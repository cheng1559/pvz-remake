import { type BoardDefinition, levelAwardSize } from '@/shared/content/gameplay'

export { levelAwardSize }

/**
 * The seed bank's x in play (SeedBank::mX), its choosing place being 0: how far right it slides once the seeds are
 * chosen (CutScene's SEED_BANK_OFFSET_X).
 */
export const SEED_BANK_X = 10

/** Board::GetSeedBankExtraWidth, shared by the adjacent board tools. */
export function seedBankExtraWidth(slots: number): number {
    return slots <= 6 ? 0 : slots === 7 ? 60 : slots === 8 ? 76 : slots === 9 ? 112 : 153
}

/** Board::GetSeedPacketPositionX: packets in the seed bank, from its left edge; more slots squeeze them closer. */
export function seedPacketX(index: number, slots: number): number {
    return slots <= 7 ? index * 59 + 85 : slots === 8 ? index * 54 + 81 : slots === 9 ? index * 52 + 80 : index * 51 + 79
}

export function boardCell(board: BoardDefinition, x: number, y: number) {
    const column = Math.floor((x - board.origin.x) / board.cell.width)
    const row = Math.floor((y - board.origin.y) / board.cell.height)
    return { row, column, inBounds: column >= 0 && column < board.columns && row >= 0 && row < board.rows }
}

/**
 * Board::PixelToGridX and PixelToGridY, where a seed goes down: no cell left of or above the lawn, the last column or row
 * past its right or bottom edge.
 */
export function plantingCell(board: BoardDefinition, x: number, y: number): { row: number, column: number } | undefined {
    if (x < board.origin.x || y < board.origin.y) return undefined
    const { row, column } = boardCell(board, x, y)
    return { row: Math.min(board.rows - 1, row), column: Math.min(board.columns - 1, column) }
}

/** LawnApp::GetStageString: the area-level number, shown after [LEVEL]. */
export function adventureStage(index: number): string {
    return `${Math.floor((index - 1) / 10) + 1}-${(index - 1) % 10 + 1}`
}
