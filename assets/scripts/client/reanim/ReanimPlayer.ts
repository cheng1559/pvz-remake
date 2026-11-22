import { _decorator, Color, Component, director, Director, gfx, isValid, Mask, Material, Node, Sprite, SpriteFrame, toRadian, UISkew, UITransform, Vec3 } from 'cc'
import type { Tint } from '@/client/view/tints'
import { loadedReanim, loadReanim } from './ReanimAssets'
import { uiNode } from '@/client/view/uiNode'
import { gameClock } from '@/core/GameClock'
import { animationFrame } from '@/client/render/AnimationAtlas'
import { KernelBatch, loadKernelMaterial, pictureMaterial, type KernelQuadSource } from '@/client/render/KernelBatch'
import { BLEND, Header, IMAGE, kernel, KEY, TRACK } from '@/shared/kernel/index'
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
    renderOverride?: TrackRenderOverride
    /** Drawn this far from where its animation has it, Y down (setTrackOffset). */
    offset?: { x: number, y: number }
}

interface TrackRenderOverride {
    color: Color
    extraAdditive: boolean
    extraAdditiveColor: Color
    offsetX: number
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
/** `trackSprites`: the sprite slots each track shows, once each, in the order its keyframes first show them. */
interface PackedClip { keys: Float64Array, starts: Map<ReanimTrack, number>, sprites: string[], trackSprites: Map<ReanimTrack, number[]> }
const packedClips = new WeakMap<Reanim, PackedClip>()
function packClip(data: Reanim): PackedClip {
    let packed = packedClips.get(data)
    if (packed) return packed
    const sprites = [...new Set(data.tracks.flatMap(track => track.keyframes.flatMap(frame => frame.sprite ? [frame.sprite] : [])))].sort()
    const slots = new Map(sprites.map((id, slot) => [id, slot]))
    const keys = kernel().f64(data.tracks.reduce((sum, track) => sum + track.keyframes.length, 0) * KEY)
    const starts = new Map<ReanimTrack, number>(), trackSprites = new Map<ReanimTrack, number[]>()
    let index = 0
    for (const track of data.tracks) {
        starts.set(track, index)
        trackSprites.set(track, [...new Set(track.keyframes.flatMap(frame => frame.sprite ? [slots.get(frame.sprite)!] : []))])
        packKeyframes(track.keyframes, keys, index, frame => frame.sprite ? slots.get(frame.sprite)! : -1)
        index += track.keyframes.length
    }
    packedClips.set(data, packed = { keys, starts, sprites, trackSprites })
    return packed
}

/** Consecutive tracks drawn by one batch, or a track drawn by its own node. */
/**
 * What a player draws, in order: a batch of tracks, a track drawn by its own node, or the nodes drawn after a batched
 * track (drawAfterTrack).
 */
type Segment = ({ first: number, end: number, frame: FrameGeometry, source: KernelQuadSource } | { trackId: string, view: TrackView }
    | { trackId: string, followed: true }) & { clipped: boolean }

/**
 * Graphics::SetClipRect around Reanimation::Draw: a rectangle in the player's own coordinates, from its origin with
 * down positive, and the tracks drawn outside it (ReanimatorTrackInstance::mIgnoreClipRect).
 */
export interface ReanimClip {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
    readonly ignore?: readonly string[]
}

let additiveSpriteMaterial: Material | null = null
interface TrackAttachment {
    parent: ReanimPlayer
    trackId: string
    basePose: ReanimKeyframe
}

/**
 * Players whose node is not shown, with pose changes waiting: a zombie being set up turns parts on and off and swaps
 * sprites several times before it shows, and writing each change at once rebuilt its drawing every time (a wave of
 * 160 zombies held one frame for a fifth of a second). Nothing hidden is drawn, so one write before the frame that
 * first draws it is enough.
 */
const hiddenPoses = new Set<ReanimPlayer>()
let hiddenPosesFlushed = false
function waitForShown(player: ReanimPlayer): void {
    hiddenPoses.add(player)
    if (hiddenPosesFlushed) return
    hiddenPosesFlushed = true
    director.on(Director.EVENT_BEFORE_DRAW, () => {
        for (const waiting of hiddenPoses) {
            if (!waiting.isValid) hiddenPoses.delete(waiting)
            else if (waiting.node.activeInHierarchy) {
                hiddenPoses.delete(waiting)
                waiting.flushPose()
            }
        }
    })
}

@ccclass('ReanimPlayer')
export class ReanimPlayer extends Component {
    private data: Reanim | null = null
    private readonly frames = new Map<string, SpriteFrame>()
    private readonly views = new Map<string, TrackView>()
    private timeSeconds = 0
    /**
     * REANIM_*_FULL_LAST_FRAME (a plant's blink): its last picture keeps a frame's time of its own, as the others do.
     * Otherwise, as Reanimation::GetFrameTime has it, the clip's pictures are spread over its whole length, its last
     * reached as it ends (a loop coming round to its first from there).
     */
    fullLastFrame = false
    private playing = false
    private loop = true
    private rate = 1
    private onlyTracks?: readonly string[]
    private visible = true
    private hideOnFinish = true
    private onFinish: (() => void) | null = null
    private readonly blendFromPoses = new Map<string, ReanimKeyframe>()
    private blendDuration = 0
    private blendElapsed = 0
    private readonly frameOverrides = new Map<string, SpriteFrame>()
    private attachment: TrackAttachment | null = null
    /** Players attached to this one's tracks; stale entries are skipped and pruned. */
    private readonly trackAttachments = new Set<ReanimPlayer>()
    private restoredAttachmentTrackId: string | null = null
    private restoredAttachmentBasePose: ReanimKeyframe | null = null
    private extraAdditive = false
    private extraAdditiveColor = Color.BLACK.clone()
    private colorOverride = Color.WHITE.clone()
    /** Drawn in this color over the color override and hit flash (see setTint): chilled, or mind-controlled. */
    private tint: Tint | undefined
    private poseDirty = false
    private batches: KernelBatch[] = []
    private supersampled = false
    /** Child nodes drawn right after a track; see drawAfterTrack. */
    private readonly followers = new Map<string, Node[]>()
    /** See setClip; one mask for each run of clipped tracks, in drawing order. */
    private clipRect: ReanimClip | null = null
    private clipMasks: Node[] = []
    /** Kernel arrays are released when the node is destroyed, even if it was never activated. */
    private releasesOnDestroy = false
    /** Kernel input; rebuilt when tracks, images, track colors or blend sources change. */
    private drawing: { keys: Float64Array, tracks: Int32Array, state: Float64Array, segments: Segment[] } | null = null
    private drawingStale = true

