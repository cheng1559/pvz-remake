import { isEnemyZombie } from './teams'
import type { Team } from '@/shared/protocol'

/**
 * What a zombie is doing, as the server keeps it and its snapshot shows it, whatever its kind: `airborne` in the air,
 * which its own mechanic takes it into and out of (a pole vaulter's jump; the original's in-air phases), out of reach
 * of what is on the lawn; `burned` holds a blackened headless zombie until it crumbles.
 */
export type ZombieState = 'walking' | 'eating' | 'airborne' | 'dying' | 'burned' | 'mowered'

export const ZOMBIE_STATES: readonly ZombieState[] = ['walking', 'eating', 'airborne', 'dying', 'burned', 'mowered']

/** Zombie::IsDeadOrDying: falling, burned or flattened. */
export function isDeadOrDying(zombie: { readonly state: ZombieState }): boolean {
    return zombie.state === 'dying' || zombie.state === 'burned' || zombie.state === 'mowered'
}

/**
 * Board::CountZombiesOnScreen and Board::AreEnemyZombiesOnScreen: a zombie that still counts against the player, one
 * on the zombies' side (not mind-controlled) with its head that is not dead or dying.
 */
export function isZombieOnScreen(zombie: { readonly state: ZombieState, readonly hasHead: boolean, readonly team?: Team }): boolean {
    return zombie.hasHead && isEnemyZombie(zombie) && !isDeadOrDying(zombie)
}

/**
 * What a dancer does as it dances (ZombieDefinition.dance; Zombie::mZombiePhase of the dancers): a leader moonwalks
 * in (`moonwalk`, PHASE_DANCER_DANCING_IN), snaps its fingers to call up its troupe (`summon`), or later the missing
 * ones under its spotlight (`resummon`, ..._WITH_LIGHT), and holds the pose (`hold`); then every dancer goes by the
 * lawn's beat (DANCE_BEAT): walking (`walk`, PHASE_DANCER_DANCING_LEFT), its arm going up (`armUp`,
 * PHASE_DANCER_WALK_TO_RAISE), and standing with it raised (`raise`, `raise2`: PHASE_DANCER_RAISE_LEFT_1 and _2).
 * One called up into a troupe comes up out of the ground first (`rise`, PHASE_DANCER_RISING; its zombie's `riseTicks`).
 */
export type DancePhase = 'moonwalk' | 'summon' | 'resummon' | 'hold' | 'rise' | 'walk' | 'armUp' | 'raise' | 'raise2'

export const DANCE_PHASES: readonly DancePhase[] = ['moonwalk', 'summon', 'resummon', 'hold', 'rise', 'walk', 'armUp', 'raise', 'raise2']

/** Zombie::CheckIfPreyCaught: a leader snapping its fingers, or holding the pose after, does not start to eat. */
export function isSummoning(phase: DancePhase): boolean {
    return phase === 'summon' || phase === 'resummon' || phase === 'hold'
}
