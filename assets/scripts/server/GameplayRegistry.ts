import { JsonComponents } from './JsonComponents'
import { PlantBehaviorRegistry } from './plants/behaviors'
import { ZombieBehaviorRegistry } from './zombies/behaviors'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { bowlingBehavior } from './plants/bowling'

export class GameplayRegistry {
    readonly plantBehaviors = new PlantBehaviorRegistry()
    readonly zombieBehaviors = new ZombieBehaviorRegistry()
    readonly components = new JsonComponents()
    private installBuiltins(definitions: GameplayDefinitions): void {
        const behaviors = new Map([['bowling', bowlingBehavior]])
        for (const [id, definition] of Object.entries(definitions.plants)) {
            const behavior = behaviors.get(String(definition.behavior?.kind))
            if (behavior && !this.plantBehaviors.has(id)) this.plantBehaviors.register('pvz:base', id, behavior)
        }
    }
    checkpoint(): () => void {
        const rollback = [this.plantBehaviors.checkpoint(), this.zombieBehaviors.checkpoint(), this.components.checkpoint()]
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
    }
}
