import { JsonComponents } from './JsonComponents'
import { PlantBehaviorRegistry } from '../plants/behaviors'
import { ZombieBehaviorRegistry } from '../zombies/behaviors'
import { ZombieRegistry } from '../zombies/ZombieRegistry'
import type { GameplayDefinitions, GameplayLevels } from '@/shared/content/gameplay'
import { LevelRuleRegistry } from '../rules/registry'
import { installBuiltinLevelRules } from '../rules'
import { PlantRegistry } from '../plants/PlantRegistry'
import { AchievementTriggerRegistry } from '../achievements/achievements'
import { installBuiltinAchievementTriggers } from '../achievements/triggers'
import { installBuiltinProjectileMotions, ProjectileMotionRegistry } from '../combat/motions'
import { ProjectileRegistry } from '../combat/ProjectileRegistry'
import { installBuiltinTutorials, TutorialRegistry } from '../tutorials'

export class GameplayRegistry {
    readonly plantBehaviors = new PlantBehaviorRegistry()
    /** The kinds of plants (PlantDefinition.kind): the base's, and a Mod's, which extends one. */
    readonly plants = new PlantRegistry()
    readonly zombieBehaviors = new ZombieBehaviorRegistry()
    /** The kinds of zombies (ZombieDefinition.kind): the base's, and a Mod's, which extends one. */
    readonly zombies = new ZombieRegistry()
    readonly components = new JsonComponents()
    readonly levelRules = new LevelRuleRegistry()
    readonly achievementTriggers = new AchievementTriggerRegistry()
    readonly projectileMotions = new ProjectileMotionRegistry()
    /** The kinds of projectiles (ProjectileDefinition.kind): the base's, and a Mod's, which extends one. */
    readonly projectiles = new ProjectileRegistry()
    readonly tutorials = new TutorialRegistry()
    private installBuiltins(definitions: GameplayDefinitions): void {
        installBuiltinLevelRules(this.levelRules)
        installBuiltinTutorials(this.tutorials)
        installBuiltinAchievementTriggers(this.achievementTriggers)
        installBuiltinProjectileMotions(this.projectileMotions)
    }
    checkpoint(): () => void {
        const rollback = [this.plantBehaviors.checkpoint(), this.plants.checkpoint(), this.zombieBehaviors.checkpoint(), this.zombies.checkpoint(), this.components.checkpoint(), this.levelRules.checkpoint(), this.achievementTriggers.checkpoint(), this.projectileMotions.checkpoint(), this.projectiles.checkpoint(), this.tutorials.checkpoint()]
        return () => { for (const undo of rollback.reverse()) undo() }
    }
    /** Everything the content names is installed and takes its settings: behaviors, plant, zombie and projectile kinds, level rules, tutorials, achievement triggers. */
    validate(definitions: GameplayDefinitions, levels: GameplayLevels): void {
        this.installBuiltins(definitions)
        this.plantBehaviors.validate(definitions)
        this.plants.validate(definitions)
        this.zombieBehaviors.validate(definitions)
        this.zombies.validate(definitions)
        this.projectiles.validate(definitions, levels)
        this.levelRules.validate(levels, definitions)
        this.tutorials.validate(levels)
        this.achievementTriggers.validate(definitions)
    }
    freeze(definitions: GameplayDefinitions, levels: GameplayLevels): void {
        this.validate(definitions, levels)
        this.plantBehaviors.freeze()
        this.plants.freeze()
        this.zombieBehaviors.freeze()
        this.zombies.freeze()
        this.components.freeze()
        this.levelRules.freeze()
        this.achievementTriggers.freeze()
        this.projectileMotions.freeze()
        this.projectiles.freeze()
        this.tutorials.freeze()
    }
}
