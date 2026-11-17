import type { EntityId, World } from '@/server/state/World'
import type { CellPlant } from '@/shared/content/planting'
import { LevelStateResource } from '../state/resources'
import type { Plant } from '../plants/Plant'

/** What stands on the lawn, as the shared cell rules (shared/content/planting, graveAt) and the level read it. */

/**
 * The plants in play (Plant.inPlay), in id order: what the lawn takes for its plants, every system but the squashing of
 * a mowed one and what is saved or shown of all of them (World.plants).
 */
export function* plantsInPlay(world: World): Generator<Plant> {
    for (const plant of world.plants) if (plant.inPlay) yield plant
}

/** The plant of `id` while it is in play. */
export function plantInPlay(world: World, id: EntityId): Plant | undefined {
    const plant = world.plants.get(id)
    return plant?.inPlay ? plant : undefined
}

/** The lawn's plants, each with its entity and row (plantsInPlay). */
export function lawnPlants(world: World): Array<CellPlant & { entity: EntityId }> {
    return [...plantsInPlay(world)].map(plant => ({ ...plant, row: plant.position.row, entity: plant.id }))
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
