import type { BoardDefinition, GameplayLevels, LevelDefinition } from '@/shared/content/gameplayTypes'

/** What the definitions of a level and its board give: where its mowers ride and the tools it has. */

/** Where a mower rides in a row: a level's waits there, and a mowing projectile runs there, on the ground. */
export function mowerY(board: BoardDefinition, row: number): number {
    return board.origin.y + row * board.cell.height + 23
}

/** The ground of a row, where a mower's wheels stand (mowerY and its height): what is thrown comes down there. */
export function rowGroundY(board: BoardDefinition, row: number): number {
    return mowerY(board, row) + 80
}

/**
 * The tools a game has: the ones levels award (the 1-4 shovel), from the level after on a first adventure and on
 * every level of a replay (CutScene::ShowShovel).
 */
export function levelTools(levels: GameplayLevels, level: LevelDefinition, firstAdventure: boolean): string[] {
    if (level.tools) return [...level.tools]
    const awards = Object.values(levels.levels).flatMap(entry => entry.award.kind === 'tool' ? [entry] : [])
        .sort((a, b) => a.adventureIndex - b.adventureIndex)
    return [...new Set(awards.filter(entry => !firstAdventure || entry.adventureIndex < level.adventureIndex).map(entry => entry.award.id))]
}
