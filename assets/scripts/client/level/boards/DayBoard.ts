import type { MusicTuneId } from '@/client/music/MusicPlaybackSnapshot'

export interface BoardPresentation {
    background: string
    backgroundX: number
    music: { choosing: MusicTuneId; gameplay: MusicTuneId }
    gameOver: {
        images: readonly [string, string, string]
        interior: { x: number; y: number }
        doorway: { x: number; y: number }
        clipX: number
        winnerY: number
        panX: number
    }
}

const DAY_BOARD: BoardPresentation = {
    background: 'pvz:background1unsodded',
    backgroundX: 80,
    music: { choosing: 'choose_seeds', gameplay: 'day_grasswalk' },
    gameOver: {
        images: ['zombieswon', 'background1_gameover_interior_overlay', 'background1_gameover_mask'],
        interior: { x: -126, y: 225 },
        doorway: { x: -130, y: 202 },
        clipX: -123,
        winnerY: 290,
        panX: 220,
    },
}

export function getBoardPresentation(boardId: string): BoardPresentation {
    if (boardId === 'pvz:day') return DAY_BOARD
    throw new Error(`Board presentation is not installed: ${boardId}`)
}
