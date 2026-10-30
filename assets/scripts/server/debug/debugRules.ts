import { defineResource, type World } from '@/ecs/index'

export interface DebugRules {
    cooldown: boolean
    sunCost: boolean
    sunSpawning: boolean
    plantInvincible: boolean
    collect: 'auto' | 'click' | 'move'
}
export const DEFAULT_DEBUG_RULES: Readonly<DebugRules> = { cooldown: true, sunCost: true, sunSpawning: true, plantInvincible: false, collect: 'click' }
export const DebugRulesResource = defineResource<DebugRules>('pvz:debug-rules')
export function getDebugRules(world: World): Readonly<DebugRules> {
    return world.resources.has(DebugRulesResource) ? world.resources.get(DebugRulesResource) : DEFAULT_DEBUG_RULES
}
