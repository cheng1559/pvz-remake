import { defineComponent, defineResource, type CommandBuffer, type GameSystem, type World } from '@/ecs/index'
import type { GameplayDefinitionsV2 } from '@/shared/content/gameplay'
import {
    EconomyStateResource,
    LevelStateResource,
    PlantComponent,
    type Position,
    PositionComponent,
    RandomResource,
    ZombieComponent,
    spawnZombie,
} from './gameplay'
import { EventQueueResource, emitServerEvent } from './events'

export interface Item {
    typeId: string
    value: number
    state: 'available' | 'collecting' | 'fading'
    velocityX: number
    velocityY: number
    accelerationY?: number
    width?: number
    groundY: number
    disappearTicks: number
    fadeTicks: number
    scale: number
    alpha: number
}

export interface TutorialState {
    firstAdventure: boolean
    step: 'pick-first-seed' | 'plant-first-seed' | 'first-plant-done' | 'collect-first-sun'
        | 'collect-more-sun' | 'enough-sun' | 'pick-second-seed' | 'plant-second-seed' | 'complete'
    sunAtTick?: number
    promptAtTick?: number
    cantAffordAdviceShown?: boolean
    seedRefreshAdviceShown?: boolean
}

export interface WaveState {
    index: number
    nextWaveAtTick?: number
    accelerateAtTick?: number
    zombieIds?: number[]
    healthToNextWave?: number
    finalWaveAnnounced?: boolean
}

export const ItemComponent = defineComponent<Item>('pvz:item')
export const TutorialResource = defineResource<TutorialState>('pvz:tutorial-state')
export const WaveResource = defineResource<WaveState>('pvz:wave-state')

// ponytail: exact 1-1 tutorial timings; move them into level data when another level reuses this flow.
const FIRST_SUN_DELAY_TICKS = 400
const FIRST_WAVE_DELAY_TICKS = 99
const SECOND_SEED_PROMPT_DELAY_TICKS = 400
const STATIC_SUN_Y = 60
const SKY_SUN_X_MIN = 100
const SKY_SUN_X_MAX = 649
const ZOMBIE_SPAWN_X = 780
const NEXT_WAVE_DELAY_TICKS = 2500
const NEXT_WAVE_DELAY_RANGE_TICKS = 600
const EARLY_WAVE_CHECK_TICKS = 400
const EARLY_WAVE_DELAY_TICKS = 200
const SUN_BANK_X = 15
const SUN_BANK_Y = 0
const BOARD_WIDTH = 800

export function initializeLevelOne(world: World, firstAdventure: boolean): void {
    world.resources.set(TutorialResource, {
        firstAdventure,
        step: firstAdventure ? 'pick-first-seed' : 'complete',
        ...(firstAdventure ? {} : {
            sunAtTick: world.resources.get(RandomResource).integer(425, 699),
        }),
    })
    world.resources.set(WaveResource, {
        index: 0,
        nextWaveAtTick: firstAdventure ? undefined : 1,
    })
}

export function noteLevelOnePlantPlaced(world: World, tick: number, upgraded = false): void {
    const tutorial = world.resources.get(TutorialResource)
    if (!tutorial.firstAdventure || tutorial.step === 'complete') return
    const plantCount = [...world.query(PlantComponent)].length + (upgraded ? 1 : 0)
    if (plantCount === 1) {
        tutorial.step = 'first-plant-done'
        tutorial.sunAtTick = tick + FIRST_SUN_DELAY_TICKS
    } else if (plantCount >= 2) {
        tutorial.step = 'complete'
        tutorial.promptAtTick = undefined
        world.resources.get(WaveResource).nextWaveAtTick = tick + FIRST_WAVE_DELAY_TICKS
    }
}

export function noteLevelOneSeedSelected(world: World): void {
    const tutorial = world.resources.get(TutorialResource)
    if (!tutorial.firstAdventure) return
    if (tutorial.step === 'pick-first-seed') tutorial.step = 'plant-first-seed'
    else if (tutorial.step === 'enough-sun' || tutorial.step === 'pick-second-seed') {
        tutorial.step = 'plant-second-seed'
        tutorial.promptAtTick = undefined
    }
}

export function noteLevelOneSeedCanceled(world: World, tick: number): void {
    const tutorial = world.resources.get(TutorialResource)
    if (!tutorial.firstAdventure) return
    if (tutorial.step === 'plant-first-seed') tutorial.step = 'pick-first-seed'
    else if (tutorial.step === 'plant-second-seed') {
        tutorial.step = 'enough-sun'
        tutorial.promptAtTick = tick + SECOND_SEED_PROMPT_DELAY_TICKS
    }
}

