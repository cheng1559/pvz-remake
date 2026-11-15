import type { GraveSnapshot, GridItemSnapshot } from '@/shared/protocol/snapshot'

/** Graves (GridItem GRIDITEM_GRAVESTONE): their type, the ranges Board::AddAGraveStone picks from, and how one rises. */

/** A grave's type among the things of a cell (GridItemSnapshot). */
export const GRAVE = 'pvz:grave'

/** Board::AddAGraveStone: 20 stone looks and a rise delay of 0-49 ticks. */
export const GRAVE_VARIANTS = 20

export const GRAVE_MAX_RISE_DELAY = 49

/** mGridItemCounter at which a grave has fully risen and can raise zombies (Board::SpawnZombiesFromGraves). */
export const GRAVE_RISEN_COUNTER = 100

/** mGridItemCounter of a grave added in play: -delay when placed, then Board::UpdateGridItems adds one each later tick.
 *  Undefined for the level's own graves, which rise in the intro. */
export function graveRiseCounter(grave: Pick<GraveSnapshot, 'riseAtTick' | 'riseDelay'>, gameplayTick: number): number | undefined {
    return grave.riseAtTick === undefined ? undefined : Math.min(GRAVE_RISEN_COUNTER, gameplayTick - grave.riseAtTick - grave.riseDelay)
}

export function graveAt(items: readonly GridItemSnapshot[] | undefined, row: number, column: number): GraveSnapshot | undefined {
    return items?.find(item => item.typeId === GRAVE && item.row === row && item.column === column)
}

/** Shared by snapshots and saves: the look and rise delay must come from AddAGraveStone's ranges. */
export function checkGraveRanges(grave: Pick<GraveSnapshot, 'variant' | 'riseDelay'>, name: string): void {
    if (grave.variant < 0 || grave.variant >= GRAVE_VARIANTS) throw new TypeError(`${name}.variant is invalid`)
    if (grave.riseDelay < 0 || grave.riseDelay > GRAVE_MAX_RISE_DELAY) throw new TypeError(`${name}.riseDelay is invalid`)
}
