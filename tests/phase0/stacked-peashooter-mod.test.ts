import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'

import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import { GameplaySystemMods } from '@/server/GameplaySystemMods'
import { parseGameplayDefinitionsV2, parseGameplayLevelsV2 } from '@/shared/content/gameplay'
import type { JsonValue, StartSessionPacket } from '@/shared/protocol'
import { runCommand } from '../server/run-command'

const source = (name: string): unknown => JSON.parse(
    readFileSync(`tools/content/pvz-base/gameplay/${name}.json`, 'utf8'),
)

interface GameplayModule {
    register(api: { registerPlantUpgrade(upgrade: {
        seedId: string
        targetPlantId: string
        resultSeedId: string
    }): void }): void
}

test('Peashooter stays plantable on empty cells and upgrades an occupied Peashooter', async () => {
    const definitions = parseGameplayDefinitionsV2(source('definitions'))
    const levels = parseGameplayLevelsV2(source('levels'), definitions)
    const level = levels.levels['pvz:adventure-1-1']
    levels.levels['pvz:adventure-1-1'] = {
        ...level,
        startingSun: 300,
    }
    const mods = new GameplaySystemMods()
    const module = await import(pathToFileURL(resolve(
        'spikes/phase0/stacked-peashooter-mod/gameplay/node/index.js',
    )).href) as GameplayModule
    module.register(mods.forMod('phase0:stacked-peashooter'))
    const server = new IntegratedGameServer(definitions, levels, mods)
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
    server.start(packet)
    runCommand(server, { type: 'completeIntro' })
    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    runCommand(server, { type: 'placePlant', row: 2, column: 0 })
    const firstEntity = server.snapshot().plants[0].entityId
    while (server.save().gameplayTick < definitions.seeds['pvz:peashooter'].cooldownTicks) server.tick()

    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 1 }), undefined)
    assert.deepEqual(server.snapshot().plants.map(plant => plant.typeId), ['pvz:peashooter', 'pvz:peashooter'])
    while (server.save().gameplayTick < definitions.seeds['pvz:peashooter'].cooldownTicks * 2) server.tick()

    runCommand(server, { type: 'selectSeed', seedId: 'pvz:peashooter' })
    assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 0 }), undefined)

    const snapshot = server.snapshot()
    assert.equal(snapshot.sun, 0)
    assert.equal(snapshot.plants.length, 2)
    const repeater = snapshot.plants.find(plant => plant.typeId === 'pvz:repeater')!
    assert.notEqual(repeater.entityId, firstEntity)
    assert.equal(repeater.seedId, 'pvz:repeater')
    assert.equal(server.drainEvents().at(-1)?.data.typeId, 'pvz:repeater')
    const restoredMods = new GameplaySystemMods()
    module.register(restoredMods.forMod('phase0:stacked-peashooter'))
    const restored = new IntegratedGameServer(definitions, levels, restoredMods)
    restored.start({ ...packet, save: server.save() as unknown as JsonValue })
    assert.equal(restored.snapshot().plants.some(plant => plant.typeId === 'pvz:repeater'), true)
})
