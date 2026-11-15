import type { EntityId, World } from '@/ecs'
import type { CellPlant } from '@/shared/content/planting'
import type { GridItemSnapshot } from '@/shared/protocol'
import { GridItemComponent, PlantComponent, PositionComponent } from '../state/components'

/** What stands on the lawn, as the shared cell rules (shared/content/planting, graveAt) read it. */

/** The lawn's plants, each with its entity and row. Mowed plants are no plants any more, so they are not among them. */
export function lawnPlants(world: World): Array<CellPlant & { entity: EntityId }> {
    return [...world.query(PositionComponent, PlantComponent)].map(entity =>
        ({ ...world.get(entity, PlantComponent)!, row: world.get(entity, PositionComponent)!.row, entity }))
}

/** The things of the lawn's cells (graves), each with its entity, as the snapshot lists them. */
export function gridItems(world: World): GridItemSnapshot[] {
    return [...world.query(GridItemComponent)].map(entity => ({ entityId: entity, ...world.get(entity, GridItemComponent)! }))
}
