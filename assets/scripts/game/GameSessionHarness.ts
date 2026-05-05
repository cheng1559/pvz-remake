import { GameSession } from './GameSession'

export interface GameHarnessResult {
    passed: boolean
    details: string[]
}

export function runAdventure11Harness(): GameHarnessResult {
    const details: string[] = []
    const session = new GameSession()

    const center = session.geometry.gridToPixel(0, 2)
    const grid = session.geometry.pixelToGrid(center.x + 40, center.y + 50)
    if (!grid || grid.col !== 0 || grid.row !== 2) {
        details.push('Grid conversion failed for the first active row.')
    }

    session.dispatch({ type: 'selectSeed', seedType: 'peashooter' })
    session.dispatch({ type: 'placePlant', x: center.x + 40, y: center.y + 50 })
    if (session.plants.length !== 1 || session.sun !== 50) {
        details.push('Plant placement did not consume one Peashooter packet cost.')
    }

    for (let i = 0; i < 220; i++) session.update()
    if (session.plants.length !== 1) {
        details.push('The planted Peashooter should remain on the board while combat is disabled.')
    }

    return {
        passed: details.length === 0,
        details,
    }
}
