import type { Team } from '@/shared/protocol'

export type { Team }

/** A plant's side: the plants' unless it says otherwise. */
export const plantTeam = (plant: { readonly team?: Team }): Team => plant.team ?? 'plants'
/** A zombie's side: the zombies' until it is mind-controlled. */
export const zombieTeam = (zombie: { readonly team?: Team }): Team => zombie.team ?? 'zombies'
/** A projectile's side: the plants' unless its shooter is a zombie. */
export const projectileTeam = (projectile: { readonly team?: Team }): Team => projectile.team ?? 'plants'

/** The one rule: different sides attack each other (Zombie::EffectedByDamage, FindZombieTarget). */
export const isHostile = (left: Team, right: Team): boolean => left !== right

/**
 * A zombie the player has to beat: not one on the plants' side. Board::AreEnemyZombiesOnScreen, CountZombiesOnScreen
 * and TotalZombiesHealthInWave leave mind-controlled zombies out.
 */
export const isEnemyZombie = (zombie: { readonly team?: Team }): boolean => zombieTeam(zombie) === 'zombies'

/**
 * Which way a side faces: the zombies' left toward the house, the plants' right (Zombie::IsWalkingBackwards). Plants
 * on the zombies' side, which the original does not have, face left too.
 */
export const teamDirection = (team: Team): -1 | 1 => team === 'zombies' ? -1 : 1

/** Zombie::mWidth, which a zombie walking right mirrors its body and attack rects across. */
export const ZOMBIE_WIDTH = 120
/** Plant::mWidth, which a plant facing left mirrors its body, attack rects and effects across. */
export const PLANT_WIDTH = 80

/** A point `x` within `width`, mirrored across it when `mirrored`. */
export const mirrorX = (x: number, width: number, mirrored: boolean): number => mirrored ? width - x : x

/** A rect within `width`, mirrored across it when `mirrored` (`x = width - x - rect width`). */
export function mirrorRect<T extends { x: number, width: number }>(rect: T, width: number, mirrored: boolean): T {
    return mirrored ? { ...rect, x: width - rect.x - rect.width } : rect
}

/** Zombie::GetZombieRect and GetZombieAttackRect as the zombie faces: one walking right mirrors them. */
export const zombieFacingRect = <T extends { x: number, width: number }>(rect: T, team: Team): T =>
    mirrorRect(rect, ZOMBIE_WIDTH, team === 'plants')

/** A plant's rect as it faces: a plant on the zombies' side mirrors it. */
export const plantFacingRect = <T extends { x: number, width: number }>(rect: T, team: Team): T =>
    mirrorRect(rect, PLANT_WIDTH, team === 'zombies')

/** A point within a plant as it faces, like a blast's center. */
export const plantFacingX = (x: number, team: Team): number => mirrorX(x, PLANT_WIDTH, team === 'zombies')
