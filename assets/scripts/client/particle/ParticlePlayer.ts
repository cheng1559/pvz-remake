import { _decorator, Canvas, Color, Component, Mat4, Node, Sprite, SpriteFrame, UITransform, Vec3 } from 'cc'
import { uiNode } from '@/client/view/uiNode'
import { KernelBatch, type KernelQuadSource } from '@/client/render/KernelBatch'
import { gameClock } from '@/core/GameClock'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { PARTICLE_STEP_SECONDS } from '@/shared/content/particle'
import { kernel, ParticleOption } from '@/shared/kernel/index'
import { KernelParticles } from '@/shared/kernel/particles'
import { ParticleAssets, type LoadedParticle, type ParticleEmitterAssets } from './ParticleAssets'
import { nextParticleSeed, parseParticlePlayerSnapshot, type ParticlePlayerSnapshot } from './ParticlePlayerSnapshot'
import { renderOrder } from '@/shared/content/renderOrder'
import type { ParticleLimits } from '@/shared/content/presentation'
export type { ParticlePlayerSnapshot } from './ParticlePlayerSnapshot'
const { ccclass } = _decorator

/** One emitter drawn by one kernel batch; additive and extra additive images share it through the mixed material. */
class ParticleEmitterView implements KernelQuadSource {
    private readonly geometry: Float64Array
    private readonly frame: SpriteFrame
    private readonly additive: boolean
    private readonly fullScreen: boolean
    private readonly batch: KernelBatch
    private readonly options = kernel().f64(ParticleOption.SIZE)
    private system: KernelParticles | null = null

    /** Emitters sit at the system's origin, so their batches are direct children of the system node. */
    constructor(parent: Node, private readonly index: number, assets: ParticleEmitterAssets) {
        this.batch = uiNode({ name: 'Particles', parent, layer: parent.layer }).node.addComponent(KernelBatch)
        this.batch.sizeMode = Sprite.SizeMode.CUSTOM
        this.frame = assets.frame
        this.geometry = assets.geometry
        this.additive = assets.definition.additive
        this.fullScreen = assets.definition.fullScreen
        this.options[ParticleOption.CEL_WIDTH] = assets.cel.width
        this.options[ParticleOption.CEL_HEIGHT] = assets.cel.height
    }

    render(system: KernelParticles, tint: Color | null, scale: number, extraAdditive: boolean): void {
        const options = this.options
        options[ParticleOption.RED] = tint?.r ?? 255; options[ParticleOption.GREEN] = tint?.g ?? 255
        options[ParticleOption.BLUE] = tint?.b ?? 255; options[ParticleOption.ALPHA] = tint?.a ?? 255
        options[ParticleOption.SCALE] = scale
        options[ParticleOption.ADDITIVE] = this.additive ? 1 : 0; options[ParticleOption.EXTRA] = extraAdditive ? 1 : 0
        this.system = system
        const capacity = Math.max(0, system.counts[this.index]) * (extraAdditive ? 2 : 1)
        if (capacity) this.batch.setSource(this, this.frame, capacity)
        else this.batch.clear()
    }

    writeQuads(positions: Float32Array, vertices: Float32Array, opacity: number, stride: number, capacity: number, placement?: Float64Array): number {
        if (!this.system) return 0
        this.options[ParticleOption.OPACITY] = opacity
        this.options[ParticleOption.STRIDE] = stride
        this.options[ParticleOption.CAPACITY] = capacity
        const written = this.system.write(this.index, this.geometry, this.options, positions, vertices)
        if (this.fullScreen && written > 0) fillScreen(this.batch.node, positions, stride, written)
        if (placement && written > 0) kernel().placeQuads(positions, written, stride, placement)
        return written
    }

    setVisible(visible: boolean): void { this.batch.enabled = visible }

    /** Draws nothing until the next render, keeping the batch's node and render data. */
    clear(): void {
        this.system = null
        this.batch.clear()
    }

    release(): void {
        this.system = null
        kernel().release(this.options)
    }
}

/**
 * PvzpParticleEmitter::DrawParticle for a FullScreen emitter: its particles fill the screen (FillRect over the board),
 * in the color and alpha the kernel gives them. Each corner of a quad goes to the screen's corner on its side, in the
 * batch's own space. The screen is the Canvas the batch is drawn in, which covers what is visible.
 */
