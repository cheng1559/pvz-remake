import { director } from 'cc'
import type {
    BoardGeometry,
    LevelDefinition,
    PlantDefinition,
    SeedDefinition,
    ZombieDefinition,
} from './GameTypes'
import type { MusicTuneId } from './music/MusicSystem'

export const GAME_TICK_SECONDS = 0.01
const DEFAULT_GAME_SPEED = 1
let currentGameSpeed = DEFAULT_GAME_SPEED
let globalPauseDepth = 0

export function getGameSpeed() {
    return currentGameSpeed
}

export function setGameSpeed(speed: number) {
    currentGameSpeed = speed
    director.getScheduler().setTimeScale(speed)
}

export function pushGlobalGamePause() {
    globalPauseDepth++
}

export function popGlobalGamePause() {
    globalPauseDepth = Math.max(0, globalPauseDepth - 1)
}

export function scaleGameDeltaTime(dt: number) {
    if (globalPauseDepth > 0) return 0
    return dt * currentGameSpeed
}

export function getLevelIntroMusicTune(level: LevelDefinition): MusicTuneId | null {
    if (level.id === 'adventure-1-5') return 'title_theme'

    return 'choose_seeds'
}

export function getLevelGameplayMusicTune(level: LevelDefinition): MusicTuneId | null {
    if (level.id === 'adventure-1-5') return 'minigame'
    if (level.conveyor?.enabled === true) return 'conveyer'
    if (level.background === 'day') return 'day_grasswalk'

    return null
}

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
    plantingPixelToGrid(x: number, y: number) {
        return this.pixelToGrid(x, y)
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
    sunflower: {
        id: 'sunflower',
        plantType: 'sunflower',
        cost: 50,
        cooldownTicks: 750,
        packetSprite: 'seedpacket_larger',
        cursorSprite: 'sunflower_head',
        placement: 'ground',
    },
    cherrybomb: {
        id: 'cherrybomb',
        plantType: 'cherrybomb',
        cost: 150,
        cooldownTicks: 5000,
        packetSprite: 'seedpacket_larger',
        cursorSprite: 'cherrybomb_left1',
        placement: 'ground',
    },
    wallnut: {
        id: 'wallnut',
        plantType: 'wallnut',
        cost: 50,
        cooldownTicks: 3000,
        packetSprite: 'seedpacket_larger',
        cursorSprite: 'wallnut_body',
        placement: 'ground',
    },
    explodenut: {
        id: 'explodenut',
        plantType: 'explodenut',
        cost: 150,
        cooldownTicks: 3000,
        packetSprite: 'seedpacket_larger',
        cursorSprite: 'wallnut_body',
        placement: 'ground',
    },
    potatomine: {
        id: 'potatomine',
        plantType: 'potatomine',
        cost: 25,
        cooldownTicks: 3000,
        packetSprite: 'seedpacket_larger',
        cursorSprite: 'potatomine_body',
        placement: 'ground',
    },
    snowpea: {
        id: 'snowpea',
        plantType: 'snowpea',
        cost: 175,
        cooldownTicks: 750,
        packetSprite: 'seedpacket_larger',
        cursorSprite: 'snowpea_head',
        placement: 'ground',
    },
    chomper: {
        id: 'chomper',
        plantType: 'chomper',
        cost: 150,
        cooldownTicks: 750,
        packetSprite: 'seedpacket_larger',
        cursorSprite: 'chomper_topjaw',
        placement: 'ground',
    },
    repeater: {
        id: 'repeater',
        plantType: 'repeater',
        cost: 200,
        cooldownTicks: 750,
        packetSprite: 'seedpacket_larger',
        cursorSprite: 'peashooter_head',
        placement: 'ground',
    },
    puffshroom: {
        id: 'puffshroom',
        plantType: 'puffshroom',
        cost: 0,
        cooldownTicks: 750,
        packetSprite: 'seedpacket_larger',
        cursorSprite: 'puffshroom_head',
        placement: 'ground',
    },
}

