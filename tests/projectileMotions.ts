import type { World } from '@/ecs/index'
import { installBuiltinProjectileMotions, ProjectileMotionRegistry, ProjectileMotionsResource } from '@/server/combat/motions'

/** Gives a world built by hand the base's projectile motions, as a session's world has them. */
export function withProjectileMotions(world: World): World {
    const motions = new ProjectileMotionRegistry()
    installBuiltinProjectileMotions(motions)
    world.resources.set(ProjectileMotionsResource, motions)
    return world
}
