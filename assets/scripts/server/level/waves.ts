import type { GameSystem, World } from '@/server/state/World'
import { type GameplayDefinitions, zombieRowY } from '@/shared/content/gameplay'
import { LevelStateResource, RandomResource, WaveResource, type WaveState } from '../state/resources'
import type { Zombie } from '../zombies/Zombie'
import { pickZombieSpawnX, spawnZombie } from '../zombies/spawn'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { tryDropLevelAward } from './levelAward'
import { graves, updateGraveSpawns } from '../gridItems/graves'
import { levelRule } from '../rules/registry'
import { isEnemyZombie } from '@/shared/content/teams'

const NEXT_WAVE_DELAY_TICKS = 2500
const NEXT_WAVE_DELAY_RANGE_TICKS = 600
const EARLY_WAVE_CHECK_TICKS = 400
const EARLY_WAVE_DELAY_TICKS = 200
const SHIELD_HEALTH_SHARE = Math.fround(0.2)

/**
 * Board::TotalZombiesHealthInWave: body and helm count in full, the shield at 0.2f. The int
 * total adds each zombie's float sum, truncated.
 */
function addWaveHealth(total: number, zombie: Zombie): number {
    const health = zombie.shieldHealth > 0
        ? Math.fround(zombie.health + zombie.helmHealth + Math.fround(zombie.shieldHealth * SHIELD_HEALTH_SHARE)) : zombie.health + zombie.helmHealth
    return Math.trunc(Math.fround(total + health))
}

/**
 * Board::NextWaveComing, once for each wave as it is about to come (`waves.index`): the final wave's banner before the
 * last one, and the awooga before the first or else the siren where `siren` says (a flag wave; on Whack-a-Zombie, the
 * last wave). A rule that counts its own waves calls it too.
 */
export function nextWaveComing(world: World, siren: boolean): void {
    const waves = world.resources.get(WaveResource)
    if (waves.announcedWave === waves.index) return
    waves.announcedWave = waves.index
    const events = world.resources.get(EventQueueResource)
    if (waves.index + 1 === waves.plan.length) emitServerEvent(events, 'finalWave', {})
    emitServerEvent(events, 'nextWaveComing', waves.index === 0 ? { first: true } : siren ? { siren: true } : {})
}

