import { type World } from '@/ecs'
import { ZombieComponent } from '@/server/state/components'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { spawnZombie } from '@/server/zombies/spawn'
import { parseGameplayDefinitions,parseGameplayLevels } from '@/shared/content/gameplay'
import { parseServerPacket,type JsonValue,type StartSessionPacket } from '@/shared/protocol'
import assert from 'node:assert/strict'
import test from 'node:test'
import { readGameplaySource } from '../../tools/mod/content'
import { runCommand } from './run-command'

const source = readGameplaySource
const definitions = parseGameplayDefinitions(source('definitions'), source('seed-catalog'))
const levels = parseGameplayLevels(source('levels'), definitions)
const options: StartSessionPacket = { type: 'startSession', protocolVersion: 1, sequence: 1,
    levelId: 'pvz:adventure-1-5', randomSeed: 12345, initialMoney: 0, firstAdventure: true, mods: [] }

function restore(server: IntegratedGameServer): void {
    server.start({ ...options, save: server.save() as unknown as JsonValue })
}
function begin(): IntegratedGameServer {
    const server = new IntegratedGameServer(definitions, levels)
    server.start({ ...options, firstAdventure: false })
    while (server.snapshot().extensions['pvz:dialog']) runCommand(server, { type: 'advanceDialog' })
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    return server
}


test('1-5 requires Dave, three shovel digs and the second dialogue before gameplay, and restores each stage', () => {
    const server = new IntegratedGameServer(definitions, levels)
    server.start(options)
    assert.deepEqual(server.snapshot().plants.map(plant => [plant.row, plant.column]), [[1, 5], [2, 7], [3, 6]])
    assert.equal(runCommand(server, { type: 'completeIntro' }), 'intro-not-complete')
    for (let index = 2400; index <= 2406; index++) {
        assert.deepEqual(server.snapshot().extensions['pvz:dialog'], { index })
        restore(server)
        assert.equal(runCommand(server, { type: 'advanceDialog' }), undefined)
    }
    assert.equal(server.snapshot().tutorial.step, 'shovel-pickup')
    for (const [row, column] of [[1, 5], [2, 7], [3, 6]]) {
        assert.equal(runCommand(server, { type: 'selectTool', toolId: 'pvz:shovel' }), undefined)
        restore(server)
        assert.deepEqual(server.snapshot().cursor, { mode: 'tool', toolId: 'pvz:shovel' })
        assert.equal(runCommand(server, { type: 'useToolAt', row, column }), undefined)
    }
    assert.equal(server.snapshot().plants.length, 0)
    for (let index = 2410; index <= 2415; index++) {
        assert.deepEqual(server.snapshot().extensions['pvz:dialog'], { index })
        runCommand(server, { type: 'advanceDialog' })
    }
    assert.equal(server.snapshot().tutorial.step, 'complete')
    restore(server)
    assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
    assert.equal(server.snapshot().wave.countdown, 200)
    assert.deepEqual(server.snapshot().conveyorPackets, [{ id: 1, seedId: 'pvz:bowling-wallnut', x: 515, selected: false, availability: {} }])
    assert.equal(server.save().tutorial.sunAtTick, undefined)
    assert.doesNotThrow(() => parseServerPacket({ type: 'frame', protocolVersion: 1, serverTick: server.snapshot().tick, acknowledgedSequence: 1, snapshot: server.snapshot(), events: [] }))
})

test('conveyor packets have distinct identities, cost no sun, obey the line and create independent bowling plants', () => {
    const server = begin()
    for (let tick = 0; tick < 4; tick++) server.tick()
    assert.equal(server.snapshot().conveyorPackets[0].x, 514)
    assert.equal(runCommand(server, { type: 'selectConveyorPacket', packetId: 1 }), undefined)
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 3 }), 'column-out-of-range')
    assert.equal(server.snapshot().conveyorPackets.length, 1)
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 1 }), undefined)
    assert.equal(server.snapshot().sun, 0)
    assert.equal(server.snapshot().conveyorPackets.length, 0)
    assert.equal(server.snapshot().plants[0].typeId, 'pvz:bowling-wallnut')
    assert.equal(definitions.plants['pvz:wallnut'].behavior, undefined)
    assert.equal(definitions.plants['pvz:explodenut'].behavior, undefined)
    while (server.snapshot().gameplayTick < 400) server.tick()
    assert.equal(server.snapshot().conveyorPackets[0].id, 2)
    assert.equal(server.snapshot().items.length, 0, 'bowling does not spawn sky sun')
})

