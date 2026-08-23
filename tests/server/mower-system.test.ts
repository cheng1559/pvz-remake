import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { Schedule, World } from '@/ecs/index'
import { parseGameplayDefinitionsV2 } from '@/shared/content/gameplay'
import {
    LawnMowerComponent,
    LevelStateResource,
    PositionComponent,
    RandomResource,
    ZombieComponent,
    createZombieSystem,
} from '@/server/gameplay'
import { createMowerSystem } from '@/server/mower'
import { EventQueueResource, createEventQueue } from '@/server/events'
import { DeterministicRng } from '@/server/DeterministicRng'

const definitions = parseGameplayDefinitionsV2(JSON.parse(
    readFileSync('tools/content/pvz-base/gameplay/definitions.json', 'utf8'),
))
const board = definitions.boards['pvz:day']

test('mower transitions ready to active, kills overlaps, and remains spent off-board', () => {
    const world = new World()
    world.resources.set(LevelStateResource, {
        id: 'pvz:test',
        definition: {} as never,
        board,
        phase: 'gameplay',
        result: 'playing',
        paused: false,
    })
    world.resources.set(EventQueueResource, createEventQueue())
    world.resources.set(RandomResource, new DeterministicRng(1))
    const mowerEntity = world.createEntity()
    world.add(mowerEntity, PositionComponent, { x: 999, y: 999, row: 2 })
    world.add(mowerEntity, LawnMowerComponent, { typeId: 'pvz:standard', state: 'ready', chompCounter: 0 })
    const schedule = new Schedule()
    schedule.add('zombie', createZombieSystem(definitions))
    schedule.add('mower', createMowerSystem(definitions))

    schedule.run(world, 1)
    assert.deepEqual(world.get(mowerEntity, PositionComponent), { x: -21, y: 303, row: 2 })

    const zombie = world.createEntity()
    world.add(zombie, PositionComponent, { x: -10, y: 280, row: 2 })
    world.add(zombie, ZombieComponent, {
        typeId: 'pvz:normal', health: 270, maxHealth: 270, state: 'walking',
        speedPerTick: 0.3, biteTicks: 0, deathTicksRemaining: 0,
        moweredTicksRemaining: 0,
        walkAnimation: 'anim_walk', animation: 'anim_walk', animationTime: 0, animationSpeed: 1,
        hasHead: false, hasArm: true, hitFlashCounter: 0, groanCounter: 300,
    })
    schedule.run(world, 2)
    assert.equal(world.get(mowerEntity, LawnMowerComponent)!.state, 'ready')
    assert.equal(world.get(zombie, ZombieComponent)!.state, 'walking')
    world.get(zombie, ZombieComponent)!.hasHead = true
    schedule.run(world, 3)
    assert.equal(world.hasEntity(zombie), true)
    assert.equal(world.get(zombie, ZombieComponent)!.state, 'mowered')
    assert.equal(world.get(mowerEntity, LawnMowerComponent)!.state, 'active')
    assert.equal(world.get(mowerEntity, LawnMowerComponent)!.chompCounter, 24)
    assert.equal(world.get(mowerEntity, PositionComponent)!.x, -19.996272)

    const secondZombie = world.createEntity()
    world.add(secondZombie, PositionComponent, { x: -10, y: 280, row: 2 })
    world.add(secondZombie, ZombieComponent, {
        typeId: 'pvz:normal', health: 270, maxHealth: 270, state: 'walking',
        speedPerTick: 0.3, biteTicks: 0, deathTicksRemaining: 0,
        moweredTicksRemaining: 0,
        walkAnimation: 'anim_walk', animation: 'anim_walk', animationTime: 0, animationSpeed: 1,
        hasHead: true, hasArm: true, hitFlashCounter: 0, groanCounter: 300,
    })
    schedule.run(world, 4)
    assert.equal(world.hasEntity(secondZombie), true)
    assert.equal(world.get(secondZombie, ZombieComponent)!.state, 'mowered')
    assert.equal(
        world.resources.get(EventQueueResource).events.filter(event => event.type === 'zombieMowered').length,
        2,
    )

    assert.equal(world.get(mowerEntity, LawnMowerComponent)!.chompCounter, 49)
    for (let tick = 5; tick <= 52; tick++) schedule.run(world, tick)
    assert.equal(world.hasEntity(zombie), true)
    schedule.run(world, 53)
    assert.equal(world.hasEntity(zombie), false)
    assert.equal(world.hasEntity(secondZombie), true)
    schedule.run(world, 54)
    assert.equal(world.hasEntity(secondZombie), false)
    assert.deepEqual(
        world.resources.get(EventQueueResource).events
            .filter(event => event.type === 'zombiePartDropped' && event.data.entityId === zombie)
            .map(event => [event.data.part, event.data.mowered]),
        [['head', true], ['arm', true]],
    )

    world.get(mowerEntity, PositionComponent)!.x = 799
    schedule.run(world, 55)
    assert.equal((world.get(mowerEntity, LawnMowerComponent) as { state: string }).state, 'spent')
    assert.equal(world.hasEntity(mowerEntity), true)
    assert.equal(world.get(mowerEntity, PositionComponent)!.x, 802.33)
})
