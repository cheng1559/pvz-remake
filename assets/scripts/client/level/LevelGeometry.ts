import { type BoardDefinition, type GameplayDefinitions, LEVEL_AWARD, type LevelDefinition, levelAwardSize } from '@/shared/content/gameplay'
import type { ItemSnapshot } from '@/shared/protocol'

export { levelAwardSize }

/** Board::GetSeedBankExtraWidth, shared by the adjacent board tools. */
export function seedBankExtraWidth(slots: number): number {
    return slots <= 6 ? 0 : slots === 7 ? 60 : slots === 8 ? 76 : slots === 9 ? 112 : 153
}

/** Board::GetSeedPacketPositionX: packets in the seed bank, from its left edge; more slots squeeze them closer. */
export function seedPacketX(index: number, slots: number): number {
    return slots <= 7 ? index * 59 + 85 : slots === 8 ? index * 54 + 81 : slots === 9 ? index * 52 + 80 : index * 51 + 79
}

/**
 * Coin::MouseHitTest: the topmost item at (x, y) that is not being collected. Sun and coins take clicks 15 further
 * around; the level's rule may widen every item (`padding`, LevelRulePresentation.itemPadding). Without `award`, the
 * level's award is passed over.
 */
export function itemAt(items: readonly ItemSnapshot[], definitions: GameplayDefinitions['items'], level: LevelDefinition,
    padding: { readonly size: number, readonly height: number } | undefined, x: number, y: number, award = true): ItemSnapshot | undefined {
    for (let index = items.length - 1; index >= 0; index--) {
        const item = items[index], isAward = item.typeId === LEVEL_AWARD
        if (!award && isAward) continue
        const size = isAward ? levelAwardSize(level.award) : definitions[item.typeId]
        if (!size) continue
        const extra = padding?.size ?? (isAward ? 0 : 15), below = padding?.height ?? 0
        if (item.state !== 'collecting' && x >= item.x - extra && x < item.x + size.width + extra &&
            y >= item.y - extra && y < item.y + size.height + extra + below) return item
    }
    return undefined
}

export function boardCell(board: BoardDefinition, x: number, y: number) {
    const column = Math.floor((x - board.origin.x) / board.cell.width)
    const row = Math.floor((y - board.origin.y) / board.cell.height)
    return { row, column, inBounds: column >= 0 && column < board.columns && row >= 0 && row < board.rows }
}

/** LawnApp::GetStageString: the area-level number, shown after [LEVEL]. */
export function adventureStage(index: number): string {
    return `${Math.floor((index - 1) / 10) + 1}-${(index - 1) % 10 + 1}`
}
