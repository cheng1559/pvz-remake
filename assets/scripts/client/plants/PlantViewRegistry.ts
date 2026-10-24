import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import type { PlantView, PlantViewContext } from './PlantView'
import { ShooterView } from './ShooterView'
import { SunflowerView } from './SunflowerView'
import { CherryBombView } from './CherryBombView'
import { ChomperView } from './ChomperView'
import { PotatoMineView } from './PotatoMineView'
import { WallNutView } from './WallNutView'
import { BowlingNutView } from './BowlingNutView'
import { plantDefinition } from './definitions'

export type PlantViewFactory = (context: PlantViewContext) => PlantView | Promise<PlantView>

export class PlantViewRegistry extends EntityViewRegistry<PlantViewContext, PlantView> {
    constructor() {
        super(context => ({
            kind: plantDefinition(context.animations.definitions, context.plant.typeId).view,
            typeId: context.plant.typeId,
        }))
        this.register('shooter', context => ShooterView.create(context))
        this.register('sunflower', context => SunflowerView.create(context))
        for (const [kind, View] of Object.entries({ cherrybomb: CherryBombView, chomper: ChomperView, potatomine: PotatoMineView, wallnut: WallNutView, bowling: BowlingNutView })) {
            this.register(kind, async context => {
                const view = new View(context)
                await view.initialize()
                return view
            })
        }
    }

}
