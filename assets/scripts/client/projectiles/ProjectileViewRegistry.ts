import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import { MowerView } from './MowerView'
import { MowingProjectileView } from './MowingProjectileView'
import { ProjectileView, type ProjectileViewContext } from './ProjectileView'

/**
 * The views of projectiles, by the `view` of their presentation (`projectile` when it names none), each kind of
 * projectile (ProjectileDefinition.kind, its server class) with the view of the same name.
 */
export class ProjectileViewRegistry extends EntityViewRegistry<ProjectileViewContext, ProjectileView> {
    constructor() {
        super((presentation, typeId) => presentation.projectiles[typeId] && (presentation.projectiles[typeId].view ?? 'projectile'),
            context => context.projectile.typeId)
        const views: Record<string, typeof ProjectileView> = { projectile: ProjectileView, mowing: MowingProjectileView }
        for (const [kind, View] of Object.entries(views)) this.registerView(kind, View)
    }
}

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
