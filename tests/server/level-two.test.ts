import { IntegratedGameServer } from '@/server/IntegratedGameServer'
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
