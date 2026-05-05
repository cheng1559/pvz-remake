import type { SoundEffect } from '@/core/SoundLoader'

export type SeedType = 'peashooter'
export type PlantType = 'peashooter'
export type ProjectileType = 'pea'
export type BackgroundType = 'day'
export type GameResult = 'playing' | 'won' | 'lost'

export interface Rect {
    x: number
    y: number
    width: number
    height: number
}

export interface BoardGridPosition {
    col: number
    row: number
}

export interface LevelDefinition {
    id: 'adventure-1-1'
    adventureLevel: number
    background: BackgroundType
    activeRows: number[]
    startingSun: number
    seedPackets: SeedType[]
    tutorialAdvice: string[]
}

export interface SeedDefinition {
    id: SeedType
    plantType: PlantType
    cost: number
    cooldownTicks: number
    packetSprite: string
    cursorSprite: string
    placement: 'ground'
}

export interface PlantDefinition {
    id: PlantType
    maxHealth: number
    attackCadenceTicks: number
    firstAttackDelayTicks: number
    shootingAnimationTicks: number
    projectileType: ProjectileType
    projectileOffsetX: number
    projectileOffsetY: number
    animationPath: string
    bodyRect: Rect
}

export interface BoardGeometry {
    width: number
    height: number
    lawnXMin: number
    lawnYMin: number
    gridWidth: number
    gridHeight: number
    cols: number
    rows: number
    seedBankRect: Rect
    menuButtonRect: Rect
    gridToPixel(col: number, row: number): { x: number, y: number }
    pixelToGrid(x: number, y: number): BoardGridPosition | null
    rowZ(row: number): number
}

export type GameCommand =
    | { type: 'selectSeed', seedType: SeedType }
    | { type: 'placePlant', x: number, y: number }
    | { type: 'clearCursor' }
    | { type: 'pause' }
    | { type: 'resume' }

export type GameEvent =
    | { type: 'entitySpawned', entityId: number }
    | { type: 'entityRemoved', entityId: number }
    | { type: 'animationRequested', entityId: number, animation: string }
    | { type: 'soundRequested', sound: SoundEffect }
    | { type: 'levelWon' }
    | { type: 'levelLost' }
    | { type: 'advice', message: string }

export interface SeedPacketState {
    seedType: SeedType
    cooldownRemaining: number
    selected: boolean
}

export interface PlantEntity {
    id: number
    kind: 'plant'
    type: PlantType
    col: number
    row: number
    x: number
    y: number
    health: number
    attackCounter: number
    shootingCounter: number
    dead: boolean
}

export type GameEntity = PlantEntity
