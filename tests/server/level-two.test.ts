import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import type { World } from '@/ecs/index'
import { damageZombie, spawnZombie } from '@/server/gameplay'
import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import type { JsonValue, StartSessionPacket } from '@/shared/protocol'
import { runCommand } from './run-command'

const source = (name: string) => JSON.parse(readFileSync(`tools/content/pvz-base/gameplay/${name}.json`, 'utf8'))
const definitions = parseGameplayDefinitions(source('definitions'))
const levels = parseGameplayLevels(source('levels'), definitions)
const start: StartSessionPacket = {
    protocolVersion: 1, sequence: 1, type: 'startSession', levelId: 'pvz:adventure-1-2',
    randomSeed: 12345, initialMoney: 0, firstAdventure: true, mods: [],
}

function game() {
    const server = new IntegratedGameServer(definitions, levels)
    server.start(start)
    runCommand(server, { type: 'completeIntro' })
    return server
}

test('1-2 starts with three rows and Sunflower teaching, and production resumes deterministically', () => {
    const server = game()
    const initial = server.snapshot()
    assert.equal(initial.sun, 50)
    assert.deepEqual(initial.lawnMowers.map(mower => mower.row), [1, 2, 3])
    assert.deepEqual(initial.seedPackets.map(packet => packet.seedId), ['pvz:peashooter', 'pvz:sunflower'])
    assert.equal(initial.tutorial.step, 'pick-sunflower')
    assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:sunflower' }), undefined)
    assert.equal(server.snapshot().tutorial.step, 'plant-sunflower')
    assert.equal(runCommand(server, { type: 'placePlant', row: 0, column: 0 }), 'row-not-active')
    assert.equal(runCommand(server, { type: 'placePlant', row: 1, column: 0 }), undefined)
    assert.equal(server.snapshot().sun, 0)
    assert.equal(server.snapshot().tutorial.step, 'refresh-sunflower')
    const saved = server.save()
    const producer = saved.entities.find(entity => entity.plant?.typeId === 'pvz:sunflower')!
    assert.ok(producer.plantAttack!.readyAtTick >= 300 && producer.plantAttack!.readyAtTick <= 1250)
    const restored = new IntegratedGameServer(definitions, levels)
    restored.start({ ...start, save: saved as unknown as JsonValue })
    let produced = false
    for (let tick = 1; tick <= producer.plantAttack!.readyAtTick + 2; tick++) {
        assert.deepEqual(restored.tick(), server.tick())
        const events = server.drainEvents()
        assert.deepEqual(restored.drainEvents(), events)
        if (events.some(event => event.type === 'sunProduced')) produced = true
    }
    assert.equal(produced, true)
    assert.equal(server.snapshot().projectiles.length, 0, 'a producer does not use shooter logic')
    const sun = server.save().entities.find(entity => entity.item?.accelerationY === 0.09)!
    assert.ok(sun.item!.scale > 0.4)
    assert.equal(runCommand(server, { type: 'collectItemAt', itemId: sun.entityId }), undefined)
    assert.equal(server.snapshot().availableSun, 25)
})

test('planting three Sunflowers completes the tutorial and starts the first-wave countdown', () => {
    const server = game()
    const save = server.save()
    save.economy.sun = 500
    server.start({ ...start, save: save as unknown as JsonValue })
    for (let column = 0; column < 3; column++) {
        assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'pvz:sunflower' }), undefined)
        assert.equal(runCommand(server, { type: 'placePlant', row: 2, column }), undefined)
        if (column < 2) for (let tick = 0; tick < 750; tick++) server.tick()
    }
    assert.equal(server.snapshot().tutorial.step, 'complete')
    assert.equal(server.snapshot().wave.countdown, 999)
    for (let tick = 0; tick < 998; tick++) server.tick()
    assert.equal(server.snapshot().wave.index, 0)
    server.tick()
    assert.equal(server.snapshot().wave.index, 1)
})

