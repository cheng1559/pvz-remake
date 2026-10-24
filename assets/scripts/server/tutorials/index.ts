import type { World } from '@/ecs/index'
import { LevelStateResource } from '../components'
import { TutorialResource } from '../levelState'
import { plantingTutorial } from './PlantingTutorial'
import { sunflowerTutorial } from './SunflowerTutorial'

export interface TutorialScript {
    readonly blocksStart?: boolean
    initialize?(world: World, firstAdventure: boolean): void
    beforeSun?(world: World, tick: number): void
    sunSpawned?(world: World): void
    update?(world: World, tick: number): void
    seedSelected?(world: World, seedId: string): void
    seedCanceled?(world: World, tick: number): void
    seedReady?(world: World, tick: number, seedId: string): void
    plantPlaced?(world: World, tick: number, plantId: string, upgraded: boolean): void
    sunCollected?(world: World, tick: number, seedId: string, canAfford: boolean): void
}

export const TUTORIALS: Readonly<Record<string, TutorialScript>> = {
    'pvz:adventure-1-1': plantingTutorial,
    'pvz:adventure-1-2': sunflowerTutorial,
}

export function getActiveTutorial(world: World): TutorialScript | undefined {
    return world.resources.get(TutorialResource).firstAdventure
        ? TUTORIALS[world.resources.get(LevelStateResource).definition.tutorial]
        : undefined
}
