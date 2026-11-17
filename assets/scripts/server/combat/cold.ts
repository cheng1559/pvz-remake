import type { ZombieDefinition } from '@/shared/content/gameplay'
import { isDeadOrDying } from '@/shared/content/zombieStates'
import type { Plant, Zombie } from '../state/components'

/** A definition's `unchillable` or `unfreezable`: always (`true`), or in the states it lists. */
function keptFrom<S extends string>(rule: true | readonly S[] | undefined, state: S | undefined): boolean {
    return rule === true || state !== undefined && !!rule?.includes(state)
}

/**
 * Zombie::CanBeChilled: any zombie but one dying, burned, mowed or rising from a grave, and one its type keeps from
 * the cold (`unchillable`: always, or in the states it lists). It holds for a snow pea's chill and an ice-shroom's.
 */
export function zombieCanBeChilled(zombie: Zombie, definition: ZombieDefinition): boolean {
    return !isDeadOrDying(zombie) && zombie.health > 0 && !zombie.riseTicks && !keptFrom(definition.unchillable, zombie.state)
}

/** Zombie::CanBeFrozen: one that can be chilled, unless its type keeps it from the ice now (`unfreezable`; a pole vaulter `airborne`). */
export function zombieCanBeFrozen(zombie: Zombie, definition: ZombieDefinition): boolean {
    return zombieCanBeChilled(zombie, definition) && !keptFrom(definition.unfreezable, zombie.state)
}

/**
 * Not in the original, whose plants are never cold: a plant is chilled as a zombie is, unless it is destroyed or its
 * kind keeps it from the cold now (Plant.keptFromCold: its `unchillable`, the torchwood).
 */
export function plantCanBeChilled(plant: Plant): boolean {
    return plant.health > 0 && !plant.keptFromCold()
}

/**
 * A plant that can be chilled is frozen as a zombie is, unless its kind keeps it from the ice now (Plant.keptFromIce:
 * its `unfreezable`, the cherry bomb, the ice-shroom, the bowled nuts, the grave buster; a potato mine rising). Those
 * are only chilled.
 */
export function plantCanBeFrozen(plant: Plant): boolean {
    return plantCanBeChilled(plant) && !plant.keptFromIce()
}
