import type { Team } from '@/shared/protocol'
import { animateCurve } from './animation'
import type { BoardDefinition, PlantDefinition, Rect, ZombieDefinition, ZombieRise } from './gameplayTypes'
import { plantFacingRect, zombieFacingRect } from './teams'
import type { ZombieState } from './zombieStates'

/**
 * Plant::GetPlantRect and GetPlantAttackRect: `rect` (its body or its attack) as a plant of `team` faces, from where it
 * stands, at (`x`, `y`): in whole pixels for what the server goes by (mX, mY; plantRect), where it is drawn for the
 * client's views.
 */
export function plantRectAt(rect: Rect, team: Team, x: number, y: number): Rect {
    const facing = plantFacingRect(rect, team)
    return { x: x + facing.x, y: y + facing.y, width: facing.width, height: facing.height }
}

/**
 * Plant::GetPlantAttackRect's rect, as high as the plant's body, before how it faces and where it stands: its
 * `chomper`, `mine` or `bowling` attack, or a shooter's `range` from where its reach begins, its body's width in
 * (shooterFront). None for a plant without one.
 */
export function plantAttack(definition: PlantDefinition): Rect | undefined {
    const { body } = definition, attack = definition.chomper?.attack ?? definition.mine?.attack ?? definition.bowling?.attack
    if (attack) return { x: attack.x, width: attack.width, y: body.y, height: body.height }
    const range = definition.shooter?.range
    return range === undefined ? undefined : { x: body.width, width: range, y: body.y, height: body.height }
}

/**
 * Zombie::GetDrawPos while a zombie rises with `ticks` of its rise left (riseTicks): how far below its body still sits
 * (mBodyY: UpdateZombieRiseFromGrave's mAltitude, from its rise's `depth` below up to none over the last `riseTicks`),
 * and how much of it the ground hides (mClipHeight: as much, and the ticks left, at most `settleTicks`, more).
 */
export function risen(rise: ZombieRise, ticks: number): { sunk: number, hidden: number } {
    const sunk = -animateCurve(rise.riseTicks, 0, ticks, -rise.depth, 0)
    return { sunk, hidden: sunk + Math.min(rise.settleTicks, ticks) }
}

/**
 * How a zombie comes up out of the ground: one called up into a troupe as its `dance.rise` has it (PHASE_DANCER_RISING),
 * any other out of a grave as its board's `riseFromGrave` has it (PHASE_RISING_FROM_GRAVE).
 */
export function zombieRise(definition: ZombieDefinition, board: BoardDefinition, calledUp: boolean): ZombieRise {
    return calledUp && definition.dance?.rise || board.riseFromGrave
}

/**
 * A pole vaulter's attack rect (Zombie::GetZombieAttackRect): its vault's `attack` while it holds its pole,
 * `airborneAttack` in the air (PHASE_POLEVAULTER_IN_VAULT), `landedAttack` once it is down.
 */
export function vaultAttack(vault: NonNullable<ZombieDefinition['vault']>, state: ZombieState, hasPole: boolean): Rect {
    return hasPole ? vault.attack : state === 'airborne' ? vault.airborneAttack : vault.landedAttack
}

/**
 * Zombie::GetZombieRect and GetZombieAttackRect: `rect` (its body or its attack) as a zombie of `team` faces, from where
 * it stands, at (`x`, `y`): in whole pixels for what the server goes by (mX, mY; zombieRect), where it is drawn for the
 * client's views. While it rises (`rising`, with the ticks of it left) the rect is down where its body sits and short
 * by what the ground hides (risen).
 */
export function zombieRectAt(rect: Rect, team: Team, x: number, y: number, rising?: { rise: ZombieRise, ticks: number }): Rect {
    const facing = zombieFacingRect(rect, team), { sunk, hidden } = rising?.ticks ? risen(rising.rise, rising.ticks) : { sunk: 0, hidden: 0 }
    return { x: x + facing.x, y: y + facing.y + sunk, width: facing.width, height: Math.max(0, facing.height - hidden) }
}
