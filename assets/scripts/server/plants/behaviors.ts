import type { PlantDefinition } from '@/shared/content/gameplay'
import type { JsonObject } from '@/shared/protocol'
import { EntityBehaviorRegistry, type EntityBehavior, type EntityBehaviorContext } from '../registry/EntityBehaviorRegistry'
import { PlantComponent, type Plant } from '../state/components'

export type PlantBehavior<State extends JsonObject = JsonObject> = EntityBehavior<'plant', Plant, PlantDefinition, State>
export type PlantBehaviorContext<State extends JsonObject = JsonObject> = EntityBehaviorContext<'plant', Plant, PlantDefinition, State>

export class PlantBehaviorRegistry extends EntityBehaviorRegistry<'plant', Plant, PlantDefinition> {
    constructor() { super('plant', PlantComponent, definitions => definitions.plants, plant => plant.health > 0) }
}
