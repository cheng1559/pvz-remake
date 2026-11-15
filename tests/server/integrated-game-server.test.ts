import assert from 'node:assert/strict'
import test from 'node:test'
import { readGameplaySource } from '../../tools/mod/content'

import type { World } from '@/ecs/index'
import { launchProjectile, STRAIGHT } from '@/server/combat/motions'
import {
PlantAttackComponent,
PlantComponent,
PositionComponent,
ProjectileComponent,
ZombieComponent
} from '@/server/state/components'
import { DeterministicRng } from '@/server/state/DeterministicRng'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { ItemComponent, SkySunResource, TutorialResource } from '@/server/state/levelState'
import { damageZombie } from '@/server/zombies/damage'
import { getAvailableSun } from '@/server/level/items'
import { startMower } from '@/server/level/mower'
import { spawnZombie } from '@/server/zombies/spawn'
import {
parseGameplayDefinitions,
parseGameplayLevels,
} from '@/shared/content/gameplay'
import { isJsonValue,parseServerPacket,type StartSessionPacket } from '@/shared/protocol/index'
import { runCommand } from './run-command'
import { adventureSeeds } from './adventure-seeds'
import { framePosition } from '@/shared/content/animation'

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
    ownedSeeds: adventureSeeds(levels, 'pvz:adventure-1-1'),
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
    assert.deepEqual(initial.mowerRows, [2])
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
    // Its body starts its idle loop at a rate of its own (Reanimation::mAnimRate, 15 to 20 frames a second), its head with it.
    const { animations, ...peashooter } = planted.plants[0]
    assert.ok(animations!.body.rate >= 15 && animations!.body.rate <= 20, `idle rate ${animations!.body.rate}`)
    assert.deepEqual(animations, { body: { clip: 'body', time: 0, rate: animations!.body.rate }, head: { clip: 'idleHead', time: 0, rate: animations!.body.rate } })
    assert.deepEqual([peashooter], [{
        entityId: 1,
        typeId: 'pvz:peashooter',
        seedId: 'pvz:peashooter',
        column: 0,
        health: 300,
        maxHealth: 300,
        x: 40,
        y: 280,
        row: 2,
    }])
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' }), 'seed-not-ready')
    assert.equal(server.tick().seedPackets[0]!.cooldownRemaining, 749)
})

