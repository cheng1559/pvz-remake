import type { GameSystem, World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { LevelStateResource, RandomResource, type Zombie, ZombieComponent } from '../state/components'
import { pickZombieSpawnX, spawnZombie } from '../zombies/spawn'
import { WaveResource, type WaveState } from '../state/levelState'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { tryDropLevelAward } from './levelAward'
import { updateGraveSpawns } from './graves'

const NEXT_WAVE_DELAY_TICKS = 2500
const NEXT_WAVE_DELAY_RANGE_TICKS = 600
const EARLY_WAVE_CHECK_TICKS = 400
const EARLY_WAVE_DELAY_TICKS = 200
const SHIELD_HEALTH_SHARE = Math.fround(0.2)

/**
 * Board::TotalZombiesHealthInWave: body and helm count in full, a shield (newspaper, screen door) at 0.2f. The int
 * total adds each zombie's float sum, truncated.
 */
function addWaveHealth(definitions: GameplayDefinitions, total: number, zombie: Zombie): number {
    const shield = definitions.zombies[zombie.typeId].helm?.shield === true
    const health = shield ? Math.fround(zombie.health + Math.fround(zombie.helmHealth * SHIELD_HEALTH_SHARE)) : zombie.health + zombie.helmHealth
    return Math.trunc(Math.fround(total + health))
}

export function createWaveSystem(definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:waves',
        run({ world, tick, commands }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result !== 'playing' || level.paused) return

            const waves = world.resources.get(WaveResource)
            updateGraveSpawns(world, definitions, tick)
            if (waves.index >= waves.plan.length) {
                tryDropLevelAward(world, definitions, commands)
                return
            }
            if (waves.nextWaveAtTick === undefined) return
            const nextIsFlag = waves.plan[waves.index].flagWave === true
            const waveHealth = (waves.zombieIds ?? []).reduce((total, entity) => {
                const zombie = world.get(entity, ZombieComponent)
                return zombie?.state === 'walking' || zombie?.state === 'eating' || zombie?.state === 'vaulting' ? addWaveHealth(definitions, total, zombie) : total
            }, 0)
            // Board::UpdateZombieSpawning returns during the huge wave countdown, so it cannot be shortened.
            if (!waves.hugeWaveAnnounced && waves.accelerateAtTick !== undefined && tick >= waves.accelerateAtTick &&
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
            if (waves.index === waves.plan.length - 1 && !waves.finalWaveAnnounced &&
                tick >= waves.nextWaveAtTick - (nextIsFlag ? 1 : 5)) {
                waves.finalWaveAnnounced = true
                emitServerEvent(world.resources.get(EventQueueResource), 'finalWave', {})
            }
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
            // Board::SpawnZombieWave: after the last wave every grave on the lawn opens, not only the level's own.
            if (waves.index === waves.plan.length && waves.graves?.length && level.definition.graveZombies?.length) waves.graveRiseAtTick = tick + 200
            waves.zombieIds = zombieIds
            const waveHealthStart = zombieIds.reduce((total, entity) => addWaveHealth(definitions, total, world.get(entity, ZombieComponent)!), 0)
            waves.healthToNextWave = (0.5 + world.resources.get(RandomResource).nextFloat() * 0.15) * waveHealthStart
            waves.nextWaveAtTick = tick + (waves.plan[waves.index]?.flagWave ? 4500
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
