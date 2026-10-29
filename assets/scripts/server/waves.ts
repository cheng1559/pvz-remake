import type { GameSystem, World } from '@/ecs/index'
import type { GameplayDefinitions, LevelDefinition } from '@/shared/content/gameplay'
import type { DeterministicRng } from './DeterministicRng'
import { LevelStateResource, RandomResource, ZombieComponent } from './components'
import { pickZombieSpawnX, spawnZombie } from './zombies/spawn'
import { WaveResource, type WaveState } from './levelState'
import { EventQueueResource, emitServerEvent } from './events'
import { tryDropLevelAward } from './levelAward'
import { updateGraveSpawns } from './graves'

const NEXT_WAVE_DELAY_TICKS = 2500
const NEXT_WAVE_DELAY_RANGE_TICKS = 600
const EARLY_WAVE_CHECK_TICKS = 400
const EARLY_WAVE_DELAY_TICKS = 200

/** Board::PickZombieWaves: reserve fixed spawns, then spend remaining points by weight. */
export function planWaves(level: LevelDefinition, random: DeterministicRng): string[][] {
    return level.waves.map((wave, index) => {
        const zombies = [...wave.zombies]
        if (wave.points === undefined) return zombies
        const pool = level.zombiePool!
        let remaining = wave.points - zombies.reduce((sum, id) => sum + pool.find(entry => entry.id === id)!.points, 0)
        while (remaining > 0) {
            const choices = pool.filter(entry => entry.weight > 0 && entry.points <= remaining && index + 1 >= (entry.firstWave ?? 1))
            let roll = random.integer(0, choices.reduce((sum, entry) => sum + entry.weight, 0) - 1)
            const picked = choices.find(entry => (roll -= entry.weight) < 0)!
            zombies.push(picked.id)
            remaining -= picked.points
        }
        return zombies
    })
}

export function createWaveSystem(definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:waves',
        run({ world, tick, commands }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result !== 'playing' || level.paused) return

            const waves = world.resources.get(WaveResource)
            updateGraveSpawns(world, definitions, tick)
            if (waves.index >= level.definition.waves.length) {
                tryDropLevelAward(world, definitions, commands)
                return
            }
            if (waves.nextWaveAtTick === undefined) return
            const nextIsFlag = level.definition.waves[waves.index].flagWave === true
            const waveHealth = (waves.zombieIds ?? []).reduce((total, entity) => {
                const zombie = world.get(entity, ZombieComponent)
                return total + (zombie?.state === 'walking' || zombie?.state === 'eating' || zombie?.state === 'vaulting'
                    ? zombie.health + zombie.helmHealth : 0)
            }, 0)
            if (waves.accelerateAtTick !== undefined && tick >= waves.accelerateAtTick &&
                (!nextIsFlag && waveHealth <= (waves.healthToNextWave ?? 0) || waveHealth <= 0)) {
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
                if (tick === waves.nextWaveAtTick - 401) emitServerEvent(world.resources.get(EventQueueResource), 'musicBurst', {})
            }
            if (waves.index === level.definition.waves.length - 1 && !waves.finalWaveAnnounced &&
                tick >= waves.nextWaveAtTick - (nextIsFlag ? 1 : 5)) {
                waves.finalWaveAnnounced = true
                emitServerEvent(world.resources.get(EventQueueResource), 'finalWave', {})
            }
            if (tick < waves.nextWaveAtTick) return

            const wave = level.definition.waves[waves.index]
            const zombieIds = (waves.zombiesByWave?.[waves.index] ?? wave.zombies).map(typeId => {
                const random = world.resources.get(RandomResource)
                const rows = level.definition.activeRows
                const row = rows.length === 1 ? rows[0] : pickWaveRow(world, waves)
                const entityId = spawnZombie(
                    world,
                    definitions,
                    typeId,
                    row,
                    pickZombieSpawnX(definitions.zombies[typeId], random, wave.flagWave),
                    level.board.origin.y + row * level.board.cell.height - 30,
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
            if (waves.index === level.definition.waves.length && waves.graves?.length && level.definition.graveZombies?.length) waves.graveRiseAtTick = tick + 200
            waves.zombieIds = zombieIds
            const waveHealthStart = zombieIds.reduce(
                (total, entity) => total + world.get(entity, ZombieComponent)!.health + world.get(entity, ZombieComponent)!.helmHealth,
                0,
            )
            waves.healthToNextWave = (0.5 + world.resources.get(RandomResource).nextFloat() * 0.15) * waveHealthStart
            waves.nextWaveAtTick = tick + (level.definition.waves[waves.index]?.flagWave ? 4500
                : NEXT_WAVE_DELAY_TICKS + world.resources.get(RandomResource).integer(0, NEXT_WAVE_DELAY_RANGE_TICKS - 1))
            waves.hugeWaveAnnounced = undefined
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
