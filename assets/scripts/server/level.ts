import type { GameSystem, World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { LevelStateResource, RandomResource, SeedBankResource } from './gameplay'
import { TutorialResource, WaveResource } from './levelState'
import { updateSkySun } from './sun'
import { getAvailableSun } from './items'
import { getActiveTutorial, TUTORIALS } from './tutorials'

export function initializeLevel(world: World, firstAdventure: boolean): void {
    const level = world.resources.get(LevelStateResource).definition
    const script = TUTORIALS[level.tutorial]
    const blocked = firstAdventure && script?.blocksStart
    world.resources.set(TutorialResource, {
        firstAdventure: firstAdventure && !!script,
        step: 'complete',
        ...(blocked ? {} : { sunAtTick: world.resources.get(RandomResource).integer(425, 699) }),
    })
    world.resources.set(WaveResource, {
        index: 0,
        nextWaveAtTick: blocked ? undefined : 1,
        ...(level.activeRows.length > 1 ? {
            rowPicks: level.activeRows.map(row => ({ row, lastPicked: 0, secondLastPicked: 0 })),
        } : {}),
    })
    script?.initialize?.(world, firstAdventure)
}

export function createLevelProgressSystem(definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:level-progress',
        run({ world, commands, tick }) {
            const script = getActiveTutorial(world)
            // Keep tutorial transitions on the same side of sky-sun spawning as before.
            script?.beforeSun?.(world, tick)
            if (updateSkySun(world, commands, definitions, tick)) script?.sunSpawned?.(world)
            // Match FlashIfReady: notify only when a usable packet actually finishes cooling down.
            if (script?.seedReady) {
                const bank = world.resources.get(SeedBankResource)
                for (const packet of bank.packets) {
                    if (packet.readyAtTick === tick && bank.selectedSeedId !== packet.seedId &&
                        getAvailableSun(world, definitions) >= definitions.seeds[packet.seedId].sunCost) {
                        script.seedReady(world, tick, packet.seedId)
                    }
                }
            }
            script?.update?.(world, tick)
        },
    }
}
