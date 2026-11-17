import type { World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { installBuiltinProjectileMotions, ProjectileMotionRegistry, ProjectileMotionsResource } from '@/server/combat/motions'
import { ProjectileFactoryResource } from '@/server/combat/Projectile'
import { ProjectileRegistry } from '@/server/combat/ProjectileRegistry'

/** Gives a world built by hand the base's projectile motions and kinds for `definitions`, as a session's world has them. */
export function withProjectileMotions(world: World, definitions: GameplayDefinitions): World {
    const motions = new ProjectileMotionRegistry()
    installBuiltinProjectileMotions(motions)
    world.resources.set(ProjectileMotionsResource, motions)
    world.resources.set(ProjectileFactoryResource, new ProjectileRegistry().factory(definitions))
    return world
}
