import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { IntegratedGameClient } from '@/client/game/IntegratedGameClient'
import { LocalGameChannel } from '@/shared/channel/index'
import { parseGameplayDefinitionsV2, parseGameplayLevelsV2 } from '@/shared/content/gameplay'

const source = (name: string): unknown => JSON.parse(
    readFileSync(`tools/content/pvz-base/gameplay/${name}.json`, 'utf8'),
)
const definitions = parseGameplayDefinitionsV2(source('definitions'))
const levels = parseGameplayLevelsV2(source('levels'), definitions)

test('integrated client hides channel packets behind start, command, update, and render', () => {
    const game = new LocalIntegratedGame(definitions, levels)
    game.start({
        levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0,
        firstAdventure: false, mods: [],
    })
    assert.equal(game.render().tick, 0)

    game.command({ type: 'completeIntro' })
    game.command({ type: 'selectSeed', seedId: 'pvz:peashooter' })
    game.command({ type: 'placePlant', row: 2, column: 0 })
    game.update(0.015)
    assert.equal(game.render().plants.length, 1)
    assert.equal(game.render().tick, 2)
    assert.equal(game.drainEvents().some(event => event.type === 'plantPlaced'), true)
    assert.equal(game.drainChanges().added.includes(2), true)

    game.requestSave()
    game.update(0)
    assert.equal((game.lastSave as { schemaVersion: number }).schemaVersion, 2)
})

test('integrated client receives every authority-changing boundary command at a newer tick', () => {
    const game = new LocalIntegratedGame(definitions, levels)
    game.start({
        levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0,
        firstAdventure: false, mods: [],
    })
    assert.deepEqual(
        [game.render().tick, game.render().gameplayTick, game.render().phase, game.render().paused],
        [0, 0, 'intro', false],
    )

    game.command({ type: 'completeIntro' })
    game.update(0)
    assert.deepEqual(
        [game.render().tick, game.render().gameplayTick, game.render().phase, game.render().paused],
        [1, 0, 'gameplay', false],
    )

    game.command({ type: 'pause' })
    game.update(0)
    assert.deepEqual(
        [game.render().tick, game.render().gameplayTick, game.render().phase, game.render().paused],
        [2, 0, 'gameplay', true],
    )

    game.command({ type: 'resume' })
    game.update(0)
    assert.deepEqual(
        [game.render().tick, game.render().gameplayTick, game.render().phase, game.render().paused],
        [3, 0, 'gameplay', false],
    )

    game.command({ type: 'completeIntro' })
    game.update(0)
    assert.equal(game.render().tick, 3)
})

test('integrated client ignores stale frames and duplicate event IDs', () => {
    const sourceGame = new LocalIntegratedGame(definitions, levels)
    sourceGame.start({
        levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0,
        firstAdventure: false, mods: [],
    })
    const snapshot = sourceGame.render()
    const channel = new LocalGameChannel()
    const client = new IntegratedGameClient(channel)
    channel.sendToClient({
        protocolVersion: 1, type: 'sessionStarted', acknowledgedSequence: 1, snapshot,
    })
    channel.sendToClient({
        protocolVersion: 1, type: 'frame', serverTick: snapshot.tick + 1,
        acknowledgedSequence: 1, snapshot: { ...snapshot, tick: snapshot.tick + 1 },
        events: [{ eventId: 1, type: 'first', data: {} }],
    })
    channel.sendToClient({
        protocolVersion: 1, type: 'frame', serverTick: snapshot.tick + 1,
        acknowledgedSequence: 1, snapshot: { ...snapshot, tick: snapshot.tick + 1 }, events: [
            { eventId: 1, type: 'duplicate', data: {} },
            { eventId: 2, type: 'stale', data: {} },
        ],
    })
    channel.sendToClient({
        protocolVersion: 1, type: 'frame', serverTick: snapshot.tick + 2,
        acknowledgedSequence: 1, snapshot: { ...snapshot, tick: snapshot.tick + 2 }, events: [
            { eventId: 1, type: 'duplicate', data: {} },
            { eventId: 2, type: 'second', data: {} },
        ],
    })

    client.update()

    assert.equal(client.render().tick, snapshot.tick + 2)
    assert.deepEqual(client.drainEvents().map(event => [event.eventId, event.type]), [
        [1, 'first'],
        [2, 'second'],
    ])
})

test('integrated client rejects an event gap on the local channel', () => {
    const game = new LocalIntegratedGame(definitions, levels)
    game.start({
        levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0,
        firstAdventure: false, mods: [],
    })
    const channel = new LocalGameChannel()
    const client = new IntegratedGameClient(channel)
    const snapshot = game.render()
    channel.sendToClient({
        protocolVersion: 1, type: 'sessionStarted', acknowledgedSequence: 1, snapshot,
    })
    channel.sendToClient({
        protocolVersion: 1, type: 'frame', serverTick: snapshot.tick + 1,
        acknowledgedSequence: 1, snapshot: { ...snapshot, tick: snapshot.tick + 1 },
        events: [{ eventId: 2, type: 'gap', data: {} }],
    })

    assert.throws(() => client.update(), /Server event gap: expected 1, received 2/)
})