export const PLANT_DEFINITIONS: Record<string, PlantDefinition> = {
    peashooter: {
        id: 'peashooter',
        maxHealth: 300,
        attackCadenceTicks: 150,
        firstAttackDelayTicks: 75,
        shootingAnimationTicks: 33,
        projectileType: 'pea',
        projectileOffsetX: 56,
        projectileOffsetY: 10,
        animationPath: 'animations/peashootersingle',
        bodyRect: { x: 10, y: 0, width: 60, height: 80 },
    },
    sunflower: {
        id: 'sunflower',
        maxHealth: 300,
        attackCadenceTicks: 2500,
        firstAttackDelayTicks: 2500,
        shootingAnimationTicks: 0,
        projectileType: 'pea',
        projectileOffsetX: 0,
        projectileOffsetY: 0,
        animationPath: 'animations/sunflower',
        bodyRect: { x: 10, y: 0, width: 60, height: 80 },
    },
    cherrybomb: {
        id: 'cherrybomb',
        maxHealth: 300,
        attackCadenceTicks: 0,
        firstAttackDelayTicks: 0,
        shootingAnimationTicks: 0,
        projectileType: 'pea',
        projectileOffsetX: 0,
        projectileOffsetY: 0,
        animationPath: 'animations/cherrybomb',
        bodyRect: { x: 10, y: 0, width: 60, height: 80 },
    },
    wallnut: {
        id: 'wallnut',
        maxHealth: 4000,
        attackCadenceTicks: 0,
        firstAttackDelayTicks: 0,
        shootingAnimationTicks: 0,
        projectileType: 'pea',
        projectileOffsetX: 0,
        projectileOffsetY: 0,
        animationPath: 'animations/wallnut',
        bodyRect: { x: 10, y: 0, width: 60, height: 80 },
    },
    explodenut: {
        id: 'explodenut',
        maxHealth: 4000,
        attackCadenceTicks: 0,
        firstAttackDelayTicks: 0,
        shootingAnimationTicks: 0,
        projectileType: 'pea',
        projectileOffsetX: 0,
        projectileOffsetY: 0,
        animationPath: 'animations/wallnut',
        bodyRect: { x: 10, y: 0, width: 60, height: 80 },
    },
    snowpea: {
        id: 'snowpea',
        maxHealth: 300,
        attackCadenceTicks: 150,
        firstAttackDelayTicks: 75,
        shootingAnimationTicks: 33,
        projectileType: 'snowpea',
        projectileOffsetX: 56,
        projectileOffsetY: 10,
        animationPath: 'animations/snowpea',
        bodyRect: { x: 10, y: 0, width: 60, height: 80 },
    },
    potatomine: {
        id: 'potatomine',
        maxHealth: 300,
        attackCadenceTicks: 0,
        firstAttackDelayTicks: 0,
        shootingAnimationTicks: 0,
        projectileType: 'pea',
        projectileOffsetX: 0,
        projectileOffsetY: 0,
        animationPath: 'animations/potatomine',
        bodyRect: { x: 10, y: 0, width: 60, height: 80 },
    },
    chomper: {
        id: 'chomper',
        maxHealth: 300,
        attackCadenceTicks: 0,
        firstAttackDelayTicks: 0,
        shootingAnimationTicks: 0,
        projectileType: 'pea',
        projectileOffsetX: 0,
        projectileOffsetY: 0,
        animationPath: 'animations/chomper',
        bodyRect: { x: 10, y: 0, width: 60, height: 80 },
    },
    repeater: {
        id: 'repeater',
        maxHealth: 300,
        attackCadenceTicks: 150,
        firstAttackDelayTicks: 75,
        shootingAnimationTicks: 26,
        projectileType: 'pea',
        projectileOffsetX: 56,
        projectileOffsetY: 10,
        animationPath: 'animations/peashooter',
        bodyRect: { x: 10, y: 0, width: 60, height: 80 },
    },
    puffshroom: {
        id: 'puffshroom',
        maxHealth: 300,
        attackCadenceTicks: 0,
        firstAttackDelayTicks: 0,
        shootingAnimationTicks: 0,
        projectileType: 'pea',
        projectileOffsetX: 0,
        projectileOffsetY: 0,
        animationPath: 'animations/puffshroom',
        bodyRect: { x: 10, y: 0, width: 60, height: 80 },
    },
}

