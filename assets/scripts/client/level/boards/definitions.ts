import type { BoardPresentation, BoardTimePresentation, PresentationDefinitions } from '@/shared/content/presentation'

/** The look of the board `boardId` (PresentationDefinitions.boards). */
export function boardLook(definitions: PresentationDefinitions, boardId: string): BoardPresentation {
    const look = definitions.boards?.[boardId]
    if (!look) throw new Error(`Board presentation is not installed: ${boardId}`)
    return look
}

/** The look of the board `boardId` at its time of day `time` (BoardPresentation.times). */
export function boardTimeLook(definitions: PresentationDefinitions, boardId: string, time: string): BoardTimePresentation {
    const look = boardLook(definitions, boardId).times[time]
    if (!look) throw new Error(`Board presentation is not installed: ${boardId} at ${time}`)
    return look
}

/**
 * The lawn picture a level's background shows at the board's time `look`, and whether its own sod lies over it. At its
 * own time (`own`) the time's background lies under its sod until that sod, laid whole (`laid`: the picture its intro
 * lays, once laid), is the time's whole lawn, which then shows whole, as at night: Board::DrawBackdrop's
 * IMAGE_BACKGROUND1 from 1-5 on. At another time (`/time`) that time's whole lawn shows alone.
 */
export function shownLawn(look: Pick<BoardTimePresentation, 'background' | 'lawn'>, own: boolean, laid: string | undefined): { image: string, ownSod: boolean } {
    const whole = look.lawn ?? look.background
    return !own || laid === whole ? { image: whole, ownSod: false } : { image: look.background, ownSod: true }
}
