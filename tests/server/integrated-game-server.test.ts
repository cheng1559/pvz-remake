import assert from 'node:assert/strict'
import test from 'node:test'
import { readGameplaySource } from '../../tools/mod/content'

import type { World } from '@/ecs/index'
import {
LawnMowerComponent,
PlantAttackComponent,
PlantComponent,
PositionComponent,
ProjectileComponent,
ZombieComponent
} from '@/server/components'
import { DeterministicRng } from '@/server/DeterministicRng'
import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import { ItemComponent,TutorialResource } from '@/server/levelState'
import { damageZombie } from '@/server/zombies/damage'
import { spawnZombie } from '@/server/zombies/spawn'
import {
parseGameplayDefinitions,
parseGameplayLevels,
} from '@/shared/content/gameplay'
import { isJsonValue,parseServerPacket,type StartSessionPacket } from '@/shared/protocol/index'
import { runCommand } from './run-command'

const source = readGameplaySource

const definitions = parseGameplayDefinitions(source('definitions'), source('seed-catalog'))
const levels = parseGameplayLevels(source('levels'), definitions)
const startPacket: StartSessionPacket = {
    protocolVersion: 1,
    sequence: 1,
    type: 'startSession',
    levelId: 'pvz:adventure-1-1',
    randomSeed: 12345,
    initialMoney: 50,
    firstAdventure: true,
    mods: [],
}

const startGameplay = (server: IntegratedGameServer) => {
    const snapshot = server.start(startPacket)
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    return snapshot
}

const gameplayTick = (server: IntegratedGameServer): number => server.save().gameplayTick

test('deterministic RNG repeats and resumes its uint32 sequence', () => {
    const first = new DeterministicRng(0)
    const second = new DeterministicRng(0)
    assert.deepEqual(
        [first.nextUint32(), first.nextFloat(), first.integer(-2, 2)],
        [second.nextUint32(), second.nextFloat(), second.integer(-2, 2)],
    )

    const restored = DeterministicRng.restore(first.snapshot())
    assert.equal(restored.nextUint32(), first.nextUint32())
    assert.throws(() => new DeterministicRng(0x100000000), /uint32/)
    assert.throws(() => first.integer(2, 1), /range/)
})

test('1-1 starts at tick zero and advances as a JSON-safe authoritative world', () => {
    const first = new IntegratedGameServer(definitions, levels)
    const second = new IntegratedGameServer(definitions, levels)
    const initial = first.start(startPacket)

    assert.equal(initial.tick, 0)
    assert.equal(initial.sun, 150)
    assert.equal(initial.money, 50)
    assert.deepEqual(initial.lawnMowers, [{
        entityId: 1,
        typeId: 'pvz:standard',
        state: 'ready',
        x: -21,
        y: 303,
        row: 2,
    }])
    assert.deepEqual(initial, second.start(startPacket))

    assert.equal(initial.phase, 'intro')
    assert.equal(runCommand(first, { type: 'selectSeed', seedId: 'pvz:peashooter' }), 'intro-not-complete')
    assert.equal(first.tick().tick, 0)
    assert.equal(runCommand(first, { type: 'completeIntro' }), undefined)
    assert.equal(first.snapshot().phase, 'gameplay')
    assert.equal(runCommand(first, { type: 'completeIntro' }), 'intro-already-complete')

    const frame = first.tick()
    assert.equal(frame.tick, 2)
    assert.equal(gameplayTick(first), 1)
    assert.equal(isJsonValue(frame), true)
    assert.doesNotThrow(() => parseServerPacket({
        protocolVersion: 1,
        type: 'frame',
        serverTick: frame.tick,
        acknowledgedSequence: startPacket.sequence,
        snapshot: frame,
        events: [],
    }))
})

