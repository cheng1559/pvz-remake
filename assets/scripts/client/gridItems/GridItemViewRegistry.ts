import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import { GraveView } from './GraveView'
import type { GridItemView, GridItemViewContext } from './GridItemView'

export type GridItemViewFactory = (context: GridItemViewContext) => GridItemView | Promise<GridItemView>

/** The views of what stands in a cell, by the `view` of its presentation (PresentationDefinitions.gridItems). */
export class GridItemViewRegistry extends EntityViewRegistry<GridItemViewContext, GridItemView> {
    constructor() {
        super(context => ({ kind: context.content.presentation.gridItems[context.item.typeId]?.view, typeId: context.item.typeId }))
        this.register('grave', context => GraveView.create(context))
    }
}
