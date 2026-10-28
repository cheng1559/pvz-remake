import assert from 'node:assert/strict'
import test from 'node:test'

import { attachReanimPose, parseReanim, sampleReanimTrack } from '@/shared/content/reanim'

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

test('Reanim parses strict second-based tracks', () => {
    const parsed = parseReanim(reanim())
    assert.equal(parsed.id, 'pvz:sunflower')
    assert.equal(parsed.tracks[0]?.keyframes[1]?.timeSeconds, 1)
    assert.equal(parsed.tracks[0]?.keyframes[1]?.interpolation, 'step')
})

test('Reanim rejects malformed animation data', () => {
    const invalid = (change: (value: any) => void) => {
        const value = structuredClone(reanim())
        change(value)
        return () => parseReanim(value)
    }

    assert.throws(invalid(value => { value.extra = true }), /not supported/)
    assert.throws(invalid(value => { value.id = 'sunflower' }), /qualified ID/)
    assert.throws(invalid(value => { value.tracks[0].keyframes[1].timeSeconds = 0 }), /must increase/)
    assert.throws(invalid(value => { value.tracks[0].keyframes[0].alpha = 2 }), /between 0 and 1/)
    assert.throws(invalid(value => { value.tracks[0].keyframes[0].sprite = '../petal' }), /qualified ID/)
    assert.throws(invalid(value => { value.tracks.push(value.tracks[0]) }), /duplicate reanim track/)
})

test('Reanim samples linear values and discrete sprites', () => {
    const track = parseReanim(reanim()).tracks[0]
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

test('Reanim finds the correct keyframes after forward and backward seeks', () => {
    const track = parseReanim(reanim()).tracks[0]
    const original = track.keyframes[0]
    track.keyframes = Array.from({ length: 8 }, (_, timeSeconds) => ({
        ...original, timeSeconds, x: timeSeconds * 10,
        sprite: timeSeconds === 4 ? null : original.sprite,
        interpolation: timeSeconds === 5 ? 'step' : 'linear',
    }))
    assert.equal(sampleReanimTrack(track, 6.5)?.x, 65)
    assert.equal(sampleReanimTrack(track, 4)?.sprite, null)
    assert.equal(sampleReanimTrack(track, 1.5)?.x, 15)
    assert.equal(sampleReanimTrack(track, 5.5)?.x, 50)
    assert.equal(sampleReanimTrack(track, 9)?.x, 70)
    assert.equal(sampleReanimTrack(track, -1), null)
})

test('Reanim attachment applies parent motion relative to its base pose', () => {
    const child = parseReanim(reanim()).tracks[0].keyframes[0]
    const base = { ...child, x: 10, y: 20, scaleX: 2, scaleY: 2 }
    const current = { ...base, x: 14, y: 18 }
    const attached = attachReanimPose(child, current, base)

    assert.equal(attached.x, 4)
    assert.equal(attached.y, -2)
    assert.equal(attached.scaleX, 1)
    assert.equal(attached.scaleY, 1)
})
