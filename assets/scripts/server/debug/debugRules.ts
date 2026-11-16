import { defineResource, type World } from '@/ecs/index'
import type { DebugRules } from '@/shared/protocol/index'

export const DEFAULT_DEBUG_RULES: Readonly<DebugRules> = {
    cooldown: true, sunCost: true, plantInvincible: false, collect: 'click', cheatSeeds: false,
}
/** Set once a debug command changes a rule; the snapshot shows it (`debug`) from then on. */
export const DebugRulesResource = defineResource<DebugRules>('pvz:debug-rules')
export function getDebugRules(world: World): Readonly<DebugRules> {
    return world.resources.has(DebugRulesResource) ? world.resources.get(DebugRulesResource) : DEFAULT_DEBUG_RULES
}
