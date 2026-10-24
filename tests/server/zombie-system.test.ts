import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { Schedule, World } from '@/ecs/index'
import { parseGameplayDefinitions } from '@/shared/content/gameplay'
import { DeterministicRng } from '@/server/DeterministicRng'
import { EventQueueResource, createEventQueue } from '@/server/events'
import {
    LevelStateResource,
    PlantComponent,
    PositionComponent,
    RandomResource,
    ZombieComponent,
} from '@/server/components'
import { createZombieSystem } from '@/server/zombies/system'
import { damageZombie } from '@/server/zombies/damage'
import { spawnZombie } from '@/server/zombies/spawn'

const definitions = parseGameplayDefinitions(JSON.parse(
    readFileSync('tools/content/pvz-base/gameplay/definitions.json', 'utf8'),
))
const board = definitions.boards['pvz:day']

function game(content = definitions) {
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
    schedule.add('zombie', createZombieSystem(content))
    let tick = 0
    return { world, run: () => schedule.run(world, ++tick) }
}

test('tongue variants use one of five spawn outcomes and never reroll during updates', () => {
    for (const typeId of ['pvz:normal', 'pvz:flag']) for (let roll = 0; roll < 5; roll++) {
        const { world, run } = game()
        const random = world.resources.get(RandomResource)
        const nextFloat = random.nextFloat.bind(random)
        let rolls = 0
        random.nextFloat = () => rolls++ === 0 ? roll / 5 : nextFloat()
        const id = spawnZombie(world, definitions, typeId, 2, 700, 280)
        assert.equal(world.get(id, ZombieComponent)!.hasTongue, roll === 0)
        const spawnRolls = rolls
        for (let tick = 0; tick < 10; tick++) run()
        assert.equal(world.get(id, ZombieComponent)!.hasTongue, roll === 0)
        assert.equal(rolls, spawnRolls)
    }
})

test('zombies sharing a gait can configure tongue and walking variants independently', () => {
    const content = structuredClone(definitions)
    content.zombies['test:walker'] = { ...content.zombies['pvz:normal'], tongueChance: 1, walk2Chance: 1 }
    content.zombies['test:plain'] = { ...content.zombies['pvz:normal'], tongueChance: 0, walk2Chance: 0 }
    const { world } = game(content)
    const variant = spawnZombie(world, content, 'test:walker', 2, 700, 280)
    const plain = spawnZombie(world, content, 'test:plain', 2, 700, 280)
    assert.equal(world.get(variant, ZombieComponent)!.hasTongue, true)
    assert.equal(world.get(variant, ZombieComponent)!.walkAnimation, 'anim_walk2')
    assert.equal(world.get(plain, ZombieComponent)!.hasTongue, false)
    assert.equal(world.get(plain, ZombieComponent)!.walkAnimation, 'anim_walk')
})

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
        eatenFlashCounter: 0, recentlyEatenCounter: 0,
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
    const eatEvents = eating.world.resources.get(EventQueueResource).events
    assert.equal(eatEvents.filter(event => event.type === 'plantEaten').length, 0)
    eating.world.get(plant, PlantComponent)!.health = definitions.zombies['pvz:normal'].bite.damage
    const otherEater = spawnZombie(eating.world, definitions, 'pvz:normal', 2, 40, 280)
    for (const zombie of [eater, otherEater]) {
        eating.world.get(zombie, ZombieComponent)!.biteTicks = definitions.zombies['pvz:normal'].bite.cadenceTicks - 1
    }
    eating.run()
    assert.equal([...eating.world.query(PlantComponent)].length, 0)
    assert.equal(eatEvents.filter(event => event.type === 'plantEaten').length, 1, 'simultaneous bites emit one eaten event')
    assert.equal(eatEvents.find(event => event.type === 'plantEaten')!.data.plantId, plant)
    eating.run()
    assert.equal(eatEvents.filter(event => event.type === 'plantEaten').length, 1)

    const headless = game()
    const ignoredPlant = headless.world.createEntity()
    headless.world.add(ignoredPlant, PositionComponent, { x: 40, y: 280, row: 2 })
    headless.world.add(ignoredPlant, PlantComponent, {
        typeId: 'pvz:peashooter', seedId: 'pvz:peashooter', column: 0, health: 300, maxHealth: 300,
        eatenFlashCounter: 0, recentlyEatenCounter: 0,
    })
    const headlessWalker = spawnZombie(headless.world, definitions, 'pvz:normal', 2, 40, 280)
    headless.run()
    assert.equal(headless.world.get(headlessWalker, ZombieComponent)!.state, 'eating')
    damageZombie(headless.world, definitions, headlessWalker, 200)
    headless.run()
    assert.equal(headless.world.get(headlessWalker, ZombieComponent)!.state, 'eating')
    assert.equal(headless.world.get(ignoredPlant, PlantComponent)!.health, 300)

    const neverStartedEating = spawnZombie(headless.world, definitions, 'pvz:normal', 2, 40, 280)
    damageZombie(headless.world, definitions, neverStartedEating, 200)
    headless.run()
    assert.equal(headless.world.get(neverStartedEating, ZombieComponent)!.state, 'walking')

    const dying = game()
    const corpse = spawnZombie(dying.world, definitions, 'pvz:normal', 2, 700, 280)
    damageZombie(dying.world, definitions, corpse, 100)
    assert.equal(dying.world.get(corpse, ZombieComponent)!.hitFlashCounter, 25)
    dying.run()
    assert.equal(dying.world.get(corpse, ZombieComponent)!.hitFlashCounter, 24)
    assert.equal(dying.world.get(corpse, ZombieComponent)!.hasArm, false)
    damageZombie(dying.world, definitions, corpse, 100)
    assert.equal(dying.world.get(corpse, ZombieComponent)!.hasHead, false)
    assert.deepEqual(
        dying.world.resources.get(EventQueueResource).events.map(event => event.data.part).filter(Boolean),
        ['arm', 'head'],
    )
    damageZombie(dying.world, definitions, corpse, 70)
    const deathTicks = dying.world.get(corpse, ZombieComponent)!.deathTicksRemaining
    const dyingZombie = dying.world.get(corpse, ZombieComponent)!
    const deathFrames = dyingZombie.animation === 'anim_death2' ? 32 : 38
    assert.equal(deathTicks, Math.ceil((deathFrames + 1) / (dyingZombie.animationSpeed * 12) * 100) + 100)
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

