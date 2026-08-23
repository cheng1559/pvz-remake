import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { DeterministicRng } from '@/server/DeterministicRng'
import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import { EconomyStateResource, PositionComponent } from '@/server/gameplay'
import { ItemComponent, TutorialResource } from '@/server/levelOne'
import type { World } from '@/ecs/index'
import {
    parseGameplayDefinitionsV2,
    parseGameplayLevelsV2,
} from '@/shared/content/gameplay'
import { isJsonValue, parseServerPacket, type JsonValue, type StartSessionPacket } from '@/shared/protocol/index'
import { runCommand } from './run-command'

const source = (name: string): unknown => JSON.parse(
    readFileSync(`tools/content/pvz-base/gameplay/${name}.json`, 'utf8'),
)

const definitions = parseGameplayDefinitionsV2(source('definitions'))
const levels = parseGameplayLevelsV2(source('levels'), definitions)
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
    }])
    assert.deepEqual(planted.plants, [{
        entityId: 2,
        typeId: 'pvz:peashooter',
        seedId: 'pvz:peashooter',
        column: 0,
        health: 300,
        maxHealth: 300,
        eatenFlashCounter: 0,
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

    const serverInternals = server as unknown as {
        spawnZombie(typeId: string, row: number, x: number): number
    }
    assert.equal(serverInternals.spawnZombie('pvz:normal', 2, 700), 3)
    server.drainEvents()

    let snapshot = server.snapshot()
    while (gameplayTick(server) < 75) snapshot = server.tick()
    assert.deepEqual(server.drainEvents().map(event => [event.type, event.data]), [[
        'plantFiring', { plantId: 2 },
    ]])
    while (gameplayTick(server) < 106) snapshot = server.tick()
    assert.equal(gameplayTick(server), 106)
    assert.deepEqual(snapshot.projectiles, [])

    snapshot = server.tick()
    assert.equal(gameplayTick(server), 107)
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

test('pea damages the spatially nearest zombie', () => {
    const server = new IntegratedGameServer(definitions, levels)
    startGameplay(server)
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    runCommand(server, { type: 'placePlant', row: 2, column: 0 })

    const serverInternals = server as unknown as {
        spawnZombie(typeId: string, row: number, x: number): number
    }
    assert.equal(serverInternals.spawnZombie('pvz:normal', 2, 94), 3)
    assert.equal(serverInternals.spawnZombie('pvz:normal', 2, 90), 4)

    let snapshot = server.snapshot()
    while (gameplayTick(server) < 107) snapshot = server.tick()
    assert.deepEqual(snapshot.projectiles, [])
    assert.deepEqual(snapshot.zombies.map(zombie => [zombie.entityId, zombie.health]), [
        [3, 270],
        [4, 250],
    ])
    assert.equal(snapshot.zombies.find(zombie => zombie.entityId === 4)?.hitFlashCounter, 25)

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

test('1-1 reports the first insufficient seed pick and flashes sun on every attempt', () => {
    const server = new IntegratedGameServer(definitions, levels)
    startGameplay(server)
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    runCommand(server, { type: 'placePlant', row: 2, column: 0 })
    let snapshot = server.snapshot()
    while (gameplayTick(server) < 750) snapshot = server.tick()
    server.drainEvents()

    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' }), 'not-enough-sun')
    assert.deepEqual(server.drainEvents().map(event => [event.type, event.data]), [
        ['sunFlash', {}],
        ['advice', { key: 'ADVICE_CANT_AFFORD_PLANT', style: 'tutorial-level1' }],
    ])
    assert.equal(server.save().tutorial.cantAffordAdviceShown, true)
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' }), 'not-enough-sun')
    assert.deepEqual(server.drainEvents().map(event => [event.type, event.data]), [
        ['sunFlash', {}],
    ])

    while (snapshot.items.length < 2) snapshot = server.tick()
    for (const item of snapshot.items.slice(0, 2)) {
        assert.equal(runCommand(server, { type: 'collectItemAt', itemId: item.entityId }), undefined)
    }
    server.drainEvents()
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' }), undefined)
    assert.deepEqual(server.drainEvents().map(event => [event.type, event.data]), [
        ['adviceCleared', { key: 'ADVICE_CANT_AFFORD_PLANT' }],
    ])
})

test('1-1 shows the seed refresh advice once after the first sun prompt', () => {
    const server = new IntegratedGameServer(definitions, levels)
    startGameplay(server)
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    runCommand(server, { type: 'placePlant', row: 2, column: 0 })
    server.drainEvents()

    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' }), 'seed-not-ready')
    assert.deepEqual(server.drainEvents(), [])

    let snapshot = server.snapshot()
    while (gameplayTick(server) < 400) snapshot = server.tick()
    server.drainEvents()
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' }), 'seed-not-ready')
    assert.deepEqual(server.drainEvents().map(event => [event.type, event.data]), [
        ['advice', {
            key: 'ADVICE_SEED_REFRESH',
            style: 'tutorial-level1',
        }],
    ])
    assert.equal(server.save().tutorial.seedRefreshAdviceShown, true)

    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' }), 'seed-not-ready')
    assert.deepEqual(server.drainEvents(), [])
})

test('sky sun falls, expires after 750 ground ticks, and fades for 50 ticks', () => {
    const server = new IntegratedGameServer(definitions, levels)
    startGameplay(server)
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    runCommand(server, { type: 'placePlant', row: 2, column: 0 })

    let snapshot = server.snapshot()
    while (gameplayTick(server) < 400) snapshot = server.tick()
    const itemId = snapshot.items[0].entityId
    assert.equal(snapshot.items[0].y, 60.67)

    let previousY = snapshot.items[0].y
    while (true) {
        snapshot = server.tick()
        const y = snapshot.items.find(item => item.entityId === itemId)!.y
        if (y === previousY) break
        previousY = y
    }
    const landedTick = gameplayTick(server) - 1
    while (snapshot.items.find(item => item.entityId === itemId)?.state === 'available') snapshot = server.tick()
    assert.equal(gameplayTick(server), landedTick + 749)
    assert.equal(snapshot.items.find(item => item.entityId === itemId)?.alpha, 255)
    snapshot = server.tick()
    assert.equal(snapshot.items.find(item => item.entityId === itemId)?.alpha, 250)
    for (let i = 1; i < 50; i++) snapshot = server.tick()
    assert.equal(snapshot.items.some(item => item.entityId === itemId), false)
})

test('fading sky sun can still be collected before it disappears', () => {
    const server = new IntegratedGameServer(definitions, levels)
    startGameplay(server)
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    runCommand(server, { type: 'placePlant', row: 2, column: 0 })

    let snapshot = server.snapshot()
    while (gameplayTick(server) < 400) snapshot = server.tick()
    const itemId = snapshot.items[0].entityId
    while (snapshot.items.find(item => item.entityId === itemId)?.state !== 'fading') snapshot = server.tick()
    const sun = snapshot.sun
    assert.equal(runCommand(server, { type: 'collectItemAt', itemId }), undefined)
    assert.equal(server.snapshot().items.find(item => item.entityId === itemId)?.state, 'collecting')
    assert.equal(server.snapshot().sun, sun)
    while (server.snapshot().items.some(item => item.entityId === itemId)) snapshot = server.tick()
    assert.equal(snapshot.sun, sun + 25)
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

test('collecting sun used for a purchase is not credited again at the bank', () => {
    const server = new IntegratedGameServer(definitions, levels)
    startGameplay(server)
    const world = (server as unknown as { requireSession(): { world: World } }).requireSession().world
    world.resources.get(EconomyStateResource).sun = 75
    const itemId = world.createEntity()
    world.add(itemId, PositionComponent, { x: 15, y: 0, row: -1 })
    world.add(itemId, ItemComponent, {
        typeId: 'pvz:sun', value: 25, state: 'collecting', velocityX: 0, velocityY: 0,
        groundY: 0, disappearTicks: 0, fadeTicks: 0, scale: 1, alpha: 255,
    })

    assert.equal(server.snapshot().availableSun, 100)
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' }), undefined)
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 0 }), undefined)
    assert.equal(server.snapshot().sun, 0)
    assert.equal(server.snapshot().availableSun, 0)

    const save = server.save()
    assert.equal(save.economy.pendingSunSpend, 25)
    const restored = new IntegratedGameServer(definitions, levels)
    restored.start({ ...startPacket, save: save as unknown as JsonValue })
    assert.equal(restored.snapshot().availableSun, 0)

    const snapshot = restored.tick()
    assert.equal(snapshot.items.some(item => item.entityId === itemId), false)
    assert.equal(snapshot.sun, 0)
    assert.equal(snapshot.availableSun, 0)
})

test('level award stops sky sun spawning and auto-collects remaining sun', () => {
    const server = new IntegratedGameServer(definitions, levels)
    startGameplay(server)
    const world = (server as unknown as { requireSession(): { world: World } }).requireSession().world
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
    let snapshot = server.tick()
    assert.equal(snapshot.tick, winTick + 1)
    assert.ok(snapshot.items.find(item => item.entityId === sunId)!.x < 300)
    while (snapshot.items.some(item => item.entityId === sunId)) snapshot = server.tick()
    assert.equal(snapshot.sun, 175)
})
