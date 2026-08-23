import { _decorator, Color, Component, gfx, JsonAsset, Material, Node, Sprite, SpriteFrame, toRadian, UISkew, UITransform, Vec3 } from 'cc'
import { ClientContentLoader, SpriteRepository } from '@/client/content/ClientContentLoader'
import { ContentRegistry } from '@/client/content/ContentRegistry'
import { uiNode } from '@/client/view/uiNode'
import {
    attachReanimPose,
    parseReanimV2,
    sampleReanimTrack,
    type ReanimKeyframeV2,
    type ReanimTrackV2,
    type ReanimV2,
} from '@/shared/content/reanim'
import {
    parseReanimPlaybackSnapshot,
    validateReanimPlaybackSnapshotContent,
    type ReanimPlaybackSnapshot,
} from './ReanimPlaybackSnapshot'

export type { ReanimPlaybackSnapshot } from './ReanimPlaybackSnapshot'

const { ccclass } = _decorator

interface TrackView {
    node: Node
    sprite: Sprite
    skew: UISkew
    additive: Sprite
}

let additiveSpriteMaterial: Material | null = null

interface TrackAttachment {
    parent: ReanimPlayer
    trackId: string
    basePose: ReanimKeyframeV2
}

export class ReanimRepository {
    private readonly cache = new Map<string, Promise<ReanimV2>>()

    constructor(
        private readonly registry: ContentRegistry,
        private readonly loader = new ClientContentLoader(),
    ) {}

    load(id: string): Promise<ReanimV2> {
        const cached = this.cache.get(id)
        if (cached) return cached
        const content = this.registry.resolve('reanim', id)
        if (!content) return Promise.reject(new Error(`unknown reanim: ${id}`))

        const promise = this.loader.load(content, JsonAsset).then(asset => {
            const data = parseReanimV2(asset.json)
            if (data.id !== id) throw new Error(`reanim ID mismatch: expected ${id}, got ${data.id}`)
            return data
        }).catch(error => {
            this.cache.delete(id)
            throw error
        })
        this.cache.set(id, promise)
        return promise
    }
}

@ccclass('ReanimPlayer')
export class ReanimPlayer extends Component {
    private data: ReanimV2 | null = null
    private readonly frames = new Map<string, SpriteFrame>()
    private readonly views = new Map<string, TrackView>()
    private timeSeconds = 0
    private playing = false
    private loop = true
    private rate = 1
    private visible = true
    private hideOnFinish = true
    private onFinish: (() => void) | null = null
    private readonly blendFromPoses = new Map<string, ReanimKeyframeV2>()
    private blendDuration = 0
    private blendElapsed = 0
    private readonly frameOverrides = new Map<string, SpriteFrame>()
    private attachment: TrackAttachment | null = null
    private restoredAttachmentTrackId: string | null = null
    private extraAdditive = false
    private extraAdditiveColor = Color.BLACK.clone()
    private colorOverride = Color.WHITE.clone()

    async load(id: string, registry: ContentRegistry, loader = new ClientContentLoader()): Promise<void> {
        const data = await new ReanimRepository(registry, loader).load(id)
        const spriteIds = new Set<string>()
        for (const track of data.tracks) {
            for (const frame of track.keyframes) if (frame.sprite) spriteIds.add(frame.sprite)
        }
        const sprites = new SpriteRepository(registry, loader)
        const loaded = await Promise.all([...spriteIds].sort().map(async spriteId =>
            [spriteId, await sprites.load(spriteId)] as const,
        ))
        if (!this.node.isValid) throw new Error('reanim player was destroyed while loading')

        this.clearViews()
        this.data = data
        this.frames.clear()
        for (const [spriteId, frame] of loaded) this.frames.set(spriteId, frame)
        for (const track of [...data.tracks].sort(compareTracks)) this.createTrackView(track)
        this.timeSeconds = 0
        this.playing = false
        this.visible = true
        this.attachment = null
        this.restoredAttachmentTrackId = null
        this.blendFromPoses.clear()
        this.blendDuration = 0
        this.colorOverride = Color.WHITE.clone()
        this.applyPose()
    }

