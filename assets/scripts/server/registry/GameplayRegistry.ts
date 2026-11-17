import { EntityExtensions } from './EntityExtensions'
import { ZombieRegistry } from '../zombies/ZombieRegistry'
import type { GameplayDefinitions, GameplayLevels } from '@/shared/content/gameplay'
import { LevelRuleRegistry } from '../rules/registry'
import { installBuiltinLevelRules } from '../rules'
import { PlantRegistry } from '../plants/PlantRegistry'
import { AchievementTriggerRegistry } from '../achievements/achievements'
import { installBuiltinAchievementTriggers } from '../achievements/triggers'
import { installBuiltinProjectileMotions, ProjectileMotionRegistry } from '../projectiles/motions'
import { ProjectileRegistry } from '../projectiles/ProjectileRegistry'
import { installBuiltinTutorials, TutorialRegistry } from '../tutorials'

export class GameplayRegistry {
    /** The kinds of plants (PlantDefinition.kind): the base's, and a Mod's, which extends one. */
    readonly plants = new PlantRegistry()
    /** The kinds of zombies (ZombieDefinition.kind): the base's, and a Mod's, which extends one. */
    readonly zombies = new ZombieRegistry()
    readonly extensions = new EntityExtensions()
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
        const rollback = [this.plants.checkpoint(), this.zombies.checkpoint(), this.extensions.checkpoint(), this.levelRules.checkpoint(), this.achievementTriggers.checkpoint(), this.projectileMotions.checkpoint(), this.projectiles.checkpoint(), this.tutorials.checkpoint()]
        return () => { for (const undo of rollback.reverse()) undo() }
    }
    /** Everything the content names is installed and takes its settings: plant, zombie and projectile kinds, level rules, tutorials, achievement triggers. */
    validate(definitions: GameplayDefinitions, levels: GameplayLevels): void {
        this.installBuiltins(definitions)
        this.plants.validate(definitions)
        this.zombies.validate(definitions)
        this.projectiles.validate(definitions, levels)
        this.levelRules.validate(levels, definitions)
        this.tutorials.validate(levels)
        this.achievementTriggers.validate(definitions)
    }
    freeze(definitions: GameplayDefinitions, levels: GameplayLevels): void {
        this.validate(definitions, levels)
        this.plants.freeze()
        this.zombies.freeze()
        this.extensions.freeze()
        this.levelRules.freeze()
        this.achievementTriggers.freeze()
        this.projectileMotions.freeze()
        this.projectiles.freeze()
        this.tutorials.freeze()
    }
}
