import type { World } from '@/ecs/index'
import { LevelStateResource } from '../components'
import { TutorialResource } from '../levelState'
import { plantingTutorial } from './PlantingTutorial'
import { sunflowerTutorial } from './SunflowerTutorial'
import { moreSunTutorial } from './MoreSunTutorial'
import { shovelTutorial } from './ShovelTutorial'

export interface TutorialScript {
    readonly blocksStart?: boolean
    readonly blocksIntro?: boolean
    readonly alwaysActive?: boolean
    advanceDialog?(world: World): void
    toolSelected?(world: World): void
    canSelectTool?(world: World, toolId: string): boolean
    plantRemoved?(world: World): void
    initialize?(world: World, firstAdventure: boolean): void
    beforeSun?(world: World, tick: number): void
    sunSpawned?(world: World): void
    update?(world: World, tick: number): void
    seedSelected?(world: World, seedId: string): void
    seedCanceled?(world: World, tick: number): void
    seedReady?(world: World, tick: number, seedId: string): void
    seedRejected?(world: World, reason: 'seed-not-ready' | 'not-enough-sun'): void
    plantPlaced?(world: World, tick: number, plantId: string, upgraded: boolean): void
    sunCollected?(world: World, tick: number, seedId: string, canAfford: boolean): void
}

export const TUTORIALS: Readonly<Record<string, TutorialScript>> = {
    'pvz:adventure-1-1': plantingTutorial,
    'pvz:adventure-1-2': sunflowerTutorial,
    'pvz:more-sun': moreSunTutorial,
    'pvz:shovel': shovelTutorial,
}

export function getActiveTutorial(world: World): TutorialScript | undefined {
    const script = TUTORIALS[world.resources.get(LevelStateResource).definition.tutorial]
    return world.resources.get(TutorialResource).firstAdventure || script?.alwaysActive ? script : undefined
}
