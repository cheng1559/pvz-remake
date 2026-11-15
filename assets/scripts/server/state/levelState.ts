import { defineComponent, defineResource } from '@/ecs/index'
import type { JsonObject } from '@/shared/protocol'
import type { WavePlan } from '../rules/registry'

export interface Item {
    typeId: string
    value: number
    state: 'available' | 'collecting' | 'fading'
    velocityX: number
    velocityY: number
    accelerationY: number
    width: number
    groundY: number
    disappearTicks: number
    fadeTicks: number
    scale: number
    alpha: number
    /** Coin::mHitGround. */
    landed?: true
    /** Coin::mNeedsBouncyArrow: a pickup arrow appears on landing and the item stays twice as long. */
    arrow?: true
}

/** Every step of every tutorial script (Board::mTutorialState), `complete` once a script is done or has none. */
export const TUTORIAL_STEPS = [
    'pick-first-seed', 'plant-first-seed', 'first-plant-done', 'collect-first-sun', 'collect-more-sun', 'enough-sun',
    'pick-second-seed', 'plant-second-seed', 'complete',
    'pick-sunflower', 'plant-sunflower', 'refresh-sunflower', 'waiting-for-sunflowers',
    'dave-opening', 'shovel-pickup', 'shovel-dig', 'shovel-keep-digging', 'dave-bowling',
    'whack-before-pick-seed', 'whack-pick-seed', 'whack-done',
] as const

export interface TutorialState {
    dialogIndex?: number
    firstAdventure: boolean
    step: typeof TUTORIAL_STEPS[number]
    promptAtTick?: number
    /** The advice shown this game, each once (Board::mHelpDisplayed). */
    displayedAdvice: string[]
}

export interface WaveState {
    index: number
    /** When the lawn's graves raise their zombies after the last wave (updateGraveSpawns). */
    graveRiseAtTick?: number
    /** Every wave of this game, built when it starts and kept by saves. */
    plan: WavePlan[]
    /** When the next wave comes (mZombieCountDown), for the wave system or a rule that counts its own; unset while none is due. */
    nextWaveAtTick?: number
    accelerateAtTick?: number
    zombieIds: number[]
    healthToNextWave: number
    /** The wave Board::NextWaveComing last ran for (nextWaveComing). */
    announcedWave?: number
    hugeWaveAnnounced: boolean
    rowPicks?: Array<{ row: number; lastPicked: number; secondLastPicked: number; mowedAtWave?: number }>
    /** What the level's rules keep through the game, in their own format (LevelRuleDefinition.parseState). */
    ruleState?: JsonObject
}

/** The sky's sun (Board::mSunCountDown, mNumSunsFallen): when it next drops one, none while held back, and how many it has. */
export interface SkySunState {
    atTick?: number
    fallen: number
}

export const ItemComponent = defineComponent<Item>('pvz:item')
export const TutorialResource = defineResource<TutorialState>('pvz:tutorial-state')
export const WaveResource = defineResource<WaveState>('pvz:wave-state')
export const SkySunResource = defineResource<SkySunState>('pvz:sky-sun')
