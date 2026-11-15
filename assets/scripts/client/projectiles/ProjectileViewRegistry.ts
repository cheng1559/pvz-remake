import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import { MowerView } from './MowerView'
import { ProjectileView, type ProjectileViewContext } from './ProjectileView'

export type ProjectileViewFactory = (context: ProjectileViewContext) => ProjectileView | Promise<ProjectileView>

/** The views of projectiles, by the `view` of their presentation: `projectile` when it names none. */
export class ProjectileViewRegistry extends EntityViewRegistry<ProjectileViewContext, ProjectileView> {
    constructor() {
        super(context => ({ kind: context.stage.content.presentation.projectiles[context.typeId]?.view ?? 'projectile', typeId: context.typeId }))
        const views: Record<string, typeof ProjectileView> = { projectile: ProjectileView, mower: MowerView }
        for (const [kind, View] of Object.entries(views)) {
            this.register(kind, async context => {
                const view = new View(context)
                await view.initialize()
                return view
            })
        }
    }
}
