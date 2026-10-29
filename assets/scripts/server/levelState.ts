import { defineComponent, defineResource } from '@/ecs/index'
import type { GraveSnapshot } from '@/shared/protocol'

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
    dialogIndex?: number
    firstAdventure: boolean
    step: 'pick-first-seed' | 'plant-first-seed' | 'first-plant-done' | 'collect-first-sun'
        | 'collect-more-sun' | 'enough-sun' | 'pick-second-seed' | 'plant-second-seed' | 'complete'
        | 'pick-sunflower' | 'plant-sunflower' | 'refresh-sunflower' | 'waiting-for-sunflowers'
        | 'dave-opening' | 'shovel-pickup' | 'shovel-dig' | 'shovel-keep-digging' | 'dave-bowling'
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
    graves?: GraveSnapshot[]
    graveRiseAtTick?: number
    zombiesByWave?: string[][]
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
