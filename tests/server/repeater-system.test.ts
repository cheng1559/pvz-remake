import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import { parseGameplayDefinitionsV2, parseGameplayLevelsV2 } from '@/shared/content/gameplay'
import type { JsonValue, StartSessionPacket } from '@/shared/protocol'
import { runCommand } from './run-command'

const source = (name: string): unknown => JSON.parse(
    readFileSync(`tools/content/pvz-base/gameplay/${name}.json`, 'utf8'),
)

test('Repeater fires twice 26 ticks apart and restores between shots', () => {
    const definitions = parseGameplayDefinitionsV2(source('definitions'))
    const levels = parseGameplayLevelsV2(source('levels'), definitions)
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
    ;(server as unknown as { spawnZombie(typeId: string, row: number, x: number): number })
        .spawnZombie('pvz:normal', 2, 400)
    server.drainEvents()

    while (server.save().gameplayTick < 100) server.tick()
    assert.deepEqual(server.drainEvents().map(event => event.type).filter(type =>
        type === 'plantFiring' || type === 'projectileFired'),
    ['plantFiring', 'projectileFired', 'plantFiring'])
    const restored = new IntegratedGameServer(definitions, levels)
    restored.start({ ...packet, save: server.save() as unknown as JsonValue })
    restored.drainEvents()

    while (restored.save().gameplayTick < 125) restored.tick()
    assert.equal(restored.drainEvents().some(event => event.type === 'projectileFired'), false)
    restored.tick()
    assert.deepEqual(restored.drainEvents().map(event => event.type).filter(type =>
        type === 'plantFiring' || type === 'projectileFired'),
    ['projectileFired'])
    while (restored.save().gameplayTick < 200) restored.tick()
    assert.equal(restored.drainEvents().some(event => event.type === 'projectileFired'), false)
})
