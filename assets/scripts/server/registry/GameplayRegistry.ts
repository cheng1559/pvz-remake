import { BASE_MOD_ID } from '@/shared/mod'
import { JsonComponents } from './JsonComponents'
import { PlantBehaviorRegistry } from '../plants/behaviors'
import { ZombieBehaviorRegistry } from '../zombies/behaviors'
import type { GameplayDefinitions, GameplayLevels } from '@/shared/content/gameplay'
import { installBuiltinWaveRules, WaveRuleRegistry } from '../level/waveRules'
import { bowlingBehavior } from '../plants/bowling'

export class GameplayRegistry {
    readonly plantBehaviors = new PlantBehaviorRegistry()
    readonly zombieBehaviors = new ZombieBehaviorRegistry()
    readonly components = new JsonComponents()
    readonly waveRules = new WaveRuleRegistry()
    private installBuiltins(definitions: GameplayDefinitions): void {
        installBuiltinWaveRules(this.waveRules)
        const behaviors = new Map([['bowling', bowlingBehavior]])
        for (const [id, definition] of Object.entries(definitions.plants)) {
            const behavior = behaviors.get(String(definition.behavior?.kind))
            if (behavior && !this.plantBehaviors.has(id)) this.plantBehaviors.register(BASE_MOD_ID, id, behavior)
        }
    }
    checkpoint(): () => void {
        const rollback = [this.plantBehaviors.checkpoint(), this.zombieBehaviors.checkpoint(), this.components.checkpoint(), this.waveRules.checkpoint()]
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
        this.waveRules.freeze()
    }
    /** Every level's wave rule is installed and takes its settings. */
    validateLevels(levels: GameplayLevels): void { this.waveRules.validate(levels) }
}
