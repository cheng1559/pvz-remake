import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { Schedule, World } from '@/ecs/index'
import { parseGameplayDefinitionsV2 } from '@/shared/content/gameplay'
import { DeterministicRng } from '@/server/DeterministicRng'
import { EventQueueResource, createEventQueue } from '@/server/events'
import {
    LevelStateResource,
    PlantComponent,
    PositionComponent,
    RandomResource,
    ZombieComponent,
    createZombieSystem,
    damageZombie,
    spawnZombie,
} from '@/server/gameplay'

const definitions = parseGameplayDefinitionsV2(JSON.parse(
    readFileSync('tools/content/pvz-base/gameplay/definitions.json', 'utf8'),
))
const board = definitions.boards['pvz:day']

function game() {
    const world = new World()
    world.resources.set(RandomResource, new DeterministicRng(1))
    world.resources.set(EventQueueResource, createEventQueue())
    world.resources.set(LevelStateResource, {
        id: 'pvz:test',
        definition: {
            adventureIndex: 1,
            board: 'pvz:day',
            activeRows: [2],
            startingSun: 0,
            seedPackets: ['pvz:peashooter'],
            lawnMower: 'pvz:standard',
            skySun: 'pvz:sun',
            waves: [{ zombies: ['pvz:normal'] }],
            tutorial: 'pvz:test',
            award: { kind: 'seed' as const, id: 'pvz:test', packetCost: 0 },
        },
        board,
        phase: 'gameplay',
        result: 'playing' as const,
        paused: false,
    })
    const schedule = new Schedule()
    schedule.add('zombie', createZombieSystem(definitions))
    let tick = 0
    return { world, run: () => schedule.run(world, ++tick) }
}

