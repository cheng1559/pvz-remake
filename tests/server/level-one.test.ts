import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { Schedule, World } from '@/ecs/index'
import { DeterministicRng } from '@/server/DeterministicRng'
import { EventQueueResource, createEventQueue } from '@/server/events'
import {
    LevelStateResource,
    PlantComponent,
    PositionComponent,
    RandomResource,
    ZombieComponent,
    createZombieSystem,
    spawnZombie,
} from '@/server/gameplay'
import {
    ItemComponent,
    TutorialResource,
    WaveResource,
    createLevelOneTutorialSystem,
    createLevelOneWaveSystem,
    createLevelOneZombieGroanSystem,
    createItemSystem,
    initializeLevelOne,
} from '@/server/levelOne'
import { parseGameplayDefinitionsV2, parseGameplayLevelsV2 } from '@/shared/content/gameplay'

const source = (name: string): unknown => JSON.parse(
    readFileSync(`tools/content/pvz-base/gameplay/${name}.json`, 'utf8'),
)
const definitions = parseGameplayDefinitionsV2(source('definitions'))
const levels = parseGameplayLevelsV2(source('levels'), definitions)

function setup() {
    const world = new World()
    const definition = levels.levels['pvz:adventure-1-1']
    world.resources.set(LevelStateResource, {
        id: 'pvz:adventure-1-1',
        definition,
        board: definitions.boards[definition.board],
        phase: 'gameplay',
        result: 'playing',
        paused: false,
    })
    world.resources.set(RandomResource, new DeterministicRng(1))
    world.resources.set(EventQueueResource, createEventQueue())
    initializeLevelOne(world, true)
    const schedule = new Schedule()
    schedule.add('tutorial', createLevelOneTutorialSystem(definitions))
    schedule.add('spawn', createLevelOneWaveSystem(definitions))
    return { world, schedule }
}

function addPlant(world: World, column: number) {
    const entity = world.createEntity()
    world.add(entity, PositionComponent, { x: 40 + column * 80, y: 280, row: 2 })
    world.add(entity, PlantComponent, {
        typeId: 'pvz:peashooter',
        seedId: 'pvz:peashooter',
        column,
        health: 300,
        maxHealth: 300,
        eatenFlashCounter: 0,
    })
}

test('level one schedules tutorial sun and the first wave from planted Peashooters', () => {
    const { world, schedule } = setup()
    addPlant(world, 0)
    schedule.run(world, 1)

    schedule.run(world, 400)
    assert.equal([...world.query(ItemComponent)].length, 0)
    schedule.run(world, 401)
    assert.equal([...world.query(ItemComponent)].length, 1)
    assert.equal(world.resources.get(TutorialResource).step, 'collect-first-sun')

    addPlant(world, 1)
    schedule.run(world, 402)
    assert.equal(world.resources.get(WaveResource).nextWaveAtTick, 501)
    schedule.run(world, 500)
    assert.equal([...world.query(ZombieComponent)].length, 0)
    schedule.run(world, 501)
    assert.equal([...world.query(ZombieComponent)].length, 1)
})

test('level one uses the original countdown and early-wave cadence', () => {
    const { world, schedule } = setup()
    addPlant(world, 0)
    addPlant(world, 1)
    schedule.run(world, 1)

    for (let tick = 2; tick <= 201; tick++) schedule.run(world, tick)
    assert.equal(world.resources.get(WaveResource).index, 1)

    const firstZombie = [...world.query(ZombieComponent)][0]
    world.get(firstZombie, ZombieComponent)!.health = 1
    schedule.run(world, 601)
    schedule.run(world, 800)
    assert.equal(world.resources.get(WaveResource).index, 1)
    schedule.run(world, 801)
    assert.equal([...world.query(ZombieComponent)].length, 2)

    for (const tick of [1201, 1401, 1801]) {
        for (const entity of [...world.query(ZombieComponent)]) world.destroyEntity(entity)
        schedule.run(world, tick)
    }

    const events = world.resources.get(EventQueueResource).events
    events.splice(0)
    schedule.run(world, 1996)
    assert.equal(events.filter(event => event.type === 'finalWave').length, 1)
    schedule.run(world, 2001)
    assert.equal(world.resources.get(WaveResource).index, 4)
    for (const entity of [...world.query(ZombieComponent)]) world.destroyEntity(entity)
    schedule.run(world, 2002)
    assert.equal(world.resources.get(LevelStateResource).result, 'playing')
    assert.equal(
        [...world.query(ItemComponent)].some(entity =>
            world.get(entity, ItemComponent)!.typeId === levels.levels['pvz:adventure-1-1'].award.id),
        true,
    )
})