    attachToTrack(parent: ReanimPlayer, trackId: string): void {
        this.requireData()
        const track = parent.requireData().tracks.find(candidate => candidate.id === trackId)
        if (!track) throw new Error(`unknown parent reanim track: ${trackId}`)
        const basePose = sampleReanimTrack(track, 0)
        if (!basePose) throw new Error(`parent reanim track has no base pose: ${trackId}`)
        this.attachment = { parent, trackId, basePose }
        this.restoredAttachmentTrackId = null
        this.applyPose()
    }

    reattachAfterRestore(parent: ReanimPlayer): void {
        if (!this.restoredAttachmentTrackId) throw new Error('reanim snapshot has no attachment to restore')
        this.attachToTrack(parent, this.restoredAttachmentTrackId)
    }

    blendFrom(previous: ReanimPlayer, durationSeconds: number): void {
        this.requireData()
        positiveFinite(durationSeconds, 'reanim blend duration')
        this.blendFromPoses.clear()
        for (const track of this.requireData().tracks) {
            const pose = previous.sampleTrack(track.id)
            if (pose) this.blendFromPoses.set(track.id, pose)
        }
        this.blendDuration = durationSeconds
        this.blendElapsed = 0
        this.applyPose()
    }

    play(options: {
        loop?: boolean
        rate?: number
        timeSeconds?: number
        hideOnFinish?: boolean
        onFinish?: () => void
    } = {}): void {
        this.requireData()
        if (options.rate != null) this.rate = positiveFinite(options.rate, 'reanim rate')
        if (options.loop != null) this.loop = options.loop
        this.hideOnFinish = options.hideOnFinish ?? true
        this.onFinish = options.onFinish ?? null
        if (options.timeSeconds != null) this.seek(options.timeSeconds)
        this.visible = true
        this.playing = true
        this.applyPose()
    }

    pause(): void {
        this.playing = false
    }

    setOnFinish(callback: (() => void) | null): void {
        this.requireData()
        this.onFinish = callback
    }

    hide(): void {
        this.playing = false
        this.visible = false
        this.applyPose()
    }

    setTrackPrefixVisible(prefix: string, visible: boolean): void {
        for (const [id, view] of this.views) if (id.startsWith(prefix)) view.node.active = visible
    }

    setTrackSpriteOverride(trackId: string, frame: SpriteFrame | null): void {
        if (frame) this.frameOverrides.set(trackId, frame)
        else this.frameOverrides.delete(trackId)
        this.applyPose()
    }

    setExtraAdditiveDraw(enabled: boolean, color: Color = Color.BLACK): void {
        this.extraAdditive = enabled
        this.extraAdditiveColor = color.clone()
        this.applyPose()
    }

    setColorOverride(color: Color = Color.WHITE): void {
        this.colorOverride = color.clone()
        this.applyPose()
    }

    getTrackWorldPosition(trackId: string): Vec3 | null {
        const view = this.views.get(trackId)
        const frame = view?.sprite.spriteFrame
        const transform = view?.node.getComponent(UITransform)
        if (!view?.node.isValid || !frame || !transform) return null
        const size = frame.originalSize
        return transform.convertToWorldSpaceAR(new Vec3(size.width * 0.5, -size.height * 0.5))
    }

    seek(timeSeconds: number): void {
        const data = this.requireData()
        if (!Number.isFinite(timeSeconds) || timeSeconds < 0) {
            throw new Error('reanim timeSeconds must be finite and non-negative')
        }
        this.timeSeconds = this.loop
            ? timeSeconds % data.durationSeconds
            : Math.min(timeSeconds, data.durationSeconds)
        this.applyPose()
    }

