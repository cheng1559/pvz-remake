import type { BoardDefinition, LevelDefinition } from '@/shared/content/gameplay'

/** Board::GetSeedBankExtraWidth, shared by the adjacent board tools. */
export function seedBankExtraWidth(slots: number): number {
    return slots <= 6 ? 0 : slots === 7 ? 60 : slots === 8 ? 76 : slots === 9 ? 112 : 153
}

export function levelAwardSize(award: LevelDefinition['award']): { width: number; height: number } {
    return award.kind === 'seed' ? { width: 50, height: 70 } : award
}

export function boardCell(board: BoardDefinition, x: number, y: number) {
    const column = Math.floor((x - board.origin.x) / board.cell.width)
    const row = Math.floor((y - board.origin.y) / board.cell.height)
    return { row, column, inBounds: column >= 0 && column < board.columns && row >= 0 && row < board.rows }
}

export function adventureLevelName(index: number): string {
    return `Level ${Math.floor((index - 1) / 10) + 1}-${(index - 1) % 10 + 1}`
}