test('Peashooter acquires a zombie ahead and fires after its fixed windup', () => {
    const server = new IntegratedGameServer(definitions, levels)
    startGameplay(server)
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    runCommand(server, { type: 'placePlant', row: 2, column: 0 })

    const world = (server as unknown as { requireSession(): { world: World } }).requireSession().world
    assert.equal(spawnZombie(world, definitions, 'pvz:normal', 2, 700, 250), 2)
    server.drainEvents()

    let snapshot = server.snapshot()
    const ready = Math.max(1, server.save().entities.find(entity => entity.plantAttack)!.plantAttack!.readyAtTick)
    while (gameplayTick(server) < ready) snapshot = server.tick()
    assert.deepEqual(server.drainEvents().map(event => [event.type, event.data]), [[
        'plantFiring', { plantId: 1 },
    ]])
    const fire = ready + definitions.plants['pvz:peashooter'].shooter!.windupTicks - 1
    while (gameplayTick(server) < fire - 1) snapshot = server.tick()
    assert.deepEqual(snapshot.projectiles, [])

    snapshot = server.tick()
    assert.equal(gameplayTick(server), fire)
    assert.equal(snapshot.zombies[0].entityId, 2)
    assert.equal(snapshot.zombies[0].state, 'walking')
    assert.equal(snapshot.zombies[0].x < 700, true)
    // Plant::GetPeaHeadOffset: the pea's corner leaves (24, -33) from the stem the head is on, where the body's idle
    // loop had it when the plant fired, between two frames of its track; it has flown its first tick since.
    const { clips } = definitions.plants['pvz:peashooter'].animation!, track = clips.body.tracks!.anim_stem
    // Its frames are spread over the loop's whole length (Reanimation::GetFrameTime, framePosition).
    const { body, head } = snapshot.plants[0].animations!, time = framePosition(clips.body, body.time - body.rate / 100)
    const from = track[Math.floor(time)], to = track[Math.min(track.length - 1, Math.floor(time) + 1)], part = time - Math.floor(time)
    const stem = { x: from.x + (to.x - from.x) * part, y: from.y + (to.y - from.y) * part }
    assert.ok(body.time > 0 && stem.x >= 37.6 && stem.x <= 47.4, `the loop has gone on to ${body.time}`)
    const round = (value: number) => Math.round(value * 1e6) / 1e6
    const [pea] = snapshot.projectiles
    assert.deepEqual({ ...pea, x: round(pea.x), y: round(pea.y), height: round(pea.height!) }, {
        entityId: 3,
        typeId: 'pvz:pea',
        x: round(40 + stem.x + 24 + 3.33),
        y: round(280 + stem.y - 33),
        row: 2,
        // It flies at its mouth's height over the ground, where its shadow lies.
        height: round(63 - (stem.y - 33)),
    })
    assert.equal(snapshot.projectiles.length, 1)
    assert.deepEqual(server.drainEvents().map(event => [event.type, event.data]), [[
        'projectileFired', { plantId: 1, projectileId: 3, typeId: 'pvz:pea' },
    ]])

    // Plant::FindTargetAndFire: its head has played the shooting clip since the windup began, at 35 frames a second,
    const windup = definitions.plants['pvz:peashooter'].shooter!.windupTicks
    assert.deepEqual({ ...head, time: round(head.time) }, { clip: 'shootHead', time: round(windup * 0.35), rate: 35 })
    // and when the clip's 25 frames are through it idles again where the body is, at the body's rate.
    while (gameplayTick(server) < ready + Math.ceil(25 / 0.35) - 2) snapshot = server.tick()
    assert.equal(snapshot.plants[0].animations!.head.clip, 'shootHead')
    snapshot = server.tick()
    assert.deepEqual(snapshot.plants[0].animations!.head, { ...snapshot.plants[0].animations!.body, clip: 'idleHead' })
})

test('a plant blinks on the server, and a save keeps its animation', () => {
    const server = new IntegratedGameServer(definitions, levels)
    startGameplay(server)
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    runCommand(server, { type: 'placePlant', row: 2, column: 0 })

    // Plant::DoBlink: the first blink comes 400 to 799 ticks after planting, over the other layers.
    let snapshot = server.snapshot()
    while (!snapshot.plants[0].animations!.blink && gameplayTick(server) < 800) snapshot = server.tick()
    const planted = server.save().entities.find(entity => entity.plant)!.plant!
    assert.ok(gameplayTick(server) >= 400, `blinked at ${gameplayTick(server)}`)
    assert.deepEqual(snapshot.plants[0].animations!.blink, { clip: 'blink', time: 0, rate: 15 })
    assert.ok(planted.blinkTicks! >= 400 && planted.blinkTicks! <= 799, `the next blink in ${planted.blinkTicks}`)

    // A restored session goes on as this one does: the blink's 3 frames at 15 a second end 20 ticks after it began.
    const restored = new IntegratedGameServer(definitions, levels)
    restored.restore(JSON.parse(JSON.stringify(server.save())))
    for (let tick = 1; tick <= 20; tick++) {
        snapshot = server.tick()
        assert.deepEqual(restored.tick().plants, snapshot.plants)
        assert.equal(snapshot.plants[0].animations!.blink !== undefined, tick < 20, `tick ${tick}`)
    }
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
    const availableSun = () => getAvailableSun((server as unknown as { requireSession(): { world: World } }).requireSession().world, fiftySunDefinitions)
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    runCommand(server, { type: 'placePlant', row: 2, column: 0 })

    let snapshot = server.snapshot()
    while (gameplayTick(server) < 750) snapshot = server.tick()
    const itemId = snapshot.items.find(item => item.state === 'available')!.entityId
    assert.equal(runCommand(server, { type: 'collectItemAt', itemId }), undefined)
    snapshot = server.snapshot()
    assert.equal(snapshot.sun, 50)
    assert.equal(availableSun(), 100)
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' }), undefined)
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 1 }), undefined)
    snapshot = server.snapshot()
    assert.equal(snapshot.sun, 0)
    assert.equal(availableSun(), 0)

    while (snapshot.items.some(item => item.entityId === itemId)) snapshot = server.tick()
    assert.equal(snapshot.sun, 0)
    assert.equal(availableSun(), 0)
})


