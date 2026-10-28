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

test('an extra additive image takes the track alpha once, as Reanimation::DrawTrack', async () => {
    const { loadKernel, Header, BLEND, IMAGE } = await import('@/shared/kernel/index')
    const api = await loadKernel()
    // One keyframe at 50% alpha: time, x, y, scaleX, scaleY, skewX, skewY, alpha, interpolation, image slot.
    const keys = new Float64Array([0, 0, 0, 1, 1, 0, 0, 0.5, 0, 0])
    const state = new Float64Array(Header.SIZE + 4 + BLEND + IMAGE)
    state.set([1, 0, 1, 0], Header.SIZE + 4 + BLEND)
    for (const field of ['RED', 'GREEN', 'BLUE', 'ALPHA', 'EXTRA_RED', 'EXTRA_GREEN', 'EXTRA_BLUE', 'EXTRA_ALPHA'] as const) state[Header[field]] = 255
    Object.assign(state, { [Header.EXTRA]: 1, [Header.OPACITY]: 1, [Header.STRIDE]: 9, [Header.TRACKS]: 1, [Header.CAPACITY]: 2,
        [Header.IMAGES]: 1, [Header.END]: 1, [Header.MATRIX_A]: 1, [Header.MATRIX_D]: 1 })
    const positions = new Float32Array(2 * 4 * 9), vertices = new Float32Array(2 * 4 * 9)
    assert.equal(api.writeReanim(keys, new Int32Array([0, 1, -1, 1]), state, positions, vertices), 2)
    // Alpha sits at offset 8 of each vertex; the additive copy is marked by a negative alpha.
    assert.deepEqual([vertices[8], vertices[4 * 9 + 8]], [128, -128])
})
