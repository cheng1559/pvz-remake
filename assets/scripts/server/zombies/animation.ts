import type { Position, Zombie } from '../state/components'
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
 * alone (CHILLED_ANIMATION_FACTOR; its walking speed follows its `_ground` track) and stops a frozen one's
 * (UpdateAnimSpeed), and what it carries (a flag, a propeller) is a Reanim of its own, at its own rate. The mower's
 * driver is not slowed.
 */
export function zombiePace(zombie: Zombie, layer = ZOMBIE_BODY_LAYER): number {
    if (layer !== ZOMBIE_BODY_LAYER || zombie.state === 'mowered') return 1
    return zombie.frozenTicks !== undefined ? 0 : zombie.chilledTicks > 0 ? CHILLED_ANIMATION_FACTOR : 1
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

/** A tick of its animation, at its pace. */
export function stepZombie(zombie: Zombie, animation: AnimationDefinition, random: AnimationRandom): void {
    stepLayers(zombie.state === 'mowered' ? MOWERED_ANIMATION : animation, zombie, random, { slowed: layer => zombiePace(zombie, layer) })
}

/** Zombie::UpdateAnimSpeed: the frames a second a walk goes at for a zombie of this speed. */
export function walkRate(speed: number, clip: AnimationClip): number {
    const ground = clip.ground!
    return speed * clip.frames / (ground[ground.length - 1] - ground[0]) * ZOMBIE_WALK_RATE_FACTOR
}

/**
 * Zombie::PickRandomSpeed, which StartWalkAnim calls each time a zombie sets off walking (from its start, after eating,
 * after its vault, out of the newspaper's gasp): the pole vaulter's run while it holds the pole, the newspaper
 * zombie's enraged walk once its paper is gone, or its own walk.
 */
export function pickZombieSpeed(zombie: Pick<Zombie, 'hasPole' | 'shieldHealth'>, definition: ZombieDefinition, random: AnimationRandom): number {
    const speed = zombie.hasPole && definition.vault ? definition.vault.runSpeedPerTick
        : definition.enrage && zombie.shieldHealth === 0 ? definition.enrage.speedPerTick : definition.speedPerTick
    return speed.min + random.nextFloat() * (speed.max - speed.min)
}

/** Zombie::StartWalkAnim's `Rand(2)`: which of its walks a zombie takes as it sets off (ZombieDefinition.walk2Chance). */
export function pickWalkClip(definition: ZombieDefinition, random: AnimationRandom): string {
    return random.nextFloat() < 1 - definition.walk2Chance ? ZOMBIE_CLIPS.walk : ZOMBIE_CLIPS.walk2
}

/**
 * Zombie::StartWalkAnim, as a zombie sets off walking again (after eating, after its vault, out of the newspaper's
 * gasp): its speed picked again, then which of its walks it takes, unless it is the enraged newspaper zombie, whose
 * walk is its own (PHASE_NEWSPAPER_MAD, without the `Rand(2)`); one still holding its pole runs.
 */
export function walkAgain(zombie: Zombie, definition: ZombieDefinition, random: AnimationRandom): void {
    zombie.speedPerTick = pickZombieSpeed(zombie, definition, random)
    if (!(definition.enrage && zombie.shieldHealth === 0)) zombie.walkClip = pickWalkClip(definition, random)
    startWalk(zombie, definition.animation, zombie.hasPole ? ZOMBIE_CLIPS.run : zombie.walkClip, random)
}

/** Its body starts a walk (its own, or its run), at its speed's rate. */
export function startWalk(zombie: Zombie, animation: AnimationDefinition, clip: string, random: AnimationRandom): void {
    playZombie(zombie, animation, clip, random).rate = walkRate(zombie.speedPerTick, animation.clips[clip])
}

/**
 * Zombie::UpdateZombieWalking: a tick of a walk. It goes as far as the ground does between the frames its clip is at,
 * at the clip's rate (Reanimation::GetTrackVelocity on `_ground`). `direction`: -1 walks left (toward the house), 1
 * right (a mind-controlled zombie).
 */
export function walkZombie(zombie: Zombie, position: Position, animation: AnimationDefinition, random: AnimationRandom, direction: -1 | 1 = -1): void {
    const state = zombieBody(zombie), clip = animation.clips[state.clip]
    state.rate = walkRate(zombie.speedPerTick, clip)
    position.x += direction * groundStep(clip, state, zombiePace(zombie))
    stepZombie(zombie, animation, random)
}
