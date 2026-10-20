import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { createGameSave, isCompatibleBaseContent, parseGameSave } from '@/app/SaveCoordinator'
import type { ServerSaveSnapshot } from '@/server/save'
import { GameplaySystemMods } from '@/server/GameplaySystemMods'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import type { JsonValue } from '@/shared/protocol'
import { levelPresentation, reanim } from './level-test-snapshot'

const source = (name: string): unknown => JSON.parse(
    readFileSync(`tools/content/pvz-base/gameplay/${name}.json`, 'utf8'),
)
const definitions = parseGameplayDefinitions(source('definitions'))
const levels = parseGameplayLevels(source('levels'), definitions)

test('base save compatibility accepts declared UI-only updates while keeping identity and version checks', () => {
    const installed = { id: 'pvz:base', version: '2.0.0', contentHash: 'new-menu' }
    const saved = { ...installed, contentHash: 'before-menu' }
    assert.equal(isCompatibleBaseContent(installed, installed), true)
    assert.equal(isCompatibleBaseContent(saved, installed), false)
    assert.equal(isCompatibleBaseContent(saved, installed, ['before-menu']), true)
    assert.equal(isCompatibleBaseContent({ ...saved, id: 'other:base' }, installed, ['before-menu']), false)
    assert.equal(isCompatibleBaseContent({ ...saved, version: '1.0.0' }, installed, ['before-menu']), false)
    assert.equal(isCompatibleBaseContent({ ...saved, contentHash: 'different-gameplay' }, installed, ['before-menu']), false)
})

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

test('SaveCoordinator strictly composes matching server and client snapshots', () => {
    const game = new LocalIntegratedGame(definitions, levels)
    game.start({
        levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0,
        firstAdventure: false, mods: [],
    })
    game.requestSave()
    game.update(0)

    const saved = createGameSave({
        profileId: 1,
        mode: 'adventure',
        levelId: 'pvz:adventure-1-1',
        createdAt: 100,
        updatedAt: 200,
        contentSet: {
            base: { id: 'pvz:base', version: '2.0.0', contentHash: 'hash' },
            mods: [],
        },
        server: game.lastSave as unknown as ServerSaveSnapshot,
        client: game.snapshotPresentation(levelPresentation(game.render())),
    })
    assert.deepEqual(parseGameSave(JSON.parse(JSON.stringify(saved))), saved)

    assert.throws(() => parseGameSave({ ...saved, extra: true }), /extra is not supported/)
    assert.throws(() => parseGameSave({ ...saved, updatedAt: 99 }), /updatedAt/)
    assert.throws(() => parseGameSave({
        ...saved,
        client: {
            ...saved.client,
            transport: {
                ...saved.client.transport,
                current: { ...saved.client.transport.current, tick: saved.server.tick + 1 },
            },
        },
    }), /ticks must match/)
    assert.throws(() => parseGameSave({
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
    assert.throws(() => parseGameSave({
        ...saved,
        contentSet: {
            ...saved.contentSet,
            mods: [{ id: 'example:mod', version: '1.0.0', contentHash: 'other' }],
        },
    }), /must match server mods/)
    assert.throws(() => parseGameSave({
        ...saved,
        client: {
            ...saved.client,
            transport: { ...saved.client.transport, highestEventId: saved.client.transport.highestEventId + 1 },
        },
    }), /events must continue/)
})

test('a planted Sunflower survives the complete 1-2 save and restore pipeline', () => {
    const options = {
        levelId: 'pvz:adventure-1-2', randomSeed: 1, initialMoney: 0,
        firstAdventure: true, mods: [],
    }
    const game = new LocalIntegratedGame(definitions, levels)
    game.start(options)
    game.command({ type: 'completeIntro' })
    game.update(0)
    game.command({ type: 'selectSeed', seedId: 'pvz:sunflower' })
    game.command({ type: 'placePlant', row: 2, column: 0 })
    const server = game.saveAtBoundary() as unknown as ServerSaveSnapshot
    const plant = game.render().plants.find(plant => plant.typeId === 'pvz:sunflower')!
    assert.ok(plant)
    const presentation = levelPresentation(game.render())
    presentation.entities.push({
        kind: 'plant', entityId: plant.entityId,
        animations: { body: reanim('pvz:sunflower'), blink: reanim('pvz:sunflower_blink') }, blinkAtTick: 500,
    })
    const saved = createGameSave({
        profileId: 1, mode: 'adventure', levelId: options.levelId, createdAt: 100, updatedAt: 200,
        contentSet: { base: { id: 'pvz:base', version: '2.0.0', contentHash: 'hash' }, mods: [] },
        server, client: game.snapshotPresentation(presentation),
    })
    const parsed = parseGameSave(JSON.parse(JSON.stringify(saved)))
    const restored = new LocalIntegratedGame(definitions, levels)
    restored.start({ ...options, save: parsed.server as unknown as JsonValue })
    assert.deepEqual(restored.restorePresentation(parsed.client), presentation)
    assert.deepEqual(restored.render(), game.render())

    const missingPlant = JSON.parse(JSON.stringify(parsed.client))
    missingPlant.transport.current.plants = []
    assert.throws(() => restored.restorePresentation(missingPlant), /plant .* is not in the current frame/)
})

test('LocalIntegratedGame returns a server save from the requested boundary', () => {
    const game = new LocalIntegratedGame(definitions, levels)
    game.start({
        levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0,
        firstAdventure: false, mods: [],
    })

    const save = game.saveAtBoundary() as unknown as ServerSaveSnapshot

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

    const save = game.saveAtBoundary() as unknown as ServerSaveSnapshot

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

    const save = game.lastSave as unknown as ServerSaveSnapshot
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

    const save = game.saveAtBoundary() as unknown as ServerSaveSnapshot

    assert.equal(save.seedBank.selectedSeedId, 'pvz:peashooter')
    assert.equal(save.level.paused, true)
})
