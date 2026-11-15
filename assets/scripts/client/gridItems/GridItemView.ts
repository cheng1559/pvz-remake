import type { Node } from 'cc'
import type { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import type { LevelStage } from '@/client/level/LevelStage'
import type { GridItemSnapshot, WorldSnapshot } from '@/shared/protocol/index'

/**
 * A thing of a cell as a view shows it: on the board the server's whole snapshot of it; off it (a packet's picture) its
 * type, and what of the rest the picture is to have.
 */
export type ShownGridItem = Partial<GridItemSnapshot> & Pick<GridItemSnapshot, 'typeId'>

export interface GridItemViewContext {
    node: Node
    content: Awaited<ReturnType<typeof loadIntegratedGameContent>>
    item: ShownGridItem
    /** The board it is on; none off the board, where the view only draws the thing as it stands. */
    stage?: LevelStage
    /** It came during play, with what the level shows of that; not one the level started or was loaded with. */
    added?: boolean
}

/** What draws a thing of a cell (the original's GridItem): a grave; a crater to come. */
export interface GridItemView {
    /** The thing on the board, by the server's snapshot. `effects`: `false` takes its state without what goes with getting there (a restored game). */
    sync(item: GridItemSnapshot, world: WorldSnapshot, effects?: boolean): void
    destroy?(): void
}
