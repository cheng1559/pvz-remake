import assert from 'node:assert/strict'
import test from 'node:test'

import { parseMusicPlaybackSnapshot } from '@/client/music/MusicPlaybackSnapshot'
import { parseAdviceWidgetSnapshot } from '@/client/hud/advice/AdviceWidgetSnapshot'

test('legacy advice snapshot rejects malformed presentation state', () => {
    const snapshot = {
        message: 'Click on the seed packet',
        style: 'tutorial-level1' as const,
        durationTicks: 499.5,
        pulseTick: 12.25,
    }
    assert.deepEqual(parseAdviceWidgetSnapshot(snapshot), snapshot)
    assert.equal(parseAdviceWidgetSnapshot(null), null)
    assert.throws(() => parseAdviceWidgetSnapshot({ ...snapshot, extra: true }), /extra is not supported/)
    assert.throws(() => parseAdviceWidgetSnapshot({ ...snapshot, message: '' }), /non-empty string/)
    assert.throws(() => parseAdviceWidgetSnapshot({ ...snapshot, style: 'unknown' }), /style is invalid/)
    assert.throws(() => parseAdviceWidgetSnapshot({ ...snapshot, pulseTick: Number.NaN }), /pulseTick/)
})

test('legacy music snapshot validates all persistent transport and stem state', () => {
    const snapshot = {
        tuneId: 'day_grasswalk' as const,
        timeSec: 12.5,
        paused: true,
        mainVolume: 1,
        drumsVolume: 0,
        hihatsVolume: 0.5,
        fadeOutCounter: 25,
        fadeOutDuration: 50,
        syncCounter: 3,
        burstState: 'starting' as const,
        burstCounter: 120,
        drumsState: 'on-queued' as const,
        drumsCounter: 0,
        queuedDrumsBoundarySec: 14,
        queuedDrumsAtSec: 12.5,
        queuedDrumsBoundaryWrapped: false,
    }
    assert.deepEqual(parseMusicPlaybackSnapshot(snapshot), snapshot)
    assert.equal(parseMusicPlaybackSnapshot(null), null)
    assert.throws(() => parseMusicPlaybackSnapshot({ ...snapshot, extra: true }), /extra is not supported/)
    assert.throws(() => parseMusicPlaybackSnapshot({ ...snapshot, mainVolume: 1.1 }), /mainVolume/)
    assert.throws(() => parseMusicPlaybackSnapshot({ ...snapshot, fadeOutCounter: 51 }), /fade counters/)
    assert.throws(
        () => parseMusicPlaybackSnapshot({ ...snapshot, drumsState: 'on', queuedDrumsBoundarySec: 14 }),
        /queued drums boundary/,
    )
})
