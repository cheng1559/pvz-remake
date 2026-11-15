import type { WorldSnapshot } from '@/shared/protocol'
import type { BoardDefinition, GameplayDefinitions, LevelDefinition, PlantSeedDefinition, SeedDefinition } from './gameplay'
import { graveAt } from './graves'
import { graveTeam, isHostile, plantTeam, type Team } from './teams'

/**
 * Board::CanPlantAt and the cell rules it stands on, once for both sides: the server plants by them and the client's
 * planting preview and shovel highlight show them. Each side reads its own lawn (the server's World, the client's
 * WorldSnapshot) through a PlantingLawn.
 */

/** A plant as the cell rules read it; a mowed one (PlantSnapshot.mowered) is no plant any more. */
export interface CellPlant {
    readonly typeId: string
    readonly row: number
    readonly column: number
    readonly team?: Team
    readonly mowered?: object
}

/**
 * Whether a plant holds the cell (row, column), so nothing else goes there: neither one that does not occupy its cell (a
 * rolling nut, which keeps the column it was planted in) nor one a mower has crushed holds any.
 */
export function holdsCell(plants: GameplayDefinitions['plants'], plant: CellPlant, row: number, column: number): boolean {
    return plant.mowered === undefined && plants[plant.typeId].occupiesCell !== false && plant.row === row && plant.column === column
}

/** The plant holding a cell (holdsCell), if any. */
export function cellPlant<T extends CellPlant>(plants: GameplayDefinitions['plants'], lawn: readonly T[], row: number, column: number): T | undefined {
    return lawn.find(plant => holdsCell(plants, plant, row, column))
}

/** Board::ToolHitTestHelper: the shovel digs up a cell's plant, but neither a grave buster nor a plant on the zombies' side. */
export function canShovel(plants: GameplayDefinitions['plants'], plant: { readonly typeId: string, readonly team?: Team }): boolean {
    return !plants[plant.typeId].graveBuster && plantTeam(plant) === 'plants'
}

/** What a planting decision reads of a lawn: the server builds one over its World, the client over a WorldSnapshot (snapshotLawn). */
export interface PlantingLawn {
    readonly level: LevelDefinition
    readonly board: Pick<BoardDefinition, 'rows' | 'columns'>
    /** The level's rule, for its share of the decision. */
    readonly rule?: LevelPlantingRule
    /** The plant holding a cell (cellPlant), if any. */
    plantAt(row: number, column: number): { readonly typeId: string, readonly team?: Team } | undefined
    /** The grave in a cell (graveAt), if any. */
    graveAt(row: number, column: number): { readonly team?: Team } | undefined
}

/**
 * A level rule's share of Board::CanPlantAt (Challenge::CanPlantAt). A rule writes it once and gives the same function to
 * both its sides, the server's LevelRuleDefinition and the client's LevelRuleView, so planting and its preview agree.
 */
export interface LevelPlantingRule {
    /**
     * False keeps the cell closed to a plant seed (the server refuses it as out of range). Asked before the planting
     * line, the cell's plant and its grave.
     */
    canPlantAt?(lawn: PlantingLawn, seed: PlantSeedDefinition, row: number, column: number): boolean
}

/**
 * Why a seed cannot go into a cell (Board::CanPlantAt's PlantingReason). The server answers each with its rejection and
 * advice; the client only needs whether there is one.
 */
export type PlantingRefusal =
    /** Off the board's rows, or in a row the level does not play. */
    | 'row-not-active'
    /** Off the board's columns. */
    | 'column-out-of-range'
    /** The level's rule keeps the cell closed (LevelPlantingRule). */
    | 'rule-closed'
    /** Right of the level's planting line (PLANTING_NOT_PASSED_LINE). */
    | 'past-line'
    /** A plant holds the cell. */
    | 'cell-occupied'
    /** A grave seed's cell has a grave already. */
    | 'cell-has-grave'
    /** A plant's cell has a grave (PLANTING_NOT_ON_GRAVE). */
    | 'not-on-grave'
    /** A grave buster's cell has no grave (PLANTING_ONLY_ON_GRAVES). */
    | 'cell-needs-grave'
    /** A grave buster's cell has a grave of its own side, which it does not eat. */
    | 'cell-has-own-grave'

/** Why a cell is out of play: off the board, or in a row the level does not play. */
export function cellOutOfPlay(lawn: PlantingLawn, row: number, column: number): 'row-not-active' | 'column-out-of-range' | undefined {
    if (!Number.isInteger(row) || row < 0 || row >= lawn.board.rows || !lawn.level.activeRows.includes(row)) return 'row-not-active'
    if (!Number.isInteger(column) || column < 0 || column >= lawn.board.columns) return 'column-out-of-range'
    return undefined
}

/** Board::CanPlantAt: why `seed`, held on `team`'s side, cannot go into the cell, or nothing when it can. */
export function plantingRefusal(lawn: PlantingLawn, seed: SeedDefinition, team: Team, row: number, column: number): PlantingRefusal | undefined {
    const outOfPlay = cellOutOfPlay(lawn, row, column)
    if (outOfPlay) return outOfPlay
    // Challenge::IZombieMouseDownWithZombie: a zombie goes into any cell of an active row, whatever stands there.
    if (seed.kind === 'zombie') return undefined
    // Like Grave Danger's graves (placeGrave): any cell of an active row without a grave (the plants there die).
    if (seed.kind === 'grave') return lawn.graveAt(row, column) ? 'cell-has-grave' : undefined
    if (lawn.rule?.canPlantAt?.(lawn, seed, row, column) === false) return 'rule-closed'
    // The level's red line (Wall-nut Bowling's): nothing right of its column.
    const line = lawn.level.plantingLine
    if (line && column > line.column) return 'past-line'
    if (lawn.plantAt(row, column)) return 'cell-occupied'
    // Graves block planting, except that a plant placed on graves (the Grave Buster) needs one, of the other side, to eat.
    const grave = lawn.graveAt(row, column)
    if (seed.placement === 'grave') return !grave ? 'cell-needs-grave' : isHostile(graveTeam(grave), team) ? undefined : 'cell-has-own-grave'
    return grave ? 'not-on-grave' : undefined
}

/** The client's lawn: a snapshot's plants and things of the cells, on the level's board, with its rule's view. */
export function snapshotLawn(definitions: Pick<GameplayDefinitions, 'plants' | 'boards'>, level: LevelDefinition,
    snapshot: Pick<WorldSnapshot, 'plants' | 'gridItems'>, rule?: LevelPlantingRule): PlantingLawn {
    return {
        level, board: definitions.boards[level.board], rule,
        plantAt: (row, column) => cellPlant(definitions.plants, snapshot.plants, row, column),
        graveAt: (row, column) => graveAt(snapshot.gridItems, row, column),
    }
}
