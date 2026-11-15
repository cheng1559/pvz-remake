import { isEnemyZombie } from './teams'
import type { Team } from '@/shared/protocol'

/** What a zombie is doing, as the server keeps it and its snapshot shows it; `burned` holds a blackened headless zombie until it crumbles. */
export type ZombieState = 'walking' | 'eating' | 'vaulting' | 'dying' | 'burned' | 'mowered'

export const ZOMBIE_STATES: readonly ZombieState[] = ['walking', 'eating', 'vaulting', 'dying', 'burned', 'mowered']

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
