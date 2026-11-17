import type { World } from '@/server/state/World'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { type Plant, PlantFactoryResource, type PlantFields } from '@/server/plants/Plant'
import { PlantRegistry } from '@/server/plants/PlantRegistry'

/** Gives a world built by hand the base's plant kinds for `definitions`, as a session's world has them. */
export function withPlantTypes(world: World, definitions: GameplayDefinitions): World {
    world.resources.set(PlantFactoryResource, new PlantRegistry().factory(definitions))
    return world
}

/**
 * A plant of `typeId` as its kind makes it, with `fields` of a test's own (a world given withPlantTypes; its `id` and
 * `position` to insert it into World.plants). `own`: its kind's fields (a shooter's `readyAtTick`, a chomper's
 * `phase`), set as they are.
 */
export function newPlant<P extends Plant = Plant>(world: World, typeId: string, fields: Partial<PlantFields & Pick<Plant, 'id' | 'position'>> = {}, own: Partial<P> = {}): P {
    return Object.assign(world.resources.get(PlantFactoryResource).create(typeId), fields, own) as P
}
