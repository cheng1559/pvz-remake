import type { SoundEffect } from '@/core/SoundLoader'

export type SeedType =
    | 'peashooter'
    | 'sunflower'
    | 'cherrybomb'
    | 'wallnut'
    | 'potatomine'
    | 'snowpea'
    | 'chomper'
    | 'repeater'
export type PlantType = SeedType
export type ProjectileType = 'pea' | 'snowpea'
export type ItemType = 'sun' | 'small-sun' | 'large-sun' | 'silver-coin' | 'gold-coin' | 'diamond' | 'final-seed-packet'
export type ItemMotion = 'from-sky' | 'from-sky-slow' | 'from-plant' | 'coin'
export type ToolType = 'shovel'
export type BackgroundType = 'day'
export type GameResult = 'playing' | 'won' | 'lost'
export type ZombieType = 'normal' | 'flag' | 'traffic-cone' | 'bucket' | 'ducky-tube'
export type ZombieSubclass = 'normal'
export type ZombieState = 'walking' | 'eating' | 'dying' | 'mowered' | 'charred'
export type LawnMowerState = 'ready' | 'triggered'
export type ZombieHelmType = 'none' | 'traffic-cone' | 'bucket'
export type ZombieShieldType = 'none'
export type AdviceStyle =
    | 'hint'
    | 'hint-stay'
    | 'tutorial-level1'
    | 'tutorial-level1-stay'
    | 'tutorial-level2'
export type LevelOneTutorialPhase =
    | 'pick-first-seed'
    | 'plant-first-seed'
    | 'first-plant-done'
    | 'collect-more-sun'
    | 'enough-sun'
    | 'pick-second-seed'
    | 'plant-second-seed'
    | 'done'
export type LevelTwoTutorialPhase =
    | 'off'
    | 'pick-sunflower'
    | 'plant-sunflower'
    | 'refresh-sunflower'
    | 'completed'
export type PlantingReason = 'ok' | 'not-here' | 'not-enough-sun' | 'waiting-for-seed'
export type PlantState =
    | 'not-ready'
    | 'ready'
    | 'doing-special'
    | 'potato-rising'
    | 'potato-armed'
    | 'potato-mashed'
    | 'chomper-biting'
    | 'chomper-biting-got-one'
    | 'chomper-biting-missed'
    | 'chomper-digesting'
    | 'chomper-swallowing'

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
    id: 'adventure-1-1' | 'adventure-1-2' | 'adventure-1-3'
    adventureLevel: number
    background: BackgroundType
    activeRows: number[]
    startingSun: number
    seedPackets: SeedType[]
    zombieWaves: ZombieWaveDefinition[]
    tutorialAdvice: string[]
    awardSeedType?: SeedType
}

export interface ZombieWaveDefinition {
    zombies: ZombieType[]
    flagWave?: boolean
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

export interface ZombieDefinition {
    id: ZombieType
    maxHealth: number
    helmType: ZombieHelmType
    helmHealth: number
    shieldType: ZombieShieldType
    shieldHealth: number
    velocityXMin: number
    velocityXMax: number
    animationPath: string
    defaultAnimation: string
    bodyRect: Rect
    attackRect: Rect
    hasFlag: boolean
    hasFloat: boolean
}

export type PlantSubclass = 'normal' | 'shooter'

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
    plantingPixelToGrid(x: number, y: number, seedType: SeedType): BoardGridPosition | null
    rowZ(row: number): number
}

export type GameCommand =
    | { type: 'selectSeed', seedType: SeedType }
    | { type: 'selectTool', toolType: ToolType }
    | { type: 'placePlant', x: number, y: number }
    | { type: 'useToolAt', x: number, y: number }
    | { type: 'collectItemAt', x: number, y: number }
    | { type: 'clearCursor' }
    | { type: 'pause' }
    | { type: 'resume' }

export type GameEvent =
    | { type: 'entitySpawned', entityId: number }
    | { type: 'entityRemoved', entityId: number }
    | { type: 'animationRequested', entityId: number, animation: string }
    | { type: 'projectileFired', entityId: number, projectileType: ProjectileType, x: number, y: number, row: number }
    | { type: 'sunProduced', entityId: number, amount: number, x: number, y: number }
    | { type: 'cherryBombDetonated', entityId: number, x: number, y: number, row: number }
    | { type: 'boardShake', amountX: number, amountY: number }
    | { type: 'readySetPlant' }
    | { type: 'soundRequested', sound: SoundEffect }
    | { type: 'foleyRequested', sound: SoundEffect, pitchRange?: number }
    | { type: 'levelAwardCollected' }
    | { type: 'levelWon' }
    | { type: 'levelLost', zombieId: number | null }
    | { type: 'advice', message: string, style?: AdviceStyle }
    | { type: 'adviceCleared' }
    | { type: 'hugeWave' }
    | { type: 'sunFlash' }
    | { type: 'finalWave' }

export interface SeedPacketState {
    seedType: SeedType
    cooldownRemaining: number
    active: boolean
    selected: boolean
}

export interface PlantEntity {
    id: number
    kind: 'plant'
    type: PlantType
    subclass: PlantSubclass
    col: number
    row: number
    x: number
    y: number
    health: number
    maxHealth: number
    launchCounter: number
    launchRate: number
    attackCounter: number
    shootingCounter: number
    specialCounter: number
    eatenFlashCounter: number
    state: PlantState
    stateCountdown: number
    dead: boolean
}

export interface ZombieEntity {
    id: number
    kind: 'zombie'
    type: ZombieType
    subclass: ZombieSubclass
    fromWave: number
    row: number
    x: number
    y: number
    velocityX: number
    health: number
    maxHealth: number
    helmType: ZombieHelmType
    helmHealth: number
    helmMaxHealth: number
    shieldType: ZombieShieldType
    shieldHealth: number
    shieldMaxHealth: number
    state: ZombieState
    currentAnimation: string
    animationSpeed: number
    animationTime: number
    moweredTime: number
    charredTime: number
    age: number
    chilledCounter: number
    hitFlashCounter: number
    hasHead: boolean
    hasArm: boolean
    hasTongue: boolean
    hasObject: boolean
    inPool: boolean
    dead: boolean
    bodyRect: Rect
    attackRect: Rect
}

export interface ItemEntity {
    id: number
    kind: 'item'
    type: ItemType
    motion: ItemMotion
    x: number
    y: number
    width: number
    height: number
    scale: number
    alpha: number
    awardSeedType: SeedType | null
    hitGround: boolean
    dead: boolean
    beingCollected: boolean
}

export interface ProjectileEntity {
    id: number
    kind: 'projectile'
    type: ProjectileType
    row: number
    x: number
    y: number
    z: number
    velocityX: number
    velocityY: number
    velocityZ: number
    accelerationZ: number
    shadowY: number
    width: number
    height: number
    age: number
    dead: boolean
}

export interface LawnMowerEntity {
    id: number
    kind: 'lawnmower'
    row: number
    x: number
    y: number
    state: LawnMowerState
    chompCounter: number
    dead: boolean
}

export type GameEntity = PlantEntity | ZombieEntity | ItemEntity | ProjectileEntity | LawnMowerEntity
