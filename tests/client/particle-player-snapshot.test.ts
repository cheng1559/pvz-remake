import assert from 'node:assert/strict'
import test from 'node:test'

import {
    parseParticlePlayerSnapshot,
    validateParticlePlayerSnapshotContent,
} from '@/client/particle/ParticlePlayerSnapshot'

const data = { id: 'pvz:peasplat', durationSeconds: 0.2 }

function snapshot(): any {
    return {
        id: 'pvz:peasplat',
        seed: 0xffffffff,
        ageTicks: 7,
        playing: true,
        visible: true,
        accumulatorSeconds: 0.005,
    }
}

test('Particle player snapshot round-trips strict playback state', () => {
    const value = snapshot()
    const parsed = parseParticlePlayerSnapshot(JSON.parse(JSON.stringify(value)))
    assert.deepEqual(validateParticlePlayerSnapshotContent(parsed, data), value)
})

test('Particle player snapshot rejects malformed state', () => {
    const invalid = (change: (value: any) => void) => {
        const value = snapshot()
        change(value)
        return () => parseParticlePlayerSnapshot(value)
    }

    const invalidContent = (change: (value: any) => void) => {
        const value = snapshot()
        change(value)
        return () => validateParticlePlayerSnapshotContent(parseParticlePlayerSnapshot(value), data)
    }

    assert.throws(invalid(value => { value.node = {} }), /node is not supported/)
    assert.throws(invalid(value => { value.id = 'peasplat' }), /qualified ID/)
    assert.throws(invalid(value => { value.seed = 0x100000000 }), /uint32/)
    assert.throws(invalid(value => { value.playing = 1 }), /must be boolean/)
    assert.throws(invalid(value => { value.visible = null }), /must be boolean/)
    assert.throws(invalid(value => { value.accumulatorSeconds = 0.01 }), /within one tick/)
    assert.throws(invalidContent(value => { value.id = 'pvz:other' }), /ID mismatch/)
    assert.throws(invalidContent(value => { value.ageTicks = 21 }), /exceeds effect duration/)
})
