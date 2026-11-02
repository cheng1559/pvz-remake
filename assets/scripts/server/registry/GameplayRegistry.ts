import { BASE_MOD_ID } from '@/shared/mod'
import { JsonComponents } from './JsonComponents'
import { PlantBehaviorRegistry } from '../plants/behaviors'
import { ZombieBehaviorRegistry } from '../zombies/behaviors'
import type { GameplayDefinitions, GameplayLevels } from '@/shared/content/gameplay'
import { LevelRuleRegistry } from '../rules/registry'
import { installBuiltinLevelRules } from '../rules'
import { bowlingBehavior } from '../plants/bowling'
import { AchievementTriggerRegistry } from '../achievements/achievements'
import { installBuiltinAchievementTriggers } from '../achievements/triggers'

export class GameplayRegistry {
    readonly plantBehaviors = new PlantBehaviorRegistry()
    readonly zombieBehaviors = new ZombieBehaviorRegistry()
    readonly components = new JsonComponents()
    readonly levelRules = new LevelRuleRegistry()
    readonly achievementTriggers = new AchievementTriggerRegistry()
    private installBuiltins(definitions: GameplayDefinitions): void {
        installBuiltinLevelRules(this.levelRules)
        installBuiltinAchievementTriggers(this.achievementTriggers)
        const behaviors = new Map([['bowling', bowlingBehavior]])
        for (const [id, definition] of Object.entries(definitions.plants)) {
            const behavior = behaviors.get(String(definition.behavior?.kind))
            if (behavior && !this.plantBehaviors.has(id)) this.plantBehaviors.register(BASE_MOD_ID, id, behavior)
        }
    }
    checkpoint(): () => void {
        const rollback = [this.plantBehaviors.checkpoint(), this.zombieBehaviors.checkpoint(), this.components.checkpoint(), this.levelRules.checkpoint(), this.achievementTriggers.checkpoint()]
        return () => { for (const undo of rollback.reverse()) undo() }
    }
    validate(definitions: GameplayDefinitions): void {
        this.installBuiltins(definitions)
        this.plantBehaviors.validate(definitions)
        this.zombieBehaviors.validate(definitions)
    }
    freeze(definitions: GameplayDefinitions): void {
        this.installBuiltins(definitions)
        this.plantBehaviors.freeze(definitions)
        this.zombieBehaviors.freeze(definitions)
        this.components.freeze()
        this.levelRules.freeze()
        this.achievementTriggers.freeze()
    }
    /** Every level's rule is installed and takes its settings. */
    validateLevels(levels: GameplayLevels, definitions: GameplayDefinitions): void { this.levelRules.validate(levels, definitions) }
}