const NORMAL_ZOMBIE_BODY_RECT = { x: 36, y: 0, width: 42, height: 115 }
const NORMAL_ZOMBIE_ATTACK_RECT = { x: 20, y: 0, width: 50, height: 115 }
const NORMAL_ZOMBIE_ANIMATION_PATH = 'animations/zombie'

export const ZOMBIE_DEFINITIONS: Record<string, ZombieDefinition> = {
    normal: {
        id: 'normal',
        maxHealth: 270,
        zombieValue: 1,
        firstAllowedWave: 1,
        pickWeight: 4000,
        helmType: 'none',
        helmHealth: 0,
        shieldType: 'none',
        shieldHealth: 0,
        velocityXMin: 0.23,
        velocityXMax: 0.32,
        animationPath: NORMAL_ZOMBIE_ANIMATION_PATH,
        defaultAnimation: 'anim_walk',
        bodyRect: NORMAL_ZOMBIE_BODY_RECT,
        attackRect: NORMAL_ZOMBIE_ATTACK_RECT,
        hasFlag: false,
        hasFloat: false,
    },
    flag: {
        id: 'flag',
        maxHealth: 270,
        zombieValue: 1,
        firstAllowedWave: 1,
        pickWeight: 0,
        helmType: 'none',
        helmHealth: 0,
        shieldType: 'none',
        shieldHealth: 0,
        velocityXMin: 0.45,
        velocityXMax: 0.45,
        animationPath: NORMAL_ZOMBIE_ANIMATION_PATH,
        defaultAnimation: 'anim_walk',
        bodyRect: NORMAL_ZOMBIE_BODY_RECT,
        attackRect: NORMAL_ZOMBIE_ATTACK_RECT,
        hasFlag: true,
        hasFloat: false,
    },
    'traffic-cone': {
        id: 'traffic-cone',
        maxHealth: 270,
        zombieValue: 2,
        firstAllowedWave: 1,
        pickWeight: 4000,
        helmType: 'traffic-cone',
        helmHealth: 370,
        shieldType: 'none',
        shieldHealth: 0,
        velocityXMin: 0.23,
        velocityXMax: 0.32,
        animationPath: NORMAL_ZOMBIE_ANIMATION_PATH,
        defaultAnimation: 'anim_walk',
        bodyRect: NORMAL_ZOMBIE_BODY_RECT,
        attackRect: NORMAL_ZOMBIE_ATTACK_RECT,
        hasFlag: false,
        hasFloat: false,
    },
    bucket: {
        id: 'bucket',
        maxHealth: 270,
        zombieValue: 4,
        firstAllowedWave: 1,
        pickWeight: 3000,
        helmType: 'bucket',
        helmHealth: 1100,
        shieldType: 'none',
        shieldHealth: 0,
        velocityXMin: 0.23,
        velocityXMax: 0.32,
        animationPath: NORMAL_ZOMBIE_ANIMATION_PATH,
        defaultAnimation: 'anim_walk',
        bodyRect: NORMAL_ZOMBIE_BODY_RECT,
        attackRect: NORMAL_ZOMBIE_ATTACK_RECT,
        hasFlag: false,
        hasFloat: false,
    },
    'ducky-tube': {
        id: 'ducky-tube',
        maxHealth: 270,
        zombieValue: 1,
        firstAllowedWave: 5,
        pickWeight: 0,
        helmType: 'none',
        helmHealth: 0,
        shieldType: 'none',
        shieldHealth: 0,
        velocityXMin: 0.23,
        velocityXMax: 0.32,
        animationPath: NORMAL_ZOMBIE_ANIMATION_PATH,
        defaultAnimation: 'anim_swim',
        bodyRect: NORMAL_ZOMBIE_BODY_RECT,
        attackRect: NORMAL_ZOMBIE_ATTACK_RECT,
        hasFlag: false,
        hasFloat: true,
    },
    'pole-vaulting': {
        id: 'pole-vaulting',
        maxHealth: 500,
        zombieValue: 2,
        firstAllowedWave: 5,
        pickWeight: 2000,
        helmType: 'none',
        helmHealth: 0,
        shieldType: 'none',
        shieldHealth: 0,
        velocityXMin: 0.66,
        velocityXMax: 0.66,
        animationPath: 'animations/zombie_polevaulter',
        defaultAnimation: 'anim_run',
        bodyRect: NORMAL_ZOMBIE_BODY_RECT,
        attackRect: { x: -29, y: 0, width: 70, height: 115 },
        hasFlag: false,
        hasFloat: false,
    },
}

