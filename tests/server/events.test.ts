import assert from 'node:assert/strict'
import test from 'node:test'

import {
    createEventQueue,
    drainServerEvents,
    emitServerEvent,
} from '@/server/events'

test('server events are JSON-safe, monotonic, and drained once', () => {
    const queue = createEventQueue()
    emitServerEvent(queue, 'pvz:spawned', { entityId: 3 })
    emitServerEvent(queue, 'pvz:impact', { position: { x: 10, y: 20 } })

    assert.deepEqual(drainServerEvents(queue).map(event => event.eventId), [1, 2])
    assert.deepEqual(drainServerEvents(queue), [])
    assert.equal(emitServerEvent(queue, 'pvz:removed', { entityId: 3 }).eventId, 3)

    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    assert.throws(
        () => emitServerEvent(queue, 'pvz:invalid', cyclic as never),
        /cycle/,
    )
})