export function noteLevelOneSunCollected(world: World, tick: number, canAfford: boolean): void {
    const tutorial = world.resources.get(TutorialResource)
    if (!tutorial.firstAdventure) return
    if (tutorial.step === 'collect-first-sun') tutorial.step = 'collect-more-sun'
    if (tutorial.step === 'collect-more-sun' && canAfford) {
        tutorial.step = 'enough-sun'
        tutorial.promptAtTick = tick + SECOND_SEED_PROMPT_DELAY_TICKS
    }
}

export function createLevelOneTutorialSystem(definitions: GameplayDefinitionsV2): GameSystem {
    return {
        id: 'pvz:level-one-tutorial',
        run({ world, commands, tick }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result !== 'playing' || level.paused) return
            if ([...world.query(ItemComponent)].some(entity =>
                world.get(entity, ItemComponent)!.typeId === level.definition.award.id)) return

            const tutorial = world.resources.get(TutorialResource)
            const plantCount = [...world.query(PlantComponent)].length

            if (tutorial.firstAdventure && tutorial.step === 'pick-first-seed' && plantCount >= 1) {
                tutorial.step = 'first-plant-done'
                tutorial.sunAtTick = tick + FIRST_SUN_DELAY_TICKS
            }
            if (tutorial.sunAtTick !== undefined && tick >= tutorial.sunAtTick) {
                spawnSkySun(world, commands, definitions, level.definition.skySun)
                if (tutorial.step === 'first-plant-done') tutorial.step = 'collect-first-sun'
                // ponytail: 1-1 uses the base random interval; add escalating cadence when later day levels migrate.
                tutorial.sunAtTick = tick + world.resources.get(RandomResource).integer(425, 699)
            }
            if (tutorial.step === 'enough-sun' && tutorial.promptAtTick !== undefined &&
                tick >= tutorial.promptAtTick) {
                tutorial.step = 'pick-second-seed'
                tutorial.promptAtTick = undefined
            }
            if (tutorial.firstAdventure && tutorial.step !== 'complete' && plantCount >= 2) {
                tutorial.step = 'complete'
                tutorial.promptAtTick = undefined
                world.resources.get(WaveResource).nextWaveAtTick = tick + FIRST_WAVE_DELAY_TICKS
            }
        },
    }
}

export function createItemSystem(): GameSystem {
    return {
        id: 'pvz:items',
        run({ world, commands }) {
            const level = world.resources.get(LevelStateResource)
            if ((level.result !== 'playing' && level.result !== 'won') || level.paused) return
            for (const entity of world.query(PositionComponent, ItemComponent)) {
                const position = world.get(entity, PositionComponent)!
                const item = world.get(entity, ItemComponent)!
                if (item.typeId === level.definition.award.id) {
                    if (item.state === 'collecting') continue
                    if (position.y + item.velocityY < item.groundY) {
                        moveItemWithinHorizontalBounds(world, position, item)
                        position.y += item.velocityY
                        item.velocityY += 0.15
                    } else {
                        position.y = item.groundY
                        position.x = Math.round(position.x)
                    }
                    continue
                }
                if (item.state === 'collecting') {
                    const dx = Math.abs(position.x - SUN_BANK_X)
                    const dy = Math.abs(position.y - SUN_BANK_Y)
                    position.x += (SUN_BANK_X - position.x) / 21
                    position.y += (SUN_BANK_Y - position.y) / 21
                    const distance = Math.hypot(dx, dy)
                    if (distance < 8) {
                        const economy = world.resources.get(EconomyStateResource)
                        const spent = Math.min(economy.pendingSunSpend, item.value)
                        economy.pendingSunSpend -= spent
                        economy.sun += item.value - spent
                        commands.destroyEntity(entity)
                    } else {
                        item.scale = Math.min(item.scale, Math.max(0.5, Math.min(1, distance * 0.05)))
                    }
                    continue
                }
                if (item.state === 'fading') {
                    item.alpha = Math.max(0, Math.round(255 * (--item.fadeTicks / 50)))
                    if (item.fadeTicks <= 0) commands.destroyEntity(entity)
                    continue
                }
                if (position.y + item.velocityY < item.groundY) {
                    moveItemWithinHorizontalBounds(world, position, item)
                    position.y += item.velocityY
                    item.velocityY += item.accelerationY ?? 0
                    continue
                }
                position.y = item.groundY
                position.x = Math.round(position.x)
                if (++item.disappearTicks >= 750) {
                    item.state = 'fading'
                    item.fadeTicks = 50
                }
            }
        },
    }
}

