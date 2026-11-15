import type { Node } from 'cc'
import type { Content, EntityView, LevelStage } from '@/client/level/LevelStage'
import type { GridItemSnapshot } from '@/shared/protocol/index'

/**
 * A thing of a cell as a view shows it: on the board the server's whole snapshot of it; off it (a packet's picture) its
 * type, and what of the rest the picture is to have.
 */
export type ShownGridItem = Partial<GridItemSnapshot> & Pick<GridItemSnapshot, 'typeId'>

export interface GridItemViewContext {
    node: Node
    content: Content
    item: ShownGridItem
    /** The board it is on; none off the board, where the view only draws the thing as it stands. */
    stage?: LevelStage
}

/** What draws a thing of a cell (the original's GridItem): a grave; a crater to come. */
export interface GridItemView extends EntityView<GridItemSnapshot> {
    /** The thing off the board, as it stands. */
    show(): void
}