function fillScreen(node: Node, positions: Float32Array, stride: number, quads: number): void {
    let canvas: Node | null = node
    while (canvas && !canvas.getComponent(Canvas)) canvas = canvas.parent
    const screen = canvas?.getComponent(UITransform)?.getBoundingBoxToWorld()
    if (!screen) return
    const inverse = Mat4.invert(new Mat4(), node.worldMatrix), corner = new Vec3()
    for (let quad = 0; quad < quads; quad++) {
        const first = quad * 4 * stride
        for (let vertex = 0; vertex < 4; vertex++) {
            const at = first + vertex * stride
            corner.set(vertex & 1 ? screen.xMax : screen.xMin, vertex & 2 ? screen.yMax : screen.yMin, 0)
            Vec3.transformMat4(corner, corner, inverse)
            positions[at] = corner.x
            positions[at + 1] = corner.y
        }
    }
}

export interface ParticleSpawnArgs {
    parent: Node
    id: string
    x: number
    y: number
    z?: number
    renderOrder?: number
    tint?: Color
    extraAdditive?: boolean
    spriteOverride?: string
    scale?: number
    seed?: number
    /** Play flipped left to right, for a zombie or plant facing the other way. */
    mirrored?: boolean
    /**
     * Once finished, keep the node for the next spawn of the same effect under the same parent instead of destroying
     * it. For frequent board effects: creating and destroying nodes costs more than simulating them.
     */
    recycle?: boolean
    /** No save keeps it: whatever spawned it brings it back, as a projectile does its trail. */
    unsaved?: boolean
}

/** Finished recyclable players by parent and effect. */
const idlePlayers = new WeakMap<Node, Map<string, ParticlePlayer[]>>()
const IDLE_LIMIT = 16
const idleKey = (id: string, sprite?: string | null) => `${id}|${sprite ?? ''}`

/**
 * TodParticleHolder's pools (the presentation settings' `particles`), shared by every player: the effects alive and
 * the emitters they hold. Until the settings give the limits, nothing is limited.
 */
let limits: ParticleLimits = { systems: Infinity, emitters: Infinity, particles: Infinity }
let liveSystems = 0, liveEmitters = 0
/** The particle limit the kernel was last given. */
let kernelLimit: number | undefined

/** The only particle player: one loader, one batch renderer and one C++ simulation on every platform. */
@ccclass('ParticlePlayer')
export class ParticlePlayer extends Component {
    /** The pools' limits, from the presentation settings (`particles`), for every effect from now on. */
    static useLimits(value: ParticleLimits): void { limits = value }

    /** What the effects alive hold of the pools. */
    static get alive(): { readonly systems: number, readonly emitters: number } { return { systems: liveSystems, emitters: liveEmitters } }

    /** Board::MakeRenderOrder; the board's top layer unless the caller says. */
    public renderOrder = renderOrder('top')
    public id = ''
    private emitters: ParticleEmitterView[] = []
    private simulation: KernelParticles | null = null
    /** Only emitters that leave their particles behind need the system's movement. */
    private followsMotion = false
    private lastWorldX: number | null = null
    private lastWorldY: number | null = null
    private readiness: Promise<void> | null = null
    private seed = 0
    private ticks = 0
    private accumulator = 0
    private particleTint: Color | null = null
    private additive = false
    private spriteOverride: string | null = null
    private scale = 1
    private mirrored = false
    private playing = true
    /** See setPaused. */
    private paused = false
    private visible = true
    private perfVisible = true
    private recycle = false
    /** See ParticleSpawnArgs.unsaved; one that was stopped is not kept either. */
    public unsaved = false
    /** The parent's pool this finished player waits in; see ParticleSpawnArgs.recycle. */
    private idlePool: ParticlePlayer[] | null = null
    /** It holds a place in the pools (and its emitters', once loaded) from when it starts until it is done. */
    private counted = false
    private heldEmitters = 0
    /** Brought back from a save, which had room for it. */
    private restored = false

    /**
     * Starts an effect (LawnApp::AddTodParticle, TodParticleHolder::AllocParticleSystem), or none while the pools are
     * full: as many effects as the limit are alive, or its emitters would not all fit. An effect not loaded yet is
     * checked for its emitters once it is, and is gone at once if they do not fit.
     */
    static spawn(args: ParticleSpawnArgs): ParticlePlayer | null {
        const emitters = ParticleAssets.get(args.id, args.spriteOverride)?.emitters.length ?? 0
        if (liveSystems >= limits.systems || liveEmitters + emitters > limits.emitters) return null
        return this.create(args)
    }

    static restore(args: { parent: Node; x: number; y: number; z?: number; snapshot: unknown }): ParticlePlayer {
        const saved = parseParticlePlayerSnapshot(args.snapshot)
        return this.create({ ...args, id: saved.id, seed: saved.seed, renderOrder: saved.renderOrder,
            tint: saved.tint ? new Color(saved.tint.r, saved.tint.g, saved.tint.b, saved.tint.a) : undefined,
            extraAdditive: saved.extraAdditive, spriteOverride: saved.spriteOverride ?? undefined, scale: saved.scale,
            mirrored: saved.mirrored,
        }, saved)
    }

