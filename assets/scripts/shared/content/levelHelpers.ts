import type { BoardDefinition, GameplayLevels, LevelDefinition } from '@/shared/content/gameplayTypes'

/** What the definitions of a level and its board give: where its mowers ride, the tools it has and its award's size. */

/**
 * Coin::IsLevelAward: the level's award on the lawn is an item of this type (COIN_FINAL_SEED_PACKET, COIN_NOTE and the
 * rest), dropped, waiting and collected as items are; what it is, its look and its size are the level's `award`.
 */
export const LEVEL_AWARD = 'pvz:level-award'

/** A seed packet's size (IMAGE_SEEDS' cel): in the bank, in the chooser, and a seed award's. */
export const SEED_PACKET_SIZE = Object.freeze({ width: 50, height: 70 })

/** The level award's size on the lawn (Coin::CoinInitialize's mWidth, mHeight): a seed award's is its packet's. */
export function levelAwardSize(award: LevelDefinition['award']): { readonly width: number; readonly height: number } {
    return award.kind === 'seed' ? SEED_PACKET_SIZE : award
}

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
