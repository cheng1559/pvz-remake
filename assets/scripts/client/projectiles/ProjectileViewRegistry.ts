import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import { MowerView } from './MowerView'
import { ProjectileView, type ProjectileViewContext } from './ProjectileView'

/** The views of projectiles, by the `view` of their presentation: `projectile` when it names none. */
export class ProjectileViewRegistry extends EntityViewRegistry<ProjectileViewContext, ProjectileView> {
    constructor() {
        super(context => ({
            kind: context.content.presentation.projectiles[context.projectile.typeId]?.view ?? 'projectile', typeId: context.projectile.typeId,
        }))
        const views: Record<string, typeof ProjectileView> = { projectile: ProjectileView, mower: MowerView }
        for (const [kind, View] of Object.entries(views)) this.registerView(kind, View)
    }
}
