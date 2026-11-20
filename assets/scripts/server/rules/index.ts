import { BASE_MOD_ID } from '@/shared/mod'
import { adventureRule } from './adventure'
import { bowlingRule } from './bowling'
import type { LevelRuleRegistry } from './registry'
import { whackAZombieRule } from './whackAZombie'

/** The base game's level rules; a Mod registers its own through the same registry. */
export function installBuiltinLevelRules(registry: LevelRuleRegistry): void {
    for (const [kind, rule] of [['pvz:adventure', adventureRule], ['pvz:bowling', bowlingRule], ['pvz:whack-a-zombie', whackAZombieRule]] as const) {
        if (!registry.has(kind)) registry.register(BASE_MOD_ID, kind, rule)
    }
}