    advance(deltaSeconds: number): void {
        if (!this.playing) return
        if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
            throw new Error('reanim deltaSeconds must be finite and non-negative')
        }
        const data = this.requireData()
        const next = this.timeSeconds + deltaSeconds * this.rate
        if (this.blendDuration > 0) this.blendElapsed += deltaSeconds
        if (this.loop) {
            this.timeSeconds = next % data.durationSeconds
        } else if (next >= data.durationSeconds) {
            this.timeSeconds = data.durationSeconds
            this.playing = false
            if (this.hideOnFinish) this.visible = false
            const onFinish = this.onFinish
            this.onFinish = null
            onFinish?.()
        } else {
            this.timeSeconds = next
        }
        this.applyPose()
        if (this.blendElapsed >= this.blendDuration) {
            this.blendFromPoses.clear()
            this.blendDuration = 0
            this.blendElapsed = 0
        }
    }

    snapshot(): ReanimPlaybackSnapshot {
        return {
            id: this.requireData().id,
            timeSeconds: this.timeSeconds,
            playing: this.playing,
            loop: this.loop,
            rate: this.rate,
            visible: this.visible,
            hideOnFinish: this.hideOnFinish,
            extraAdditive: this.extraAdditive,
            extraAdditiveColor: {
                r: this.extraAdditiveColor.r,
                g: this.extraAdditiveColor.g,
                b: this.extraAdditiveColor.b,
                a: this.extraAdditiveColor.a,
            },
            blend: this.blendDuration > 0 ? {
                durationSeconds: this.blendDuration,
                elapsedSeconds: this.blendElapsed,
                fromPoses: [...this.blendFromPoses].map(([trackId, pose]) => ({ trackId, pose: { ...pose } })),
            } : null,
            attachmentTrackId: this.attachment?.trackId ?? this.restoredAttachmentTrackId,
        }
    }

    restore(value: unknown): void {
        const data = this.requireData()
        const snapshot = validateReanimPlaybackSnapshotContent(parseReanimPlaybackSnapshot(value), data)
        this.timeSeconds = snapshot.timeSeconds
        this.playing = snapshot.playing
        this.loop = snapshot.loop
        this.rate = snapshot.rate
        this.visible = snapshot.visible
        this.hideOnFinish = snapshot.hideOnFinish
        this.onFinish = null
        this.extraAdditive = snapshot.extraAdditive
        this.extraAdditiveColor = new Color(
            snapshot.extraAdditiveColor.r,
            snapshot.extraAdditiveColor.g,
            snapshot.extraAdditiveColor.b,
            snapshot.extraAdditiveColor.a,
        )
        this.colorOverride = Color.WHITE.clone()
        this.blendFromPoses.clear()
        this.blendDuration = snapshot.blend?.durationSeconds ?? 0
        this.blendElapsed = snapshot.blend?.elapsedSeconds ?? 0
        for (const entry of snapshot.blend?.fromPoses ?? []) this.blendFromPoses.set(entry.trackId, entry.pose)
        this.attachment = null
        this.restoredAttachmentTrackId = snapshot.attachmentTrackId
        this.applyPose()
    }

    protected update(dt: number): void {
        this.advance(dt)
    }

    protected onDestroy(): void {
        this.clearViews()
    }

    private createTrackView(track: ReanimTrackV2): void {
        const parts = uiNode({
            name: track.id,
            parent: this.node,
            anchor: { x: 0, y: 1 },
            sprite: { sizeMode: Sprite.SizeMode.RAW, trim: false },
            skew: { x: 0, y: 0 },
        })
        const additive = uiNode({
            name: `${track.id}_extra_additive`, parent: parts.node,
            anchor: { x: 0, y: 1 },
            sprite: { sizeMode: Sprite.SizeMode.RAW, trim: false },
        }).sprite!
        additive.customMaterial = getAdditiveSpriteMaterial()
        additive.enabled = false
        this.views.set(track.id, { node: parts.node, sprite: parts.sprite!, skew: parts.skew!, additive })
    }

    private applyPose(): void {
        if (!this.data) return
        for (const track of this.data.tracks) {
            const view = this.views.get(track.id)!
            let pose = this.visible ? sampleReanimTrack(track, this.timeSeconds) : null
            const blendFrom = this.blendFromPoses.get(track.id)
            if (pose && blendFrom && this.blendDuration > 0) {
                pose = blendPose(blendFrom, pose, Math.min(1, this.blendElapsed / this.blendDuration))
            }
            if (pose && this.attachment) {
                const parentPose = this.attachment.parent.sampleTrack(this.attachment.trackId)
                pose = parentPose
                    ? attachReanimPose(pose, parentPose, this.attachment.basePose)
                    : null
            }
            const frame = this.frameOverrides.get(track.id) ?? (pose?.sprite ? this.frames.get(pose.sprite) : undefined)
            if (!pose || !frame) {
                view.sprite.enabled = false
                view.additive.enabled = false
                continue
            }

            view.node.setPosition(pose.x, -pose.y, 0)
            view.node.angle = -pose.skewX
            const skewDifference = pose.skewX - pose.skewY
            const cosine = Math.cos(toRadian(skewDifference))
            const safeCosine = Math.abs(cosine) < 0.001 ? 0.001 : cosine
            const scaleY = pose.scaleY * safeCosine
            const appliedSkew = Math.abs(pose.scaleX) <= 0.0001
                ? skewDifference
                : Math.atan(Math.tan(toRadian(skewDifference)) * scaleY / pose.scaleX) * 180 / Math.PI
            view.skew.setSkew(-appliedSkew, 0)
            view.node.setScale(pose.scaleX, scaleY, 1)
            view.sprite.spriteFrame = frame
            view.sprite.color = new Color(
                this.colorOverride.r,
                this.colorOverride.g,
                this.colorOverride.b,
                Math.round(pose.alpha * this.colorOverride.a),
            )
            view.sprite.enabled = true
            view.additive.spriteFrame = frame
            view.additive.color = new Color(
                this.extraAdditiveColor.r,
                this.extraAdditiveColor.g,
                this.extraAdditiveColor.b,
                Math.round(this.extraAdditiveColor.a * pose.alpha),
            )
            view.additive.enabled = this.extraAdditive
        }
    }

    private requireData(): ReanimV2 {
        if (!this.data) throw new Error('reanim player is not loaded')
        return this.data
    }

    private sampleTrack(trackId: string): ReanimKeyframeV2 | null {
        const track = this.requireData().tracks.find(candidate => candidate.id === trackId)
        return track ? sampleReanimTrack(track, this.timeSeconds) : null
    }

    private clearViews(): void {
        for (const view of this.views.values()) if (view.node.isValid) view.node.destroy()
        this.views.clear()
    }
}

