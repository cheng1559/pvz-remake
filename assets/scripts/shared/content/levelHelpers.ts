import type { BoardDefinition, GameplayLevels, ItemDefinition, LevelDefinition } from '@/shared/content/gameplayTypes'

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

/**
 * Board::MouseHitTest over Coin::MouseHitTest: the topmost item at (x, y) that is not being collected, the last listed
 * (the order the server makes them in, which the snapshot keeps). An item takes clicks its `clickPadding` further around
 * (the sun's), or the level's `itemClickPadding` (Whack-a-Zombie's, with more below). Without `award`, the level's award
 * is passed over. The server collects what it finds; the client asks it only where a press goes.
 */
export function itemAt<Item extends { typeId: string, state: string, x: number, y: number }>(items: readonly Item[],
    definitions: Readonly<Record<string, ItemDefinition>>, level: LevelDefinition, x: number, y: number, award = true): Item | undefined {
    const padding = level.itemClickPadding
    for (let index = items.length - 1; index >= 0; index--) {
        const item = items[index], isAward = item.typeId === LEVEL_AWARD
        if (!award && isAward) continue
        const definition = isAward ? undefined : definitions[item.typeId], size = isAward ? levelAwardSize(level.award) : definition
        if (!size || item.state === 'collecting') continue
        const extra = definition?.clickPadding ?? padding?.size ?? 0, below = padding?.height ?? 0
        if (x >= item.x - extra && x < item.x + size.width + extra && y >= item.y - extra && y < item.y + size.height + extra + below) return item
    }
    return undefined
}

/**
 * Zombie::GetBodyDamageIndex, GetHelmDamageIndex and GetShieldDamageIndex, Plant::AnimateNuts: 2 below a third of the
 * maximum, 1 below two thirds, otherwise 0, each third rounded down as the original's integer division does.
 */
export function damageIndex(health: number, maxHealth: number): number {
    return health < Math.trunc(maxHealth / 3) ? 2 : health < Math.trunc(maxHealth * 2 / 3) ? 1 : 0
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
