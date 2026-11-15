import { type Animated, type AnimationRandom, drawn, pace, startLayer, startLayers, stepLayers } from './animation'
import { PLANT_BLINK_LAYER, type PlantAnimationDefinition } from './gameplay'

/** What only a plant's animation does (PlantDefinition.animation), on the rules of every animation (./animation). */

/** A plant, as far as its animation goes. */
export interface AnimatedPlant extends Animated {
    /** Ticks to its next blink. */
    blinkTicks?: number
}

/** Plant::AnimateNuts: the frames a second of a plant being chewed. */
const CHEWED_FPS = 0.1

/**
 * Plant::PlantInitialize: every layer starts the clip it has in `first` (its own, or an asleep plant's in its place),
 * and the first blink is counted down to.
 */
export function startPlantLayers(animation: PlantAnimationDefinition, plant: AnimatedPlant, first: Record<string, string | null>, random: AnimationRandom): void {
    startLayers(animation, plant, first, random)
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
 * A tick of a plant's animation: its layers move on (stepLayers) and the blink comes round. `chewed`: zombies are
 * eating the plant. Plant::UpdateBlink: with `blinkWaits` (an asleep plant) the blink is not counted down to.
 * Plant::DoBlink: with `blinkMisses` (a plant about to shoot, or in a state it does not blink in) the blink that came
 * round is not played.
 */
export function stepPlantAnimation(animation: PlantAnimationDefinition, plant: AnimatedPlant, random: AnimationRandom,
    on: { chewed?: boolean, blinkWaits?: boolean, blinkMisses?: () => boolean } = {}): void {
    const layers = plant.animations
    if (!layers) return
    stepLayers(animation, plant, random, { before: (state, clip) => {
        if (!clip.chewed) return
        if (on.chewed) state.rate = CHEWED_FPS
        else if (state.rate === CHEWED_FPS) state.rate = pace(clip, random)
    } })
    const blink = animation.blink
    if (!blink || plant.blinkTicks === undefined || on.blinkWaits) return
    if (--plant.blinkTicks > 0) return
    plant.blinkTicks = random.integer(blink.ticks.min, blink.ticks.max)
    if (on.blinkMisses?.()) return
    layers[PLANT_BLINK_LAYER] = startLayer(animation, plant, drawn(blink.clips, random), random)
}