test('normal zombie uses grounded walking, loses limbs, bites, dies, and loses at the board edge', () => {
    const walking = game()
    const walker = spawnZombie(walking.world, definitions, 'pvz:normal', 2, 700, 280)
    walking.run()
    assert.equal(walking.world.get(walker, PositionComponent)!.x < 700, true)
    assert.equal(walking.world.get(walker, ZombieComponent)!.animationTime > 0, true)
    let previousX = walking.world.get(walker, PositionComponent)!.x
    for (let tick = 0; tick < 300; tick++) {
        walking.run()
        const x = walking.world.get(walker, PositionComponent)!.x
        assert.equal(previousX - x < 2, true)
        previousX = x
    }

    const eating = game()
    const plant = eating.world.createEntity()
    eating.world.add(plant, PositionComponent, { x: 40, y: 280, row: 2 })
    eating.world.add(plant, PlantComponent, {
        typeId: 'pvz:peashooter', seedId: 'pvz:peashooter', column: 0, health: 300, maxHealth: 300,
        eatenFlashCounter: 0,
    })
    const eater = spawnZombie(eating.world, definitions, 'pvz:normal', 2, 40, 280)
    for (let tick = 0; tick < 3; tick++) eating.run()
    assert.equal(eating.world.get(plant, PlantComponent)!.health, 300)
    eating.run()
    assert.equal(eating.world.get(eater, ZombieComponent)!.state, 'eating')
    assert.equal(eating.world.get(plant, PlantComponent)!.health, 296)
    for (let tick = 0; tick < 4; tick++) eating.run()
    assert.equal(eating.world.get(plant, PlantComponent)!.health, 292)
    for (let tick = 0; tick < 8; tick++) eating.run()
    assert.equal(eating.world.get(plant, PlantComponent)!.eatenFlashCounter, 25)
    assert.equal(
        eating.world.resources.get(EventQueueResource).events.some(event => event.type === 'zombieChewedPlant'),
        true,
    )
    eating.run()
    assert.equal(eating.world.get(plant, PlantComponent)!.eatenFlashCounter, 24)

    const headless = game()
    const ignoredPlant = headless.world.createEntity()
    headless.world.add(ignoredPlant, PositionComponent, { x: 40, y: 280, row: 2 })
    headless.world.add(ignoredPlant, PlantComponent, {
        typeId: 'pvz:peashooter', seedId: 'pvz:peashooter', column: 0, health: 300, maxHealth: 300,
        eatenFlashCounter: 0,
    })
    const headlessWalker = spawnZombie(headless.world, definitions, 'pvz:normal', 2, 40, 280)
    headless.run()
    assert.equal(headless.world.get(headlessWalker, ZombieComponent)!.state, 'eating')
    damageZombie(headless.world, headlessWalker, 200)
    headless.run()
    assert.equal(headless.world.get(headlessWalker, ZombieComponent)!.state, 'eating')
    assert.equal(headless.world.get(ignoredPlant, PlantComponent)!.health, 300)

    const neverStartedEating = spawnZombie(headless.world, definitions, 'pvz:normal', 2, 40, 280)
    damageZombie(headless.world, neverStartedEating, 200)
    headless.run()
    assert.equal(headless.world.get(neverStartedEating, ZombieComponent)!.state, 'walking')

    const dying = game()
    const corpse = spawnZombie(dying.world, definitions, 'pvz:normal', 2, 700, 280)
    damageZombie(dying.world, corpse, 100)
    assert.equal(dying.world.get(corpse, ZombieComponent)!.hitFlashCounter, 25)
    dying.run()
    assert.equal(dying.world.get(corpse, ZombieComponent)!.hitFlashCounter, 24)
    assert.equal(dying.world.get(corpse, ZombieComponent)!.hasArm, false)
    damageZombie(dying.world, corpse, 100)
    assert.equal(dying.world.get(corpse, ZombieComponent)!.hasHead, false)
    assert.deepEqual(
        dying.world.resources.get(EventQueueResource).events.map(event => event.data.part).filter(Boolean),
        ['arm', 'head'],
    )
    damageZombie(dying.world, corpse, 70)
    const deathTicks = dying.world.get(corpse, ZombieComponent)!.deathTicksRemaining
    assert.equal(dying.world.get(corpse, ZombieComponent)!.state, 'dying')
    assert.equal(
        dying.world.resources.get(EventQueueResource).events.some(event => event.type === 'zombieDying'),
        false,
    )
    for (let tick = 0; tick < deathTicks &&
        !dying.world.resources.get(EventQueueResource).events.some(event => event.type === 'zombieDying'); tick++) {
        dying.run()
    }
    assert.equal(dying.world.hasEntity(corpse), true)
    assert.equal(
        dying.world.resources.get(EventQueueResource).events.filter(event => event.type === 'zombieDying').length,
        1,
    )
    const elapsedDeathTicks = deathTicks - dying.world.get(corpse, ZombieComponent)!.deathTicksRemaining
    for (let tick = elapsedDeathTicks; tick < deathTicks - 1; tick++) dying.run()
    assert.equal(dying.world.hasEntity(corpse), true)
    dying.run()
    assert.equal(dying.world.hasEntity(corpse), false)

    const lost = game()
    spawnZombie(lost.world, definitions, 'pvz:normal', 2, -99.9, 280)
    lost.run()
    assert.equal(lost.world.resources.get(LevelStateResource).result, 'lost')
})

test('normal zombie starts eating at the legacy 20-pixel attack overlap boundary', () => {
    const outside = game()
    const outsidePlant = outside.world.createEntity()
    outside.world.add(outsidePlant, PositionComponent, { x: 40, y: 280, row: 2 })
    outside.world.add(outsidePlant, PlantComponent, {
        typeId: 'pvz:peashooter', seedId: 'pvz:peashooter', column: 0, health: 300, maxHealth: 300,
        eatenFlashCounter: 0,
    })
    const outsideZombie = spawnZombie(outside.world, definitions, 'pvz:normal', 2, 70.01, 280)
    outside.run()
    assert.equal(outside.world.get(outsideZombie, ZombieComponent)!.state, 'walking')

    const boundary = game()
    const boundaryPlant = boundary.world.createEntity()
    boundary.world.add(boundaryPlant, PositionComponent, { x: 40, y: 280, row: 2 })
    boundary.world.add(boundaryPlant, PlantComponent, {
        typeId: 'pvz:peashooter', seedId: 'pvz:peashooter', column: 0, health: 300, maxHealth: 300,
        eatenFlashCounter: 0,
    })
    const boundaryZombie = spawnZombie(boundary.world, definitions, 'pvz:normal', 2, 70, 280)
    boundary.run()
    assert.equal(boundary.world.get(boundaryZombie, ZombieComponent)!.state, 'eating')
})