export function createWaveSystem(definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:waves',
        run({ world, tick, commands }) {
            const level = world.resources.get(LevelStateResource)
            // Challenge::UpdateZombieSpawning: some rules raise their own zombies.
            if (level.result !== 'playing' || level.paused || levelRule(world)?.spawnsZombies) return

            const waves = world.resources.get(WaveResource)
            updateGraveSpawns(world, definitions, tick)
            if (waves.index >= waves.plan.length) {
                tryDropLevelAward(world, definitions, commands)
                return
            }
            if (waves.nextWaveAtTick === undefined) return
            const nextIsFlag = waves.plan[waves.index].flagWave === true
            const waveHealth = waves.zombieIds.reduce((total, entity) => {
                const zombie = world.zombies.get(entity)
                // Board::TotalZombiesHealthInWave leaves out mind-controlled zombies.
                return (zombie?.state === 'walking' || zombie?.state === 'eating' || zombie?.state === 'airborne') && isEnemyZombie(zombie)
                    ? addWaveHealth(total, zombie) : total
            }, 0)
            // Board::UpdateZombieSpawning returns during the huge wave countdown, so it cannot be shortened.
            if (!waves.hugeWaveAnnounced && waves.accelerateAtTick !== undefined && tick >= waves.accelerateAtTick &&
                (!nextIsFlag && waveHealth <= waves.healthToNextWave || waveHealth <= 0)) {
                waves.nextWaveAtTick = Math.min(waves.nextWaveAtTick, tick + EARLY_WAVE_DELAY_TICKS)
                waves.accelerateAtTick = undefined
            }
            if (nextIsFlag && !waves.hugeWaveAnnounced && tick >= waves.nextWaveAtTick - 5) {
                waves.hugeWaveAnnounced = true
                waves.nextWaveAtTick = tick + 751
                emitServerEvent(world.resources.get(EventQueueResource), 'hugeWave', {})
            }
            if (nextIsFlag && waves.hugeWaveAnnounced) {
                if (tick === waves.nextWaveAtTick - 726) emitServerEvent(world.resources.get(EventQueueResource), 'hugeWaveSound', {})
                // Board::UpdateZombieSpawning bursts the music with 700 of the countdown left for the night tune and 400 for the
                // others; the client keeps the one for its tune.
                const countdown = waves.nextWaveAtTick - 1 - tick
                if (countdown === 700 || countdown === 400) emitServerEvent(world.resources.get(EventQueueResource), 'musicBurst', { countdown })
            }
            // Board::UpdateZombieSpawning: 5 ticks before a wave; a flag wave's as its huge wave countdown ends.
            if (tick >= waves.nextWaveAtTick - (nextIsFlag ? 1 : 5)) nextWaveComing(world, nextIsFlag)
            if (tick < waves.nextWaveAtTick) return

            const wave = waves.plan[waves.index]
            const zombieIds = wave.zombies.map(typeId => {
                const random = world.resources.get(RandomResource)
                const rows = level.definition.activeRows
                const row = rows.length === 1 ? rows[0] : pickWaveRow(world, waves)
                const entityId = spawnZombie(
                    world,
                    definitions,
                    typeId,
                    row,
                    pickZombieSpawnX(definitions.zombies[typeId], random, wave.flagWave),
                    zombieRowY(level.board, row),
                )
                emitServerEvent(world.resources.get(EventQueueResource), 'zombieSpawned', {
                    entityId,
                    typeId,
                    row,
                    wave: waves.index,
                })
                return entityId
            })
            waves.index++
            // Board::SpawnZombieWave: after the last wave every grave on the lawn opens, not only the level's own.
            if (waves.index === waves.plan.length && graves(world).length && level.definition.graveZombies?.length) waves.graveRiseAtTick = tick + 200
            waves.zombieIds = zombieIds
            const waveHealthStart = zombieIds.reduce((total, entity) => addWaveHealth(total, world.zombies.get(entity)!), 0)
            waves.healthToNextWave = (0.5 + world.resources.get(RandomResource).nextFloat() * 0.15) * waveHealthStart
            waves.nextWaveAtTick = tick + (waves.plan[waves.index]?.flagWave ? 4500
                : NEXT_WAVE_DELAY_TICKS + world.resources.get(RandomResource).integer(0, NEXT_WAVE_DELAY_RANGE_TICKS - 1))
            waves.hugeWaveAnnounced = false
            waves.accelerateAtTick = tick + EARLY_WAVE_CHECK_TICKS
        },
    }
}

// Smooth the two previous row picks and reduce pressure on a recently mowed row, as in the original.
function pickWaveRow(world: World, waves: WaveState): number {
    const states = waves.rowPicks!
    const weights = states.map(state => {
        const sinceMower = waves.index - (state.mowedAtWave ?? -100)
        return sinceMower <= 1 ? 0.01 : sinceMower <= 2 ? 0.5 : 1
    })
    const total = weights.reduce((sum, weight) => sum + weight, 0)
    const adjusted = states.map((state, index) => {
        const weight = weights[index] / total
        const expected = 1 / weight
        const factor = (1 + (state.lastPicked + 1 - expected) / expected * 2) * 0.75
            + (1 + (state.secondLastPicked + 1 - expected * 2) / (expected * 2) * 2) * 0.25
        return weight * Math.max(0.01, Math.min(100, factor))
    })
    let roll = world.resources.get(RandomResource).nextFloat() * adjusted.reduce((sum, weight) => sum + weight, 0)
    let picked = states[states.length - 1]
    for (let index = 0; index < states.length; index++) {
        roll -= adjusted[index]
        if (roll <= 0) { picked = states[index]; break }
    }
    for (const state of states) { state.lastPicked++; state.secondLastPicked++ }
    picked.secondLastPicked = picked.lastPicked
    picked.lastPicked = 0
    return picked.row
}