function getAdditiveSpriteMaterial(): Material {
    if (additiveSpriteMaterial) return additiveSpriteMaterial
    additiveSpriteMaterial = new Material()
    additiveSpriteMaterial.initialize({
        effectName: 'for2d/builtin-sprite',
        defines: { USE_TEXTURE: true },
        states: {
            blendState: {
                targets: [{
                    blend: true,
                    blendSrc: gfx.BlendFactor.SRC_ALPHA,
                    blendDst: gfx.BlendFactor.ONE,
                    blendSrcAlpha: gfx.BlendFactor.SRC_ALPHA,
                    blendDstAlpha: gfx.BlendFactor.ONE,
                }],
            },
        },
    })
    return additiveSpriteMaterial
}

function compareTracks(a: ReanimTrackV2, b: ReanimTrackV2): number {
    return a.zIndex - b.zIndex || a.id.localeCompare(b.id)
}

function positiveFinite(value: number, name: string): number {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive and finite`)
    return value
}

function blendPose(from: ReanimKeyframeV2, to: ReanimKeyframeV2, ratio: number): ReanimKeyframeV2 {
    const lerp = (a: number, b: number) => a + (b - a) * ratio
    const lerpAngle = (a: number, b: number) => {
        while (a > b + 180) a -= 360
        while (a < b - 180) a += 360
        return lerp(a, b)
    }
    return {
        ...to,
        x: lerp(from.x, to.x),
        y: lerp(from.y, to.y),
        scaleX: lerp(from.scaleX, to.scaleX),
        scaleY: lerp(from.scaleY, to.scaleY),
        skewX: lerpAngle(from.skewX, to.skewX),
        skewY: lerpAngle(from.skewY, to.skewY),
        alpha: lerp(from.alpha, to.alpha),
    }
}
