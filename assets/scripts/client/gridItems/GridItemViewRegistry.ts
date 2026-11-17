import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import { GraveView } from './GraveView'
import { CraterView } from './CraterView'
import type { GridItemView, GridItemViewContext } from './GridItemView'

/** The views of what stands in a cell, by the `view` of its presentation (PresentationDefinitions.gridItems). */
export class GridItemViewRegistry extends EntityViewRegistry<GridItemViewContext, GridItemView> {
    constructor() {
        super((presentation, typeId) => presentation.gridItems[typeId]?.view, context => context.item.typeId)
        this.registerView('grave', GraveView)
        this.registerView('crater', CraterView)
    }
}
