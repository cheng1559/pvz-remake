import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { readBaseContent } from '../../tools/mod/content'
import { parseParticle } from '@/shared/content/particle'
import { KernelParticles, packParticleEmitters } from '@/shared/kernel/particles'
import { drawParticles as render } from './particle-draw'

const track = (low: number, high = low) => ({ nodes: [{ time: 0, low, high }] })
function peasplat() {
    return { schemaVersion: 3, id: 'pvz:peasplat', emitters: [{
        sprite: 'pvz:pea_particles', columns: 3, rows: 1, firstFrame: 0, frameCount: 3,
        systemDuration: track(20), particleDuration: track(20), spawnMinActive: track(6, 10),
        spawnMaxLaunched: track(10), emitterRadius: track(0, 10), launchSpeed: track(150),
        randomLaunchSpin: true, particleScale: track(.8, 1.2),
        fields: [{ type: 'friction', x: track(.1), y: track(.1) },
            { type: 'acceleration', x: track(0), y: track(10) }],
    }] }
}

test('one particle schema parses built-in and Mod definitions with complete emitter capabilities', () => {
    const parsed = parseParticle(peasplat())
    assert.equal(parsed.emitters[0].fields[1].type, 'acceleration')
    assert.equal(parsed.emitters[0].particleStretch.nodes[0].low, 1)
    const particles = readBaseContent().resources.particles
    assert.ok(Object.keys(particles).length > 0)
    for (const [id, file] of Object.entries(particles)) {
        const particle = parseParticle(JSON.parse(readFileSync(`mods/pvz-base/${file}`, 'utf8')))
        assert.equal(particle.id, id)
    }
})

test('particle format rejects obsolete, unsupported and unsafe definitions', () => {
    const invalid = (change: (value: any) => void) => {
        const value = structuredClone(peasplat()); change(value)
        return () => parseParticle(value)
    }
    assert.throws(invalid(value => { value.schemaVersion = 2 }), /schemaVersion must be 3/)
    assert.throws(invalid(value => { value.extra = true }), /not supported/)
    assert.throws(invalid(value => { value.id = 'peasplat' }), /qualified ID/)
    assert.throws(invalid(value => { value.emitters[0].sprite = '../pea' }), /qualified ID/)
    assert.throws(invalid(value => { value.emitters[0].spawnMinActive.nodes[0].high = 5000 }), /out of range/)
    assert.throws(invalid(value => { value.emitters[0].emitterOffsetX = track(Infinity) }), /out of range/)
    assert.throws(invalid(value => { value.emitters[0].particleLoops = 'yes' }), /must be boolean/)
    assert.throws(invalid(value => { value.emitters[0].fields[0].type = 'invalid' }), /type is invalid/)
})

test('particle replay is deterministic across tick batching, seeds and emitter offsets', () => {
    const definition = parseParticle(peasplat())
    const left = new KernelParticles(packParticleEmitters(definition.emitters), 123, 1)
    const replay = new KernelParticles(packParticleEmitters(definition.emitters), 123, 1)
    const different = new KernelParticles(packParticleEmitters(definition.emitters), 456, 1)
    const movedDefinition = peasplat()
    Object.assign(movedDefinition.emitters[0], { emitterOffsetX: track(25), emitterOffsetY: track(35) })
    const moved = new KernelParticles(packParticleEmitters(parseParticle(movedDefinition).emitters), 123, 1)
    try {
        left.step(8); different.step(8); moved.step(8)
        for (let i = 0; i < 8; i++) replay.step()
        assert.deepEqual(render(left), render(replay))
        assert.notDeepEqual(render(left), render(different))
        const baseline = render(left), offset = render(moved)
        baseline.forEach((particle, index) => {
            assert.ok(Math.abs(offset[index].x - particle.x - 25) < 1e-3)
            assert.ok(Math.abs(offset[index].y - particle.y + 35) < 1e-3)
        })
    } finally { for (const system of [left, replay, different, moved]) system.dispose() }
})


test('original particle easing, bounce and random distributions reach the shared kernel', () => {
    const definition = (curve: string, distribution?: string) => parseParticle({ schemaVersion: 3, id: 'pvz:curve', emitters: [{
        sprite: 'pvz:star', systemDuration: track(101), particleDuration: track(201),
        spawnMinActive: track(1), spawnMaxLaunched: track(1),
        systemAlpha: { nodes: [{ time: 0, low: 0, high: 0, curve }, { time: 1, low: 1, high: 1 }] },
        particleScale: { nodes: [{ time: 0, low: 0, high: 1, ...(distribution ? { distribution } : {}) }] },
    }] })
    for (const [curve, expected] of [['ease-in', 16], ['ease-out', 112], ['ease-in-out', 40], ['fast-in-out', 96], ['bounce', 128]] as const) {
        const particles = new KernelParticles(packParticleEmitters(definition(curve).emitters), 1, 1)
        try { particles.step(26); assert.equal(render(particles)[0].alpha, expected, curve) }
        finally { particles.dispose() }
    }
    const linear = new KernelParticles(packParticleEmitters(definition('linear').emitters), 42, 1)
    const eased = new KernelParticles(packParticleEmitters(definition('linear', 'ease-in').emitters), 42, 1)
    try {
        linear.step(); eased.step()
        assert.ok(Math.abs(render(eased)[0].a - render(linear)[0].a ** 2) < 1e-6)
    } finally { linear.dispose(); eased.dispose() }
})

test('an emitter draws its newest particles first and applies the tint alpha, as TodParticleEmitter', () => {
    // One particle per tick, fading over its life, so age shows in alpha.
    const definition = parseParticle({ schemaVersion: 3, id: 'pvz:trail', emitters: [{
        sprite: 'pvz:star', systemDuration: track(100), particleDuration: track(100), spawnRate: track(100),
        particleAlpha: { nodes: [{ time: 0, low: 1, high: 1 }, { time: 1, low: 0, high: 0 }] },
    }] })
    const particles = new KernelParticles(packParticleEmitters(definition.emitters), 1, 1)
    try {
        particles.step(20)
        const alphas = render(particles).map(particle => particle.alpha)
        assert.ok(alphas.length > 2)
        assert.deepEqual(alphas, [...alphas].sort((a, b) => b - a), 'newest (most opaque) first')
        const faded = render(particles, [255, 255, 255, 128]).map(particle => particle.alpha)
        faded.forEach((alpha, index) => assert.ok(Math.abs(alpha - alphas[index] * 128 / 255) <= 1))
    } finally { particles.dispose() }
})