test('session pause and resume work during the 1-1 intro', () => {
    const server = new IntegratedGameServer(definitions, levels)
    server.start(startPacket)

    assert.equal(runCommand(server, { type: 'pause' }), undefined)
    assert.equal(server.snapshot().paused, true)
    assert.equal(server.snapshot().phase, 'intro')
    assert.equal(runCommand(server, { type: 'resume' }), undefined)
    assert.equal(server.snapshot().paused, false)
})

test('selecting and placing Peashooter changes authority state atomically', () => {
    const server = new IntegratedGameServer(definitions, levels)
    const initial = startGameplay(server)
    assert.deepEqual(initial.seedPackets, [{
        seedId: 'pvz:peashooter',
        ready: true,
        selected: false,
        cooldownRemaining: 0,
        cooldownTotal: 0,
        availability: {},
    }])
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 0 }), 'no-seed-selected')
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' }), undefined)
    assert.deepEqual(server.snapshot().cursor, { mode: 'seed', seedId: 'pvz:peashooter' })

    const beforeInvalidPlacement = server.snapshot()
    assert.equal(runCommand(server, { type: 'placePlant', row: 1, column: 0 }), 'row-not-active')
    assert.deepEqual(server.snapshot(), beforeInvalidPlacement)

    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 0 }), undefined)
    const planted = server.snapshot()
    assert.equal(planted.sun, 50)
    assert.deepEqual(planted.cursor, { mode: 'none' })
    assert.deepEqual(planted.seedPackets, [{
        seedId: 'pvz:peashooter',
        ready: false,
        selected: false,
        cooldownRemaining: 750,
        cooldownTotal: 750,
        availability: { reason: 'seed-not-ready', warningKey: 'WAITING_FOR_SEED' },
    }])
    assert.deepEqual(planted.plants, [{
        entityId: 2,
        typeId: 'pvz:peashooter',
        seedId: 'pvz:peashooter',
        column: 0,
        health: 300,
        maxHealth: 300,
        eatenFlashCounter: 0, recentlyEatenCounter: 0,
        x: 40,
        y: 280,
        row: 2,
    }])
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' }), 'seed-not-ready')
    assert.equal(server.tick().seedPackets[0].cooldownRemaining, 749)
})

test('Peashooter acquires a zombie ahead and fires after its fixed windup', () => {
    const server = new IntegratedGameServer(definitions, levels)
    startGameplay(server)
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    runCommand(server, { type: 'placePlant', row: 2, column: 0 })

    const world = (server as unknown as { requireSession(): { world: World } }).requireSession().world
    assert.equal(spawnZombie(world, definitions, 'pvz:normal', 2, 700, 250), 3)
    server.drainEvents()

    let snapshot = server.snapshot()
    const ready = Math.max(1, server.save().entities.find(entity => entity.plantAttack)!.plantAttack!.readyAtTick)
    while (gameplayTick(server) < ready) snapshot = server.tick()
    assert.deepEqual(server.drainEvents().map(event => [event.type, event.data]), [[
        'plantFiring', { plantId: 2 },
    ]])
    const fire = ready + definitions.plants['pvz:peashooter'].shooter!.windupTicks - 1
    while (gameplayTick(server) < fire - 1) snapshot = server.tick()
    assert.deepEqual(snapshot.projectiles, [])

    snapshot = server.tick()
    assert.equal(gameplayTick(server), fire)
    assert.equal(snapshot.zombies[0].entityId, 3)
    assert.equal(snapshot.zombies[0].state, 'walking')
    assert.equal(snapshot.zombies[0].x < 700, true)
    assert.deepEqual(snapshot.projectiles, [{
        entityId: 4,
        typeId: 'pvz:pea',
        x: 99.33,
        y: 290,
        row: 2,
    }])
    assert.deepEqual(server.drainEvents().map(event => [event.type, event.data]), [[
        'projectileFired', { plantId: 2, projectileId: 4, typeId: 'pvz:pea' },
    ]])
})


