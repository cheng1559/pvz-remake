import { JsonComponents } from './JsonComponents'
import { PlantBehaviorRegistry } from './plants/behaviors'
import { ZombieBehaviorRegistry } from './zombies/behaviors'
import type { GameplayDefinitions } from '@/shared/content/gameplay'

export class GameplayRegistry {
    readonly plantBehaviors = new PlantBehaviorRegistry()
    readonly zombieBehaviors = new ZombieBehaviorRegistry()
    readonly components = new JsonComponents()
    checkpoint(): () => void {
        const rollback = [this.plantBehaviors.checkpoint(), this.zombieBehaviors.checkpoint(), this.components.checkpoint()]
        return () => { for (const undo of rollback.reverse()) undo() }
    }
    validate(definitions: GameplayDefinitions): void {
        this.plantBehaviors.validate(definitions)
        this.zombieBehaviors.validate(definitions)
    }
    freeze(definitions: GameplayDefinitions): void {
        this.plantBehaviors.freeze(definitions)
        this.zombieBehaviors.freeze(definitions)
        this.components.freeze()
    }
}
