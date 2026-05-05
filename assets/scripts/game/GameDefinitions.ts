import type {
    BoardGeometry,
    LevelDefinition,
    PlantDefinition,
    SeedDefinition,
} from './GameTypes'

export const GAME_TICK_SECONDS = 0.01

export const DAY_GEOMETRY: BoardGeometry = {
    width: 800,
    height: 600,
    lawnXMin: 40,
    lawnYMin: 80,
    gridWidth: 80,
    gridHeight: 100,
    cols: 9,
    rows: 5,
    seedBankRect: { x: 0, y: 0, width: 446, height: 87 },
    menuButtonRect: { x: 680, y: 0, width: 110, height: 40 },
    gridToPixel(col: number, row: number) {
        return {
            x: col * 80 + 40,
            y: row * 100 + 80,
        }
    },
    pixelToGrid(x: number, y: number) {
        if (x < 40 || y < 80) return null
        const col = Math.max(0, Math.min(8, Math.floor((x - 40) / 80)))
        const row = Math.max(0, Math.min(4, Math.floor((y - 80) / 100)))
        return { col, row }
    },
    rowZ(row: number) {
        return 100 + row * 20
    },
}

export const SEED_DEFINITIONS: Record<string, SeedDefinition> = {
    peashooter: {
        id: 'peashooter',
        plantType: 'peashooter',
        cost: 100,
        cooldownTicks: 750,
        packetSprite: 'seedpacket_larger',
        cursorSprite: 'peashooter_head',
        placement: 'ground',
    },
}

export const PLANT_DEFINITIONS: Record<string, PlantDefinition> = {
    peashooter: {
        id: 'peashooter',
        maxHealth: 300,
        attackCadenceTicks: 150,
        firstAttackDelayTicks: 75,
        shootingAnimationTicks: 35,
        projectileType: 'pea',
        projectileOffsetX: 56,
        projectileOffsetY: -55,
        animationPath: 'animations/peashootersingle',
        bodyRect: { x: 10, y: -75, width: 60, height: 75 },
    },
}

export const ADVENTURE_1_1: LevelDefinition = {
    id: 'adventure-1-1',
    adventureLevel: 1,
    background: 'day',
    activeRows: [2],
    startingSun: 150,
    seedPackets: ['peashooter'],
    tutorialAdvice: [
        'Click on the seed packet, then click on the grass to plant.',
    ],
}
