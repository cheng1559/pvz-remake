import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import { PlantView, type PlantViewContext } from './PlantView'
import { CherryBombView } from './CherryBombView'
import { ChomperView } from './ChomperView'
import { WallNutView } from './WallNutView'
import { GraveBusterView } from './GraveBusterView'
import { plantDefinition } from './definitions'

export type PlantViewFactory = (context: PlantViewContext) => PlantView | Promise<PlantView>

export class PlantViewRegistry extends EntityViewRegistry<PlantViewContext, PlantView> {
    constructor() {
        super(context => ({
            kind: plantDefinition(context.animations.definitions, context.plant.typeId).view,
            typeId: context.plant.typeId,
        }))
        // Every plant is drawn by its animation, whatever its layers: one view shows them, and a few plants add to it.
        const views: Record<string, typeof PlantView> = {
            shooter: PlantView, sunflower: PlantView, potatomine: PlantView, puffshroom: PlantView, mushroom: PlantView,
            sunshroom: PlantView, bowling: PlantView,
            cherrybomb: CherryBombView, chomper: ChomperView, wallnut: WallNutView, gravebuster: GraveBusterView,
        }
        for (const [kind, View] of Object.entries(views)) {
            this.register(kind, async context => {
                const view = new View(context)
                await view.initialize()
                return view
            })
        }
    }

}
