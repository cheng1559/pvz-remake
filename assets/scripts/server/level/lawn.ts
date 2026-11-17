import type { EntityId, World } from '@/ecs'
import type { CellPlant } from '@/shared/content/planting'
import type { GridItemSnapshot } from '@/shared/protocol'
import { GridItemComponent, LevelStateResource, MowerComponent, PlantComponent, PositionComponent, ProjectileComponent } from '../state/components'

/** What stands on the lawn, as the shared cell rules (shared/content/planting, graveAt) and the level read it. */

/** The lawn's plants, each with its entity and row. Mowed plants are no plants any more, so they are not among them. */
export function lawnPlants(world: World): Array<CellPlant & { entity: EntityId }> {
    return [...world.query(PositionComponent, PlantComponent)].map(entity =>
        ({ ...world.get(entity, PlantComponent)!, row: world.get(entity, PositionComponent)!.row, entity }))
}

/** The things of the lawn's cells (graves), each with its entity, as the snapshot lists them. */
export function gridItems(world: World): GridItemSnapshot[] {
    return [...world.query(GridItemComponent)].map(entity => ({ entityId: entity, ...world.get(entity, GridItemComponent)! }))
}

/**
 * The mowers still waiting at their rows' ends (Mower, MOWER_READY; Board::CountUntriggerLawnMowers counts them), each
 * by its row, which has one at most.
 */
export function readyMowers(world: World): Map<number, EntityId> {
    const mowers = new Map<number, EntityId>()
    for (const entity of world.query(PositionComponent, MowerComponent)) mowers.set(world.get(entity, PositionComponent)!.row, entity)
    return mowers
}

/**
 * Board::mLawnMowers.mSize: the lawn's mowers, waiting or set off: the rows' (Mower), and the level's mowing projectiles
 * (LevelDefinition.lawnMower) they run as.
 */
export function lawnMowerCount(world: World): number {
    const running = world.resources.get(LevelStateResource).definition.lawnMower
    return [...world.query(MowerComponent)].length + [...world.query(ProjectileComponent)].filter(entity => world.get(entity, ProjectileComponent)!.typeId === running).length
}