export const ADVENTURE_1_1: LevelDefinition = {
    id: 'adventure-1-1',
    adventureLevel: 1,
    background: 'day',
    activeRows: [2],
    startingSun: 150,
    seedPackets: ['peashooter'],
    zombieWaves: [
        { zombies: ['normal'] },
        { zombies: ['normal'] },
        { zombies: ['normal'] },
        { zombies: ['normal', 'normal'] },
    ],
    awardKind: 'seed',
    awardSeedType: 'sunflower',
    tutorialAdvice: [
        'Click on a seed packet to pick it up!',
    ],
}

export const ADVENTURE_1_2: LevelDefinition = {
    id: 'adventure-1-2',
    adventureLevel: 2,
    background: 'day',
    activeRows: [1, 2, 3],
    startingSun: 50,
    seedPackets: ['peashooter', 'sunflower'],
    zombieWaves: [
        { zombies: ['normal'] },
        { zombies: ['normal'] },
        { zombies: ['normal'] },
        { zombies: ['normal', 'normal'] },
        { zombies: ['normal', 'normal'] },
        { zombies: ['normal', 'normal'], flagWave: true, flagNormalCount: 2 },
    ],
    awardKind: 'seed',
    awardSeedType: 'cherrybomb',
    tutorialAdvice: [],
}

export const ADVENTURE_1_3: LevelDefinition = {
    id: 'adventure-1-3',
    adventureLevel: 3,
    background: 'day',
    activeRows: [1, 2, 3],
    startingSun: 50,
    seedPackets: ['peashooter', 'sunflower', 'cherrybomb'],
    zombieWaves: [
        { zombies: ['normal'] },
        { zombies: ['normal'] },
        { zombies: ['normal'] },
        { zombies: ['normal', 'normal'] },
        { zombies: ['traffic-cone'] },
        { zombies: ['normal', 'normal'] },
        { zombies: ['traffic-cone', 'normal'] },
        { zombies: ['traffic-cone', 'normal'], flagWave: true, flagNormalCount: 3 },
    ],
    awardKind: 'seed',
    awardSeedType: 'wallnut',
    tutorialAdvice: [],
}

export const ADVENTURE_1_4: LevelDefinition = {
    id: 'adventure-1-4',
    adventureLevel: 4,
    background: 'day',
    activeRows: [0, 1, 2, 3, 4],
    startingSun: 50,
    seedPackets: ['peashooter', 'sunflower', 'cherrybomb', 'wallnut'],
    zombieWaves: [
        { zombies: ['normal'] },
        { zombies: ['normal'] },
        { zombies: ['normal', 'normal'] },
        { zombies: ['traffic-cone'] },
        { zombies: ['normal', 'normal'] },
        { zombies: ['traffic-cone', 'normal'] },
        { zombies: ['normal', 'normal', 'normal'] },
        { zombies: ['traffic-cone', 'normal'] },
        { zombies: ['traffic-cone', 'normal', 'normal'] },
        { zombies: ['traffic-cone'], flagWave: true, flagNormalCount: 4 },
    ],
    awardKind: 'shovel',
    tutorialAdvice: [],
}

const WALLNUT_BOWLING_ZOMBIE_POOL = [
    { zombieType: 'normal', pointCost: 1, weight: 4000 },
    { zombieType: 'traffic-cone', pointCost: 2, weight: 4000 },
] as const

