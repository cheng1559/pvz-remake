import type { GameSystem, World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { LevelStateResource, RandomResource, SeedBankResource } from '../state/components'
import { TutorialResource, WaveResource } from '../state/levelState'
import { updateSkySun } from './sun'
import { getAvailableSun } from './items'
import { getActiveTutorial, TUTORIALS } from '../tutorials'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { planWaves } from './waves'
import { selectedSeedId } from '../seeds/seedBank'
import { createGraves } from './graves'
import { getDebugRules } from '../debug/debugRules'

export function initializeLevel(world: World, firstAdventure: boolean): void {
    const level = world.resources.get(LevelStateResource).definition
    const script = TUTORIALS[level.tutorial]
    const blocked = firstAdventure && script?.blocksStart
    world.resources.set(TutorialResource, {
        firstAdventure,
        step: 'complete',
        ...(blocked || !level.skySun ? {} : { sunAtTick: world.resources.get(RandomResource).integer(425, 699) }),
    })
    world.resources.set(WaveResource, {
        index: 0,
        ...(level.graves ? { graves: createGraves(world) } : {}),
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
            // SeedPacket::FlashIfReady: on the first gameplay update and when a usable packet finishes recharging.
            // Debug commands that clear a recharge do not count as finishing it.
            const bank = world.resources.get(SeedBankResource)
            // `/suncost false` makes every packet affordable, as the planting check already does.
            const sunCost = getDebugRules(world).sunCost
            for (const [slot, packet] of bank.packets.entries()) {
                const initialReady = tick === 1 && packet.readyAtTick <= tick
                const cooldownFinished = packet.readyAtTick === tick
                if (!initialReady && !cooldownFinished || bank.selection.mode === 'seed' && bank.selection.slot === slot ||
                    getAvailableSun(world, definitions) < (sunCost ? definitions.seeds[packet.seedId].sunCost : 0)) continue
                emitServerEvent(world.resources.get(EventQueueResource), 'seedPacketFlashRequested', { seedId: packet.seedId, slot })
                if (cooldownFinished) script?.seedReady?.(world, tick, packet.seedId)
            }
            script?.update?.(world, tick)
        },
    }
}
