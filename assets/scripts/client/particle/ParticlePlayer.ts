import { _decorator, Color, Component, Node, Sprite, SpriteFrame } from 'cc'
import { uiNode } from '@/client/view/uiNode'
import { KernelBatch, type KernelQuadSource } from '@/client/render/KernelBatch'
import { gameClock } from '@/core/GameClock'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { PARTICLE_STEP_SECONDS } from '@/shared/content/particle'
import { kernel, ParticleOption } from '@/shared/kernel/index'
import { KernelParticles } from '@/shared/kernel/particles'
import { ParticleAssets, type LoadedParticle, type ParticleEmitterAssets } from './ParticleAssets'
import { nextParticleSeed, parseParticlePlayerSnapshot, type ParticlePlayerSnapshot } from './ParticlePlayerSnapshot'
export type { ParticlePlayerSnapshot } from './ParticlePlayerSnapshot'
const { ccclass } = _decorator

/** One emitter drawn by one kernel batch; additive and extra additive images share it through the mixed material. */
class ParticleEmitterView implements KernelQuadSource {
    private readonly geometry: Float64Array
    private readonly frame: SpriteFrame
    private readonly additive: boolean
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
    }

    render(system: KernelParticles, tint: Color | null, scale: number, extraAdditive: boolean): void {
        const options = this.options
        options[ParticleOption.RED] = tint?.r ?? 255; options[ParticleOption.GREEN] = tint?.g ?? 255
        options[ParticleOption.BLUE] = tint?.b ?? 255; options[ParticleOption.SCALE] = scale
        options[ParticleOption.ADDITIVE] = this.additive ? 1 : 0; options[ParticleOption.EXTRA] = extraAdditive ? 1 : 0
        this.system = system
        const capacity = Math.max(0, system.counts[this.index]) * (extraAdditive ? 2 : 1)
        if (capacity) this.batch.setSource(this, this.frame, capacity)
        else this.batch.clear()
    }

    writeQuads(positions: Float32Array, vertices: Float32Array, opacity: number, stride: number, capacity: number): number {
        if (!this.system) return 0
        this.options[ParticleOption.OPACITY] = opacity
        this.options[ParticleOption.STRIDE] = stride
        this.options[ParticleOption.CAPACITY] = capacity
        return this.system.write(this.index, this.geometry, this.options, positions, vertices)
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
    /**
     * Once finished, keep the node for the next spawn of the same effect under the same parent instead of destroying
     * it. For frequent board effects: creating and destroying nodes costs more than simulating them.
     */
    recycle?: boolean
}

/** Finished recyclable players by parent and effect. */
const idlePlayers = new WeakMap<Node, Map<string, ParticlePlayer[]>>()
const IDLE_LIMIT = 16
const idleKey = (id: string, sprite?: string | null) => `${id}|${sprite ?? ''}`

/** The only particle player: one loader, one batch renderer and one C++ simulation on every platform. */
@ccclass('ParticlePlayer')
export class ParticlePlayer extends Component {
    public renderOrder = 10000
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
    private playing = true
    private visible = true
    private perfVisible = true
    private recycle = false
    /** The parent's pool this finished player waits in; see ParticleSpawnArgs.recycle. */
    private idlePool: ParticlePlayer[] | null = null

    static spawn(args: ParticleSpawnArgs): ParticlePlayer { return this.create(args) }

    static restore(args: { parent: Node; x: number; y: number; z?: number; snapshot: unknown }): ParticlePlayer {
        const saved = parseParticlePlayerSnapshot(args.snapshot)
        return this.create({ ...args, id: saved.id, seed: saved.seed, renderOrder: saved.renderOrder,
            tint: saved.tint ? new Color(saved.tint.r, saved.tint.g, saved.tint.b, saved.tint.a) : undefined,
            extraAdditive: saved.extraAdditive, spriteOverride: saved.spriteOverride ?? undefined, scale: saved.scale,
        }, saved)
    }

    private static create(args: ParticleSpawnArgs, saved?: ParticlePlayerSnapshot): ParticlePlayer {
        const reused = args.recycle ? this.reuse(args) : null
        if (reused) return reused
        const node = uiNode({ name: `Particle_${args.id}`, parent: args.parent, layer: args.parent.layer,
            anchor: { x: 0, y: 1 }, position: { x: args.x, y: args.y, z: args.z ?? 0 } }).node
        const player = node.addComponent(ParticlePlayer)
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
            player.readiness = ParticleAssets.load(args.id, args.spriteOverride).then(initialize)
            void player.readiness.catch(error => {
                if (node.isValid) node.destroy()
                console.error(`[ParticlePlayer] Failed to load ${args.id}`, error)
            })
        }
        return player
    }

    private static reuse(args: ParticleSpawnArgs): ParticlePlayer | null {
        const assets = ParticleAssets.get(args.id, args.spriteOverride)
        const player = assets ? idlePlayers.get(args.parent)?.get(idleKey(args.id, args.spriteOverride))?.pop() : undefined
        if (!assets || !player) return null
        player.idlePool = null
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
        this.renderOrder = args.renderOrder ?? 10000
        this.particleTint = args.tint?.clone() ?? null
        this.additive = args.extraAdditive ?? false
        this.scale = Math.max(0, args.scale ?? 1)
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
            playing: this.playing, visible: this.visible })
    }

    hide(): void { this.playing = false; this.visible = false; this.render() }

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
        this.simulation = new KernelParticles(assets.packed, this.seed, assets.emitters.length)
        // A recycled player plays the same effect again with its existing emitter batches.
        if (!this.emitters.length) this.emitters = assets.emitters.map((emitter, index) => new ParticleEmitterView(this.node, index, emitter))
        this.followsMotion = assets.emitters.some(emitter => emitter.definition.particlesDontFollow)
        if (this.step(1, false)) this.render()
    }

    private release(): void {
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
        if (!this.perfVisible || !this.simulation || !this.playing) return
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
        const position = this.node.worldPosition
        const x = this.lastWorldX === null ? 0 : position.x - this.lastWorldX
        const y = this.lastWorldY === null ? 0 : position.y - this.lastWorldY
        this.lastWorldX = position.x; this.lastWorldY = position.y
        for (let index = 0; index < this.emitters.length; index++) { output[index * 2] = x; output[index * 2 + 1] = y }
    }
}
