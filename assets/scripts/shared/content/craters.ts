/**
 * Craters (GridItem GRIDITEM_CRATER): what a doom-shroom's blast leaves in its cell, or a crater seed puts down. No
 * plant goes into its cell while it is there, nor a grave (Board::CanPlantAt, CanAddGraveStoneAt); zombies cross it.
 */

/** A crater's type among the things of a cell (GridItemSnapshot). */
export const CRATER = 'pvz:crater'

/** GridItem::DrawCrater: below this many ticks left a crater looks worn (IMAGE_CRATER_FADING). */
export const CRATER_WORN_TICKS = 9000

/** GridItem::DrawCrater: over its last ticks it fades out. */
export const CRATER_FADE_TICKS = 25

/** The crater in a cell, among the things of the cells: a snapshot's `gridItems`, or the server's (server/level/lawn). */
export function craterAt<T extends { readonly typeId: string, readonly row: number, readonly column: number }>(
    items: readonly T[] | undefined, row: number, column: number): T | undefined {
    return items?.find(item => item.typeId === CRATER && item.row === row && item.column === column)
}