    private static create(args: ParticleSpawnArgs, saved?: ParticlePlayerSnapshot): ParticlePlayer {
        const reused = args.recycle ? this.reuse(args) : null
        if (reused) return reused
        const node = uiNode({ name: `Particle_${args.id}`, parent: args.parent, layer: args.parent.layer,
            anchor: { x: 0, y: 1 }, position: { x: args.x, y: args.y, z: args.z ?? 0 } }).node
        const player = node.addComponent(ParticlePlayer)
        player.count()
        player.restored = !!saved
        player.id = args.id
        player.spriteOverride = args.spriteOverride ?? null
        player.recycle = args.recycle ?? false
        player.configure(args)
        // The C++ system and kernel arrays are freed with the node, even if it was never activated.
        node.once(Node.EventType.NODE_DESTROYED, () => player.release())
        const initialize = (assets: LoadedParticle) => {
            if (!node.isValid) return
            player.initialize(assets)
            if (saved && node.isValid) {
                player.accumulator = saved.accumulatorSeconds
                player.fastForward(saved.ageTicks)
                player.playing = saved.playing
                player.visible = saved.visible
                if (node.isValid) player.render()
            }
        }
        const cached = ParticleAssets.get(args.id, args.spriteOverride)
        if (cached) {
            initialize(cached)
            player.readiness = Promise.resolve()
        } else {
            player.readiness = ParticleAssets.load(args.id, args.spriteOverride).then(initialize).catch(error => {
                if (!node.isValid) return
                node.destroy()
                throw error
            })
        }
        return player
    }

    private static reuse(args: ParticleSpawnArgs): ParticlePlayer | null {
        const assets = ParticleAssets.get(args.id, args.spriteOverride)
        const player = assets ? idlePlayers.get(args.parent)?.get(idleKey(args.id, args.spriteOverride))?.pop() : undefined
        if (!assets || !player) return null
        player.idlePool = null
        player.count()
        player.node.setPosition(args.x, args.y, args.z ?? 0)
        player.configure(args)
        player.ticks = player.accumulator = 0
        player.lastWorldX = player.lastWorldY = null
        player.playing = player.visible = true
        player.initialize(assets)
        return player
    }

    /** The per-spawn settings; the effect and its sprite stay with the node. */
    private configure(args: ParticleSpawnArgs): void {
        this.seed = args.seed ?? nextParticleSeed()
        this.renderOrder = args.renderOrder ?? renderOrder('top')
        this.particleTint = args.tint?.clone() ?? null
        this.additive = args.extraAdditive ?? false
        this.scale = Math.max(0, args.scale ?? 1)
        // A recycled player keeps its node: set the facing either way.
        this.mirrored = args.mirrored ?? false
        this.node.setScale(this.mirrored ? -1 : 1, 1, 1)
        this.unsaved = args.unsaved ?? false
        this.paused = false
    }

    /**
     * What it went with is gone (Projectile::Die: AttachmentCrossFade "FadeOut", then AttachmentDetach): left where it
     * is, it launches no more, its particles live out their time, and it is gone with the last.
     */
    stop(): void {
        if (!this.simulation) { this.node.destroy(); return }
        this.unsaved = true
        this.simulation.stop()
    }

    /** False while a recycled player waits for reuse: it has no simulation and draws nothing. */
    get live(): boolean { return !this.idlePool }

    whenReady(): Promise<void> { return this.readiness ?? Promise.reject(new Error('particle load has not started')) }
    get ageTicks(): number { return this.ticks }
    get tint(): Color | null { return this.particleTint?.clone() ?? null }
    get extraAdditive(): boolean { return this.additive }

    snapshot(): ParticlePlayerSnapshot {
        if (!this.simulation) throw new Error('particle is not ready')
        return parseParticlePlayerSnapshot({ id: this.id, seed: this.seed, ageTicks: this.ticks,
            accumulatorSeconds: this.accumulator, renderOrder: this.renderOrder,
            tint: this.particleTint ? { r: this.particleTint.r, g: this.particleTint.g, b: this.particleTint.b, a: this.particleTint.a } : null,
            extraAdditive: this.additive, spriteOverride: this.spriteOverride, scale: this.scale,
            playing: this.playing, visible: this.visible, ...(this.mirrored ? { mirrored: true } : {}) })
    }

    hide(): void { this.playing = false; this.visible = false; this.render() }

