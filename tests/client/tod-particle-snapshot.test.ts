import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { parseTodParticleSystemSnapshot, TodParticleRng } from '@/core/Particle/TodParticleSnapshot'

test('legacy TodParticle seed and snapshot validate deterministic replay inputs', () => {
    assert.doesNotMatch(
        readFileSync('assets/scripts/core/Particle/TodParticle.ts', 'utf8'),
        /Math\.random/,
    )
    const first = new TodParticleRng(123)
    const second = new TodParticleRng(123)
    assert.deepEqual(
        Array.from({ length: 20 }, () => first.nextFloat()),
        Array.from({ length: 20 }, () => second.nextFloat()),
    )

    const snapshot = {
        effect: 'peasplat', seed: 123, ageTicks: 25, accumulator: 0.005,
        renderOrder: 10000, tint: { r: 1, g: 2, b: 3, a: 255 },
        extraAdditive: true, imageOverride: null, useGameTime: false, scale: 1.5,
    }
    assert.deepEqual(parseTodParticleSystemSnapshot(snapshot), snapshot)
    assert.throws(() => parseTodParticleSystemSnapshot({ ...snapshot, unknown: true }), /unknown is not supported/)
    assert.throws(() => parseTodParticleSystemSnapshot({ ...snapshot, seed: -1 }), /seed/)
    assert.throws(() => parseTodParticleSystemSnapshot({ ...snapshot, accumulator: 0.01 }), /below one tick/)
    assert.throws(() => parseTodParticleSystemSnapshot({
        ...snapshot, tint: { ...snapshot.tint, r: 256 },
    }), /tint.r/)
})
