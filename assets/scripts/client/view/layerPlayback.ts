import type { Node } from 'cc'
import type { ClientAnimationClip } from '@/client/content/ClientAnimationRegistry'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import type { AnimationClip } from '@/shared/content/gameplay'
import type { ReanimKeyframe } from '@/shared/content/reanim'
import { ASSET_FPS } from '@/shared/content/animation'

/** Seconds of a clip's own pictures to a frame of an animation: at the pace they were made at (`fps`, 12 by default). */
function secondsPerFrame(clip: ClientAnimationClip): number {
    return (clip.rateScale ?? 1) / (clip.fps ?? 12)
}

/**
 * How long a loaded Reanim is, in the frames of its own pace (12 a second): what a view's Mod times a clip of its own
 * by (PlantView.ownFrames, ZombieView.ownFrames).
 */
export function ownFrames(reanimId: string): number {
    const seconds = ReanimPlayer.duration(reanimId)
    if (seconds === undefined) throw new Error(`Reanim is not loaded: ${reanimId}`)
    return seconds * ASSET_FPS
}

/** Within this of a clip's length, pictures are as long as the clip: their length is a sum of seconds. */
const END = 1e-6

/**
 * How a player shows a layer (LayerShown) on the presentation's clip, which may be as long as it likes: a loop goes at
 * the layer's rate and comes round by its own length; a clip played once goes at that rate over its own pictures and
 * stays on its last; one that fits a time (`frames`) is stretched over that many of the animation's frames.
 */
export function layerPlayback(shown: LayerShown, durationSeconds: number, time = shown.time): { loop: boolean, rate: number, timeSeconds: number } {
    const { clip, frames } = shown
    // Seconds of the clip's own pictures to a frame of the animation's.
    const length = frames === undefined ? secondsPerFrame(clip) : durationSeconds / frames
    return { loop: frames === undefined && !shown.once, rate: shown.rate * length, timeSeconds: (frames === undefined ? time : Math.min(time, frames)) * length }
}

/** What a layer shows: a clip of the presentation, and how far into it in the animation's frames. */
export interface LayerShown {
    /** Names what is shown: a layer shown something else starts it from the beginning. */
    key: string
    clip: ClientAnimationClip
    time: number
    /** Frames a second. */
    rate: number
    /** It plays once over its own pictures, and stays on its last; a loop otherwise. */
    once?: true
    /** It plays once, over this many frames whatever its own length (it fits a time). */
    frames?: number
    hidden?: boolean
    /**
     * It goes with another layer (a clip's `sync`): where that one is, as a part of its own pictures (`time` of `own`
     * frames). It starts at the same part of its own (Reanimation::mAnimTime is a part of a clip), and goes on at its rate.
     */
    sync?: { time: number, own: number }
}

/** A layer's clips: the presentation's picture of one, and the animation's clip of the name (none for one shown in its place). */
export interface LayerClips {
    picture(name: string): ClientAnimationClip
    played(name: string): AnimationClip | undefined
    /** How long a picture is, in seconds. */
    duration(reanimId: string): number
}

/**
 * What a layer shows of what it plays (`state`, a LayerSnapshot, among the animation's `layers`). A clip of the
 * animation that ends is played as the original plays any Reanim, at its rate over its own pictures, and ends where
 * they do (Reanimation::mLoopCount), if they are no longer than the clip: one that goes on to another shows that one
 * from then (a shooter's head back on
 * its idling, at its body's time), one played once is gone, and one that holds stays on its last picture. Longer
 * pictures are stretched over the clip, so that they end where the animation does; so is a clip that fits a time
 * (`fit`), as the original sets its rate. The server's animation keeps its own clips'
 * lengths for what follows from them; a presentation of other lengths (a resource pack's) changes only the picture.
 */
export function shownLayer(state: { clip: string, time: number, rate: number, hidden?: true }, layers: Readonly<Record<string, { clip: string, time: number, rate: number }>> | undefined,
    clips: LayerClips): LayerShown | undefined {
    const clip = clips.picture(state.clip), played = clips.played(state.clip)
    const leader = played?.sync === undefined ? undefined : layers?.[played.sync]
    // Shown for every layer every frame: built field by field, without spreads.
    const shown: LayerShown = { key: state.clip, clip, time: state.time, rate: state.rate }
    if (state.hidden) shown.hidden = true
    if (leader) shown.sync = { time: leader.time, own: ownLength(clips, clips.picture(leader.clip)) }
    if (!played || played.next === undefined && !played.once && !played.hold && !played.fit) return shown
    if (played.fit) { shown.frames = played.frames; return shown }
    const length = ownLength(clips, clip)
    // Pictures longer than the clip are stretched over it, so they end where the animation does (a pack's longer death).
    if (length > played.frames + END) { shown.frames = played.frames; return shown }
    if (played.hold || state.time < length) { shown.once = true; return shown }
    if (played.next === undefined) return undefined
    // The next clip from where this one ended: at the time of the layer it goes with, or on from here at its own pace.
    const next = clips.played(played.next), sync = next?.sync === undefined ? undefined : layers?.[next.sync]
    const rate = sync?.rate ?? (next?.fps ? (next.fps.min + next.fps.max) / 2 : state.rate)
    return shownLayer({ clip: played.next, time: sync?.time ?? (state.time - length) / state.rate * rate, rate }, layers, clips)
}

