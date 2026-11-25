import { type Animated, type AnimationRandom, drawn, pace, startLayer, startLayers, stepLayers } from './animation'
import { PLANT_BLINK_LAYER, type PlantAnimationDefinition } from './gameplay'
import type { PlantPhase } from './plantKinds'

/** What only a plant's animation does (PlantDefinition.animation), on the rules of every animation (./animation). */

/** A plant, as far as its animation goes. */
export interface AnimatedPlant extends Animated {
    /** Ticks to its next blink (Plant::mBlinkCountdown). */
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

/** A plant off the board, as far as its animation goes, and the phase of its kind it is in there, if it has one. */
export interface OffBoardPlant extends AnimatedPlant {
    phase?: PlantPhase
}

/**
 * Plant::PlantInitialize for a plant that is not in play (PlantAnimationDefinition.offBoard): its layers start as on
 * the board, which gives each its pace, and then show the clips of the phase of its kind it is in there (`phases`) and the
 * clips `offBoard.layers` has, in place of their own (an armed potato mine goes at the 12 it is buried at). A layer that
 * only has a clip there starts that; one with none there is not there. A picture of the plant (a packet's) may have it
 * in a `phase` of its own, in place of all of `offBoard`; `at`: how far each layer starts towards its clip's last
 * frame, as a part.
 */
export function startOffBoardPlant(animation: PlantAnimationDefinition, random: AnimationRandom,
    picture: { phase?: PlantPhase, at?: number } = {}): OffBoardPlant {
    const offBoard = picture.phase === undefined ? animation.offBoard : { phase: picture.phase }, phase = offBoard?.phase
    const shown: Record<string, string | null> = { ...(phase === undefined ? {} : animation.phases?.[phase]), ...offBoard?.layers }
    const plant: OffBoardPlant = {}
    startPlantLayers(animation, plant, Object.fromEntries(Object.entries(animation.layers).map(([layer, clip]) => [layer, clip ?? shown[layer] ?? null])), random)
    for (const [layer, layerState] of Object.entries(plant.animations!)) {
        const clip = Object.hasOwn(shown, layer) ? shown[layer] : layerState.clip
        if (clip === null) { delete plant.animations![layer]; continue }
        layerState.clip = clip
        layerState.time += Math.max(0, (animation.clips[clip]?.frames ?? 1) - 1) * (picture.at ?? 0)
        delete layerState.hidden
    }
    if (phase !== undefined) plant.phase = phase
    return plant
}

/**
 * Plant::DoBlink: whether a blink that comes round now is missed, as the tick starts: while a layer plays a clip it
 * fires with (`fire`; Plant::mShootingCounter, which Plant::UpdateShooting holds until the shot's clip is done), while
 * its kind says (`misses`), or, with `blink.phases`, in a `phase` outside them (a potato mine not armed).
 */
function blinkMissed(animation: PlantAnimationDefinition, plant: AnimatedPlant, phase: string | undefined, misses: boolean): boolean {
    const phases = animation.blink!.phases, fire = animation.fire
    if (misses || phases && (phase === undefined || !phases.includes(phase))) return true
    if (fire) for (const layer in fire) if (plant.animations?.[layer]?.clip === fire[layer]) return true
    return false
}

/** Plant::EndBlink: the blink it plays is over (Plant::FindTargetAndFire, as it starts a shot). */
export function endBlink(plant: AnimatedPlant): void {
    if (plant.animations) delete plant.animations[PLANT_BLINK_LAYER]
}

/** It came to a phase of its kind: one it blinks in (`blink.phases`) counts down to its first blink in it (`blink.first`: an armed potato mine). */
export function blinkPhaseStarted(animation: PlantAnimationDefinition, plant: AnimatedPlant, phase: string, random: AnimationRandom): void {
    const blink = animation.blink
    if (blink?.first && blink.phases?.includes(phase)) plant.blinkTicks = random.integer(blink.first.min, blink.first.max)
}

/**
 * A tick of a plant's animation: its layers move on (stepLayers, at the part of their rate `slowed` says) and the blink
 * comes round (Plant::UpdateBlink, then Plant::DoBlink unless it is missed: blinkMissed). `chewed`: zombies are eating
 * the plant. With `blinkWaits` (asleep, or a chilled plant's tick it sits out) its blink's countdown waits. `phase`: the
 * phase of its kind it is in, for `blink.phases`. `blinkMisses`: its kind misses a blink now (Plant.blinkMisses: a
 * shooter winding up).
 */
export function stepPlantAnimation(animation: PlantAnimationDefinition, plant: AnimatedPlant, random: AnimationRandom,
    on: { slowed?: (layer: string) => number, chewed?: boolean, blinkWaits?: boolean, phase?: string, blinkMisses?: boolean } = {}): void {
    const layers = plant.animations
    if (!layers) return
    const blink = animation.blink
    const counting = !!blink && plant.blinkTicks !== undefined && !on.blinkWaits
    // Whether it fires as the tick starts, as Plant::UpdateShooting has it before the layers move on.
    const missed = counting && plant.blinkTicks! <= 1 && blinkMissed(animation, plant, on.phase, !!on.blinkMisses)
    stepLayers(animation, plant, random, { slowed: on.slowed, before: (layerState, clip) => {
        if (!clip.chewed) return
        if (on.chewed) layerState.rate = CHEWED_FPS
        else if (layerState.rate === CHEWED_FPS) layerState.rate = pace(clip, random)
    } })
    if (!counting || --plant.blinkTicks! > 0) return
    plant.blinkTicks = random.integer(blink!.ticks.min, blink!.ticks.max)
    if (!missed) layers[PLANT_BLINK_LAYER] = startLayer(animation, plant, drawn(blink!.clips, random), random)
}