const DAY_1_6_ZOMBIE_POOL = [
    { zombieType: 'normal', pointCost: 1, weight: 4000 },
    { zombieType: 'traffic-cone', pointCost: 2, weight: 4000 },
    { zombieType: 'pole-vaulting', pointCost: 2, weight: 2000 },
] as const

const DAY_1_8_ZOMBIE_POOL = [
    { zombieType: 'normal', pointCost: 1, weight: 4000 },
    { zombieType: 'traffic-cone', pointCost: 2, weight: 4000 },
    { zombieType: 'bucket', pointCost: 4, weight: 3000 },
] as const

const DAY_1_9_ZOMBIE_POOL = [
    { zombieType: 'normal', pointCost: 1, weight: 4000 },
    { zombieType: 'traffic-cone', pointCost: 2, weight: 4000 },
    { zombieType: 'pole-vaulting', pointCost: 2, weight: 2000 },
    { zombieType: 'bucket', pointCost: 4, weight: 3000 },
] as const

const DAY_1_10_CONVEYOR_SEED_POOL = [
    { seedType: 'peashooter', weight: 20 },
    { seedType: 'cherrybomb', weight: 20 },
    { seedType: 'wallnut', weight: 15 },
    { seedType: 'repeater', weight: 20 },
    { seedType: 'snowpea', weight: 10 },
    { seedType: 'chomper', weight: 5 },
    { seedType: 'potatomine', weight: 10 },
] as const

export const ADVENTURE_1_5: LevelDefinition = {
    id: 'adventure-1-5',
    adventureLevel: 5,
    background: 'day',
    challengeMode: 'wallnut-bowling',
    activeRows: [0, 1, 2, 3, 4],
    startingSun: 0,
    seedPackets: [],
    seedBankPacketSlots: 10,
    conveyor: {
        enabled: true,
        initialDelayTicks: 400,
        maxPackets: 10,
        seedPool: [
            { seedType: 'wallnut', weight: 85 },
            { seedType: 'explodenut', weight: 15 },
        ],
    },
    bowling: {
        lineColMax: 2,
        showBowlingStripe: true,
    },
    initialPlants: [
        { type: 'peashooter', row: 1, col: 5 },
        { type: 'peashooter', row: 2, col: 7 },
        { type: 'peashooter', row: 3, col: 6 },
    ],
    showCrazyDave: true,
    crazyDaveIntro: true,
    skipIntro: true,
    startWithFullLawn: true,
    hideSeedBank: false,
    hasLawnMowers: true,
    skySunSpawning: false,
    pauseGameplayOnStart: true,
    suppressReadySetPlant: true,
    zombieWaves: [
        { zombies: [], zombiePoints: 4, zombiePointPool: WALLNUT_BOWLING_ZOMBIE_POOL },
        { zombies: [], zombiePoints: 4, zombiePointPool: WALLNUT_BOWLING_ZOMBIE_POOL },
        { zombies: [], zombiePoints: 4, zombiePointPool: WALLNUT_BOWLING_ZOMBIE_POOL },
        { zombies: [], zombiePoints: 8, zombiePointPool: WALLNUT_BOWLING_ZOMBIE_POOL },
        { zombies: [], zombiePoints: 8, zombiePointPool: WALLNUT_BOWLING_ZOMBIE_POOL },
        { zombies: [], zombiePoints: 8, zombiePointPool: WALLNUT_BOWLING_ZOMBIE_POOL },
        { zombies: [], zombiePoints: 12, zombiePointPool: WALLNUT_BOWLING_ZOMBIE_POOL },
        {
            zombies: [],
            zombiePoints: 12,
            zombiePointPool: WALLNUT_BOWLING_ZOMBIE_POOL,
            requiredZombies: ['traffic-cone'],
            flagWave: true,
            flagNormalCount: 3,
        },
    ],
    awardKind: 'seed',
    awardSeedType: 'potatomine',
    tutorialAdvice: [],
}