test('collecting the award keeps existing entity updates running while spawning and input stop', () => {
    const server = new IntegratedGameServer(definitions, levels)
    startGameplay(server)
    const world = (server as unknown as { requireSession(): { world: World } }).requireSession().world
    startMower(world, definitions, 2)
    const mower = (snapshot: { projectiles: Array<{ typeId: string, x: number }> }) => snapshot.projectiles.find(projectile => projectile.typeId === 'pvz:lawnmower')!
    const peaId = launchProjectile(world, definitions, world, { typeId: 'pvz:pea', position: { x: 100, y: 290, row: 2 }, motion: STRAIGHT })
    const plantId = world.createEntity()
    world.add(plantId, PositionComponent, { x: 40, y: 280, row: 2 })
    world.add(plantId, PlantComponent, {
        typeId: 'pvz:peashooter', seedId: 'pvz:peashooter', column: 0,
        health: 300, maxHealth: 300, recentlyEatenCounter: 0, chilledTicks: 0,
    })
    world.add(plantId, PlantAttackComponent, { readyAtTick: 150, burst: { fireAtTick: 2, shotsRemaining: 1 } })
    const corpseId = spawnZombie(world, definitions, 'pvz:normal', 2, 700, 250)
    damageZombie(world, definitions, corpseId, 270)
    world.resources.get(SkySunResource).atTick = 1
    const sunId = world.createEntity()
    world.add(sunId, PositionComponent, { x: 300, y: 300, row: -1 })
    world.add(sunId, ItemComponent, {
        typeId: 'pvz:sun', value: 25, state: 'available', velocityX: 0, velocityY: 0, accelerationY: 0, width: 60,
        groundY: 300, disappearTicks: 0, fadeTicks: 0, scale: 1, alpha: 255,
    })
    const awardId = world.createEntity()
    world.add(awardId, PositionComponent, { x: 400, y: 300, row: -1 })
    world.add(awardId, ItemComponent, {
        typeId: 'pvz:sunflower', value: 1, state: 'available', velocityX: 0, velocityY: 0, accelerationY: 0, width: 60,
        groundY: 300, disappearTicks: 0, fadeTicks: 0, scale: 1, alpha: 255,
    })

    assert.equal(server.tick().items.length, 2)
    assert.equal(runCommand(server, { type: 'collectItemAt', itemId: awardId }), undefined)
    assert.equal(server.snapshot().items.find(item => item.entityId === sunId)?.state, 'collecting')
    const winTick = server.snapshot().tick
    const mowerX = mower(server.snapshot()).x
    const peaX = world.get(peaId, PositionComponent)!.x
    const corpseTicks = world.get(corpseId, ZombieComponent)!.deathTicksRemaining
    let snapshot = server.tick()
    assert.equal(snapshot.tick, winTick + 1)
    assert.equal(snapshot.result, 'won')
    assert.ok(mower(snapshot).x > mowerX, 'collecting the award must not stop an active mower')
    assert.equal(world.get(peaId, PositionComponent)!.x, peaX + 3.33)
    assert.equal(snapshot.projectiles.filter(projectile => projectile.typeId === 'pvz:pea').length, 2, 'a pending shot completes after victory')
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
