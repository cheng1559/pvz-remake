import type { PlantDefinition } from './gameplay'

/**
 * Plant::UpdateAbilities: the states each ability goes through, its first the one a plant starts in. A plant has at
 * most one ability: the fuse (cherry bomb), the mine (potato mine), the chomper, a producer's growth (sun-shroom) or
 * the grave buster's.
 */
export const PLANT_ABILITY_STATES_BY_KIND = {
    fuse: ['fuse'],
    mine: ['arming', 'rising', 'armed'],
    chomper: ['ready', 'biting', 'got-one', 'missed', 'digesting', 'swallowing'],
    growth: ['small', 'growing', 'big'],
    graveBuster: ['landing', 'eating'],
} as const

export type PlantAbilityKind = keyof typeof PLANT_ABILITY_STATES_BY_KIND
export type PlantAbilityState = typeof PLANT_ABILITY_STATES_BY_KIND[PlantAbilityKind][number]

export const PLANT_ABILITY_STATES: readonly PlantAbilityState[] = Object.values(PLANT_ABILITY_STATES_BY_KIND).flat()

/** The ability `definition` gives a plant, if any. */
export function plantAbilityKind(definition: PlantDefinition): PlantAbilityKind | undefined {
    if (definition.fuse) return 'fuse'
    if (definition.mine) return 'mine'
    if (definition.chomper) return 'chomper'
    if (definition.producer?.growth) return 'growth'
    if (definition.graveBuster) return 'graveBuster'
    return undefined
}

/** A plant on a rhythm (PlantAttackComponent): one that fires, or one that produces. */
export function hasPlantAttack(definition: PlantDefinition): boolean {
    return !!(definition.shooter || definition.producer)
}