test('1-2 restores the Sunflower guide only on cancel, planting, cooldown or affordable-sun events', () => {
    const server = game()
    const save = server.save()
    save.economy.sun = 150
    server.start({ ...start, save: save as unknown as JsonValue })
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    for (let tick = 0; tick < 10; tick++) server.tick()
    assert.equal(server.snapshot().tutorial.step, 'refresh-sunflower', 'holding the wrong seed does not restore the guide')
    server.start({ ...start, save: server.save() as unknown as JsonValue })
    server.tick()
    assert.equal(server.snapshot().tutorial.step, 'refresh-sunflower', 'restore does not synthesize a readiness event')
    runCommand(server, { type: 'clearCursor' })
    assert.equal(server.snapshot().tutorial.step, 'pick-sunflower')
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    runCommand(server, { type: 'placePlant', row: 2, column: 0 })
    assert.equal(server.snapshot().tutorial.step, 'pick-sunflower')
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:sunflower' })
    runCommand(server, { type: 'placePlant', row: 2, column: 1 })
    for (let tick = 0; tick < 750; tick++) server.tick()
    assert.equal(server.snapshot().tutorial.step, 'refresh-sunflower', 'cooldown alone is insufficient without sun')
    for (let tick = 0; tick < 2000 && server.snapshot().items.filter(item => item.state === 'available').length < 2; tick++) server.tick()
    const suns = server.snapshot().items.filter(item => item.typeId === 'pvz:sun' && item.state === 'available')
    assert.ok(suns.length >= 2)
    runCommand(server, { type: 'collectItemAt', itemId: suns[0].entityId })
    assert.equal(server.snapshot().tutorial.step, 'refresh-sunflower')
    runCommand(server, { type: 'collectItemAt', itemId: suns[1].entityId })
    assert.equal(server.snapshot().tutorial.step, 'pick-sunflower', 'crossing the cost threshold restores the guide immediately')

    const rich = game()
    const richSave = rich.save()
    richSave.economy.sun = 500
    rich.start({ ...start, save: richSave as unknown as JsonValue })
    runCommand(rich, { type: 'selectSeed', seedId: 'pvz:sunflower' })
    runCommand(rich, { type: 'placePlant', row: 2, column: 0 })
    runCommand(rich, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    for (let tick = 0; tick < 749; tick++) rich.tick()
    assert.equal(rich.snapshot().tutorial.step, 'refresh-sunflower')
    rich.tick()
    assert.equal(rich.snapshot().tutorial.step, 'pick-sunflower', 'a real cooldown completion can restore the guide while holding another seed')
    assert.equal(rich.snapshot().cursor.mode, 'seed')
})

test('1-2 runs six waves, saves the huge-wave countdown and awards Cherry Bomb', () => {
    const server = game()
    const rows = new Set<number>()
    for (let index = 0; index < 6; index++) {
        const save = server.save()
        save.entities = save.entities.filter(entity => !entity.zombie)
        save.wave.zombieIds = []
        save.wave.nextWaveAtTick = save.gameplayTick + 1
        server.start({ ...start, save: save as unknown as JsonValue })
        server.drainEvents()
        server.tick()
        if (index === 5) {
            assert.equal(server.snapshot().wave.index, 5)
            assert.ok(server.drainEvents().some(event => event.type === 'hugeWave'))
            const restored = new IntegratedGameServer(definitions, levels)
            restored.start({ ...start, save: server.save() as unknown as JsonValue })
            while (server.snapshot().wave.index === 5) {
                assert.deepEqual(restored.tick(), server.tick())
                assert.deepEqual(restored.drainEvents(), server.drainEvents())
            }
            assert.equal(server.snapshot().zombies.length, 5)
            assert.equal(server.snapshot().zombies.filter(zombie => zombie.typeId === 'pvz:flag').length, 1)
        }
        assert.equal(server.snapshot().wave.index, index + 1)
        for (const zombie of server.snapshot().zombies) rows.add(zombie.row)
    }
    assert.deepEqual([...rows].sort(), [1, 2, 3])
    const save = server.save()
    for (const entity of save.entities) if (entity.zombie) entity.zombie.health = 0
    server.start({ ...start, save: save as unknown as JsonValue })
    server.tick()
    server.tick()
    const reward = server.snapshot().items.find(item => item.typeId === 'pvz:cherrybomb')!
    assert.ok(reward)
    assert.equal(runCommand(server, { type: 'collectItemAt', itemId: reward.entityId }), undefined)
    assert.equal(server.snapshot().result, 'won')
})


test('a Flag Zombie drops its flag once when losing its head, dying or being mowed, including after restore', () => {
    for (const damage of [190, 270, 0]) {
        const server = game()
        const world = (server as unknown as { session: { world: World } }).session.world
        const entity = spawnZombie(world, definitions, 'pvz:flag', 2, damage ? 600 : -40, 250)
        if (damage) damageZombie(world, entity, damage)
        else server.tick()
        const dropped = server.drainEvents().filter(event => event.type === 'zombiePartDropped' && event.data.part === 'flag')
        assert.equal(dropped.length, 1)
        assert.equal(dropped[0].data.entityId, entity)
        const saved = server.save()
        server.start({ ...start, save: saved as unknown as JsonValue })
        if (damage === 190) damageZombie((server as unknown as { session: { world: World } }).session.world, entity, 80)
        for (let tick = 0; tick < 60; tick++) server.tick()
        assert.equal(server.drainEvents().filter(event => event.type === 'zombiePartDropped' && event.data.part === 'flag').length, 0)
    }
})
