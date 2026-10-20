import type { GameSystem, World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { LevelStateResource, PositionComponent, RandomResource, ZombieComponent, spawnZombie } from './gameplay'
import { ItemComponent, WaveResource, type WaveState } from './levelState'
import { EventQueueResource, emitServerEvent } from './events'

const ZOMBIE_SPAWN_X = 780
const NEXT_WAVE_DELAY_TICKS = 2500
const NEXT_WAVE_DELAY_RANGE_TICKS = 600
const EARLY_WAVE_CHECK_TICKS = 400
const EARLY_WAVE_DELAY_TICKS = 200

export function createWaveSystem(definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:waves',
        run({ world, tick, commands }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result !== 'playing' || level.paused) return

            const waves = world.resources.get(WaveResource)
            if (waves.index >= level.definition.waves.length) {
                if ([...world.query(ItemComponent)].some(entity =>
                    world.get(entity, ItemComponent)!.typeId === level.definition.award.id)) return
                const zombies = [...world.query(PositionComponent, ZombieComponent)]
                if (zombies.some(entity => {
                    const zombie = world.get(entity, ZombieComponent)!
                    return zombie.hasHead && zombie.state !== 'dying' && zombie.state !== 'mowered'
                })) return
                const source = zombies.sort((left, right) =>
                    world.get(right, PositionComponent)!.x - world.get(left, PositionComponent)!.x)[0]
                const random = world.resources.get(RandomResource)
                const sourcePosition = source === undefined ? undefined : world.get(source, PositionComponent)!
                const sourceZombie = source === undefined ? undefined : world.get(source, ZombieComponent)!
                const body = sourceZombie ? definitions.zombies[sourceZombie.typeId].body : undefined
                const x = sourcePosition && body ? sourcePosition.x + body.x + body.width / 2 : 400
                const y = sourcePosition && body ? sourcePosition.y + body.y + body.height / 2 : 280
                const entity = world.createEntity()
                world.add(entity, PositionComponent, { x, y, row: -1 })
                world.add(entity, ItemComponent, {
                    typeId: level.definition.award.id,
                    value: 1,
                    state: 'available',
                    velocityX: -0.5 + random.nextFloat(),
                    velocityY: -3 - random.nextFloat() * 2,
                    width: 50,
                    groundY: Math.max(80, Math.min(521, y + 45 + random.integer(0, 19))),
                    disappearTicks: 0,
                    fadeTicks: 0,
                    scale: 1,
                    alpha: 255,
                })
                emitServerEvent(world.resources.get(EventQueueResource), 'levelAwardDropped', {
                    entityId: entity,
                    typeId: level.definition.award.id,
                })
                for (const zombieEntity of zombies) {
                    const zombie = world.get(zombieEntity, ZombieComponent)!
                    if (zombie.state !== 'dying' && zombie.state !== 'mowered') commands.destroyEntity(zombieEntity)
                }
                return
            }
            if (waves.nextWaveAtTick === undefined) return
            const nextIsFlag = level.definition.waves[waves.index].flagWave === true
            const waveHealth = (waves.zombieIds ?? []).reduce((total, entity) => {
                const zombie = world.get(entity, ZombieComponent)
                return total + (zombie?.state === 'walking' || zombie?.state === 'eating' ? zombie.health : 0)
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
            const zombieIds = wave.zombies.map(typeId => {
                const random = world.resources.get(RandomResource)
                const rows = level.definition.activeRows
                const row = rows.length === 1 ? rows[0] : pickWaveRow(world, waves)
                const entityId = spawnZombie(
                    world,
                    definitions,
                    typeId,
                    row,
                    ZOMBIE_SPAWN_X + random.integer(0, 39) + (wave.flagWave ? 40 : 0),
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
            waves.zombieIds = zombieIds
            const waveHealthStart = zombieIds.reduce(
                (total, entity) => total + world.get(entity, ZombieComponent)!.health,
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