export function createLevelOneZombieGroanSystem(): GameSystem {
    return {
        id: 'pvz:level-one-zombie-groans',
        run({ world }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result !== 'playing' || level.paused) return
            const zombies = [...world.query(ZombieComponent)]
            const awardDropped = [...world.query(ItemComponent)].some(entity =>
                world.get(entity, ItemComponent)!.typeId === level.definition.award.id)
            for (const entity of zombies) {
                const zombie = world.get(entity, ZombieComponent)!
                if (zombie.health <= 0 || zombie.state === 'dying' || zombie.state === 'mowered') continue
                zombie.groanCounter--
                if (zombie.groanCounter !== 0) continue
                const random = world.resources.get(RandomResource)
                if (random.integer(0, zombies.length - 1) !== 0 || !zombie.hasHead || awardDropped) continue
                emitServerEvent(world.resources.get(EventQueueResource), 'zombieGroaned', { entityId: entity })
                zombie.groanCounter = random.integer(500, 1499)
            }
        },
    }
}

export function createLevelOneWaveSystem(definitions: GameplayDefinitionsV2): GameSystem {
    return {
        id: 'pvz:level-one-waves',
        run({ world, tick }) {
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
                for (const zombieEntity of zombies) world.get(zombieEntity, ZombieComponent)!.health = 0
                return
            }
            if (waves.nextWaveAtTick === undefined) return
            const waveHealth = (waves.zombieIds ?? []).reduce((total, entity) => {
                const zombie = world.get(entity, ZombieComponent)
                return total + (zombie?.state === 'walking' || zombie?.state === 'eating' ? zombie.health : 0)
            }, 0)
            if (waves.accelerateAtTick !== undefined && tick >= waves.accelerateAtTick &&
                waveHealth <= (waves.healthToNextWave ?? 0)) {
                waves.nextWaveAtTick = Math.min(waves.nextWaveAtTick, tick + EARLY_WAVE_DELAY_TICKS)
                waves.accelerateAtTick = undefined
            }
            if (waves.index === level.definition.waves.length - 1 && !waves.finalWaveAnnounced &&
                tick >= waves.nextWaveAtTick - 5) {
                waves.finalWaveAnnounced = true
                emitServerEvent(world.resources.get(EventQueueResource), 'finalWave', {})
            }
            if (tick < waves.nextWaveAtTick) return

            const wave = level.definition.waves[waves.index]
            const zombieIds = wave.zombies.map((typeId, index) => {
                const row = level.definition.activeRows[index % level.definition.activeRows.length]
                const random = world.resources.get(RandomResource)
                const entityId = spawnZombie(
                    world,
                    definitions,
                    typeId,
                    row,
                    ZOMBIE_SPAWN_X + random.integer(0, 39),
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
            waves.nextWaveAtTick = tick + NEXT_WAVE_DELAY_TICKS +
                world.resources.get(RandomResource).integer(0, NEXT_WAVE_DELAY_RANGE_TICKS - 1)
            waves.accelerateAtTick = tick + EARLY_WAVE_CHECK_TICKS
        },
    }
}

function spawnSkySun(
    world: World,
    commands: CommandBuffer,
    definitions: GameplayDefinitionsV2,
    typeId: string,
): void {
    const definition = definitions.items[typeId]
    const entity = commands.createEntity()
    commands.add(entity, PositionComponent, {
        x: world.resources.get(RandomResource).integer(SKY_SUN_X_MIN, SKY_SUN_X_MAX),
        y: STATIC_SUN_Y,
        row: -1,
    })
    commands.add(entity, ItemComponent, {
        typeId,
        value: definition.value,
        state: 'available',
        velocityX: 0,
        velocityY: 0.67,
        width: definition.width,
        groundY: world.resources.get(RandomResource).integer(300, 549),
        disappearTicks: 0,
        fadeTicks: 0,
        scale: 1,
        alpha: 255,
    })
    emitServerEvent(world.resources.get(EventQueueResource), 'itemSpawned', {
        entityId: entity,
        typeId,
    })
}

function moveItemWithinHorizontalBounds(world: World, position: Position, item: Item): void {
    position.x += item.velocityX
    const maxX = BOARD_WIDTH - (item.width ?? 60)
    if (position.x > maxX) {
        position.x = maxX
        item.velocityX = -0.4 - world.resources.get(RandomResource).nextFloat() * 0.4
    } else if (position.x < 0) {
        position.x = 0
        item.velocityX = 0.4 + world.resources.get(RandomResource).nextFloat() * 0.4
    }
}
