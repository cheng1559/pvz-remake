import { TICK_SECONDS } from '@/shared/protocol'
import type { AnimationClip, AnimationDefinition } from './gameplay'

/**
 * An animation (a plant's or a zombie's `animation`) as it goes: what each of its layers plays and how far into it.
 * The server keeps it for what is on the board, so what follows from it (where a pea shooter's mouth is as it sways,
 * how far a zombie's step takes it) is the same for everyone; a client keeps it by the same rules for what it shows off
 * the board (the almanac, a packet's picture).
 */

/** What a layer plays: `time` in the clip's frames, counting on past a loop's length; `rate` in frames a second (Reanimation::mAnimRate). */
export interface LayerState {
    clip: string, time: number, rate: number
    /** There and going on, but not shown now (the potato mine's light between its flashes). */
    hidden?: true
}

/** What is animated, as far as its animation goes. */
export interface Animated {
    animations?: Record<string, LayerState>
    /** The ticks its ability has left are what a clip that fits them lasts. */
    ability?: { ticks?: number }
}

export interface AnimationRandom { nextFloat(): number, integer(min: number, max: number): number }

export const TICKS_PER_SECOND = Math.round(1 / TICK_SECONDS)
/** The frames a second a Reanim is made at: the pace of a clip that has none to go by. */
export const ASSET_FPS = 12
/** Within this of a clip's length it is through: its time is a sum of steps, a whole number of which may fall a hair short. */
const END = 1e-9

/** The frames a second a clip of its own pace goes at, drawn from its range. */
export function pace({ fps }: AnimationClip, random: AnimationRandom): number {
    return fps!.min === fps!.max ? fps!.min : fps!.min + random.nextFloat() * (fps!.max - fps!.min)
}

/**
 * A layer starts a clip: where the layer it goes with is and at its rate, over the ticks its ability has left, or at a
 * rate of its own. A clip that walks on its ground has none until whoever walks it gives it one.
 */
export function startLayer(animation: AnimationDefinition, entity: Animated, clip: string, random: AnimationRandom): LayerState {
    const definition = animation.clips[clip], { sync, fit, start, frames } = definition, layers = entity.animations
    if (sync !== undefined) return { clip, time: layers?.[sync]?.time ?? 0, rate: layers?.[sync]?.rate ?? ASSET_FPS }
    if (fit && entity.ability?.ticks) return { clip, time: 0, rate: frames * TICKS_PER_SECOND / entity.ability.ticks }
    // With nothing to fit, a clip goes at its own pace if it has one.
    if (fit && !definition.fps) return { clip, time: 0, rate: ASSET_FPS }
    const rate = definition.fps ? pace(definition, random) : 0
    return { clip, time: start ? frames * (start.min + random.nextFloat() * (start.max - start.min)) : 0, rate }
}

/** Every layer starts the clip it has in `first` (its own, or one in its place); `null` leaves a layer without one. */
export function startLayers(animation: AnimationDefinition, entity: Animated, first: Record<string, string | null>, random: AnimationRandom): void {
    entity.animations = {}
    for (const [layer, clip] of Object.entries(first)) if (clip !== null) entity.animations[layer] = startLayer(animation, entity, clip, random)
}

/** Some layers play clips from the start: `{layer: clip}`. */
export function playLayers(animation: AnimationDefinition, entity: Animated, clips: Record<string, string> | undefined, random: AnimationRandom): void {
    for (const [layer, clip] of Object.entries(clips ?? {})) entity.animations![layer] = startLayer(animation, entity, clip, random)
}

/** One of the clips, by their weights; a single one costs no draw. */
export function drawn(clips: Record<string, number>, random: AnimationRandom): string {
    const entries = Object.entries(clips)
    let roll = entries.length > 1 ? random.integer(1, entries.reduce((sum, [, weight]) => sum + weight, 0)) : 1
    return entries.find(([, weight]) => (roll -= weight) <= 0)![0]
}

/**
 * A tick of an animation's layers: each moves on, and a clip that is through gives way (to the next, to nothing, or to
 * its last frame). `slowed`: a layer goes at this part of its rate (a chilled zombie's body, at half). `before`: what
 * is done to a layer on a clip of the animation before it moves on.
 */
export function stepLayers(animation: AnimationDefinition, entity: Animated, random: AnimationRandom,
    on: { slowed?: (layer: string) => number, before?: (state: LayerState, clip: AnimationClip) => void } = {}): void {
    const layers = entity.animations
    if (!layers) return
    for (const [layer, state] of Object.entries(layers)) {
        // A clip shown off the board in place of the animation's is a loop.
        const clip: AnimationClip | undefined = animation.clips[state.clip]
        if (clip) on.before?.(state, clip)
        state.time += state.rate * (on.slowed?.(layer) ?? 1) / TICKS_PER_SECOND
        if (!clip || state.time < clip.frames - END) continue
        if (clip.once) delete layers[layer]
        else if (clip.next !== undefined) layers[layer] = startLayer(animation, entity, clip.next, random)
        else if (clip.hold) state.time = clip.frames
    }
}

/**
 * Reanimation::GetFrameTime: which of a clip's frames it shows at a time, as a position between them. Its frames are
 * spread over its whole length, the last reached as it ends: a loop comes round to its first from its last, and a clip
 * that ends is on its last from then on.
 */
export function framePosition(clip: AnimationClip, time: number): number {
    const ends = clip.next !== undefined || clip.once || clip.hold || clip.fit
    return (ends ? Math.min(Math.max(time, 0), clip.frames) : time % clip.frames) * (clip.frames - 1) / clip.frames
}

/**
 * Reanimation::ShouldTriggerTimedEvent: whether a clip came to a part of its length (`mark`, of 1) between two of its
 * times, in frames; a loop comes to it each time round.
 */
export function passedMark(clip: AnimationClip, before: number, after: number, mark: number): boolean {
    const at = mark * clip.frames
    return Math.floor((after - at) / clip.frames) > Math.floor((before - at) / clip.frames)
}
