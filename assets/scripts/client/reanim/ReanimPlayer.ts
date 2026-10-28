import { _decorator, Color, Component, gfx, isValid, JsonAsset, Material, Node, Sprite, SpriteFrame, toRadian, UISkew, UITransform, Vec3 } from 'cc'
import { ClientContentLoader, SpriteRepository } from '@/client/content/ClientContentLoader'
import { ContentRegistry } from '@/client/content/ContentRegistry'
import { uiNode } from '@/client/view/uiNode'
import { gameClock } from '@/core/GameClock'
import { animationFrame, animationFrames } from '@/client/render/AnimationAtlas'
import { KernelBatch, loadKernelMaterial, type KernelQuadSource } from '@/client/render/KernelBatch'
import { BLEND, Header, IMAGE, kernel, KEY, loadKernel, TRACK } from '@/shared/kernel/index'
import {
    attachmentMatrix,
    attachReanimPose,
    packKeyframes,
    parseReanim,
    sampleReanimTrack,
    type ReanimKeyframe,
    type ReanimTrack,
    type Reanim,
} from '@/shared/content/reanim'
import {
    parseReanimPlaybackSnapshot,
    validateReanimPlaybackSnapshotContent,
    type ReanimPlaybackSnapshot,
} from './ReanimPlaybackSnapshot'

export type { ReanimPlaybackSnapshot } from './ReanimPlaybackSnapshot'

const { ccclass } = _decorator

/** A track is drawn by the player's batches unless a caller asked for its node. */
interface TrackView {
    track?: ReanimTrack
    visible?: boolean
    node?: Node
    sprite?: Sprite
    skew?: UISkew
    additive?: Sprite
}

const DEG_TO_RAD = Math.PI / 180

/** A frame's texture with its untrimmed, top-left anchored rectangle and UVs, read once. */
interface FrameGeometry {
    frame: SpriteFrame
    texture: unknown
    /** left, right, bottom, top, then the four corner UVs. */
    data: Float64Array
}
const geometries = new WeakMap<SpriteFrame, FrameGeometry>()
/** SpriteFrame properties are getters; reading them per image per frame is costly without a JIT. */
function frameGeometry(frame: SpriteFrame): FrameGeometry {
    let geometry = geometries.get(frame)
    if (!geometry) {
        const border = frame.trimmedBorder, size = frame.originalSize, data = new Float64Array(12)
        data[0] = border.x; data[1] = size.width + border.y; data[2] = border.z - size.height; data[3] = border.w
        data.set(frame.uv.slice(0, 8), 4)
        geometry = { frame, texture: frame.texture, data }
        geometries.set(frame, geometry)
    }
    return geometry
}

/** A clip's keyframes in the kernel's layout, packed once; sprite slots index `sprites`. */
interface PackedClip { keys: Float64Array, starts: Map<ReanimTrack, number>, sprites: string[] }
const packedClips = new WeakMap<Reanim, PackedClip>()
function packClip(data: Reanim): PackedClip {
    let packed = packedClips.get(data)
    if (packed) return packed
    const sprites = [...new Set(data.tracks.flatMap(track => track.keyframes.flatMap(frame => frame.sprite ? [frame.sprite] : [])))].sort()
    const slots = new Map(sprites.map((id, slot) => [id, slot]))
    const keys = kernel().f64(data.tracks.reduce((sum, track) => sum + track.keyframes.length, 0) * KEY)
    const starts = new Map<ReanimTrack, number>()
    let index = 0
    for (const track of data.tracks) {
        starts.set(track, index)
        packKeyframes(track.keyframes, keys, index, frame => frame.sprite ? slots.get(frame.sprite)! : -1)
        index += track.keyframes.length
    }
    packedClips.set(data, packed = { keys, starts, sprites })
    return packed
}

/** Consecutive tracks drawn by one batch, or a track drawn by its own node. */
type Segment = { first: number, end: number, frame: FrameGeometry, source: KernelQuadSource } | { trackId: string, view: TrackView }

