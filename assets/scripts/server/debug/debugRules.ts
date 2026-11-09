import { defineResource, type World } from '@/ecs/index'

export interface DebugRules {
    cooldown: boolean
    sunCost: boolean
    sunSpawning: boolean
    plantInvincible: boolean
    collect: 'auto' | 'click' | 'move'
    /**
     * `/cheatseed`: the chooser offers every seed on its pages (chooserPages) and Let's Rock starts with any cards
     * chosen. It counts towards the chooser's slots and whether it opens, so a chooser takes it up when it opens.
     */
    cheatSeeds: boolean
}
export const DEFAULT_DEBUG_RULES: Readonly<DebugRules> = {
    cooldown: true, sunCost: true, sunSpawning: true, plantInvincible: false, collect: 'click', cheatSeeds: false,
}
export const DebugRulesResource = defineResource<DebugRules>('pvz:debug-rules')
export function getDebugRules(world: World): Readonly<DebugRules> {
    return world.resources.has(DebugRulesResource) ? world.resources.get(DebugRulesResource) : DEFAULT_DEBUG_RULES
}
