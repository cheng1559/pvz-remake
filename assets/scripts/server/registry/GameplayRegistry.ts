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
import { installBuiltinProjectileMotions, ProjectileMotionRegistry } from '../combat/motions'
import { installBuiltinTutorials, TutorialRegistry } from '../tutorials'

export class GameplayRegistry {
    readonly plantBehaviors = new PlantBehaviorRegistry()
    readonly zombieBehaviors = new ZombieBehaviorRegistry()
    readonly components = new JsonComponents()
    readonly levelRules = new LevelRuleRegistry()
    readonly achievementTriggers = new AchievementTriggerRegistry()
    readonly projectileMotions = new ProjectileMotionRegistry()
    readonly tutorials = new TutorialRegistry()
    private installBuiltins(definitions: GameplayDefinitions): void {
        installBuiltinLevelRules(this.levelRules)
        installBuiltinTutorials(this.tutorials)
        installBuiltinAchievementTriggers(this.achievementTriggers)
        installBuiltinProjectileMotions(this.projectileMotions)
        const behaviors = new Map([['bowling', bowlingBehavior]])
        for (const [id, definition] of Object.entries(definitions.plants)) {
            const behavior = behaviors.get(String(definition.behavior?.kind))
            if (behavior && !this.plantBehaviors.has(id)) this.plantBehaviors.register(BASE_MOD_ID, id, behavior)
        }
    }
    checkpoint(): () => void {
        const rollback = [this.plantBehaviors.checkpoint(), this.zombieBehaviors.checkpoint(), this.components.checkpoint(), this.levelRules.checkpoint(), this.achievementTriggers.checkpoint(), this.projectileMotions.checkpoint(), this.tutorials.checkpoint()]
        return () => { for (const undo of rollback.reverse()) undo() }
    }
    /** Everything the content names is installed and takes its settings: behaviors, level rules, tutorials, achievement triggers. */
    validate(definitions: GameplayDefinitions, levels: GameplayLevels): void {
        this.installBuiltins(definitions)
        this.plantBehaviors.validate(definitions)
        this.zombieBehaviors.validate(definitions)
        this.levelRules.validate(levels, definitions)
        this.tutorials.validate(levels)
        this.achievementTriggers.validate(definitions)
    }
    freeze(definitions: GameplayDefinitions, levels: GameplayLevels): void {
        this.validate(definitions, levels)
        this.plantBehaviors.freeze()
        this.zombieBehaviors.freeze()
        this.components.freeze()
        this.levelRules.freeze()
        this.achievementTriggers.freeze()
        this.projectileMotions.freeze()
        this.tutorials.freeze()
    }
}