    get durationSeconds(): number { return this.requireData().durationSeconds }
    /** The frames a second the loaded clip was made at (Reanim.fps), its own pace. */
    get fps(): number { return this.requireData().fps }
    /** Where a track of a clip in memory (prepareReanims) is in its first frame, for attaching from it. */
    static firstPose(id: string, trackId: string): ReanimKeyframe | undefined {
        const track = loadedReanim(id)?.data.tracks.find(candidate => candidate.id === trackId)
        return track && sampleReanimTrack(track, 0) || undefined
    }
    /** How long a clip in memory (prepareReanims) is, for timing it before a player shows it. */
    static duration(id: string): number | undefined {
        return loadedReanim(id)?.data.durationSeconds
    }
    /** How many frames of its own a clip in memory (prepareReanims) is, at the pace it was made at. */
    static frames(id: string): number | undefined {
        const data = loadedReanim(id)?.data
        return data && data.durationSeconds * data.fps
    }
    /** The loaded clip, or null before the first load. */
    get loadedId(): string | null { return this.data?.id ?? null }
    get lastFrameTimeSeconds(): number {
        return lastKeyTime(this.requireData())
    }

    /** Where in its pictures the clip is (Reanimation::GetFrameTime): its time, spread over the pictures' own span. */
    private get poseSeconds(): number {
        const data = this.data
        if (!data || this.fullLastFrame || !(data.durationSeconds > 0)) return this.timeSeconds
        return this.timeSeconds * lastKeyTime(data) / data.durationSeconds
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
     * Draws a child node right after the track, where Reanimation::DrawRenderGroup draws the track's attachment: the
     * batch the track is drawn in ends with it, and the next one starts after the node. The track needs no node of its
     * own for that (a shooter's head after its stem, which shows nothing). The order holds while the batches are
     * reordered; reloading the animation forgets it.
     */
    drawAfterTrack(node: Node, trackId: string): void {
        const followers = this.followers.get(trackId) ?? []
        if (!followers.includes(node)) followers.push(node)
        this.followers.set(trackId, followers)
        node.setParent(this.node)
        this.drawingStale = true
        this.writePose()
    }

    /**
     * Draws the tracks inside `clip` but those it names to `ignore`; null draws them whole. A change of the rectangle
     * alone only moves the masks the clipped runs are drawn under.
     */
    setClip(clip: ReanimClip | null): void {
        const before = this.clipRect, ignore = clip?.ignore ?? []
        this.clipRect = clip && { x: clip.x, y: clip.y, width: clip.width, height: clip.height, ignore: [...ignore] }
        if ((before === null) !== (clip === null) || before && (before.ignore!.length !== ignore.length || before.ignore!.some((id, index) => id !== ignore[index]))) {
            this.drawingStale = true
            this.applyPose()
        }
        for (const mask of this.clipMasks) this.placeClipMask(mask)
    }

    getAnimation(): Reanim {
        return parseReanim(this.requireData())
    }

    getSpriteFrame(spriteId: string): SpriteFrame | undefined {
        return this.frames.get(spriteId)
    }

    /**
     * Replace poses/timing while keeping track nodes, attached UI and playback state. A player at the end of its poses
     * (a clip that has finished and holds) stays at the end of the new ones, however long they are; any other keeps
     * its time, within them.
     */
    replaceAnimation(value: unknown): void {
        const data = parseReanim(value)
        const previous = this.requireData()
        if (data.id !== previous.id || data.tracks.length !== this.views.size ||
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
        this.timeSeconds = this.timeSeconds >= previous.durationSeconds ? data.durationSeconds : Math.min(this.timeSeconds, data.durationSeconds)
        this.applyPose()
    }

    /** Loads a clip by its resource ID (ReanimAssets) and shows it from its start. */
    async load(id: string): Promise<void> {
        const [{ data, frames }] = await Promise.all([loadReanim(id), loadKernelMaterial()])
        if (!this.node?.isValid) throw new Error('reanim player was destroyed while loading')

        this.clearViews()
        this.onlyTracks = undefined
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

    /**
     * Plays another clip in place, from its start: one body's clips are files of their own, and going from one to
     * another only changes which is played. This node and its batches stay, with its attachment to a parent's track,
     * its colors and what was put after tracks both clips have; what was set on single tracks (shown or hidden, other
     * images, colors) starts over, as with a clip just loaded. `blendSeconds`: from the pose it shows now (the
     * original's StartBlend). The clip is in memory already (prepareReanims).
     */
    change(id: string, blendSeconds = 0, onlyTracks?: readonly string[]): void {
        const assets = loadedReanim(id)
        if (!assets) throw new Error(`reanim is not loaded: ${id}`)
        const previous = this.data
        // The pose showing now, before its tracks are the other clip's.
        const poses = previous && blendSeconds > 0 ? previous.tracks.map(track => [track.id, this.sampleBlendedTrack(track)] as const) : []
        // A Mod may have extended this player's poses with replaceAnimation. Replaying the same ID keeps them.
        const filterChanged = this.onlyTracks !== onlyTracks
        this.onlyTracks = onlyTracks
        if (previous?.id !== id) {
            const views = new Map(this.views)
            this.clearTrackViews()
            this.frameOverrides.clear()
            this.data = assets.data
            this.frames.clear()
            for (const [spriteId, frame] of assets.frames) this.frames.set(spriteId, frame)
            for (const track of [...assets.data.tracks].sort(compareTracks)) {
                // A track's own node stays for what is attached to it or drawn after it.
                const { node, sprite, skew, additive } = views.get(track.id) ?? {}
                views.delete(track.id)
                if (node) node.active = this.trackIncluded(track.id)
                this.views.set(track.id, node ? { track, visible: true, node, sprite, skew, additive } : { track, visible: true })
            }
            for (const [trackId, view] of views) {
                if (isValid(view.node, true)) view.node!.destroy()
                this.followers.delete(trackId)
            }
        } else if (filterChanged) {
            for (const [trackId, view] of this.views) if (view.node) view.node.active = view.visible && this.trackIncluded(trackId)
        }
        this.blendFromPoses.clear()
        for (const [trackId, pose] of poses) if (this.views.has(trackId) && pose?.sprite) this.blendFromPoses.set(trackId, pose)
        this.blendDuration = blendSeconds > 0 ? blendSeconds : 0
        this.blendElapsed = 0
        this.timeSeconds = 0
        this.drawingStale = true
        this.applyPose()
    }

    /** `basePose` defaults to the parent clip's first frame, like a reanim's first attachment. */
    attachToTrack(parent: ReanimPlayer, trackId: string, basePose?: ReanimKeyframe): void {
        this.requireData()
        const track = parent.requireData().tracks.find(candidate => candidate.id === trackId)
        if (!track) throw new Error(`unknown parent reanim track: ${trackId}`)
        basePose ??= sampleReanimTrack(track, 0) ?? undefined
        if (!basePose) throw new Error(`parent reanim track has no base pose: ${trackId}`)
        this.attachment = { parent, trackId, basePose }
        parent.trackAttachments.add(this)
        this.restoredAttachmentTrackId = null
        this.restoredAttachmentBasePose = null
        this.applyPose()
    }

    get attachmentTrackId(): string | null {
        return this.attachment?.trackId ?? this.restoredAttachmentTrackId
    }

    /** The parent track's pose this attachment is relative to. */
    get attachmentBasePose(): ReanimKeyframe | null {
        return this.attachment?.basePose ?? this.restoredAttachmentBasePose
    }

    /** Reanimation::PropogateColorToAttachments: track attachments take this player's colors. */
    private attachedPlayers(): ReanimPlayer[] {
        const players: ReanimPlayer[] = []
        for (const player of this.trackAttachments) {
            if (player.isValid && player.attachment?.parent === this) players.push(player)
            else this.trackAttachments.delete(player)
        }
        return players
    }

    reattachAfterRestore(parent: ReanimPlayer): void {
        if (!this.restoredAttachmentTrackId) throw new Error('reanim snapshot has no attachment to restore')
        this.attachToTrack(parent, this.restoredAttachmentTrackId, this.restoredAttachmentBasePose ?? undefined)
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

    /**
     * Plays the loaded clip from here (or `timeSeconds`). `fps`: frames of it a second (Reanimation::mAnimRate); it goes
     * on at the pace it had without, its own (`fps`) at first.
     */
    play(options: {
        loop?: boolean
        fps?: number
        timeSeconds?: number
        hideOnFinish?: boolean
        onFinish?: () => void
    } = {}): void {
        this.requireData()
        if (options.fps != null) this.setFps(options.fps)
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

    /**
     * The frames a second it plays on at from here, where it is: 0 stands it still where it plays (a frozen plant's or
     * zombie's body, whose server animation stops), and it goes on at the next pace.
     */
    setFps(fps: number): void {
        if (!Number.isFinite(fps) || fps < 0) throw new Error('reanim fps must be finite and non-negative')
        this.rate = fps / this.requireData().fps
    }

    /** The frames a second it plays at. */
    get playbackFps(): number { return this.rate * this.requireData().fps }

    setOnFinish(callback: (() => void) | null): void {
        this.requireData()
        this.onFinish = callback
    }

    hide(): void {
        this.playing = false
        this.visible = false
        this.applyPose()
    }

    /** Every track ID of the loaded clip; the list is the player's own, made once for the clip and not to be changed. */
    get trackIds(): readonly string[] {
        return this.trackIdList ??= [...this.views.keys()]
    }
    private trackIdList?: string[]

    private clearTrackViews(): void {
        this.views.clear()
        this.trackIdList = undefined
    }

    private trackIncluded(id: string): boolean {
        return !this.onlyTracks || this.onlyTracks.includes(id)
    }

    /** Exact track IDs; ones this clip lacks are skipped. */
    setTracksVisible(trackIds: readonly string[], visible: boolean): void {
        let changed = false
        for (const [id, view] of this.views) if (trackIds.includes(id) && view.visible !== visible) {
            view.visible = visible
            if (view.node) view.node.active = visible && this.trackIncluded(id)
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

    /** A shield or attachment can draw independently of the body's tint and hit flash. */
    setTrackRenderOverride(trackId: string, override: TrackRenderOverride | null): void {
        const view = this.views.get(trackId)
        if (!view) throw new Error(`unknown reanim track: ${trackId}`)
        const previous = view.renderOverride
        if (!override && !previous) return
        if (override && previous && sameColor(override.color, previous.color) &&
            sameColor(override.extraAdditiveColor, previous.extraAdditiveColor) &&
            override.extraAdditive === previous.extraAdditive && override.offsetX === previous.offsetX) return
        view.renderOverride = override ? { ...override, color: override.color.clone(), extraAdditiveColor: override.extraAdditiveColor.clone() } : undefined
        const created = override && !view.node
        if (created) {
            this.createTrackNode(trackId, view)
            this.drawingStale = true
        }
        this.applyPose(created ? undefined : trackId)
    }

    /**
     * A track drawn moved by `offset` (Y down) from where its animation has it, as Reanimation::SetShakeOverride shakes
     * one: through a node of its own, so the rest still draws in batches, in the body's color, tint and flash. `null`
     * puts it back.
     */
    setTrackOffset(trackId: string, offset: { x: number, y: number } | null): void {
        const view = this.views.get(trackId)
        if (!view) throw new Error(`unknown reanim track: ${trackId}`)
        if (offset?.x === view.offset?.x && offset?.y === view.offset?.y) return
        view.offset = offset ? { x: offset.x, y: offset.y } : undefined
        const created = offset && !view.node
        if (created) {
            this.createTrackNode(trackId, view)
            this.drawingStale = true
        }
        if (view.node) this.applyPose(created ? undefined : trackId)
    }

    /** Also applies to players attached to this one's tracks, like the original color propagation. */
    setExtraAdditiveDraw(enabled: boolean, color: Color = Color.BLACK): void {
        if (this.extraAdditive !== enabled || !sameColor(this.extraAdditiveColor, color)) {
            this.extraAdditive = enabled
            this.extraAdditiveColor = color.clone()
            this.applyPose()
        }
        for (const player of this.attachedPlayers()) player.setExtraAdditiveDraw(enabled, color)
    }

    /**
     * Zombie::DrawReanim's tint, the one way a chilled or mind-controlled zombie or plant (client/view/tints.ts) is
     * drawn: the color is multiplied by the tint and the tint is added over the hit flash. It stays apart from the color
     * override and hit flash so that the views keep setting those, and, like them, applies to players attached to this
     * one's tracks. A chilled one's slower animation is the server's, which sends the rate it plays at.
     */
    setTint(tint?: Tint): void {
        if (this.tint?.r !== tint?.r || this.tint?.g !== tint?.g || this.tint?.b !== tint?.b) {
            this.tint = tint && { r: tint.r, g: tint.g, b: tint.b }
            this.applyPose()
        }
        for (const player of this.attachedPlayers()) player.setTint(tint)
    }

    private get drawColor(): Color {
        const color = this.colorOverride, tint = this.tint
        return tint ? new Color(color.r * tint.r / 255, color.g * tint.g / 255, color.b * tint.b / 255, color.a) : color
    }

    private get drawExtraAdditive(): boolean { return this.extraAdditive || !!this.tint }

    private get drawExtraAdditiveColor(): Color {
        const tint = this.tint
        if (!tint) return this.extraAdditiveColor
        const extra = this.extraAdditive ? this.extraAdditiveColor : Color.BLACK
        return new Color(Math.min(255, extra.r + tint.r), Math.min(255, extra.g + tint.g), Math.min(255, extra.b + tint.b), 255)
    }

    /**
     * For a picture drawn much smaller than its art, a seed packet's: its images take four samples to a screen pixel
     * (pictureMaterial), and those of the players attached to its tracks.
     */
    setSupersampled(): void {
        if (!this.supersampled) {
            this.supersampled = true
            for (const batch of this.batches) batch?.setSupersampled(true)
            this.applyPose()
        }
        for (const player of this.attachedPlayers()) player.setSupersampled()
    }

    /** Also applies to players attached to this one's tracks, like the original color propagation. */
    setColorOverride(color: Color = Color.WHITE): void {
        if (!sameColor(this.colorOverride, color)) {
            this.colorOverride = color.clone()
            this.applyPose()
        }
        for (const player of this.attachedPlayers()) player.setColorOverride(color)
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
        this.endFinishedBlend()
    }

    /** Moves its blend on by `deltaSeconds` and leaves it where it is in its clip: for a player stopped and driven by seek. */
    advanceBlend(deltaSeconds: number): void {
        if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
            throw new Error('reanim deltaSeconds must be finite and non-negative')
        }
        if (this.blendDuration <= 0) return
        this.blendElapsed += deltaSeconds
        this.applyPose()
        this.endFinishedBlend()
    }

    private endFinishedBlend(): void {
        if (this.blendElapsed < this.blendDuration) return
        if (this.blendFromPoses.size) this.drawingStale = true
        this.blendFromPoses.clear()
        this.blendDuration = 0
        this.blendElapsed = 0
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
            attachmentBasePose: this.attachmentBasePose ? { ...this.attachmentBasePose } : null,
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
        this.restoredAttachmentBasePose = snapshot.attachmentBasePose
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
            active: view.visible !== false && this.trackIncluded(trackId),
            anchor: { x: 0, y: 1 },
            sprite: { sizeMode: Sprite.SizeMode.RAW, trim: false },
            skew: { x: 0, y: 0 },
        })
        Object.assign(view, { node: parts.node, sprite: parts.sprite!, skew: parts.skew! })
    }

    /** The clip's rectangle, drawn by a mask at the player's origin (its anchor puts the rectangle where it goes). */
    private placeClipMask(mask: Node): void {
        const clip = this.clipRect
        mask.active = !!clip && clip.width > 0 && clip.height > 0
        if (!clip || !mask.active) return
        uiNode({ node: mask, size: { width: clip.width, height: clip.height }, anchor: { x: -clip.x / clip.width, y: 1 + clip.y / clip.height } })
    }

    private clipMaskAt(index: number): Node {
        let mask = this.clipMasks[index]
        if (!mask) {
            mask = uiNode({ name: 'ReanimClip', parent: this.node, layer: this.node.layer, mask: Mask.Type.GRAPHICS_RECT }).node
            this.clipMasks[index] = mask
        }
        this.placeClipMask(mask)
        return mask
    }

    private batchAt(index: number): KernelBatch {
        let batch = this.batches[index]
        if (!batch) {
            batch = uiNode({ name: 'ReanimBatch', parent: this.node, layer: this.node.layer }).node.addComponent(KernelBatch)
            batch.sizeMode = Sprite.SizeMode.CUSTOM
            batch.setSupersampled(this.supersampled)
            this.batches[index] = batch
        }
        return batch
    }

    private applyPose(trackId?: string): void {
        if (this.enabledInHierarchy) { this.poseDirty = true; return }
        // Hidden, it waits to show (hiddenPoses). Shown but disabled (a paused or frozen lawn), it writes now.
        if (this.node?.activeInHierarchy === false) { this.poseDirty = true; waitForShown(this); return }
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
        const state = drawing.state, color = this.drawColor, extra = this.drawExtraAdditiveColor
        // Every animation every frame: what is made here is made that often, so the usual case makes nothing.
        let matrix = IDENTITY, shown = this.visible
        if (shown && this.attachment) {
            const { parent, trackId: parentTrackId, basePose } = this.attachment
            const parentTrack = parent.requireData().tracks.find(candidate => candidate.id === parentTrackId)
            const parentPose = parentTrack ? parent.sampleAttachedTrack(parentTrack) : null
            if (parentPose) matrix = attachmentMatrix(parentPose, basePose)
            else shown = false
        }
        state[Header.TIME] = this.poseSeconds
        state[Header.RED] = color.r; state[Header.GREEN] = color.g; state[Header.BLUE] = color.b; state[Header.ALPHA] = color.a
        state[Header.EXTRA] = this.drawExtraAdditive ? 1 : 0
        state[Header.EXTRA_RED] = extra.r; state[Header.EXTRA_GREEN] = extra.g; state[Header.EXTRA_BLUE] = extra.b; state[Header.EXTRA_ALPHA] = extra.a
        state[Header.TINTED] = color.r !== 255 || color.g !== 255 || color.b !== 255 ? 1 : 0
        state[Header.BLENDING] = this.blendDuration > 0 ? 1 : 0
        state[Header.RATIO] = this.blendDuration > 0 ? Math.min(1, this.blendElapsed / this.blendDuration) : 0
        state[Header.MATRIX_A] = matrix.a; state[Header.MATRIX_B] = matrix.b; state[Header.MATRIX_C] = matrix.c
        state[Header.MATRIX_D] = matrix.d; state[Header.MATRIX_X] = matrix.tx; state[Header.MATRIX_Y] = matrix.ty
        // What draws, in drawing order, and whether each is clipped: the player's own two lists, filled anew.
        const order = this.order ??= [], clips = this.orderClips ??= []
        let count = 0, used = 0, anyClipped = false
        const segments = drawing.segments
        for (let index = 0; index < segments.length; index++) {
            const segment = segments[index], clipped = segment.clipped
            if ('view' in segment) {
                this.writeTrackNode(segment.trackId, segment.view)
                if (this.ours(segment.view.node!)) { order[count] = segment.view.node!; clips[count++] = clipped }
            }
            if ('view' in segment || 'followed' in segment) {
                const followers = this.followers.get(segment.trackId)
                if (followers) for (const node of followers) if (this.ours(node)) { order[count] = node; clips[count++] = clipped }
            } else if (shown) {
                const batch = this.batchAt(used++)
                // Room for every track and its extra additive image; only the quads written are drawn.
                batch.setSource(segment.source, segment.frame.frame, (segment.end - segment.first) * 2)
                order[count] = batch.node
                clips[count++] = clipped
            } else continue
            if (clipped) anyClipped = true
        }
        // Nothing of an earlier, longer order is kept alive by the list.
        order.length = count
        for (let i = used; i < this.batches.length; i++) this.batches[i].clear()
        if (!this.batches.length && !this.followers.size && !this.clipMasks.length) return
        if (anyClipped || this.clipMasks.length) this.arrange(order, clips)
        else place(this.node, order)
    }

    /** What draws, in drawing order, as writePose last listed it, and whether each is clipped. */
    private order?: Node[]
    private orderClips?: boolean[]

    /** A node is this player's to put in order: one moved under another parent (the menu's wood sign) keeps that parent's. */
    private ours(node: Node): boolean {
        const parent = node.parent
        return parent === this.node || this.clipMasks.includes(parent!)
    }

    /** Puts what draws in drawing order, each run of clipped ones under a clip mask of its own. */
    private arrange(order: readonly Node[], clips: readonly boolean[]): void {
        const top: Node[] = [], runs: Node[][] = []
        for (let index = 0; index < order.length; index++) {
            const node = order[index]
            if (!clips[index]) { top.push(node); continue }
            if (!index || !clips[index - 1]) top.push(this.clipMaskAt(runs.push([]) - 1))
            runs[runs.length - 1].push(node)
        }
        for (let i = runs.length; i < this.clipMasks.length; i++) this.clipMasks[i].active = false
        place(this.node, top)
        for (let index = 0; index < runs.length; index++) place(this.clipMasks[index], runs[index])
    }

    /** Draws the batched tracks [first, end); the drawing state is the one prepared by the last pose write. */
    private writeRun(first: number, end: number, positions: Float32Array, vertices: Float32Array, opacity: number, stride: number, capacity: number,
        placement?: Float64Array): number {
        const drawing = this.drawing
        if (!drawing) return 0
        const state = drawing.state
        state[Header.PLACED] = placement ? 1 : 0
        if (placement) state.set(placement, Header.PLACE)
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
        const clipRect = this.clipRect
        views.forEach(([id, view], index) => {
            const clipped = !!clipRect && !clipRect.ignore!.includes(id)
            const track = view.track ?? data.tracks.find(candidate => candidate.id === id)
            const override = this.frameOverrides.get(id)
            const overrideSlot = override && !view.node ? images.push(frameGeometry(override)) - 1 : -1
            tracks.set(track ? [clip.starts.get(track)!, track.keyframes.length, overrideSlot, view.visible !== false && this.trackIncluded(id) ? 1 : 0] : [0, 0, -1, 0], index * TRACK)
            // Packed once per clip: walking every keyframe here took most of a rebuild, 160 times over when a wave arrives.
            const trackImages = view.node ? [] : overrideSlot >= 0 ? [images[overrideSlot]]
                : track ? (clip.trackSprites.get(track) ?? []).map(slot => images[slot]) : []
            const image = trackImages.find(Boolean)
            // A batch binds one texture. Images too many for one atlas page can spread over several,
            // so a track switching between pages draws through its own node.
            if (image && trackImages.some(other => other && other.texture !== image.texture)) this.createTrackNode(id, view)
            if (view.node) {
                run = null
                segments.push({ trackId: id, view, clipped })
                return
            }
            // Batches split where the texture changes, which images of one animation normally share, and where the
            // clip starts or ends.
            if (run && (!image || image.texture === run.frame.texture && run.clipped === clipped)) run.end = index + 1
            else if (image) {
                const segment: Extract<Segment, { first: number }> = {
                    first: index, end: index + 1, frame: image, clipped,
                    // Called for every batch every frame: its arguments one by one, where a rest would make an array of them.
                    source: { writeQuads: (positions, vertices, opacity, stride, capacity, placement) =>
                        this.writeRun(segment.first, segment.end, positions, vertices, opacity, stride, capacity, placement) },
                }
                run = segment
                segments.push(segment)
            }
            // What is drawn after the track (drawAfterTrack) comes between the batch it ends and the next.
            if (this.followers.has(id)) {
                run = null
                segments.push({ trackId: id, followed: true, clipped })
            }
        })
        const blends = Header.SIZE + views.length * 4, imageStart = blends + views.length * BLEND
        const state = drawing.f64(imageStart + images.length * IMAGE)
        views.forEach(([id], index) => {
            // A track has no color of its own: the kernel's per-track color stays white.
            state.set([255, 255, 255, 255], Header.SIZE + index * 4)
            const from = this.blendDuration > 0 ? this.blendFromPoses.get(id) : undefined
            if (from) state.set([1, from.x, from.y, from.scaleX, from.scaleY, from.skewX, from.skewY, from.alpha], blends + index * BLEND)
        })
        // A missing image keeps a zero-sized slot, which draws nothing.
        images.forEach((image, slot) => { if (image) state.set(image.data, imageStart + slot * IMAGE) })
        state[Header.TRACKS] = views.length
        state[Header.IMAGES] = images.length
        state[Header.RATE] = data.fps
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

        const override = view.renderOverride
        const color = override?.color ?? this.drawColor
        const extraAdditive = override?.extraAdditive ?? this.drawExtraAdditive
        const extraColor = override?.extraAdditiveColor ?? this.drawExtraAdditiveColor
        node.setPosition(pose.x + (override?.offsetX ?? 0) + (view.offset?.x ?? 0), -(pose.y + (view.offset?.y ?? 0)), 0)
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
        if (this.supersampled && sprite.customMaterial !== pictureMaterial()) sprite.customMaterial = pictureMaterial()
        setSpriteColor(sprite, color.r, color.g, color.b, Math.round(pose.alpha * color.a))
        sprite.enabled = true
        if (extraAdditive) {
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
                extraColor.r,
                extraColor.g,
                extraColor.b,
                Math.round(extraColor.a * pose.alpha),
            )
        }
        if (view.additive) view.additive.enabled = extraAdditive
    }

    private requireData(): Reanim {
        if (!this.data) throw new Error('reanim player is not loaded')
        return this.data
    }

    sampleTrack(trackId: string, timeSeconds = this.poseSeconds): ReanimKeyframe | null {
        const track = this.requireData().tracks.find(candidate => candidate.id === trackId)
        return track ? sampleReanimTrack(track, timeSeconds) : null
    }

    private sampleBlendedTrack(track: ReanimTrack): ReanimKeyframe | null {
        let pose = sampleReanimTrack(track, this.poseSeconds)
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
        this.followers.clear()
        for (const view of this.views.values()) if (isValid(view.node, true)) view.node!.destroy()
        this.clearTrackViews()
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

/** The matrix of a player on no part of another: its poses as they are. */
const IDENTITY: ReturnType<typeof attachmentMatrix> = { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }

/** Has `nodes` the first children of `parent`, in their order. */
function place(parent: Node, nodes: readonly Node[]): void {
    const children = parent.children
    for (let index = 0; index < nodes.length; index++) {
        const node = nodes[index]
        // In its place among the parent's children, it is the parent's: every frame's case, for which the node is
        // not asked for its parent, a call into the native engine each time.
        if (children[index] === node) continue
        if (node.parent !== parent) node.setParent(parent)
        if (parent.children[index] !== node) node.setSiblingIndex(index)
    }
}

/** The time of a clip's last picture, of any track: what its pictures span. */
const lastKeyTimes = new WeakMap<Reanim, number>()
function lastKeyTime(data: Reanim): number {
    let time = lastKeyTimes.get(data)
    if (time === undefined) lastKeyTimes.set(data, time = Math.max(0, ...data.tracks.map(track => track.keyframes[track.keyframes.length - 1].timeSeconds)))
    return time
}

function blendKeyframes(from: ReanimKeyframe, to: ReanimKeyframe, ratio: number): ReanimKeyframe {
    const drawing = kernel()
    const start = blendFrom ??= drawing.f64(7), pose = blendTo ??= drawing.f64(7)
    start.set([from.x, from.y, from.scaleX, from.scaleY, from.skewX, from.skewY, from.alpha])
    pose.set([to.x, to.y, to.scaleX, to.scaleY, to.skewX, to.skewY, to.alpha])
    drawing.blend(start, ratio, pose)
    return { ...to, x: pose[0], y: pose[1], scaleX: pose[2], scaleY: pose[3], skewX: pose[4], skewY: pose[5], alpha: pose[6] }
}
