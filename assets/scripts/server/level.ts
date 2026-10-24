import type { GameSystem, World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { LevelStateResource, RandomResource, SeedBankResource } from './components'
import { TutorialResource, WaveResource } from './levelState'
import { updateSkySun } from './sun'
import { getAvailableSun } from './items'
import { getActiveTutorial, TUTORIALS } from './tutorials'
import { EventQueueResource, emitServerEvent } from './events'
import { planWaves } from './waves'
import { selectedSeedId } from './seedBank'

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
        nextWaveAtTick: blocked ? undefined : level.firstWaveTicks ?? 1,
        ...(level.zombiePool ? { zombiesByWave: planWaves(level, world.resources.get(RandomResource)) } : {}),
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
            // Match FlashIfReady on the first gameplay update and when a usable packet finishes cooling down.
            if (tick === 1 || script?.seedReady) {
                const bank = world.resources.get(SeedBankResource)
                for (const packet of bank.packets) {
                    const initialReady = tick === 1 && packet.readyAtTick <= tick
                    const cooldownFinished = packet.readyAtTick === tick
                    if ((initialReady || cooldownFinished) && selectedSeedId(bank) !== packet.seedId &&
                        getAvailableSun(world, definitions) >= definitions.seeds[packet.seedId].sunCost) {
                        if (initialReady) emitServerEvent(world.resources.get(EventQueueResource), 'seedPacketFlashRequested', { seedId: packet.seedId })
                        if (cooldownFinished) script?.seedReady?.(world, tick, packet.seedId)
                    }
                }
            }
            script?.update?.(world, tick)
        },
    }
}
