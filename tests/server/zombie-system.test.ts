import assert from 'node:assert/strict'
import test from 'node:test'
import { readGameplaySource } from '../../tools/mod/content'

import { Schedule,World } from '@/ecs/index'
import {
LevelStateResource,
PlantComponent,
PositionComponent,
RandomResource,
ZombieComponent,
} from '@/server/state/components'
import { DeterministicRng } from '@/server/state/DeterministicRng'
import { EventQueueResource,createEventQueue } from '@/server/state/events'
import { damageZombie } from '@/server/zombies/damage'
import { spawnZombie } from '@/server/zombies/spawn'
import { createZombieSystem } from '@/server/zombies/system'
import { parseGameplayDefinitions } from '@/shared/content/gameplay'

const definitions = parseGameplayDefinitions(readGameplaySource('definitions'))
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
            lawnMower: 'pvz:lawnmower',
            skySun: 'pvz:sun',
            waves: [{ zombies: ['pvz:normal'] }],
            award: { kind: 'seed' as const, id: 'pvz:test' },
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




test('normal zombie uses grounded walking, loses limbs, bites, dies, and loses at the board edge', () => {
    const walking = game()
    const walker = spawnZombie(walking.world, definitions, 'pvz:normal', 2, 700, 280)
    walking.run()
    // Zombie::UpdateZombieWalking: a tick takes it as far as the ground goes between the frames its clip is at, at the
    // clip's rate, which is its speed's (Zombie::UpdateAnimSpeed).
    const body = walking.world.get(walker, ZombieComponent)!.animations.body, walk = definitions.zombies['pvz:normal'].animation.clips[body.clip]
    const speed = walking.world.get(walker, ZombieComponent)!.speedPerTick
    assert.ok(Math.abs(body.rate - speed * walk.frames / (walk.ground!.at(-1)! - walk.ground![0]) * 47) < 1e-9)
    assert.ok(Math.abs(700 - walking.world.get(walker, PositionComponent)!.x - (walk.ground![1] - walk.ground![0]) * body.rate / 100) < 1e-9)
    assert.ok(Math.abs(body.time - body.rate / 100) < 1e-12)
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
        recentlyEatenCounter: 0,
        chilledTicks: 0,
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
    assert.equal(
        eating.world.resources.get(EventQueueResource).events.some(event => event.type === 'zombieChewedPlant'),
        true,
        'the client flashes the chewed plant',
    )
    eating.run()
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
        recentlyEatenCounter: 0,
        chilledTicks: 0,
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
    assert.ok(dying.world.resources.get(EventQueueResource).events.some(event => event.type === 'zombieHit' && event.data.entityId === corpse),
        'the client flashes the hit zombie')
    dying.run()
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
    const death = dyingZombie.animations.body
    assert.equal(deathTicks, Math.ceil((death.clip === 'death2' ? 33 : 39) / death.rate * 100) + 100)
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




test('zombie target cache follows component replacement, mutation and removal', () => {
    const { world, run } = game()
    const plant = world.createEntity()
    world.add(plant, PositionComponent, { x: 40, y: 280, row: 2 })
    world.add(plant, PlantComponent, {
        typeId: 'pvz:peashooter', seedId: 'pvz:peashooter', column: 0, health: 300, maxHealth: 300,
        recentlyEatenCounter: 0,
        chilledTicks: 0,
    })
    const zombie = spawnZombie(world, definitions, 'pvz:normal', 2, 70, 280)
    const state = () => world.get(zombie, ZombieComponent)!.state
    const resetPosition = () => { world.get(zombie, PositionComponent)!.x = 70 }
    run()
    assert.equal(state(), 'eating')
    world.add(plant, PositionComponent, { x: 400, y: 280, row: 2 })
    resetPosition(); run()
    assert.equal(state(), 'walking', 'replacing a position invalidates the cache')
    world.get(plant, PositionComponent)!.x = 40
    resetPosition(); run()
    assert.equal(state(), 'eating', 'mutating a position is visible through the cached reference')
    world.add(plant, PlantComponent, { ...world.get(plant, PlantComponent)!, health: 0 })
    resetPosition(); run()
    assert.equal(state(), 'walking', 'replacing the plant component invalidates the cache')
    world.remove(plant, PlantComponent)
    resetPosition(); run()
    assert.equal(state(), 'walking')
})

test('a chilled zombie body goes at half its rate and its flag at its own, which it lets go with its head', () => {
    const { world, run } = game()
    const entity = spawnZombie(world, definitions, 'pvz:flag', 2, 700, 280)
    const zombie = world.get(entity, ZombieComponent)!
    damageZombie(world, definitions, entity, 1, { chillTicks: 1000 })
    const before = { body: zombie.animations.body.time, flag: zombie.animations.flag.time }
    run()
    // Zombie::ApplyAnimRate halves the body alone; the flag is a Reanim of its own at 15 a second.
    assert.ok(Math.abs(zombie.animations.body.time - before.body - zombie.animations.body.rate / 2 / 100) < 1e-9)
    assert.ok(Math.abs(zombie.animations.flag.time - before.flag - 15 / 100) < 1e-9)
    damageZombie(world, definitions, entity, 200)
    assert.equal(zombie.animations.flag, undefined, 'Zombie::DropFlag')
    // The client draws what falls by the zombie's type, which the event says.
    assert.ok(world.resources.get(EventQueueResource).events.some(event => event.type === 'zombiePartDropped' && event.data.part === 'flag'
        && event.data.typeId === 'pvz:flag'))
})

test('a zombie that stops eating sets off again as StartWalkAnim does: a new speed and walk; the flag zombie always takes walk2', () => {
    const eating = game()
    const plant = eating.world.createEntity()
    eating.world.add(plant, PositionComponent, { x: 300, y: 280, row: 2 })
    eating.world.add(plant, PlantComponent, { typeId: 'pvz:peashooter', seedId: 'pvz:peashooter', column: 3, health: 300, maxHealth: 300, recentlyEatenCounter: 0, chilledTicks: 0 })
    const zombies = Array.from({ length: 12 }, () => spawnZombie(eating.world, definitions, 'pvz:normal', 2, 330, 280))
    const flags = Array.from({ length: 4 }, () => spawnZombie(eating.world, definitions, 'pvz:flag', 2, 330, 280))
    const before = new Map([...zombies, ...flags].map(entity => [entity, { ...eating.world.get(entity, ZombieComponent)! }]))
    // A few ticks of chewing, before sixteen of them finish the plant.
    for (let tick = 0; tick < 3; tick++) eating.run()
    assert.deepEqual([...zombies, ...flags].map(entity => eating.world.get(entity, ZombieComponent)!.state), Array(16).fill('eating'))
    eating.world.destroyEntity(plant)
    eating.run()
    const after = [...zombies, ...flags].map(entity => eating.world.get(entity, ZombieComponent)!)
    assert.deepEqual(after.map(zombie => zombie.state), Array(16).fill('walking'))
    const { min, max } = definitions.zombies['pvz:normal'].speedPerTick
    assert.ok(zombies.every(entity => { const speed = eating.world.get(entity, ZombieComponent)!.speedPerTick; return speed >= min && speed <= max }))
    assert.ok(zombies.some(entity => eating.world.get(entity, ZombieComponent)!.speedPerTick !== before.get(entity)!.speedPerTick), 'PickRandomSpeed')
    const walks = zombies.map(entity => eating.world.get(entity, ZombieComponent)!)
    assert.ok(walks.some(zombie => zombie.walkClip === 'walk') && walks.some(zombie => zombie.walkClip === 'walk2'), 'Rand(2)')
    assert.ok(walks.every(zombie => zombie.animations.body.clip === zombie.walkClip))
    // StartWalkAnim fixes the flag zombie's variant at 0: anim_walk2, from its start too.
    assert.ok(flags.every(entity => before.get(entity)!.walkClip === 'walk2' && eating.world.get(entity, ZombieComponent)!.walkClip === 'walk2'))
})
