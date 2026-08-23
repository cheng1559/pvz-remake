import assert from 'node:assert/strict'
import test from 'node:test'

import { IntegratedGameClient } from '@/client/game/IntegratedGameClient'
import { parseClientPresentationSnapshotV2 } from '@/client/game/ClientPresentationSnapshot'
import { LocalGameChannel } from '@/shared/channel/index'
import type { WorldSnapshot } from '@/shared/protocol/index'
import { adventure11Presentation } from './adventure11-test-snapshot'

function snapshot(tick: number, x: number): WorldSnapshot {
    return {
        levelId: 'pvz:adventure-1-1', tick, gameplayTick: tick, phase: 'gameplay', result: 'playing', paused: false,
        sun: 50, availableSun: 50, money: 0, wave: { index: 0, total: 4, countdown: 10 },
        cursor: { mode: 'none' }, seedPackets: [], conveyorPackets: [],
        plants: [], zombies: [], projectiles: [{ entityId: 1, typeId: 'pvz:pea', x, y: 20, row: 2 }],
        items: [], lawnMowers: [], tutorial: { id: 'pvz:adventure-1-1', step: 'complete' }, extensions: {},
    }
}

test('client presentation snapshot restores interpolation, sequence, and consumed event baseline', () => {
    const sourceChannel = new LocalGameChannel()
    const source = new IntegratedGameClient(sourceChannel)
    source.start({
        levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [],
    })
    sourceChannel.sendToClient({
        protocolVersion: 1, type: 'sessionStarted', acknowledgedSequence: 1, snapshot: snapshot(1, 10),
    })
    sourceChannel.sendToClient({
        protocolVersion: 1, type: 'frame', serverTick: 2, acknowledgedSequence: 1,
        snapshot: snapshot(2, 20), events: [{ eventId: 1, type: 'played', data: {} }],
    })
    source.update()
    source.drainEvents()

    const saved = source.snapshot(adventure11Presentation(source.world.current!))
    const restoredChannel = new LocalGameChannel()
    const restored = new IntegratedGameClient(restoredChannel)
    restored.restore(JSON.parse(JSON.stringify(saved)))
    assert.equal(restored.render(0.5).projectiles[0].x, 15)
    assert.deepEqual(restored.drainChanges(), { added: [1], removed: [] })

    restored.command({ type: 'clearCursor' })
    assert.equal(restoredChannel.drainServerPackets()[0].sequence, 2)
    restoredChannel.sendToClient({
        protocolVersion: 1, type: 'frame', serverTick: 3, acknowledgedSequence: 2,
        snapshot: snapshot(3, 30), events: [
            { eventId: 1, type: 'duplicate', data: {} },
            { eventId: 2, type: 'new', data: {} },
        ],
    })
    restored.update()
    assert.deepEqual(restored.drainEvents().map(event => event.type), ['new'])

    assert.throws(
        () => parseClientPresentationSnapshotV2({ ...saved, extra: true }),
        /extra is not supported/,
    )
    assert.throws(
        () => parseClientPresentationSnapshotV2({ ...saved, adventure11: { ...saved.adventure11, extra: true } }),
        /extra is not supported/,
    )
    assert.throws(
        () => parseClientPresentationSnapshotV2({
            ...saved,
            transport: { ...saved.transport, previous: saved.transport.current },
        }),
        /previous tick must be below current tick/,
    )
    assert.throws(
        () => parseClientPresentationSnapshotV2({
            ...saved,
            adventure11: {
                ...saved.adventure11,
                advice: { ...saved.adventure11.advice, lastSyncedTick: saved.transport.current.gameplayTick + 1 },
            },
        }),
        /presenter ticks must match/,
    )
    assert.throws(
        () => parseClientPresentationSnapshotV2({
            ...saved,
            adventure11: {
                ...saved.adventure11,
                entities: [{ kind: 'sun', entityId: 999, animation: null }],
            },
        }),
        /sun 999 is not in the current frame/,
    )
})