test('seed and shovel selection are exclusive, including after save and on a non-bowling level', () => {
    const server = begin()
    runCommand(server, { type: 'selectTool', toolId: 'pvz:shovel' })
    runCommand(server, { type: 'selectConveyorPacket', packetId: 1 })
    assert.equal(server.snapshot().cursor.mode, 'seed')
    assert.deepEqual(server.save().seedBank.selection, { mode: 'conveyor', packetId: 1 })
    restore(server)
    assert.equal(server.snapshot().cursor.mode, 'seed')
    runCommand(server, { type: 'selectTool', toolId: 'pvz:shovel' })
    assert.equal(server.snapshot().cursor.mode, 'tool')
    assert.deepEqual(server.save().seedBank.selection, { mode: 'tool', toolId: 'pvz:shovel' })

    const config = source('levels')
    config.levels['pvz:adventure-1-1'].tools = ['pvz:shovel']
    const normal = new IntegratedGameServer(definitions, parseGameplayLevels(config, definitions))
    normal.start({ ...options, levelId: 'pvz:adventure-1-1', firstAdventure: false })
    runCommand(normal, { type: 'completeIntro' })
    assert.equal(runCommand(normal, { type: 'selectTool', toolId: 'pvz:shovel' }), undefined)
    assert.equal(runCommand(normal, { type: 'selectSeed', seedId: 'pvz:peashooter' }), undefined)
    assert.equal(normal.snapshot().cursor.mode, 'seed')
    assert.deepEqual(normal.save().seedBank.selection, { mode: 'seed', slot: 0 })
    runCommand(normal, { type: 'placePlant', row: 2, column: 0 })
    runCommand(normal, { type: 'selectTool', toolId: 'pvz:shovel' })
    assert.equal(runCommand(normal, { type: 'useToolAt', row: 2, column: 0 }), undefined)
    assert.equal(normal.snapshot().plants.length, 0)
})







test('a bowling plant hits, ricochets and resumes the same motion after save; an explosive one burns nearby zombies', () => {
    for (const explosive of [false, true]) {
        const server = begin()
        const saved = server.save()
        saved.seedBank.conveyor!.packets[0].seedId = explosive ? 'pvz:bowling-explodenut' : 'pvz:bowling-wallnut'
        server.start({ ...options, save: saved as unknown as JsonValue })
        runCommand(server, { type: 'selectConveyorPacket', packetId: 1 })
        runCommand(server, { type: 'placePlant', row: 2, column: 1 })
        const world = (server as unknown as { session: { world: World } }).session.world
        const plant = server.snapshot().plants[0]
        const id = spawnZombie(world, definitions, 'pvz:normal', 2, plant.x + 20, plant.y - 30)
        const events = server.drainEvents()
        server.tick()
        events.push(...server.drainEvents())
        if (explosive) {
            assert.equal(server.snapshot().plants.length, 0)
            assert.ok(events.some(event => event.type === 'plantExploded'))
            assert.ok(!world.get(id, ZombieComponent) || world.get(id, ZombieComponent)!.health === 0)
        } else {
            assert.equal(world.get(id, ZombieComponent)!.health, 0)
            assert.notEqual(server.snapshot().plants[0].row, 2)
            assert.deepEqual(events.find(event => event.type === 'bowlingImpact')!.data, {
                entityId: id, typeId: 'pvz:normal', helm: false,
            })
        }
        const restored = new IntegratedGameServer(definitions, levels)
        restored.start({ ...options, save: server.save() as unknown as JsonValue })
        for (let tick = 0; tick < 40; tick++) assert.deepEqual(restored.tick(), server.tick())
    }
})
