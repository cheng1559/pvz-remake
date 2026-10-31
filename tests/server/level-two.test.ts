import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { parseGameplayDefinitions,parseGameplayLevels } from '@/shared/content/gameplay'
import type { JsonValue,StartSessionPacket } from '@/shared/protocol'
import assert from 'node:assert/strict'
import test from 'node:test'
import { readGameplaySource } from '../../tools/mod/content'
import { runCommand } from './run-command'

const source = readGameplaySource
const definitions = parseGameplayDefinitions(source('definitions'), source('seed-catalog'))
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



test('/nextflag announces the flag wave 750 ticks ahead; repeating it ends the countdown', () => {
    const debug = (server: IntegratedGameServer, command: string) => {
        server.enqueueDebugCommand(1, command)
        server.processBoundaryCommands()
        return server.drainCommandResults()[0].debug
    }
    const server = game()
    server.drainEvents()
    assert.equal(debug(server, '/nextflag')?.ok, true)
    assert.deepEqual(server.drainEvents().map(event => event.type), ['hugeWave'])
    assert.equal(server.snapshot().zombies.length, 0)
    // The previous wave is gone and due for an early wave, which must not cut the countdown short.
    const save = server.save()
    Object.assign(save.wave, { zombieIds: [], accelerateAtTick: save.gameplayTick })
    server.start({ ...start, save: save as unknown as JsonValue })
    server.drainEvents()
    const timeline = new Map<string, number>()
    for (let tick = 1; !server.snapshot().zombies.length; tick++) {
        server.tick()
        for (const event of server.drainEvents()) if (!timeline.has(event.type)) timeline.set(event.type, tick)
    }
    assert.deepEqual([timeline.get('hugeWaveSound'), timeline.get('musicBurst'), timeline.get('finalWave'), timeline.get('zombieSpawned')], [25, 350, 750, 751])

    const skipped = game()
    debug(skipped, '/nextflag')
    for (let tick = 0; tick < 100; tick++) skipped.tick()
    skipped.drainEvents()
    assert.equal(debug(skipped, '/nextflag')?.ok, true)
    assert.equal(skipped.snapshot().zombies.length, 5, 'Board::KeyChar ends a running huge wave countdown')
    assert.ok(skipped.drainEvents().some(event => event.type === 'finalWave'))
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
