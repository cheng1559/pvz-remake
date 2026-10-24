import { defineComponent, defineResource } from '@/ecs/index'

export interface Item {
    typeId: string
    value: number
    state: 'available' | 'collecting' | 'fading'
    velocityX: number
    velocityY: number
    accelerationY?: number
    width?: number
    groundY: number
    disappearTicks: number
    fadeTicks: number
    scale: number
    alpha: number
}

export interface TutorialState {
    firstAdventure: boolean
    step: 'pick-first-seed' | 'plant-first-seed' | 'first-plant-done' | 'collect-first-sun'
        | 'collect-more-sun' | 'enough-sun' | 'pick-second-seed' | 'plant-second-seed' | 'complete'
        | 'pick-sunflower' | 'plant-sunflower' | 'refresh-sunflower'
    sunAtTick?: number
    promptAtTick?: number
    cantAffordAdviceShown?: boolean
    seedRefreshAdviceShown?: boolean
    zombieWarningShown?: boolean
    sunsFallen?: number
    displayedAdvice?: string[]
}

export interface WaveState {
    index: number
    nextWaveAtTick?: number
    accelerateAtTick?: number
    zombieIds?: number[]
    healthToNextWave?: number
    finalWaveAnnounced?: boolean
    hugeWaveAnnounced?: boolean
    rowPicks?: Array<{ row: number; lastPicked: number; secondLastPicked: number; mowedAtWave?: number }>
}

export const ItemComponent = defineComponent<Item>('pvz:item')
export const TutorialResource = defineResource<TutorialState>('pvz:tutorial-state')
export const WaveResource = defineResource<WaveState>('pvz:wave-state')
