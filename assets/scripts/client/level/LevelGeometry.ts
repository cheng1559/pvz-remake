import type { BoardDefinition } from '@/shared/content/gameplay'

export function boardCell(board: BoardDefinition, x: number, y: number) {
    const column = Math.floor((x - board.origin.x) / board.cell.width)
    const row = Math.floor((y - board.origin.y) / board.cell.height)
    return { row, column, inBounds: column >= 0 && column < board.columns && row >= 0 && row < board.rows }
}

export function adventureLevelName(index: number): string {
    return `Level ${Math.floor((index - 1) / 10) + 1}-${(index - 1) % 10 + 1}`
}