export const ADVENTURE_1_6: LevelDefinition = {
    id: 'adventure-1-6',
    adventureLevel: 6,
    background: 'day',
    activeRows: [0, 1, 2, 3, 4],
    startingSun: 50,
    seedPackets: ['peashooter', 'sunflower', 'cherrybomb', 'wallnut', 'potatomine'],
    startWithFullLawn: true,
    zombieWaves: [],
    zombieWaveGenerator: {
        waveCount: 10,
        zombiePointPool: DAY_1_6_ZOMBIE_POOL,
        introducedZombie: 'pole-vaulting',
    },
    awardKind: 'seed',
    awardSeedType: 'snowpea',
    tutorialAdvice: [],
}

export const ADVENTURE_1_7: LevelDefinition = {
    id: 'adventure-1-7',
    adventureLevel: 7,
    background: 'day',
    activeRows: [0, 1, 2, 3, 4],
    startingSun: 50,
    seedPackets: ['peashooter', 'sunflower', 'cherrybomb', 'wallnut', 'potatomine', 'snowpea'],
    startWithFullLawn: true,
    zombieWaves: [],
    zombieWaveGenerator: {
        waveCount: 20,
        zombiePointPool: DAY_1_6_ZOMBIE_POOL,
    },
    awardKind: 'seed',
    awardSeedType: 'chomper',
    tutorialAdvice: [],
}

export const ADVENTURE_1_8: LevelDefinition = {
    id: 'adventure-1-8',
    adventureLevel: 8,
    background: 'day',
    activeRows: [0, 1, 2, 3, 4],
    startingSun: 50,
    seedPackets: ['peashooter', 'sunflower', 'cherrybomb', 'wallnut', 'potatomine', 'snowpea', 'chomper'],
    startWithFullLawn: true,
    zombieWaves: [],
    zombieWaveGenerator: {
        waveCount: 10,
        zombiePointPool: DAY_1_8_ZOMBIE_POOL,
        introducedZombie: 'bucket',
    },
    awardKind: 'seed',
    awardSeedType: 'repeater',
    tutorialAdvice: [],
}

export const ADVENTURE_1_9: LevelDefinition = {
    id: 'adventure-1-9',
    adventureLevel: 9,
    background: 'day',
    activeRows: [0, 1, 2, 3, 4],
    startingSun: 50,
    seedPackets: ['peashooter', 'sunflower', 'cherrybomb', 'wallnut', 'potatomine', 'snowpea', 'chomper', 'repeater'],
    startWithFullLawn: true,
    zombieWaves: [],
    zombieWaveGenerator: {
        waveCount: 20,
        zombiePointPool: DAY_1_9_ZOMBIE_POOL,
    },
    awardKind: 'note',
    tutorialAdvice: [],
}

export const ADVENTURE_1_10: LevelDefinition = {
    id: 'adventure-1-10',
    adventureLevel: 10,
    background: 'day',
    activeRows: [0, 1, 2, 3, 4],
    startingSun: 0,
    seedPackets: [],
    seedBankPacketSlots: 10,
    conveyor: {
        enabled: true,
        initialDelayTicks: 0,
        maxPackets: 10,
        seedPool: DAY_1_10_CONVEYOR_SEED_POOL,
    },
    startWithFullLawn: true,
    skySunSpawning: false,
    zombieWaves: [],
    zombieWaveGenerator: {
        waveCount: 20,
        zombiePointPool: DAY_1_9_ZOMBIE_POOL,
        pointMultiplier: 3,
    },
    initialZombieCountdownTicks: 100,
    introZombiePreviewCapacity: 18,
    awardKind: 'seed',
    awardSeedType: 'puffshroom',
    tutorialAdvice: [],
}

export const ADVENTURE_LEVELS = [
    ADVENTURE_1_1,
    ADVENTURE_1_2,
    ADVENTURE_1_3,
    ADVENTURE_1_4,
    ADVENTURE_1_5,
    ADVENTURE_1_6,
    ADVENTURE_1_7,
    ADVENTURE_1_8,
    ADVENTURE_1_9,
    ADVENTURE_1_10,
] as const