test('1-1 tutorial collects two suns and starts its first wave 99 ticks after the second plant', () => {
    const server = new IntegratedGameServer(definitions, levels)
    startGameplay(server)
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    runCommand(server, { type: 'placePlant', row: 2, column: 0 })

    let snapshot = server.snapshot()
    while (gameplayTick(server) < 400) snapshot = server.tick()
    assert.equal(snapshot.items.length, 1)
    assert.equal(snapshot.tutorial.step, 'collect-first-sun')
    const firstItemId = snapshot.items[0].entityId
    assert.equal(runCommand(server, { type: 'collectItemAt', itemId: firstItemId }), undefined)
    snapshot = server.snapshot()
    assert.equal(snapshot.sun, 50)
    assert.equal(snapshot.items[0].state, 'collecting')
    assert.equal(snapshot.tutorial.step, 'collect-more-sun')

    while (snapshot.items.some(item => item.entityId === firstItemId)) snapshot = server.tick()
    assert.equal(snapshot.sun, 75)
    while (!snapshot.items.some(item => item.state === 'available') && gameplayTick(server) < 1200) snapshot = server.tick()
    const secondItem = snapshot.items.find(item => item.state === 'available')!
    assert.equal(snapshot.tutorial.step, 'collect-more-sun')
    server.drainEvents()
    runCommand(server, { type: 'collectItemAt', itemId: secondItem.entityId })
    snapshot = server.snapshot()
    assert.equal(snapshot.sun, 75)
    assert.equal(snapshot.items.find(item => item.entityId === secondItem.entityId)?.state, 'collecting')
    assert.equal(snapshot.tutorial.step, 'enough-sun')
    assert.deepEqual(server.drainEvents().map(event => event.type), [
        'seedPacketFlashRequested',
        'itemCollected',
    ])
    const enoughSunTick = gameplayTick(server)
    assert.equal(server.save().tutorial.promptAtTick, enoughSunTick + 400)
    while (gameplayTick(server) < enoughSunTick + 399) snapshot = server.tick()
    assert.equal(snapshot.tutorial.step, 'enough-sun')
    snapshot = server.tick()
    assert.equal(snapshot.tutorial.step, 'pick-second-seed')
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' }), undefined)
    assert.equal(server.snapshot().tutorial.step, 'plant-second-seed')
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 1 }), undefined)
    assert.equal(server.snapshot().sun, 0)
    assert.equal(server.snapshot().tutorial.step, 'complete')
    const secondPlantTick = gameplayTick(server)

    while (gameplayTick(server) < secondPlantTick + 98) snapshot = server.tick()
    assert.equal(snapshot.zombies.length, 0)
    snapshot = server.tick()
    assert.equal(gameplayTick(server), secondPlantTick + 99)
    assert.equal(snapshot.wave.index, 1)
    assert.equal(snapshot.zombies.length, 1)
})






test('collecting sun buys immediately but reaches the HUD only at the bank', () => {
    const fiftySunDefinitions = {
        ...definitions,
        items: {
            ...definitions.items,
            'pvz:sun': { ...definitions.items['pvz:sun'], value: 50 },
        },
    }
    const server = new IntegratedGameServer(fiftySunDefinitions, levels)
    startGameplay(server)
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    runCommand(server, { type: 'placePlant', row: 2, column: 0 })

    let snapshot = server.snapshot()
    while (gameplayTick(server) < 750) snapshot = server.tick()
    const itemId = snapshot.items.find(item => item.state === 'available')!.entityId
    assert.equal(runCommand(server, { type: 'collectItemAt', itemId }), undefined)
    snapshot = server.snapshot()
    assert.equal(snapshot.sun, 50)
    assert.equal(snapshot.availableSun, 100)
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' }), undefined)
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 1 }), undefined)
    snapshot = server.snapshot()
    assert.equal(snapshot.sun, 0)
    assert.equal(snapshot.availableSun, 0)

    while (snapshot.items.some(item => item.entityId === itemId)) snapshot = server.tick()
    assert.equal(snapshot.sun, 0)
    assert.equal(snapshot.availableSun, 0)
})


