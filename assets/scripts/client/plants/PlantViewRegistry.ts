import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import { PlantView, type PlantViewContext } from './PlantView'
import { CherryBombView } from './CherryBombView'
import { ChomperView } from './ChomperView'
import { WallNutView } from './WallNutView'
import { GraveBusterView } from './GraveBusterView'

export class PlantViewRegistry extends EntityViewRegistry<PlantViewContext, PlantView> {
    constructor() {
        super((presentation, typeId) => presentation.plants[typeId] && (presentation.plants[typeId].view ?? 'plant'), context => context.plant.typeId)
        // Every plant is drawn by its animation, whatever its layers: one view shows them (`plant`, when its
        // presentation names none), and a few plants add to it.
        const views: Record<string, typeof PlantView> = {
            plant: PlantView, cherrybomb: CherryBombView, chomper: ChomperView, wallnut: WallNutView, gravebuster: GraveBusterView,
        }
        for (const [kind, View] of Object.entries(views)) this.registerView(kind, View)
    }

}
