import type { ProjectileCreateArgs } from './BaseProjectile'
import { Projectile } from './BaseProjectile'

export function createProjectile(args: ProjectileCreateArgs): Projectile {
    return new Projectile(args)
}

export { Projectile }