test('collecting the award keeps existing entity updates running while spawning and input stop', () => {
    const server = new IntegratedGameServer(definitions, levels)
    startGameplay(server)
    const world = (server as unknown as { requireSession(): { world: World } }).requireSession().world
    const mowerId = server.snapshot().lawnMowers[0].entityId
    world.get(mowerId, LawnMowerComponent)!.state = 'active'
    const peaId = world.createEntity()
    world.add(peaId, PositionComponent, { x: 100, y: 290, row: 2 })
    world.add(peaId, ProjectileComponent, { typeId: 'pvz:pea' })
    const plantId = world.createEntity()
    world.add(plantId, PositionComponent, { x: 40, y: 280, row: 2 })
    world.add(plantId, PlantComponent, {
        typeId: 'pvz:peashooter', seedId: 'pvz:peashooter', column: 0,
        health: 300, maxHealth: 300, eatenFlashCounter: 0, recentlyEatenCounter: 0,
    })
    world.add(plantId, PlantAttackComponent, { readyAtTick: 150, fireAtTick: 2, shotsRemaining: 1 })
    const corpseId = spawnZombie(world, definitions, 'pvz:normal', 2, 700, 250)
    damageZombie(world, definitions, corpseId, 270)
    world.resources.get(TutorialResource).sunAtTick = 1
    const sunId = world.createEntity()
    world.add(sunId, PositionComponent, { x: 300, y: 300, row: -1 })
    world.add(sunId, ItemComponent, {
        typeId: 'pvz:sun', value: 25, state: 'available', velocityX: 0, velocityY: 0,
        groundY: 300, disappearTicks: 0, fadeTicks: 0, scale: 1, alpha: 255,
    })
    const awardId = world.createEntity()
    world.add(awardId, PositionComponent, { x: 400, y: 300, row: -1 })
    world.add(awardId, ItemComponent, {
        typeId: 'pvz:sunflower', value: 1, state: 'available', velocityX: 0, velocityY: 0,
        groundY: 300, disappearTicks: 0, fadeTicks: 0, scale: 1, alpha: 255,
    })

    assert.equal(server.tick().items.length, 2)
    assert.equal(runCommand(server, { type: 'collectItemAt', itemId: awardId }), undefined)
    assert.equal(server.snapshot().items.find(item => item.entityId === sunId)?.state, 'collecting')
    const winTick = server.snapshot().tick
    const mowerX = server.snapshot().lawnMowers[0].x
    const peaX = world.get(peaId, PositionComponent)!.x
    const corpseTicks = world.get(corpseId, ZombieComponent)!.deathTicksRemaining
    let snapshot = server.tick()
    assert.equal(snapshot.tick, winTick + 1)
    assert.equal(snapshot.result, 'won')
    assert.ok(snapshot.lawnMowers[0].x > mowerX, 'collecting the award must not stop an active mower')
    assert.equal(world.get(peaId, PositionComponent)!.x, peaX + definitions.projectiles['pvz:pea'].speedPerTick.x)
    assert.equal(snapshot.projectiles.length, 2, 'a pending shot completes after victory')
    assert.equal(world.get(corpseId, ZombieComponent)!.deathTicksRemaining, corpseTicks - 1)
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' }), 'game-not-playing')
    assert.ok(snapshot.items.find(item => item.entityId === sunId)!.x < 300)
    while (snapshot.items.some(item => item.entityId === sunId)) snapshot = server.tick()
    assert.equal(snapshot.sun, 175)
    for (let tick = 0; tick < 250; tick++) snapshot = server.tick()
    assert.equal(snapshot.projectiles.length, 0, 'peas leave the board after victory')
    assert.equal(snapshot.zombies.length, 0, 'death animations finish after victory')
    assert.equal(snapshot.result, 'won')
})
