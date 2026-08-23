import assert from 'node:assert/strict'
import test from 'node:test'

import { attachReanimPose, parseReanimV2, sampleReanimTrack } from '@/shared/content/reanim'

function reanim() {
    return {
        schemaVersion: 2,
        id: 'pvz:sunflower',
        durationSeconds: 1,
        tracks: [{
            id: 'petal',
            zIndex: 0,
            keyframes: [
                {
                    timeSeconds: 0,
                    x: 0,
                    y: 0,
                    scaleX: 1,
                    scaleY: 1,
                    skewX: 0,
                    skewY: 0,
                    alpha: 1,
                    sprite: 'pvz:sunflower_petal',
                    interpolation: 'linear',
                },
                {
                    timeSeconds: 1,
                    x: 4,
                    y: 2,
                    scaleX: 1,
                    scaleY: 1,
                    skewX: 0,
                    skewY: 0,
                    alpha: 0.8,
                    sprite: null,
                    interpolation: 'step',
                },
            ],
        }],
    }
}

test('ReanimV2 parses strict second-based tracks', () => {
    const parsed = parseReanimV2(reanim())
    assert.equal(parsed.id, 'pvz:sunflower')
    assert.equal(parsed.tracks[0]?.keyframes[1]?.timeSeconds, 1)
    assert.equal(parsed.tracks[0]?.keyframes[1]?.interpolation, 'step')
})

test('ReanimV2 rejects malformed animation data', () => {
    const invalid = (change: (value: any) => void) => {
        const value = structuredClone(reanim())
        change(value)
        return () => parseReanimV2(value)
    }

    assert.throws(invalid(value => { value.extra = true }), /not supported/)
    assert.throws(invalid(value => { value.id = 'sunflower' }), /qualified ID/)
    assert.throws(invalid(value => { value.tracks[0].keyframes[1].timeSeconds = 0 }), /must increase/)
    assert.throws(invalid(value => { value.tracks[0].keyframes[0].alpha = 2 }), /between 0 and 1/)
    assert.throws(invalid(value => { value.tracks[0].keyframes[0].sprite = '../petal' }), /qualified ID/)
    assert.throws(invalid(value => { value.tracks.push(value.tracks[0]) }), /duplicate reanim track/)
})

test('ReanimV2 samples linear values and discrete sprites', () => {
    const track = parseReanimV2(reanim()).tracks[0]
    assert.equal(sampleReanimTrack(track, -0.1), null)
    assert.deepEqual(sampleReanimTrack(track, 0.5), {
        timeSeconds: 0.5,
        x: 2,
        y: 1,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
        alpha: 0.9,
        sprite: 'pvz:sunflower_petal',
        interpolation: 'linear',
    })
    assert.equal(sampleReanimTrack(track, 1)?.sprite, null)
})

test('ReanimV2 attachment applies parent motion relative to its base pose', () => {
    const child = parseReanimV2(reanim()).tracks[0].keyframes[0]
    const base = { ...child, x: 10, y: 20, scaleX: 2, scaleY: 2 }
    const current = { ...base, x: 14, y: 18 }
    const attached = attachReanimPose(child, current, base)

    assert.equal(attached.x, 4)
    assert.equal(attached.y, -2)
    assert.equal(attached.scaleX, 1)
    assert.equal(attached.scaleY, 1)
})
