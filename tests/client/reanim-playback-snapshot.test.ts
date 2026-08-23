import assert from 'node:assert/strict'
import test from 'node:test'

import {
    parseReanimPlaybackSnapshot,
    validateReanimPlaybackSnapshotContent,
} from '@/client/reanim/ReanimPlaybackSnapshot'
import { parseReanimV2 } from '@/shared/content/reanim'

const data = parseReanimV2({
    schemaVersion: 2,
    id: 'pvz:peashooter_idle',
    durationSeconds: 2,
    tracks: [{
        id: 'head',
        zIndex: 0,
        keyframes: [{
            timeSeconds: 0,
            x: 1,
            y: 2,
            scaleX: 1,
            scaleY: 1,
            skewX: 0,
            skewY: 0,
            alpha: 1,
            sprite: 'pvz:peashooter_head',
            interpolation: 'linear',
        }],
    }],
})

function snapshot(): any {
    return {
        id: 'pvz:peashooter_idle',
        timeSeconds: 0.75,
        playing: true,
        loop: true,
        rate: 1.25,
        visible: true,
        hideOnFinish: false,
        extraAdditive: true,
        extraAdditiveColor: { r: 12, g: 34, b: 56, a: 78 },
        blend: {
            durationSeconds: 0.2,
            elapsedSeconds: 0.05,
            fromPoses: [{
                trackId: 'head',
                pose: {
                    timeSeconds: 0.5,
                    x: 1,
                    y: 2,
                    scaleX: 1,
                    scaleY: 1,
                    skewX: 3,
                    skewY: 4,
                    alpha: 0.9,
                    sprite: 'pvz:peashooter_head',
                    interpolation: 'step',
                },
            }],
        },
        attachmentTrackId: 'anim_head1',
    }
}

test('Reanim playback snapshot preserves serializable presentation state', () => {
    const value = snapshot()
    const parsed = parseReanimPlaybackSnapshot(JSON.parse(JSON.stringify(value)))
    assert.deepEqual(validateReanimPlaybackSnapshotContent(parsed, data), value)
    assert.equal('parent' in value, false)
    assert.equal('callback' in value, false)
})

test('Reanim playback snapshot rejects malformed state', () => {
    const invalid = (change: (value: any) => void) => {
        const value = snapshot()
        change(value)
        return () => parseReanimPlaybackSnapshot(value)
    }

    const invalidContent = (change: (value: any) => void) => {
        const value = snapshot()
        change(value)
        return () => validateReanimPlaybackSnapshotContent(parseReanimPlaybackSnapshot(value), data)
    }

    assert.throws(invalid(value => { value.node = {} }), /node is not supported/)
    assert.throws(invalid(value => { value.id = 'peashooter' }), /qualified ID/)
    assert.throws(invalid(value => { value.extraAdditiveColor.r = 1.5 }), /integer between 0 and 255/)
    assert.throws(invalid(value => { value.blend.elapsedSeconds = 0.2 }), /within the blend duration/)
    assert.throws(invalid(value => { value.blend.fromPoses.push(value.blend.fromPoses[0]) }), /duplicate/)
    assert.throws(invalid(value => { value.blend.fromPoses[0].pose.alpha = 2 }), /between 0 and 1/)
    assert.throws(invalid(value => { value.blend.fromPoses[0].pose.sprite = 'head.png' }), /qualified ID/)
    assert.throws(invalid(value => { value.attachmentTrackId = '' }), /non-empty string/)
    assert.throws(invalidContent(value => { value.id = 'pvz:other' }), /cannot restore/)
    assert.throws(invalidContent(value => { value.timeSeconds = 2 }), /outside the animation duration/)
    assert.throws(invalidContent(value => { value.blend.fromPoses[0].trackId = 'unknown' }), /is not in/)
})