test('level one drops its award from the last effective zombie before its corpse disappears', () => {
    const { world } = setup()
    world.resources.get(WaveResource).index = levels.levels['pvz:adventure-1-1'].waves.length
    const zombieId = spawnZombie(world, definitions, 'pvz:normal', 2, 700, 250)
    world.get(zombieId, ZombieComponent)!.health = 0
    const schedule = new Schedule()
    schedule.add('spawn', createLevelOneWaveSystem(definitions))
    schedule.add('zombie', createZombieSystem(definitions))
    schedule.add('cleanup', createItemSystem())

    schedule.run(world, 1)
    assert.equal([...world.query(ItemComponent)].length, 0)
    schedule.run(world, 2)
    const awardId = [...world.query(ItemComponent)][0]
    const awardPosition = world.get(awardId, PositionComponent)!
    const award = world.get(awardId, ItemComponent)!
    assert.equal(world.hasEntity(zombieId), true)
    assert.equal(awardPosition.x, 750)
    assert.ok(awardPosition.y >= 302.5 && awardPosition.y < 304.5)
    assert.equal(award.width, 50)
    assert.ok(award.velocityX >= -0.8 && award.velocityX <= -0.4)
    assert.ok(award.velocityY >= -4.85 && award.velocityY < -2.85)
    assert.ok(award.groundY >= 352.5 && award.groundY <= 371.5)
    assert.equal(world.resources.get(LevelStateResource).result, 'playing')
})

test('falling sun and money stay fully inside the board and bounce at both edges', () => {
    const { world } = setup()
    const right = world.createEntity()
    world.add(right, PositionComponent, { x: 790, y: 100, row: -1 })
    world.add(right, ItemComponent, {
        typeId: 'pvz:sun', value: 25, state: 'available', velocityX: 1, velocityY: 1,
        width: 60, groundY: 200, disappearTicks: 0, fadeTicks: 0, scale: 1, alpha: 255,
    })
    const left = world.createEntity()
    world.add(left, PositionComponent, { x: -10, y: 100, row: -1 })
    world.add(left, ItemComponent, {
        typeId: 'pvz:coin', value: 10, state: 'available', velocityX: -1, velocityY: 1,
        width: 60, groundY: 200, disappearTicks: 0, fadeTicks: 0, scale: 1, alpha: 255,
    })

    const schedule = new Schedule()
    schedule.add('cleanup', createItemSystem())
    schedule.run(world, 1)

    assert.equal(world.get(right, PositionComponent)!.x, 740)
    assert.ok(world.get(right, ItemComponent)!.velocityX < 0)
    assert.equal(world.get(left, PositionComponent)!.x, 0)
    assert.ok(world.get(left, ItemComponent)!.velocityX > 0)
})

test('level one zombie groans use reference countdown, gating, and award rules', () => {
    const { world } = setup()
    const zombieId = spawnZombie(world, definitions, 'pvz:normal', 2, 700, 250)
    const zombie = world.get(zombieId, ZombieComponent)!
    const initialCounter = zombie.groanCounter
    assert.ok(initialCounter >= 300 && initialCounter <= 400)
    const schedule = new Schedule()
    schedule.add('zombie', createLevelOneZombieGroanSystem())

    for (let tick = 1; tick <= initialCounter; tick++) schedule.run(world, tick)

    const events = world.resources.get(EventQueueResource).events
    assert.deepEqual(events.map(event => [event.type, event.data.entityId]), [['zombieGroaned', zombieId]])
    assert.ok(zombie.groanCounter >= 500 && zombie.groanCounter <= 1499)

    events.splice(0)
    zombie.groanCounter = 1
    const awardId = world.createEntity()
    world.add(awardId, PositionComponent, { x: 400, y: 300, row: -1 })
    world.add(awardId, ItemComponent, {
        typeId: levels.levels['pvz:adventure-1-1'].award.id,
        value: 1,
        state: 'available',
        velocityX: 0,
        velocityY: 0,
        groundY: 300,
        disappearTicks: 0,
        fadeTicks: 0,
        scale: 1,
        alpha: 255,
    })
    schedule.run(world, initialCounter + 1)
    assert.equal(zombie.groanCounter, 0)
    assert.deepEqual(events, [])

    world.destroyEntity(awardId)
    const secondId = spawnZombie(world, definitions, 'pvz:normal', 2, 720, 250)
    const second = world.get(secondId, ZombieComponent)!
    zombie.groanCounter = 1
    second.groanCounter = 1
    const ranges: Array<[number, number]> = []
    world.resources.set(RandomResource, {
        integer(min: number, max: number) {
            ranges.push([min, max])
            return max
        },
    } as unknown as DeterministicRng)
    schedule.run(world, initialCounter + 2)
    assert.deepEqual(ranges, [[0, 1], [0, 1]])
    assert.equal(zombie.groanCounter, 0)
    assert.equal(second.groanCounter, 0)
    assert.deepEqual(events, [])
})
