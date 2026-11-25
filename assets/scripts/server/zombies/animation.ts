import type { Zombie } from './Zombie'
import { type AnimationClip, type AnimationDefinition, ZOMBIE_BODY_LAYER, ZOMBIE_CLIPS, type ZombieDefinition } from '@/shared/content/gameplay'
import { type AnimationRandom, CHILLED_ANIMATION_FACTOR, groundStep, type LayerState, startLayer, startLayers, stepLayers, TICKS_PER_SECOND } from '@/shared/content/animation'
import { MOWERED_ANIMATION } from '@/shared/content/zombieAnimation'

/**
 * A zombie's animation on the board (ZombieDefinition.animation): its body on the clip of what it does, and what it
 * carries on its own, kept and moved on by the rules every animation goes by (shared/content/animation). What a zombie does follows from
 * it: it walks as far as its clip's ground goes, bites at its eating's marks and is down at its death's.
 */

export { TICKS_PER_SECOND }

/** Zombie::UpdateAnimSpeed: a walk goes at the rate that takes its zombie over the ground at the zombie's speed, by this. */
const ZOMBIE_WALK_RATE_FACTOR = 47

/**
 * The part of its rate a layer of a zombie's animation goes at: Zombie::ApplyAnimRate halves a chilled zombie's body
 * alone (CHILLED_ANIMATION_FACTOR; its walking speed follows its `_ground` track), as one `slowed` (a dancer whose
 * troupe has one chilled, IsMovingAtChilledSpeed) unless its kind says not (Zombie.chillSlows: a dancer's moonwalk), and
 * stops a frozen one's (UpdateAnimSpeed), and what it carries (a flag, a propeller) is a Reanim of its own, at its own
 * rate. The mower's driver is not slowed.
 */
export function zombiePace(zombie: Zombie, layer = ZOMBIE_BODY_LAYER): number {
    if (layer !== ZOMBIE_BODY_LAYER || zombie.state === 'mowered') return 1
    return zombie.frozenTicks !== undefined ? 0 : zombie.chillSlows() ? CHILLED_ANIMATION_FACTOR : 1
}

/** Zombie::ZombieInitialize: every layer starts its clip; the body walks from there (startWalk). */
export function startZombie(zombie: Zombie, animation: AnimationDefinition, random: AnimationRandom): void {
    startLayers(animation, zombie, animation.layers, random)
}

/** What its body plays. */
export function zombieBody(zombie: Zombie): LayerState {
    return zombie.animations[ZOMBIE_BODY_LAYER]
}

/** Zombie::PlayZombieReanim: its body starts a clip. */
export function playZombie(zombie: Zombie, animation: AnimationDefinition, clip: string, random: AnimationRandom): LayerState {
    return zombie.animations[ZOMBIE_BODY_LAYER] = startLayer(clip === ZOMBIE_CLIPS.mowered ? MOWERED_ANIMATION : animation, zombie, clip, random)
}

/** The zombie whose animation is stepping, for PACED: every zombie steps every tick, without a closure made for each. */
let stepping: Zombie
const PACED = { slowed: (layer: string) => zombiePace(stepping, layer) }

/** A tick of its animation, at its pace. */
export function stepZombie(zombie: Zombie, animation: AnimationDefinition, random: AnimationRandom): void {
    stepping = zombie
    stepLayers(zombie.state === 'mowered' ? MOWERED_ANIMATION : animation, zombie, random, PACED)
}

/**
 * Zombie::UpdateAnimSpeed: the frames a second a walk goes at for a zombie of this speed, drawn at `scale`
 * (ZombieDefinition.scale), whose steps are so much the shorter.
 */
export function walkRate(speed: number, clip: AnimationClip, scale = 1): number {
    const ground = clip.ground!
    return speed * clip.frames / (ground[ground.length - 1] - ground[0]) * ZOMBIE_WALK_RATE_FACTOR / scale
}

/** Zombie::StartWalkAnim's `Rand(2)`: which of its walks a zombie takes as it sets off (ZombieDefinition.walk2Chance). */
export function pickWalkClip(definition: ZombieDefinition, random: AnimationRandom): string {
    return random.nextFloat() < 1 - definition.walk2Chance ? ZOMBIE_CLIPS.walk : ZOMBIE_CLIPS.walk2
}

/** Its body starts a walk (its own, or its run), at its speed's rate; its kind sets a zombie off on the one it takes (Zombie.walkAgain). */
export function startWalk(zombie: Zombie, definition: ZombieDefinition, clip: string, random: AnimationRandom): void {
    playZombie(zombie, definition.animation, clip, random).rate = walkRate(zombie.speedPerTick, definition.animation.clips[clip], definition.scale)
}

/**
 * Zombie::UpdateZombieWalking: a tick of a walk, its step (moveZombie) and then its animation's tick.
 */
export function walkZombie(zombie: Zombie, definition: ZombieDefinition, random: AnimationRandom, direction: -1 | 1 = -1): void {
    moveZombie(zombie, definition, direction)
    stepZombie(zombie, definition.animation, random)
}

/**
 * A walk's step, its animation not ticked. It goes as far as the ground does between the frames its clip is at, at the
 * clip's rate (Reanimation::GetTrackVelocity on `_ground`), at its size. A walk goes at its speed's rate, a clip of its
 * own pace at that (a dancer's moonwalk). `direction`: -1 walks left (toward the house), 1 right (a mind-controlled
 * zombie).
 */
export function moveZombie(zombie: Zombie, definition: ZombieDefinition, direction: -1 | 1 = -1): void {
    const state = zombieBody(zombie), clip = definition.animation.clips[state.clip]
    if (!clip.fps) state.rate = walkRate(zombie.speedPerTick, clip, definition.scale)
    zombie.position.x += direction * groundStep(clip, state, zombiePace(zombie)) * (definition.scale ?? 1)
}
