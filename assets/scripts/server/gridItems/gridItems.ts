import type { World } from '@/server/state/World'
import type { GridItemSnapshot } from '@/shared/protocol'
import type { Crater } from './craters'
import type { Grave } from './graves'

/**
 * What stands in a cell without being a plant or a zombie (GridItemSnapshot), by its type: its cell is its own, so it
 * has no position.
 */
export type GridItem = Grave | Crater

/** The things of the lawn's cells (graves, craters), each with its entity, as the snapshot lists them. */
export function gridItems(world: World): GridItemSnapshot[] {
    return [...world.gridItems].map(({ id, ...item }) => ({ entityId: id, ...item }))
}
