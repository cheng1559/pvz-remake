import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import { PlantView, type PlantViewContext } from './PlantView'
import { ShooterView } from './ShooterView'
import { ScaredyShroomView } from './ScaredyShroomView'
import { ProducerView } from './ProducerView'
import { SunShroomView } from './SunShroomView'
import { FusePlantView } from './FusePlantView'
import { PotatoMineView } from './PotatoMineView'
import { ChomperView } from './ChomperView'
import { GraveBusterView } from './GraveBusterView'
import { HypnoShroomView } from './HypnoShroomView'
import { WallNutView } from './WallNutView'
import { BowlingNutView } from './BowlingNutView'

export class PlantViewRegistry extends EntityViewRegistry<PlantViewContext, PlantView> {
    constructor() {
        super((presentation, typeId) => presentation.plants[typeId] && (presentation.plants[typeId].view ?? 'plant'), context => context.plant.typeId)
        // Every plant is drawn by its animation, whatever its layers: one view shows them (`plant`, when its
        // presentation names none), and each kind of plant (PlantDefinition.kind, its server class) has its own view by
        // the same name, which adds what that kind does.
        const views: Record<string, typeof PlantView> = {
            plant: PlantView, shooter: ShooterView, scaredyshroom: ScaredyShroomView, producer: ProducerView, sunshroom: SunShroomView,
            fuse: FusePlantView, potatomine: PotatoMineView, chomper: ChomperView, gravebuster: GraveBusterView,
            hypnoshroom: HypnoShroomView, wallnut: WallNutView, bowlingnut: BowlingNutView,
        }
        for (const [kind, View] of Object.entries(views)) this.registerView(kind, View)
    }
}
