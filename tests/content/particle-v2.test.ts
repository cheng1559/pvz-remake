import assert from 'node:assert/strict'
import test from 'node:test'

import { ParticleSimulation, parseParticleV2 } from '@/shared/content/particle'

const track = (low: number, high = low, end?: number) => ({
    nodes: end == null
        ? [{ timeRatio: 0, low, high }]
        : [{ timeRatio: 0, low, high }, { timeRatio: 1, low: end, high: end }],
})

function peasplat() {
    const emitter = (sprite: string) => ({
        sprite,
        columns: 4,
        rows: 1,
        firstFrame: 0,
        frameCount: 4,
        durationSeconds: 0.2,
        emitterOffsetX: track(0),
        emitterOffsetY: track(0),
        spawnMinActive: track(1),
        spawnMaxLaunched: track(1),
        emitterRadius: track(0, 10),
        particleDurationSeconds: track(0.2),
        launchSpeed: track(0),
        particleAlpha: track(0.9, 0.9, 0),
        particleScale: track(0.4, 0.6, 1),
        particleSpinSpeed: track(0),
        randomLaunchSpin: true,
        fields: [],
    })
    return {
        schemaVersion: 2,
        id: 'pvz:peasplat',
        durationSeconds: 0.2,
        emitters: [
            emitter('pvz:pea_splats'),
            {
                ...emitter('pvz:pea_particles'),
                columns: 3,
                frameCount: 3,
                spawnMinActive: track(6, 10),
                spawnMaxLaunched: track(-1),
                launchSpeed: track(150),
                particleAlpha: track(1, 1, 0),
                particleScale: track(0.8, 1.2),
                particleSpinSpeed: track(-200, 200),
                fields: [
                    { type: 'friction', x: track(0, 0, 0.1), y: track(0, 0, 0.1) },
                    { type: 'acceleration', x: track(0), y: track(1000) },
                ],
            },
        ],
    }
}

test('ParticleV2 strictly parses the two-emitter peasplat', () => {
    const parsed = parseParticleV2(peasplat())
    assert.equal(parsed.id, 'pvz:peasplat')
    assert.equal(parsed.emitters.length, 2)
    assert.equal(parsed.emitters[1].fields[1].type, 'acceleration')
})

test('ParticleV2 rejects unsupported and unsafe data', () => {
    const invalid = (change: (value: any) => void) => {
        const value = structuredClone(peasplat())
        change(value)
        return () => parseParticleV2(value)
    }
    assert.throws(invalid(value => { value.extra = true }), /not supported/)
    assert.throws(invalid(value => { value.id = 'peasplat' }), /qualified ID/)
    assert.throws(invalid(value => { value.emitters[0].sprite = '../pea' }), /qualified ID/)
    assert.throws(invalid(value => { value.emitters[0].fields = [{ type: 'attractor', x: track(0), y: track(0) }] }), /friction or acceleration/)
    assert.throws(invalid(value => { value.emitters[0].particleAlpha.nodes[0].high = 2 }), /out of range/)
    assert.throws(invalid(value => { value.emitters[0].spawnMinActive.nodes[0].high = 5000 }), /out of range/)
    assert.throws(invalid(value => { delete value.emitters[0].emitterOffsetX }), /emitterOffsetX is required/)
    assert.throws(invalid(value => { value.emitters[0].emitterOffsetY.nodes[0].high = 1_000_001 }), /out of range/)
    assert.throws(invalid(value => { value.durationSeconds = 100 }), /too large/)
})

test('ParticleSimulation produces the same pose for the same seed', () => {
    const definition = parseParticleV2(peasplat())
    const left = new ParticleSimulation(definition, 12345)
    const right = new ParticleSimulation(definition, 12345)
    const different = new ParticleSimulation(definition, 54321)
    left.advance(8)
    right.advance(8)
    different.advance(8)
    assert.deepEqual(left.pose(), right.pose())
    assert.notDeepEqual(left.pose(), different.pose())
})

test('ParticleSimulation applies emitter offsets to its poses', () => {
    const value = peasplat()
    const baseline = new ParticleSimulation(parseParticleV2(structuredClone(value)), 1)
    value.emitters[0].emitterOffsetX = track(25)
    value.emitters[0].emitterOffsetY = track(35)
    const simulation = new ParticleSimulation(parseParticleV2(value), 1)
    baseline.advance()
    simulation.advance()

    assert.equal(simulation.pose()[0].x - baseline.pose()[0].x, 25)
    assert.equal(simulation.pose()[0].y - baseline.pose()[0].y, 35)
})

test('ParticleSimulation restores by replaying its seed and age', () => {
    const definition = parseParticleV2(peasplat())
    const source = new ParticleSimulation(definition, 7)
    source.advance(9)
    source.playing = false
    source.visible = false
    const snapshot = source.snapshot()

    const restored = new ParticleSimulation(definition, 7)
    restored.restore(snapshot)
    assert.deepEqual(restored.snapshot(), snapshot)
    restored.visible = true
    source.visible = true
    assert.deepEqual(restored.pose(), source.pose())
    assert.throws(() => restored.restore({ ...snapshot, ageTicks: 21 }), /exceeds effect duration/)
})
