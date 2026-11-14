import { TICK_SECONDS } from '@/shared/protocol'
import { PLANT_BLINK_LAYER, type PlantAnimationDefinition, type PlantClip } from './gameplay'

/**
 * A plant's animation (PlantDefinition.animation) as it goes: what each of its layers plays and how far into it. The
 * server keeps it for a plant on the board, so what follows from it (where a pea shooter's mouth is as it sways) is the
 * same for everyone; a client keeps it by the same rules for a plant off the board (the almanac, a packet's picture).
 */

/** What a layer plays: `time` in the clip's frames, counting on past a loop's length; `rate` in frames a second (Reanimation::mAnimRate). */
export interface PlantLayerState {
    clip: string, time: number, rate: number
    /** There and going on, but not shown now (the potato mine's light between its flashes). */
    hidden?: true
}

/** A plant, as far as its animation goes. */
export interface AnimatedPlant {
    animations?: Record<string, PlantLayerState>
    /** Ticks to its next blink. */
    blinkTicks?: number
    /** The ticks its ability has left are what a clip that fits them lasts. */
    ability?: { ticks?: number }
}

export interface AnimationRandom { nextFloat(): number, integer(min: number, max: number): number }

const TICKS_PER_SECOND = Math.round(1 / TICK_SECONDS)
/** The frames a second a Reanim is made at: the pace of a clip that has none to go by. */
export const PLANT_ASSET_FPS = 12
/** Within this of a clip's length it is through: its time is a sum of steps, a whole number of which may fall a hair short. */
const END = 1e-9
/** Plant::AnimateNuts: the frames a second of a plant being chewed. */
const CHEWED_FPS = 0.1

/** The frames a second a clip of its own pace goes at, drawn from its range. */
function pace({ fps }: PlantClip, random: AnimationRandom): number {
    return fps!.min === fps!.max ? fps!.min : fps!.min + random.nextFloat() * (fps!.max - fps!.min)
}

/**
 * A layer starts a clip: where the layer it goes with is and at its rate, over the ticks the plant's ability has left,
 * or at a rate of its own.
 */
export function startPlantLayer(animation: PlantAnimationDefinition, plant: AnimatedPlant, clip: string, random: AnimationRandom): PlantLayerState {
    const definition = animation.clips[clip], { sync, fit, start, frames } = definition, layers = plant.animations!
    if (sync !== undefined) return { clip, time: layers[sync]?.time ?? 0, rate: layers[sync]?.rate ?? PLANT_ASSET_FPS }
    if (fit) return { clip, time: 0, rate: plant.ability?.ticks ? frames * TICKS_PER_SECOND / plant.ability.ticks : PLANT_ASSET_FPS }
    const rate = pace(definition, random)
    return { clip, time: start ? frames * (start.min + random.nextFloat() * (start.max - start.min)) : 0, rate }
}

/** Some layers play clips from the start: `{layer: clip}`. */
export function playPlantLayers(animation: PlantAnimationDefinition, plant: AnimatedPlant, clips: Record<string, string> | undefined, random: AnimationRandom): void {
    for (const [layer, clip] of Object.entries(clips ?? {})) plant.animations![layer] = startPlantLayer(animation, plant, clip, random)
}

/** One of the clips, by their weights; a single one costs no draw. */
function drawn(clips: Record<string, number>, random: AnimationRandom): string {
    const entries = Object.entries(clips)
    let roll = entries.length > 1 ? random.integer(1, entries.reduce((sum, [, weight]) => sum + weight, 0)) : 1
    return entries.find(([, weight]) => (roll -= weight) <= 0)![0]
}

/**
 * Plant::PlantInitialize: every layer starts the clip it has in `first` (its own, or an asleep plant's in its place),
 * and the first blink is counted down to.
 */
export function startPlantLayers(animation: PlantAnimationDefinition, plant: AnimatedPlant, first: Record<string, string | null>, random: AnimationRandom): void {
    plant.animations = {}
    for (const [layer, clip] of Object.entries(first)) if (clip !== null) plant.animations[layer] = startPlantLayer(animation, plant, clip, random)
    if (animation.blink) plant.blinkTicks = random.integer(animation.blink.ticks.min, animation.blink.ticks.max)
}

/**
 * Plant::PlantInitialize for a plant that is not in play: its layers start as on the board, which gives each its pace,
 * and then show the clips in `shown` in place of their own (an armed potato mine goes at the 12 it is buried at). A
 * layer that only has a clip off the board starts that. `at`: how far each starts towards its clip's last frame, as a part.
 */
export function startOffBoardPlant(animation: PlantAnimationDefinition, shown: Readonly<Record<string, string>> | undefined,
    random: AnimationRandom, at = 0): AnimatedPlant {
    const plant: AnimatedPlant = {}
    startPlantLayers(animation, plant, Object.fromEntries(Object.entries(animation.layers).map(([layer, clip]) => [layer, clip ?? shown?.[layer] ?? null])), random)
    for (const [layer, state] of Object.entries(plant.animations!)) {
        state.clip = shown?.[layer] ?? state.clip
        state.time += Math.max(0, (animation.clips[state.clip]?.frames ?? 1) - 1) * at
        delete state.hidden
    }
    return plant
}

/**
 * A tick of a plant's animation: each layer moves on, a clip that is through gives way, and the blink comes round.
 * `chewed`: zombies are eating the plant. Plant::UpdateBlink: with `blinkWaits` (an asleep plant) the blink is not
 * counted down to. Plant::DoBlink: with `blinkMisses` (a plant about to shoot, or in a state it does not blink in) the
 * blink that came round is not played.
 */
export function stepPlantAnimation(animation: PlantAnimationDefinition, plant: AnimatedPlant, random: AnimationRandom,
    on: { chewed?: boolean, blinkWaits?: boolean, blinkMisses?: () => boolean } = {}): void {
    const layers = plant.animations
    if (!layers) return
    for (const [layer, state] of Object.entries(layers)) {
        // A clip shown off the board in place of the animation's is a loop.
        const clip: PlantClip | undefined = animation.clips[state.clip]
        if (clip?.chewed) {
            if (on.chewed) state.rate = CHEWED_FPS
            else if (state.rate === CHEWED_FPS) state.rate = pace(clip, random)
        }
        state.time += state.rate / TICKS_PER_SECOND
        if (!clip || state.time < clip.frames - END) continue
        if (clip.once) delete layers[layer]
        else if (clip.next !== undefined) layers[layer] = startPlantLayer(animation, plant, clip.next, random)
        else if (clip.hold) state.time = clip.frames
    }
    const blink = animation.blink
    if (!blink || plant.blinkTicks === undefined || on.blinkWaits) return
    if (--plant.blinkTicks > 0) return
    plant.blinkTicks = random.integer(blink.ticks.min, blink.ticks.max)
    if (on.blinkMisses?.()) return
    layers[PLANT_BLINK_LAYER] = startPlantLayer(animation, plant, drawn(blink.clips, random), random)
}
