import { readGameplaySource } from '../../tools/content_source'
import assert from 'node:assert/strict'
import test from 'node:test'

import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import { spawnZombie } from '@/server/zombies/spawn'
import type { World } from '@/ecs'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import type { JsonValue, StartSessionPacket } from '@/shared/protocol'
import { runCommand } from './run-command'

const source = readGameplaySource

test('Repeater fires twice 26 ticks apart and restores between shots', () => {
    const definitions = parseGameplayDefinitions(source('definitions'), source('seed-catalog'))
    const levels = parseGameplayLevels(source('levels'), definitions)
    const level = levels.levels['pvz:adventure-1-1']
    levels.levels['pvz:adventure-1-1'] = {
        ...level,
        startingSun: 200,
        seedPackets: ['pvz:repeater'],
    }
    const packet: StartSessionPacket = {
        protocolVersion: 1,
        sequence: 1,
        type: 'startSession',
        levelId: 'pvz:adventure-1-1',
        randomSeed: 1,
        initialMoney: 0,
        firstAdventure: false,
        mods: [],
    }
    const server = new IntegratedGameServer(definitions, levels)
    server.start(packet)
    runCommand(server, { type: 'completeIntro' })
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:repeater' })
    runCommand(server, { type: 'placePlant', row: 2, column: 0 })
    const world = (server as unknown as { requireSession(): { world: World } }).requireSession().world
    spawnZombie(world, definitions, 'pvz:normal', 2, 400, 250)
    server.drainEvents()

    const ready = Math.max(1, server.save().entities.find(entity => entity.plantAttack)!.plantAttack!.readyAtTick)
    const firstShot = ready + definitions.plants['pvz:repeater'].shooter!.windupTicks - 1
    while (server.save().gameplayTick < firstShot) server.tick()
    assert.deepEqual(server.drainEvents().map(event => event.type).filter(type =>
        type === 'plantFiring' || type === 'projectileFired'),
    ['plantFiring', 'projectileFired', 'plantFiring'])
    const restored = new IntegratedGameServer(definitions, levels)
    restored.start({ ...packet, save: server.save() as unknown as JsonValue })
    restored.drainEvents()

    while (restored.save().gameplayTick < firstShot + 25) restored.tick()
    assert.equal(restored.drainEvents().some(event => event.type === 'projectileFired'), false)
    restored.tick()
    assert.deepEqual(restored.drainEvents().map(event => event.type).filter(type =>
        type === 'plantFiring' || type === 'projectileFired'),
    ['projectileFired'])
    server.drainEvents()
    while (server.save().gameplayTick < firstShot + 26) server.tick()
    server.drainEvents()
    for (let tick = 0; tick < 300; tick++) {
        assert.deepEqual(restored.tick(), server.tick(), 'restoring preserves the random cadence and burst phase')
        assert.deepEqual(restored.drainEvents(), server.drainEvents())
    }
})
