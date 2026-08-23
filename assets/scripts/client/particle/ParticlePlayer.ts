import { _decorator, Color, Component, Rect, Size, Sprite, SpriteFrame, Texture2D, Vec2 } from 'cc'
import {
    ClientContentLoader,
    ParticleRepository,
    SpriteRepository,
} from '@/client/content/ClientContentLoader'
import { ContentRegistry } from '@/client/content/ContentRegistry'
import { uiNode } from '@/client/view/uiNode'
import {
    PARTICLE_STEP_SECONDS,
    ParticleSimulation,
    type ParticlePose,
    type ParticleV2,
} from '@/shared/content/particle'
import {
    parseParticlePlayerSnapshot,
    validateParticlePlayerSnapshotContent,
    type ParticlePlayerSnapshot,
} from './ParticlePlayerSnapshot'

export type { ParticlePlayerSnapshot } from './ParticlePlayerSnapshot'

const { ccclass } = _decorator

@ccclass('ParticlePlayer')
export class ParticlePlayer extends Component {
    private data: ParticleV2 | null = null
    private simulation: ParticleSimulation | null = null
    private accumulatorSeconds = 0
    private readiness: Promise<void> | null = null
    private readonly frames = new Map<string, SpriteFrame>()
    private readonly views: Sprite[] = []

    load(id: string, registry: ContentRegistry, loader = new ClientContentLoader()): Promise<void> {
        const readiness = this.loadContent(id, registry, loader)
        this.readiness = readiness
        return readiness
    }

    whenReady(): Promise<void> {
        return this.readiness ?? Promise.reject(new Error('particle player load has not started'))
    }

    private async loadContent(id: string, registry: ContentRegistry, loader: ClientContentLoader): Promise<void> {
        const data = await new ParticleRepository(registry, loader).load(id)
        const sprites = new SpriteRepository(registry, loader)
        const spriteIds = [...new Set(data.emitters.map(emitter => emitter.sprite))].sort()
        const atlases = new Map(await Promise.all(spriteIds.map(async spriteId =>
            [spriteId, await sprites.load(spriteId)] as const,
        )))
        if (!this.isValid || !this.node?.isValid) throw new Error('particle player was destroyed while loading')

        this.clear()
        this.data = data
        for (const emitter of data.emitters) {
            const atlas = atlases.get(emitter.sprite)!
            for (let index = emitter.firstFrame; index < emitter.firstFrame + emitter.frameCount; index++) {
                this.frames.set(frameKey(emitter.sprite, index), sliceFrame(atlas, emitter.columns, emitter.rows, index))
            }
        }
        this.simulation = new ParticleSimulation(data, 0)
        this.simulation.playing = false
        this.simulation.visible = false
        this.applyPose()
    }

    play(seed = 0): void {
        this.simulation = new ParticleSimulation(this.requireData(), uint32(seed, 'particle seed'))
        this.accumulatorSeconds = 0
        this.applyPose()
    }

    hide(): void {
        const simulation = this.requireSimulation()
        simulation.playing = false
        simulation.visible = false
        this.applyPose()
    }

    advance(deltaSeconds: number): void {
        if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
            throw new Error('particle deltaSeconds must be finite and non-negative')
        }
        const simulation = this.requireSimulation()
        if (!simulation.playing) return
        this.accumulatorSeconds += deltaSeconds
        const ticks = Math.floor(this.accumulatorSeconds / PARTICLE_STEP_SECONDS)
        if (ticks === 0) return
        this.accumulatorSeconds -= ticks * PARTICLE_STEP_SECONDS
        simulation.advance(ticks)
        this.applyPose()
    }

    snapshot(): ParticlePlayerSnapshot {
        return {
            ...this.requireSimulation().snapshot(),
            accumulatorSeconds: this.accumulatorSeconds,
        }
    }

    restore(value: unknown): void {
        const snapshot = validateParticlePlayerSnapshotContent(
            parseParticlePlayerSnapshot(value),
            this.requireData(),
        )
        let simulation = this.requireSimulation()
        if (simulation.seed !== snapshot.seed) {
            simulation = new ParticleSimulation(this.requireData(), snapshot.seed)
            this.simulation = simulation
        }
        simulation.restore(snapshot)
        this.accumulatorSeconds = snapshot.accumulatorSeconds
        this.applyPose()
    }

    protected update(dt: number): void {
        if (this.simulation) this.advance(dt)
    }

    protected onDestroy(): void {
        for (const sprite of this.views) if (sprite.isValid) sprite.spriteFrame = null
        this.releaseFrames()
        this.views.length = 0
    }

    private applyPose(): void {
        const poses = this.simulation?.pose() ?? []
        for (let index = 0; index < poses.length; index++) this.render(index, poses[index])
        for (let index = poses.length; index < this.views.length; index++) this.views[index].enabled = false
    }

    private render(index: number, pose: ParticlePose): void {
        let sprite = this.views[index]
        if (!sprite) {
            sprite = uiNode({
                name: 'Particle',
                parent: this.node,
                anchor: { x: 0.5, y: 0.5 },
                sprite: { sizeMode: Sprite.SizeMode.RAW, trim: false },
            }).sprite!
            this.views.push(sprite)
        }
        const frame = this.frames.get(frameKey(pose.sprite, pose.frame))
        if (!frame) throw new Error(`particle frame is not loaded: ${pose.sprite}#${pose.frame}`)
        sprite.spriteFrame = frame
        sprite.color = new Color(255, 255, 255, Math.round(pose.alpha * 255))
        sprite.enabled = true
        sprite.node.setPosition(pose.x, -pose.y, 0)
        sprite.node.setScale(pose.scale, pose.scale, 1)
        sprite.node.angle = -pose.angleDegrees
    }

    private requireData(): ParticleV2 {
        if (!this.data) throw new Error('particle player is not loaded')
        return this.data
    }

    private requireSimulation(): ParticleSimulation {
        if (!this.simulation) throw new Error('particle player is not loaded')
        return this.simulation
    }

    private clear(): void {
        for (const sprite of this.views) {
            if (sprite.isValid) sprite.spriteFrame = null
            const node = sprite.isValid ? sprite.node : null
            if (node?.isValid) node.destroy()
        }
        this.views.length = 0
        this.releaseFrames()
    }

    private releaseFrames(): void {
        for (const frame of this.frames.values()) if (frame.isValid) frame.destroy()
        this.frames.clear()
    }
}

function sliceFrame(atlas: SpriteFrame, columns: number, rows: number, index: number): SpriteFrame {
    const texture = atlas.texture as Texture2D
    const width = (texture.width || atlas.originalSize.width) / columns
    const height = (texture.height || atlas.originalSize.height) / rows
    const frame = new SpriteFrame()
    frame.packable = false
    frame.reset({
        texture,
        rect: new Rect(index % columns * width, Math.floor(index / columns) * height, width, height),
        originalSize: new Size(width, height),
        offset: new Vec2(),
        isRotate: false,
    })
    frame.packable = false
    return frame
}

function frameKey(sprite: string, frame: number): string {
    return `${sprite}#${frame}`
}

function uint32(value: number, name: string): number {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
        throw new Error(`${name} must be a uint32`)
    }
    return value
}