/** How long a clip's own pictures are, in frames of its pace. */
function ownLength(clips: LayerClips, picture: ClientAnimationClip): number {
    return clips.duration(picture.reanimId) / secondsPerFrame(picture)
}

/** `offset`: what a synced layer's pictures are ahead of its time by, from where it started (LayerShown.sync). */
interface Layer { player: ReanimPlayer, key?: string, time: number, shown: boolean, offset: number }

/**
 * The players of an animation's layers, a plant's or a zombie's, each showing what its layer plays. A layer whose clip
 * goes on a part (`attachmentTrackId`) goes on that part of the nearest layer under it that has it, and is drawn with
 * that part, as Reanimation::DrawRenderGroup draws a track's attachment (a pea shooter's head on its stem, a flag in
 * its zombie's hand); any other is placed by whoever shows them.
 */
export class LayerPlayers {
    private readonly layers = new Map<string, Layer>()
    /**
     * Reanimation::AttachToAnotherReanimation fixes the pose a part is attached from at its first attachment
     * (mFrameBasePose): by the layer and the part.
     */
    private readonly bases = new Map<string, ReanimKeyframe>()

    /** `alone`: tracks a clip of the animation draws alone (the potato mine's light), left to it by the others. */
    constructor(parent: Node, names: readonly string[], private readonly alone: readonly string[] = []) {
        for (const name of names) this.layers.set(name, { player: uiNode({ name, parent }).node.addComponent(ReanimPlayer), time: 0, shown: false, offset: 0 })
    }

    /** A layer's player. */
    player(name: string): ReanimPlayer { return this.layers.get(name)!.player }

    /** The players of the layers shown, from the bottom. */
    get shown(): ReanimPlayer[] { return [...this.layers.values()].filter(layer => layer.shown).map(layer => layer.player) }

    /** A layer is not drawn, until it is shown again. */
    hide(name: string): void {
        const layer = this.layers.get(name)!
        if (layer.shown) layer.player.hide()
        layer.shown = false
    }

    /**
     * Each layer on what it shows and at its time; a layer with nothing to show, or hidden, is not drawn. A layer started
     * on a clip blends from the pose it had over `blend` seconds, and one not on a part is placed by `place` (`first`: it
     * is the bottom layer). `basePose`: the pose a clip says its part is attached from, where it says.
     */
    show(shown: (name: string) => LayerShown | undefined, options: {
        blend(name: string, clip: ClientAnimationClip, first: boolean): number
        place(name: string, player: ReanimPlayer, clip: ClientAnimationClip, first: boolean): void
        basePose?(clip: ClientAnimationClip, track: string): ReanimKeyframe | undefined
    }): void {
        // The layers under the one being shown, with the tracks each draws.
        const below: [string, ReanimPlayer, readonly string[]][] = []
        for (const [name, layer] of this.layers) {
            const what = shown(name), { player } = layer
            if (!what) {
                if (layer.shown) player.hide()
                layer.key = undefined
                layer.shown = false
                continue
            }
            const { clip } = what, loop = what.frames === undefined && !what.once
            // A clip started over (a second shot) blends from where the first had got to, as a clip changed to does.
            const started = layer.key !== what.key || !loop && what.time < layer.time
            if (started) {
                player.change(clip.reanimId, options.blend(name, clip, layer.key === undefined))
                player.fullLastFrame = clip.fullLastFrame === true
                // A synced layer starts at the part of its pictures the one it goes with is at of its own.
                const own = player.durationSeconds / secondsPerFrame(clip)
                layer.offset = what.sync && what.sync.own > 0 ? (what.sync.time / what.sync.own % 1) * own - what.time : 0
                const track = clip.attachmentTrackId, parent = track ? [...below].reverse().find(([, , drawn]) => drawn.includes(track)) : undefined
                if (track && parent) {
                    parent[1].drawAfterTrack(player.node, track)
                    player.node.setPosition(0, 0)
                    player.node.setScale(1, 1, 1)
                    const key = `${parent[0]}/${track}`, base = this.bases.get(key) ?? options.basePose?.(clip, track)
                    player.attachToTrack(parent[1], track, base)
                    if (!base && player.attachmentBasePose) this.bases.set(key, player.attachmentBasePose)
                } else options.place(name, player, clip, !below.length)
                if (clip.onlyTracks) player.setTracksVisible(player.trackIds.filter(id => !clip.onlyTracks!.includes(id)), false)
                else player.setTracksVisible(this.alone, false)
            }
            const playback = layerPlayback(what, player.durationSeconds, what.time + layer.offset)
            // It plays on between two times it is shown, and is set right by each, at the rate it now goes at (a frozen
            // one's 0, a chilled one's half).
            if (what.hidden) { if (layer.shown) player.hide() }
            else if (started || !layer.shown) player.play({ ...playback, hideOnFinish: false })
            else {
                if (player.playbackRate !== playback.rate) player.setRate(playback.rate)
                player.seek(playback.timeSeconds)
            }
            layer.key = what.key
            layer.time = what.time
            layer.shown = !what.hidden
            below.push([name, player, clip.onlyTracks ?? player.trackIds])
        }
    }
}