    /** Stands still as it is drawn while what it belongs to does (a frozen plant's), and goes on once that does. */
    setPaused(paused: boolean): void { this.paused = paused }

    fastForward(ticks: number): void {
        if (!Number.isSafeInteger(ticks) || ticks < 0) throw new Error('particle ticks must be a non-negative safe integer')
        if (!this.simulation) throw new Error('particle is not ready')
        if (ticks > 0 && this.step(ticks)) this.render()
    }

    overrideScale(scale: number): void {
        this.scale = Math.max(0, scale)
        if (this.simulation) this.render()
    }

    private initialize(assets: LoadedParticle): void {
        if (this.counted && !this.heldEmitters && assets.emitters.length) {
            // A save had room for what it kept.
            if (!this.restored && liveEmitters + assets.emitters.length > limits.emitters) { this.node.destroy(); return }
            liveEmitters += this.heldEmitters = assets.emitters.length
        }
        if (Number.isFinite(limits.particles) && kernelLimit !== limits.particles) kernel().particlesLimit(kernelLimit = limits.particles)
        this.simulation = new KernelParticles(assets.packed, this.seed, assets.emitters.length)
        // A recycled player plays the same effect again with its existing emitter batches.
        if (!this.emitters.length) this.emitters = assets.emitters.map((emitter, index) => new ParticleEmitterView(this.node, index, emitter))
        this.followsMotion = assets.emitters.some(emitter => emitter.definition.particlesDontFollow)
        if (this.step(1, false)) this.render()
    }

    /** It takes its place in the pools. */
    private count(): void {
        if (this.counted) return
        this.counted = true
        liveSystems++
    }

    /** It gives its places in the pools back. */
    private uncount(): void {
        if (!this.counted) return
        this.counted = false
        liveSystems--
        liveEmitters -= this.heldEmitters
        this.heldEmitters = 0
    }

    private release(): void {
        this.uncount()
        this.idlePool?.splice(this.idlePool.indexOf(this), 1)
        this.idlePool = null
        this.simulation?.dispose()
        this.simulation = null
        for (const emitter of this.emitters) emitter.release()
        this.emitters.length = 0
    }

    protected update(dt: number): void {
        if (this.perfVisible !== GameDebugSettings.perfParticlesEnabled) {
            this.perfVisible = GameDebugSettings.perfParticlesEnabled
            for (const emitter of this.emitters) emitter.setVisible(this.perfVisible && this.visible)
        }
        if (!this.perfVisible || !this.simulation || !this.playing || this.paused) return
        this.accumulator += gameClock.delta(dt)
        const ticks = Math.floor(this.accumulator / PARTICLE_STEP_SECONDS)
        if (!ticks) return
        this.accumulator -= ticks * PARTICLE_STEP_SECONDS
        if (this.step(ticks)) this.render()
    }

    private render(): void {
        if (!this.simulation) return
        for (const emitter of this.emitters) {
            emitter.render(this.simulation, this.particleTint, this.scale, this.additive)
            emitter.setVisible(this.visible && this.perfVisible)
        }
    }

    private step(ticks: number, countAge = true): boolean {
        if (!this.simulation) return false
        if (this.followsMotion) this.motion(this.simulation.motion)
        const stepped = this.simulation.step(ticks)
        if (countAge) this.ticks += stepped
        // A finished system draws nothing more; stop instead of counting down its remaining lifetime.
        if (this.simulation.finished) { this.finish(); return false }
        return true
    }

    private finish(): void {
        this.uncount()
        const parent = this.node.parent
        if (!this.recycle || !parent) { this.node.destroy(); return }
        let pools = idlePlayers.get(parent)
        if (!pools) idlePlayers.set(parent, pools = new Map())
        const key = idleKey(this.id, this.spriteOverride)
        let pool = pools.get(key)
        if (!pool) pools.set(key, pool = [])
        if (pool.length >= IDLE_LIMIT) { this.node.destroy(); return }
        pool.push(this)
        this.idlePool = pool
        this.simulation!.dispose()
        this.simulation = null
        for (const emitter of this.emitters) emitter.clear()
    }

    private motion(output: Float64Array): void {
        const position = this.node.worldPosition, scale = this.node.worldScale
        // The particles live in the node's space: a mirrored parent (a projectile flying left) flips the motion.
        const x = this.lastWorldX === null ? 0 : (position.x - this.lastWorldX) / (scale.x || 1)
        const y = this.lastWorldY === null ? 0 : (position.y - this.lastWorldY) / (scale.y || 1)
        this.lastWorldX = position.x; this.lastWorldY = position.y
        for (let index = 0; index < this.emitters.length; index++) { output[index * 2] = x; output[index * 2 + 1] = y }
    }
}
