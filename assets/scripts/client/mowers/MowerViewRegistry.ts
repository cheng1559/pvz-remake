import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import type { ProjectileViewContext } from '@/client/projectiles/ProjectileView'
import { MowerView } from './MowerView'

/**
 * The view of the rows' lawn mowers waiting (Mower), drawn as the projectile they set off as: `mower`, whatever that
 * projectile's own view is.
 */
export class MowerViewRegistry extends EntityViewRegistry<ProjectileViewContext, MowerView> {
    constructor() {
        super((presentation, typeId) => presentation.projectiles[typeId] && 'mower', context => context.projectile.typeId)
        this.registerView('mower', MowerView)
    }
}
