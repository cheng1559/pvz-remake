import type { World } from '@/server/state/World'
import type { GridItemSnapshot } from '@/shared/protocol'

/** The things of the lawn's cells (graves, craters), each with its entity, as the snapshot lists them. */
export function gridItems(world: World): GridItemSnapshot[] {
    return [...world.gridItems].map(({ id, ...item }) => ({ entityId: id, ...item }))
}
