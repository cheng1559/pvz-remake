import type { PresentationDefinitions } from '@/shared/content/presentation'

export function getBoardPresentation(definitions: PresentationDefinitions, boardId: string) {
    const board = definitions.boards?.[boardId]
    if (!board) throw new Error(`Board presentation is not installed: ${boardId}`)
    return board
}
