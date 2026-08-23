import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { createGameSaveV2, parseGameSaveV2 } from '@/app/SaveCoordinator'
import type { ServerSaveSnapshotV2 } from '@/server/save'
import { GameplaySystemMods } from '@/server/GameplaySystemMods'
import { parseGameplayDefinitionsV2, parseGameplayLevelsV2 } from '@/shared/content/gameplay'
import { adventure11Presentation } from './adventure11-test-snapshot'

const source = (name: string): unknown => JSON.parse(
    readFileSync(`tools/content/pvz-base/gameplay/${name}.json`, 'utf8'),
)
const definitions = parseGameplayDefinitionsV2(source('definitions'))
const levels = parseGameplayLevelsV2(source('levels'), definitions)

test('LocalIntegratedGame applies gameplay system Mod enhancements', () => {
    let runs = 0
    const mods = new GameplaySystemMods()
    mods.forMod('test:solar-pea').enhanceSystem('pvz:peashooter', (_context, next, bindings) => {
        assert.equal(bindings.components.plant.name, 'pvz:plant')
        next()
        runs++
    })
    const game = new LocalIntegratedGame(definitions, levels, mods)
    game.start({
        levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0,
        firstAdventure: false, mods: [{ id: 'test:solar-pea', version: '1.0.0', contentHash: 'test' }],
    })
    game.command({ type: 'completeIntro' })
    game.update(0)
    game.update(definitions.tickSeconds)

    assert.equal(runs, 1)
})

test('SaveCoordinator strictly composes matching server and client v2 snapshots', () => {
    const game = new LocalIntegratedGame(definitions, levels)
    game.start({
        levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0,
        firstAdventure: false, mods: [],
    })
    game.requestSave()
    game.update(0)

    const saved = createGameSaveV2({
        profileId: 1,
        mode: 'adventure',
        levelId: 'pvz:adventure-1-1',
        createdAt: 100,
        updatedAt: 200,
        contentSet: {
            base: { id: 'pvz:base', version: '2.0.0', contentHash: 'hash' },
            mods: [],
        },
        server: game.lastSave as unknown as ServerSaveSnapshotV2,
        client: game.snapshotPresentation(adventure11Presentation(game.render())),
    })
    assert.deepEqual(parseGameSaveV2(JSON.parse(JSON.stringify(saved))), saved)

    assert.throws(() => parseGameSaveV2({ ...saved, extra: true }), /extra is not supported/)
    assert.throws(() => parseGameSaveV2({ ...saved, updatedAt: 99 }), /updatedAt/)
    assert.throws(() => parseGameSaveV2({
        ...saved,
        client: {
            ...saved.client,
            transport: {
                ...saved.client.transport,
                current: { ...saved.client.transport.current, tick: saved.server.tick + 1 },
            },
        },
    }), /ticks must match/)
    assert.throws(() => parseGameSaveV2({
        ...saved,
        client: {
            ...saved.client,
            transport: {
                ...saved.client.transport,
                current: {
                    ...saved.client.transport.current,
                    tick: saved.server.tick + 1,
                },
            },
        },
        server: {
            ...saved.server,
            tick: saved.server.tick + 1,
            gameplayTick: saved.server.gameplayTick + 1,
        },
    }), /gameplay ticks must match/)
    assert.throws(() => parseGameSaveV2({
        ...saved,
        contentSet: {
            ...saved.contentSet,
            mods: [{ id: 'example:mod', version: '1.0.0', contentHash: 'other' }],
        },
    }), /must match server mods/)
    assert.throws(() => parseGameSaveV2({
        ...saved,
        client: {
            ...saved.client,
            transport: { ...saved.client.transport, highestEventId: saved.client.transport.highestEventId + 1 },
        },
    }), /events must continue/)
})

test('LocalIntegratedGame returns a server save from the requested boundary', () => {
    const game = new LocalIntegratedGame(definitions, levels)
    game.start({
        levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0,
        firstAdventure: false, mods: [],
    })

    const save = game.saveAtBoundary() as unknown as ServerSaveSnapshotV2

    assert.equal(save.tick, game.render().tick)
    assert.equal(save.levelId, game.render().levelId)
})

test('LocalIntegratedGame finishes a queued gameplay command before saving', () => {
    const game = new LocalIntegratedGame(definitions, levels)
    game.start({
        levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0,
        firstAdventure: false, mods: [],
    })
    game.command({ type: 'completeIntro' })
    game.update(0)
    const beforeTick = game.render().tick
    game.command({ type: 'selectSeed', seedId: 'pvz:peashooter' })

    const save = game.saveAtBoundary() as unknown as ServerSaveSnapshotV2

    assert.equal(save.tick, beforeTick + 1)
    assert.equal(save.seedBank.selectedSeedId, 'pvz:peashooter')
})

test('LocalIntegratedGame saves before a command queued after the request', () => {
    const game = new LocalIntegratedGame(definitions, levels)
    game.start({
        levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0,
        firstAdventure: false, mods: [],
    })
    game.command({ type: 'completeIntro' })
    game.update(0)
    const saveSequence = game.requestSave()
    game.command({ type: 'selectSeed', seedId: 'pvz:peashooter' })

    game.update(0)

    const save = game.lastSave as unknown as ServerSaveSnapshotV2
    assert.equal(game.lastSaveSequence, saveSequence)
    assert.equal(save.seedBank.selectedSeedId, undefined)
    game.update(definitions.tickSeconds)
    assert.equal(game.render().cursor.mode, 'seed')
})

test('LocalIntegratedGame advances every gameplay and session boundary before saving', () => {
    const game = new LocalIntegratedGame(definitions, levels)
    game.start({
        levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0,
        firstAdventure: false, mods: [],
    })
    game.command({ type: 'completeIntro' })
    game.update(0)
    game.command({ type: 'selectSeed', seedId: 'pvz:peashooter' })
    game.command({ type: 'pause' })

    const save = game.saveAtBoundary() as unknown as ServerSaveSnapshotV2

    assert.equal(save.seedBank.selectedSeedId, 'pvz:peashooter')
    assert.equal(save.level.paused, true)
})
