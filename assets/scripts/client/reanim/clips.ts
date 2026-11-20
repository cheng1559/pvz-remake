import type { ClientAnimationClip } from '@/shared/content/presentation'
import { prepareReanims } from './ReanimAssets'
import type { ReanimPlayer } from './ReanimPlayer'

/** A value of a pace, or one picked between [min, max]. */
function pick(value: number | readonly [number, number]): number {
    return typeof value === 'number' ? value : value[0] + Math.random() * (value[1] - value[0])
}

/**
 * The frames a second a clip plays at (Reanimation::mAnimRate): its `fps` (its Reanim's own, `ownFps`, without), by its
 * `rateScale`, each picked between the two when it gives a range.
 */
export function clipFps(clip: ClientAnimationClip, ownFps: number): number {
    return (clip.fps === undefined ? ownFps : pick(clip.fps)) * (clip.rateScale === undefined ? 1 : pick(clip.rateScale))
}

/**
 * How many frames of its Reanim go by a frame of the animation a plant's or zombie's clip shows: its `rateScale`, a
 * single factor for those (their pace is their server animation's).
 */
export function layerRateScale(clip: ClientAnimationClip): number {
    const scale = clip.rateScale ?? 1
    if (typeof scale !== 'number') throw new Error(`${clip.reanimId}: a layer's rateScale is a single factor`)
    return scale
}

/** One of a table of clips (an owner's `clips`, or the presentation's own), which must have it. */
export function clipNamed(clips: Readonly<Record<string, ClientAnimationClip>>, name: string): ClientAnimationClip {
    const clip = clips[name]
    if (!clip) throw new Error(`Clip is not installed: ${name}`)
    return clip
}

/** The clips' Reanims in memory, for showClip to change to at once. */
export async function prepareClips(clips: Iterable<ClientAnimationClip>): Promise<void> {
    await prepareReanims([...clips].map(clip => clip.reanimId))
}

export interface ShowClipOptions {
    /** In place of where the clip starts (`start`): seconds into its pictures (a mallet's swing, a cloud's drift). */
    timeSeconds?: number
    /**
     * In place of its start, pace and loop, once the player is on it: what a plant's or zombie's layer plays by, its server
     * animation's (LayerPlayers). Such a layer stays on its last picture.
     */
    playback?(player: ReanimPlayer): { loop: boolean, fps: number, timeSeconds: number }
    /** A further factor on its pace, one the server picked (a burned zombie's remains, Zombie::ApplyBurn's `mAnimRate *=`). */
    rateScale?: number
    /** Seconds it blends in from the pose the player had (Reanimation::StartBlend), in place of its `blend` (0 without). */
    blend?: number
    /** Places the player's node in place of the clip's `x`, `y` and `scale`: a layer on another's part, or a plant's or zombie's body. */
    place?(player: ReanimPlayer, clip: ClientAnimationClip): void
    onFinish?: () => void
}

/**
 * Starts a prepared clip. Entity layers supply their server clock and track placement;
 * other owners use the clip's local transform, pace and playback flags.
 */
export function showClip(player: ReanimPlayer, clip: ClientAnimationClip, options: ShowClipOptions = {}): void {
    player.change(clip.reanimId, options.blend ?? clip.blend ?? 0, clip.onlyTracks)
    player.fullLastFrame = clip.fullLastFrame === true
    if (options.place) options.place(player, clip)
    else {
        const scale = clip.scale ?? 1
        player.node.setPosition(clip.x ?? 0, clip.y ?? 0)
        player.node.setScale(scale, scale, 1)
    }
    if (options.playback) {
        player.play({ ...options.playback(player), hideOnFinish: false, onFinish: options.onFinish })
        return
    }
    const loop = clip.loop === true
    const timeSeconds = options.timeSeconds
        ?? (clip.start === 'end' ? player.durationSeconds : clip.start === 'random' ? Math.random() * player.durationSeconds : 0)
    player.play({ loop, fps: clipFps(clip, player.fps) * (options.rateScale ?? 1), timeSeconds, hideOnFinish: !loop && clip.hold !== true,
        onFinish: options.onFinish })
}
