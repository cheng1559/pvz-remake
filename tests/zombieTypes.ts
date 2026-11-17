import type { World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { type Zombie, ZombieFactoryResource, type ZombieFields } from '@/server/zombies/Zombie'
import { ZombieRegistry } from '@/server/zombies/ZombieRegistry'

/** Gives a world built by hand the base's zombie kinds for `definitions`, as a session's world has them. */
export function withZombieTypes(world: World, definitions: GameplayDefinitions): World {
    world.resources.set(ZombieFactoryResource, new ZombieRegistry().factory(definitions))
    return world
}

/** A zombie of `typeId` as its kind makes it, with `fields` of a test's own (a world given withZombieTypes). */
export function newZombie(world: World, typeId: string, fields: Partial<ZombieFields> = {}): Zombie {
    return Object.assign(world.resources.get(ZombieFactoryResource).create(typeId), fields)
}
