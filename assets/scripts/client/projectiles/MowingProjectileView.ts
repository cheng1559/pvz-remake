import { ProjectileView } from './ProjectileView'

/**
 * A lawn mower running (MowingProjectile): its animation playing in a loop where it runs, on the board's plant shadow,
 * as any animated projectile is drawn (its presentation's `reanim` and `plantShadow`). Its own
 * (MowingProjectile.snapshotOwn): nothing.
 */
export class MowingProjectileView extends ProjectileView {}