let additiveSpriteMaterial: Material | null = null
const parsedReanims = new WeakMap<JsonAsset, Reanim>()
interface ReanimAssets {
    data: Reanim
    frames: ReadonlyArray<readonly [string, SpriteFrame]>
}
// Registries define sprite overrides; share prepared assets only within the same content registry.
const preparedReanims = new WeakMap<ContentRegistry, Map<string, Promise<ReanimAssets>>>()

interface TrackAttachment {
    parent: ReanimPlayer
    trackId: string
    basePose: ReanimKeyframe
}

export class ReanimRepository {
    private readonly cache: Map<string, Promise<ReanimAssets>>

    constructor(
        private readonly registry: ContentRegistry,
        private readonly loader = new ClientContentLoader(),
    ) {
        let cache = preparedReanims.get(registry)
        if (!cache) preparedReanims.set(registry, cache = new Map())
        this.cache = cache
    }

    load(id: string): Promise<ReanimAssets> {
        const cached = this.cache.get(id)
        if (cached) return cached
        const content = this.registry.resolve('reanim', id)
        if (!content) return Promise.reject(new Error(`unknown reanim: ${id}`))

        const promise = this.loader.load(content, JsonAsset).then(async asset => {
            let data = parsedReanims.get(asset)
            if (!data) {
                data = parseReanim(asset.json)
                parsedReanims.set(asset, data)
            }
            if (data.id !== id) throw new Error(`reanim ID mismatch: expected ${id}, got ${data.id}`)
            const spriteIds = new Set<string>()
            for (const track of data.tracks) {
                for (const frame of track.keyframes) if (frame.sprite) spriteIds.add(frame.sprite)
            }
            const sprites = new SpriteRepository(this.registry, this.loader)
            const [loaded] = await Promise.all([Promise.all([...spriteIds].sort().map(async spriteId =>
                [spriteId, await sprites.load(spriteId, id)] as const,
            )), loadKernel()])
            // Pack after every image has arrived, so one animation's images share a page.
            const packed = animationFrames(loaded.map(([, frame]) => frame))
            const frames = loaded.map(([spriteId], index) => [spriteId, packed[index]] as const)
            return { data, frames }
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
    private data: Reanim | null = null
    private readonly frames = new Map<string, SpriteFrame>()
    private readonly views = new Map<string, TrackView>()
    private timeSeconds = 0
    private playing = false
    private loop = true
    private rate = 1
    private visible = true
    private hideOnFinish = true
    private onFinish: (() => void) | null = null
    private readonly blendFromPoses = new Map<string, ReanimKeyframe>()
    private blendDuration = 0
    private blendElapsed = 0
    private readonly frameOverrides = new Map<string, SpriteFrame>()
    private readonly trackColors = new Map<string, Color>()
    private attachment: TrackAttachment | null = null
    private restoredAttachmentTrackId: string | null = null
    private extraAdditive = false
    private extraAdditiveColor = Color.BLACK.clone()
    private colorOverride = Color.WHITE.clone()
    private poseDirty = false
    private batches: KernelBatch[] = []
    /** Child nodes drawn right after a track; see drawAfterTrack. */
    private readonly followers = new Map<string, Node[]>()
    /** Kernel arrays are released when the node is destroyed, even if it was never activated. */
    private releasesOnDestroy = false
    /** Kernel input; rebuilt when tracks, images, track colors or blend sources change. */
    private drawing: { keys: Float64Array, tracks: Int32Array, state: Float64Array, segments: Segment[] } | null = null
    private drawingStale = true

    get durationSeconds(): number { return this.requireData().durationSeconds }
    /** The loaded clip, or null before the first load. */
    get loadedId(): string | null { return this.data?.id ?? null }
    get lastFrameTimeSeconds(): number {
        return Math.max(0, ...this.requireData().tracks.map(track => track.keyframes[track.keyframes.length - 1].timeSeconds))
    }

    /** Gives the track its own node, for callers that attach to it or change it directly. */
    getTrackNode(trackId: string): Node | null {
        const view = this.views.get(trackId)
        if (!view) return null
        if (!view.node) {
            this.createTrackNode(trackId, view)
            this.drawingStale = true
            this.writePose()
        }
        return view.node!
    }

    /**
     * Draws a child node right after the track, where Reanimation::DrawRenderGroup draws the track's attachment.
     * The order holds while the batches are reordered; reloading the animation forgets it.
     */
    drawAfterTrack(node: Node, trackId: string): void {
        const followers = this.followers.get(trackId) ?? []
        if (!followers.includes(node)) followers.push(node)
        this.followers.set(trackId, followers)
        node.setParent(this.node)
        this.getTrackNode(trackId)
        this.writePose()
    }

    getAnimation(): Reanim {
        return parseReanim(this.requireData())
    }

    getSpriteFrame(spriteId: string): SpriteFrame | undefined {
        return this.frames.get(spriteId)
    }

    /** Replace poses/timing while keeping track nodes, attached UI and playback state. */
    replaceAnimation(value: unknown): void {
        const data = parseReanim(value)
        if (data.id !== this.requireData().id || data.tracks.length !== this.views.size ||
            data.tracks.some(track => !this.views.has(track.id))) {
            throw new Error('replacement reanim must retain its ID and tracks')
        }
        for (const track of data.tracks) for (const frame of track.keyframes) {
            if (frame.sprite && !this.frames.has(frame.sprite)) {
                throw new Error(`replacement reanim uses an unloaded sprite: ${frame.sprite}`)
            }
        }
        this.data = data
        for (const track of data.tracks) this.views.get(track.id)!.track = track
        this.drawingStale = true
        this.timeSeconds = Math.min(this.timeSeconds, data.durationSeconds)
        this.applyPose()
    }

    async load(id: string, registry: ContentRegistry, loader = new ClientContentLoader()): Promise<void> {
        const [{ data, frames }] = await Promise.all([new ReanimRepository(registry, loader).load(id), loadKernelMaterial()])
        if (!this.node?.isValid) throw new Error('reanim player was destroyed while loading')

        this.clearViews()
        this.data = data
        this.frames.clear()
        for (const [spriteId, frame] of frames) this.frames.set(spriteId, frame)
        for (const track of [...data.tracks].sort(compareTracks)) this.views.set(track.id, { track, visible: true })
        this.drawingStale = true
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
        // Capture before clearing: a repeated shot may blend from this player itself.
        const poses = previous.requireData().tracks.map(track =>
            [track.id, previous.sampleBlendedTrack(track)] as const)
        this.blendFromPoses.clear()
        const tracks = new Set(this.requireData().tracks.map(track => track.id))
        for (const [id, pose] of poses) if (tracks.has(id) && pose?.sprite) this.blendFromPoses.set(id, pose)
        this.blendDuration = durationSeconds
        this.blendElapsed = 0
        this.drawingStale = true
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
        let changed = false
        for (const [id, view] of this.views) if (id.startsWith(prefix) && view.visible !== visible) {
            view.visible = visible
            if (view.node) view.node.active = visible
            changed = true
        }
        if (changed) this.drawingStale = true
        if (changed) this.applyPose()
    }

    setTrackSpriteOverride(trackId: string, frame: SpriteFrame | null): void {
        // Keep the override on this animation's page so the player still draws in one batch.
        if (frame) this.frameOverrides.set(trackId, animationFrame(frame, this.frames.values().next().value))
        else this.frameOverrides.delete(trackId)
        this.drawingStale = true
        this.applyPose(trackId)
    }

    setTrackColorOverride(trackId: string, color: Color | null): void {
        if (!this.views.has(trackId)) throw new Error(`unknown reanim track: ${trackId}`)
        if (color) this.trackColors.set(trackId, color.clone())
        else this.trackColors.delete(trackId)
        this.drawingStale = true
        this.applyPose(trackId)
    }

    setExtraAdditiveDraw(enabled: boolean, color: Color = Color.BLACK): void {
        if (this.extraAdditive === enabled && sameColor(this.extraAdditiveColor, color)) return
        this.extraAdditive = enabled
        this.extraAdditiveColor = color.clone()
        this.applyPose()
    }

    setColorOverride(color: Color = Color.WHITE): void {
        if (sameColor(this.colorOverride, color)) return
        this.colorOverride = color.clone()
        this.applyPose()
    }

    /** World position of the center of the track's current image. */
    getTrackWorldPosition(trackId: string): Vec3 | null {
        this.flushPose()
        const view = this.views.get(trackId)
        if (!view) return null
        if (view.node) {
            const frame = view.sprite?.spriteFrame
            const transform = view.node.getComponent(UITransform)
            if (!view.node.isValid || !frame || !transform) return null
            const size = frame.originalSize
            return transform.convertToWorldSpaceAR(new Vec3(size.width * 0.5, -size.height * 0.5))
        }
        const track = view.track ?? this.requireData().tracks.find(candidate => candidate.id === trackId)!
        const pose = this.visible ? this.sampleAttachedTrack(track) : null
        const frame = this.frameOverrides.get(trackId) ?? (pose?.sprite ? this.frames.get(pose.sprite) : undefined)
        if (!pose || !frame) return null
        const u = frame.originalSize.width / 2, v = -frame.originalSize.height / 2
        const kx = pose.skewX * DEG_TO_RAD, ky = pose.skewY * DEG_TO_RAD
        const local = new Vec3(pose.x + Math.cos(kx) * pose.scaleX * u + Math.sin(ky) * pose.scaleY * v,
            -pose.y - Math.sin(kx) * pose.scaleX * u + Math.cos(ky) * pose.scaleY * v, 0)
        return Vec3.transformMat4(local, local, this.node.worldMatrix)
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
            if (this.blendFromPoses.size) this.drawingStale = true
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
        this.drawingStale = true
        this.attachment = null
        this.restoredAttachmentTrackId = snapshot.attachmentTrackId
        this.applyPose()
    }

    protected update(dt: number): void {
        this.advance(gameClock.delta(dt))
    }

    protected lateUpdate(): void {
        this.flushPose()
    }

    /** Writes pending pose changes to the track nodes. */
    flushPose(): void {
        if (!this.poseDirty) return
        this.poseDirty = false
        this.writePose()
    }

    protected onDestroy(): void {
        this.clearViews()
    }

    private createTrackNode(trackId: string, view: TrackView): void {
        const parts = uiNode({
            name: trackId,
            parent: this.node,
            active: view.visible !== false,
            anchor: { x: 0, y: 1 },
            sprite: { sizeMode: Sprite.SizeMode.RAW, trim: false },
            skew: { x: 0, y: 0 },
        })
        Object.assign(view, { node: parts.node, sprite: parts.sprite!, skew: parts.skew! })
    }

    private batchAt(index: number): KernelBatch {
        let batch = this.batches[index]
        if (!batch) {
            batch = uiNode({ name: 'ReanimBatch', parent: this.node, layer: this.node.layer }).node.addComponent(KernelBatch)
            batch.sizeMode = Sprite.SizeMode.CUSTOM
            this.batches[index] = batch
        }
        return batch
    }

    private applyPose(trackId?: string): void {
        if (this.enabledInHierarchy) { this.poseDirty = true; return }
        // Without lateUpdate, write now; a single-track change leaves the other tracks alone.
        if (trackId === undefined) this.poseDirty = false
        this.writePose(trackId)
    }

    /**
     * Tracks without a node are drawn by the kernel in as few batches as their textures allow; a
     * track node splits the batches so attached children keep their place in the drawing order.
     */
    private writePose(trackId?: string): void {
        const data = this.data
        if (!data) return
        const single = trackId === undefined ? undefined : this.views.get(trackId)
        if (single?.node) { this.writeTrackNode(trackId!, single); return }
        const drawing = this.prepareDrawing()
        const state = drawing.state, color = this.colorOverride, extra = this.extraAdditiveColor
        let matrix = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }, shown = this.visible
        if (shown && this.attachment) {
            const { parent, trackId: parentTrackId, basePose } = this.attachment
            const parentTrack = parent.requireData().tracks.find(candidate => candidate.id === parentTrackId)
            const parentPose = parentTrack ? parent.sampleAttachedTrack(parentTrack) : null
            if (parentPose) matrix = attachmentMatrix(parentPose, basePose)
            else shown = false
        }
        state[Header.TIME] = this.timeSeconds
        state[Header.RED] = color.r; state[Header.GREEN] = color.g; state[Header.BLUE] = color.b; state[Header.ALPHA] = color.a
        state[Header.EXTRA] = this.extraAdditive ? 1 : 0
        state[Header.EXTRA_RED] = extra.r; state[Header.EXTRA_GREEN] = extra.g; state[Header.EXTRA_BLUE] = extra.b; state[Header.EXTRA_ALPHA] = extra.a
        state[Header.TINTED] = this.trackColors.size > 0 || color.r !== 255 || color.g !== 255 || color.b !== 255 ? 1 : 0
        state[Header.BLENDING] = this.blendDuration > 0 ? 1 : 0
        state[Header.RATIO] = this.blendDuration > 0 ? Math.min(1, this.blendElapsed / this.blendDuration) : 0
        state[Header.MATRIX_A] = matrix.a; state[Header.MATRIX_B] = matrix.b; state[Header.MATRIX_C] = matrix.c
        state[Header.MATRIX_D] = matrix.d; state[Header.MATRIX_X] = matrix.tx; state[Header.MATRIX_Y] = matrix.ty
        const order: Node[] = []
        let used = 0
        for (const segment of drawing.segments) {
            if ('view' in segment) {
                this.writeTrackNode(segment.trackId, segment.view)
                order.push(segment.view.node!)
                for (const node of this.followers.get(segment.trackId) ?? []) if (node.parent === this.node) order.push(node)
            } else if (shown) {
                const batch = this.batchAt(used++)
                // Room for every track and its extra additive image; the kernel clears unused quads.
                batch.setSource(segment.source, segment.frame.frame, (segment.end - segment.first) * 2)
                order.push(batch.node)
            }
        }
        for (let i = used; i < this.batches.length; i++) this.batches[i].clear()
        if (this.batches.length || this.followers.size) {
            const children = this.node.children
            order.forEach((node, index) => { if (children[index] !== node) node.setSiblingIndex(index) })
        }
    }

    /** Draws the batched tracks [first, end); the drawing state is the one prepared by the last pose write. */
    private writeRun(first: number, end: number, positions: Float32Array, vertices: Float32Array, opacity: number, stride: number, capacity: number): number {
        const drawing = this.drawing
        if (!drawing) return 0
        const state = drawing.state
        state[Header.OPACITY] = opacity
        state[Header.STRIDE] = stride
        state[Header.CAPACITY] = capacity
        state[Header.FIRST] = first
        state[Header.END] = end
        return kernel().writeReanim(drawing.keys, drawing.tracks, state, positions, vertices)
    }

    /** Packs track order, visibility, images, colors and blend sources for the kernel. */
    private prepareDrawing(): NonNullable<ReanimPlayer['drawing']> {
        if (this.drawing && !this.drawingStale) return this.drawing
        this.drawingStale = false
        this.releaseDrawing()
        if (!this.releasesOnDestroy && this.node) {
            this.releasesOnDestroy = true
            this.node.once(Node.EventType.NODE_DESTROYED, () => this.releaseDrawing())
        }
        const data = this.requireData(), drawing = kernel(), clip = packClip(data), views = [...this.views]
        // Images are only needed when some track is drawn by a batch.
        const batched = views.some(([, view]) => !view.node)
        const images: Array<FrameGeometry | undefined> = batched ? clip.sprites.map(id => {
            const frame = this.frames.get(id)
            return frame && frameGeometry(frame)
        }) : []
        const tracks = drawing.i32(views.length * TRACK)
        const segments: Segment[] = []
        let run: Extract<Segment, { first: number }> | null = null
        views.forEach(([id, view], index) => {
            const track = view.track ?? data.tracks.find(candidate => candidate.id === id)
            const override = this.frameOverrides.get(id)
            const overrideSlot = override && !view.node ? images.push(frameGeometry(override)) - 1 : -1
            tracks.set(track ? [clip.starts.get(track)!, track.keyframes.length, overrideSlot, view.visible === false ? 0 : 1] : [0, 0, -1, 0], index * TRACK)
            if (view.node) {
                run = null
                segments.push({ trackId: id, view })
                return
            }
            // Batches split where the texture changes; images of one animation normally share an atlas page.
            const image = overrideSlot >= 0 ? images[overrideSlot]
                : track?.keyframes.map(frame => frame.sprite ? images[clip.sprites.indexOf(frame.sprite)] : undefined).find(Boolean)
            if (run && (!image || image.texture === run.frame.texture)) { run.end = index + 1; return }
            if (!image) return
            const segment: Extract<Segment, { first: number }> = {
                first: index, end: index + 1, frame: image,
                source: { writeQuads: (...target) => this.writeRun(segment.first, segment.end, ...target) },
            }
            run = segment
            segments.push(segment)
        })
        const blends = Header.SIZE + views.length * 4, imageStart = blends + views.length * BLEND
        const state = drawing.f64(imageStart + images.length * IMAGE)
        views.forEach(([id], index) => {
            const color = this.trackColors.get(id) ?? Color.WHITE
            state.set([color.r, color.g, color.b, color.a], Header.SIZE + index * 4)
            const from = this.blendDuration > 0 ? this.blendFromPoses.get(id) : undefined
            if (from) state.set([1, from.x, from.y, from.scaleX, from.scaleY, from.skewX, from.skewY, from.alpha], blends + index * BLEND)
        })
        // A missing image keeps a zero-sized slot, which draws nothing.
        images.forEach((image, slot) => { if (image) state.set(image.data, imageStart + slot * IMAGE) })
        state[Header.TRACKS] = views.length
        state[Header.IMAGES] = images.length
        return this.drawing = { keys: clip.keys, tracks, state, segments }
    }

    private releaseDrawing(): void {
        if (!this.drawing) return
        kernel().release(this.drawing.tracks)
        kernel().release(this.drawing.state)
        this.drawing = null
    }

    private writeTrackNode(trackId: string, view: TrackView): void {
        const track = view.track ?? this.requireData().tracks.find(candidate => candidate.id === trackId)
        if (!track) return
        const node = view.node!, sprite = view.sprite!
        const pose = this.visible ? this.sampleAttachedTrack(track) : null
        const frame = this.frameOverrides.get(trackId) ?? (pose?.sprite ? this.frames.get(pose.sprite) : undefined)
        if (!pose || !frame) {
            sprite.enabled = false
            if (view.additive) view.additive.enabled = false
            return
        }

        node.setPosition(pose.x, -pose.y, 0)
        node.angle = -pose.skewX
        const skewDifference = pose.skewX - pose.skewY
        let scaleY = pose.scaleY
        let appliedSkew = 0
        if (skewDifference !== 0) {
            const cosine = Math.cos(toRadian(skewDifference))
            scaleY *= Math.abs(cosine) < 0.001 ? 0.001 : cosine
            appliedSkew = Math.abs(pose.scaleX) <= 0.0001
                ? skewDifference
                : Math.atan(Math.tan(toRadian(skewDifference)) * scaleY / pose.scaleX) * 180 / Math.PI
        }
        view.skew!.setSkew(-appliedSkew, 0)
        node.setScale(pose.scaleX, scaleY, 1)
        sprite.spriteFrame = frame
        const trackColor = this.trackColors.get(trackId) ?? Color.WHITE
        setSpriteColor(sprite,
            Math.round(this.colorOverride.r * trackColor.r / 255),
            Math.round(this.colorOverride.g * trackColor.g / 255),
            Math.round(this.colorOverride.b * trackColor.b / 255),
            Math.round(pose.alpha * this.colorOverride.a * trackColor.a / 255),
        )
        sprite.enabled = true
        if (this.extraAdditive) {
            if (!view.additive) {
                view.additive = uiNode({
                    name: `${trackId}_extra_additive`, parent: node,
                    anchor: { x: 0, y: 1 },
                    sprite: { sizeMode: Sprite.SizeMode.RAW, trim: false },
                }).sprite!
                view.additive.node.setSiblingIndex(0)
                view.additive.customMaterial = getAdditiveSpriteMaterial()
            }
            view.additive.spriteFrame = frame
            setSpriteColor(view.additive,
                this.extraAdditiveColor.r,
                this.extraAdditiveColor.g,
                this.extraAdditiveColor.b,
                Math.round(this.extraAdditiveColor.a * pose.alpha),
            )
        }
        if (view.additive) view.additive.enabled = this.extraAdditive
    }

    private requireData(): Reanim {
        if (!this.data) throw new Error('reanim player is not loaded')
        return this.data
    }

    sampleTrack(trackId: string, timeSeconds = this.timeSeconds): ReanimKeyframe | null {
        const track = this.requireData().tracks.find(candidate => candidate.id === trackId)
        return track ? sampleReanimTrack(track, timeSeconds) : null
    }

    private sampleBlendedTrack(track: ReanimTrack): ReanimKeyframe | null {
        let pose = sampleReanimTrack(track, this.timeSeconds)
        const blendFrom = this.blendFromPoses.get(track.id)
        if (pose && blendFrom && this.blendDuration > 0) {
            pose = blendKeyframes(blendFrom, pose, Math.min(1, this.blendElapsed / this.blendDuration))
        }
        return pose
    }

    private sampleAttachedTrack(track: ReanimTrack): ReanimKeyframe | null {
        let pose = this.sampleBlendedTrack(track)
        if (pose && this.attachment) {
            const { parent, trackId, basePose } = this.attachment
            const parentTrack = parent.requireData().tracks.find(candidate => candidate.id === trackId)
            const parentPose = parentTrack ? parent.sampleAttachedTrack(parentTrack) : null
            pose = parentPose ? attachReanimPose(pose, parentPose, basePose) : null
        }
        return pose
    }

    private clearViews(): void {
        this.trackColors.clear()
        this.followers.clear()
        for (const view of this.views.values()) if (isValid(view.node, true)) view.node!.destroy()
        this.views.clear()
        for (const batch of this.batches) if (isValid(batch.node, true)) batch.node.destroy()
        this.batches = []
        this.releaseDrawing()
        this.drawingStale = true
    }
}

let scratchColor: Color | undefined

/** Avoids allocating a Color for every track on every frame; the setter copies the value. */
function setSpriteColor(sprite: Sprite, r: number, g: number, b: number, a: number): void {
    const current = sprite.color
    if (current?.r === r && current.g === g && current.b === b && current.a === a) return
    const color = scratchColor ??= new Color()
    color.r = r; color.g = g; color.b = b; color.a = a
    sprite.color = color
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

function sameColor(a: Color, b: Color): boolean {
    return a.r === b.r && a.g === b.g && a.b === b.b && a.a === b.a
}

function compareTracks(a: ReanimTrack, b: ReanimTrack): number {
    return a.zIndex - b.zIndex || a.id.localeCompare(b.id)
}

function positiveFinite(value: number, name: string): number {
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive and finite`)
    return value
}

let blendFrom: Float64Array | undefined, blendTo: Float64Array | undefined

function blendKeyframes(from: ReanimKeyframe, to: ReanimKeyframe, ratio: number): ReanimKeyframe {
    const drawing = kernel()
    const start = blendFrom ??= drawing.f64(7), pose = blendTo ??= drawing.f64(7)
    start.set([from.x, from.y, from.scaleX, from.scaleY, from.skewX, from.skewY, from.alpha])
    pose.set([to.x, to.y, to.scaleX, to.scaleY, to.skewX, to.skewY, to.alpha])
    drawing.blend(start, ratio, pose)
    return { ...to, x: pose[0], y: pose[1], scaleX: pose[2], scaleY: pose[3], skewX: pose[4], skewY: pose[5], alpha: pose[6] }
}
