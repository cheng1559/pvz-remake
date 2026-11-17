import type { EntityId, World } from '@/server/state/World'
import type { CellPlant } from '@/shared/content/planting'
import type { GridItemSnapshot } from '@/shared/protocol'
import { LevelStateResource, PlantComponent, PositionComponent } from '../state/components'

/** What stands on the lawn, as the shared cell rules (shared/content/planting, graveAt) and the level read it. */

/** The lawn's plants, each with its entity and row. Mowed plants are no plants any more, so they are not among them. */
export function lawnPlants(world: World): Array<CellPlant & { entity: EntityId }> {
    return [...world.query(PositionComponent, PlantComponent)].map(entity =>
        ({ ...world.get(entity, PlantComponent)!, row: world.get(entity, PositionComponent)!.row, entity }))
}

/** The things of the lawn's cells (graves), each with its entity, as the snapshot lists them. */
export function gridItems(world: World): GridItemSnapshot[] {
    return [...world.gridItems].map(({ id, ...item }) => ({ entityId: id, ...item }))
}

/**
 * The mowers still waiting at their rows' ends (Mower, MOWER_READY; Board::CountUntriggerLawnMowers counts them), each
 * by its row, which has one at most.
 */
export function readyMowers(world: World): Map<number, EntityId> {
    const mowers = new Map<number, EntityId>()
    for (const mower of world.mowers) mowers.set(mower.position.row, mower.id)
    return mowers
}

/**
 * Board::mLawnMowers.mSize: the lawn's mowers, waiting or set off: the rows' (Mower), and the level's mowing projectiles
 * (LevelDefinition.lawnMower) they run as.
 */
export function lawnMowerCount(world: World): number {
    const running = world.resources.get(LevelStateResource).definition.lawnMower
    return [...world.mowers].length + [...world.projectiles].filter(projectile => projectile.typeId === running).length
}
