import type { GameSystem, World } from '@/server/state/World'
import { type GameplayDefinitions, levelHasWaves } from '@/shared/content/gameplay'
import { LevelStateResource, RandomResource, SeedBankResource, SkySunResource, TutorialResource, WaveResource } from '../state/resources'
import { updateSkySun } from './sun'
import { getActiveTutorial, levelTutorial, skipTutorial } from '../tutorials'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { planWaves, type LevelRuleRegistry } from '../rules/registry'
import { seedAffordable } from '../seeds/seedBank'
import { createGraves, pickSpecialGrave } from '../gridItems/graves'

/** Board::InitZombieWaves: ZOMBIE_COUNTDOWN_FIRST_WAVE, the first wave's countdown when the level gives none. */
const FIRST_WAVE_TICKS = 1800

export function initializeLevel(world: World, firstAdventure: boolean, definitions: GameplayDefinitions, rules: LevelRuleRegistry): void {
    const level = world.resources.get(LevelStateResource).definition
    const script = levelTutorial(world)
    // TutorialScript.skips: a first adventure without what the script teaches starts as a replay does.
    const skipped = firstAdventure && !!script?.skips?.(world)
    const blocked = firstAdventure && !skipped && script?.blocksStart
    world.resources.set(TutorialResource, {
        firstAdventure,
        ...(skipped ? { skipped: true } : {}),
        step: 'complete',
        displayedAdvice: [],
    })
    // Board::InitLevel: the first sky sun (RandRangeInt(425, 700), the upper end included), unless the tutorial holds it back for its first plant.
    world.resources.set(SkySunResource, { fallen: 0, ...(blocked || !level.skySun ? {} : { atTick: world.resources.get(RandomResource).integer(425, 700) }) })
    if (level.graves) createGraves(world)
    world.resources.set(WaveResource, {
        index: 0,
        nextWaveAtTick: blocked || !levelHasWaves(level) ? undefined : level.firstWaveTicks ?? FIRST_WAVE_TICKS,
        plan: planWaves(rules.draft(level, definitions), level, world.resources.get(RandomResource)),
        zombieIds: [],
        healthToNextWave: 0,
        hugeWaveAnnounced: false,
        ...(level.activeRows.length > 1 ? {
            rowPicks: level.activeRows.map(row => ({ row, lastPicked: 0, secondLastPicked: 0 })),
        } : {}),
    })
    rules.get(level)?.initialize?.(world, definitions)
    pickSpecialGrave(world)
    script?.initialize?.(world, firstAdventure)
}

export function createLevelProgressSystem(definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:level-progress',
        run({ world, commands, tick }) {
            let script = getActiveTutorial(world)
            // TutorialScript.skips: what the script teaches gone from the bank (`/seed`), it lets go and plays no more.
            const tutorial = world.resources.get(TutorialResource)
            if (script && tutorial.firstAdventure && tutorial.step !== 'complete' && script.skips?.(world)) {
                skipTutorial(world, tick, script)
                script = getActiveTutorial(world)
            }
            // Keep tutorial transitions on the same side of sky-sun spawning as before.
            script?.beforeSun?.(world, tick)
            if (updateSkySun(world, commands, definitions, tick)) script?.sunSpawned?.(world)
            // SeedPacket::FlashIfReady: on the first gameplay update and when a usable packet finishes recharging.
            // Debug commands that clear a recharge do not count as finishing it.
            const bank = world.resources.get(SeedBankResource)
            for (const [slot, packet] of bank.packets.entries()) {
                if (!packet) continue
                const initialReady = tick === 1 && packet.readyAtTick <= tick
                const cooldownFinished = packet.readyAtTick === tick
                if (!initialReady && !cooldownFinished || bank.selection.mode === 'seed' && bank.selection.slot === slot ||
                    !seedAffordable(world, definitions, packet.seedId)) continue
                emitServerEvent(world.resources.get(EventQueueResource), 'seedPacketFlashRequested', { seedId: packet.seedId, slot })
                if (cooldownFinished) script?.seedReady?.(world, definitions, tick, packet.seedId)
            }
            script?.update?.(world, definitions, tick)
        },
    }
}