test('only headed zombies lose at their board edge, while headless zombies die 70px earlier without flashing', () => {
    for (const [typeId, edge] of [['pvz:normal', -100], ['pvz:pole_vaulter', -150], ['pvz:normal', -220]] as const) {
        const content = { ...definitions, zombies: { ...definitions.zombies,
            [typeId]: { ...definitions.zombies[typeId], boardEdgeX: edge } } }
        const headed = game(content)
        const attacker = spawnZombie(headed.world, content, typeId, 2, edge + 10, 280)
        headed.run()
        assert.equal(headed.world.resources.get(LevelStateResource).result, 'playing')
        headed.world.get(attacker, PositionComponent)!.x = edge
        headed.run()
        assert.equal(headed.world.resources.get(LevelStateResource).result, 'lost')

        const headless = game(content)
        const walker = spawnZombie(headless.world, content, typeId, 2, edge + 71, 280)
        damageZombie(headless.world, content, walker, content.zombies[typeId].maxHealth * 0.8)
        const zombie = headless.world.get(walker, ZombieComponent)!
        assert.equal(zombie.hasHead, false)
        zombie.hitFlashCounter = 0
        headless.run()
        assert.equal(zombie.state, 'walking')
        headless.world.get(walker, PositionComponent)!.x = edge + 70
        headless.run()
        assert.equal(zombie.health, 0)
        assert.equal(zombie.state, 'dying')
        assert.equal(zombie.hitFlashCounter, 0)
        assert.equal(headless.world.resources.get(LevelStateResource).result, 'playing')
        assert.equal(headless.world.resources.get(EventQueueResource).events.some(event => event.type === 'levelLost'), false)
    }
})

test('normal zombie starts eating at the legacy 20-pixel attack overlap boundary', () => {
    const outside = game()
    const outsidePlant = outside.world.createEntity()
    outside.world.add(outsidePlant, PositionComponent, { x: 40, y: 280, row: 2 })
    outside.world.add(outsidePlant, PlantComponent, {
        typeId: 'pvz:peashooter', seedId: 'pvz:peashooter', column: 0, health: 300, maxHealth: 300,
        eatenFlashCounter: 0, recentlyEatenCounter: 0,
    })
    const outsideZombie = spawnZombie(outside.world, definitions, 'pvz:normal', 2, 70.01, 280)
    outside.run()
    assert.equal(outside.world.get(outsideZombie, ZombieComponent)!.state, 'walking')

    const boundary = game()
    const boundaryPlant = boundary.world.createEntity()
    boundary.world.add(boundaryPlant, PositionComponent, { x: 40, y: 280, row: 2 })
    boundary.world.add(boundaryPlant, PlantComponent, {
        typeId: 'pvz:peashooter', seedId: 'pvz:peashooter', column: 0, health: 300, maxHealth: 300,
        eatenFlashCounter: 0, recentlyEatenCounter: 0,
    })
    const boundaryZombie = spawnZombie(boundary.world, definitions, 'pvz:normal', 2, 70, 280)
    boundary.run()
    assert.equal(boundary.world.get(boundaryZombie, ZombieComponent)!.state, 'eating')
})
