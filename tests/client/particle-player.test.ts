import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { loadScript } from '../loadScript'
import { parseParticle, type ParticleTrackCurve } from '@/shared/content/particle'
import * as renderOrderModule from '@/shared/content/renderOrder'
const parseDefinition = (value: { emitters: unknown[] }) => parseParticle({ schemaVersion: 3, id: 'pvz:test', ...value })

import { parseParticlePlayerSnapshot } from '@/client/particle/ParticlePlayerSnapshot'
import { drawParticles } from '../content/particle-draw'

test('empty converted particles preload and expire without hiding image loading failures', async () => {
    const { KernelParticles, packParticleEmitters } = await import('@/shared/kernel/particles')
    const empty = parseParticle(JSON.parse(readFileSync('mods/pvz-base/assets/particles/circleevenspacing.json', 'utf8')))
    assert.equal(empty.emitters.length, 0)
    const definitions = new Map([[empty.id, empty], ['test:missing-image', parseParticle({
        schemaVersion: 3, id: 'test:missing-image', emitters: [{ sprite: 'test:missing' }],
    })]])
    definitions.set('test:flash', parseParticle({
        schemaVersion: 3, id: 'test:flash', emitters: [{ sprite: 'test:missing', fullScreen: true }],
    }))
    const whiteTexture = {}
    const modules: Record<string, unknown> = {
        cc: {
            builtinResMgr: { get: (id: string) => id === 'white-texture' ? whiteTexture : undefined },
            SpriteFrame: class {
                originalSize = { width: 2, height: 2 }
                trimmedBorder = { x: 0, y: 0, z: 0, w: 0 }
                uv = [0, 1, 1, 1, 0, 0, 1, 0]
            },
        },
        '@/shared/kernel/index': await import('@/shared/kernel/index'),
        '@/client/content/ModResources': { modResources: {
            ids: async (kind: string) => kind === 'particles' ? [empty.id] : [],
            json: async (kind: string, id: string) => kind === 'particles' ? JSON.parse(JSON.stringify(definitions.get(id))) : undefined,
            sprite: async () => { throw new Error('image unavailable') },
        } },
        '@/shared/content/particle': { parseParticle },
        '@/client/content/preloadTasks': { preloadTasks: async (tasks: (() => Promise<unknown>)[]) => {
            for (const task of tasks) await task()
        } },
        '@/shared/kernel/particles': { packParticleEmitters },
    }
    const exports = loadScript('assets/scripts/client/particle/ParticleAssets.ts', (id: string) => modules[id] ?? {}, { console: { warn() {} } })
    await exports.ParticleAssets.preloadAll()
    const flash = await exports.ParticleAssets.load('test:flash', 'test:missing-override')
    assert.equal(flash.emitters[0].frame.texture, whiteTexture, 'a full-screen fill draws even with no loadable sprite')
    const loaded = exports.ParticleAssets.get(empty.id)
    assert.equal(loaded.emitters.length, 0)
    const system = new KernelParticles(loaded.packed, 1, 0)
    try { assert.equal(system.dead, true) } finally { system.dispose() }
    await assert.rejects(exports.ParticleAssets.load('test:missing-image'), /particle has no loadable emitters/)
})

test('the particle core retains track boundaries and easing curves', async () => {
    const { KernelParticles, packParticleEmitters } = await import('@/shared/kernel/particles')
    const constant = (value: number) => ({ nodes: [{ time: 0, low: value, high: value }] })
    for (const [curve, expected] of Object.entries({ linear: 6, 'ease-in': 3.5, 'ease-out': 8.5, 'ease-in-out': 6 })) {
        const data = parseDefinition({ emitters: [{ sprite: 'pvz:test', particleDuration: constant(5), systemDuration: constant(10),
            spawnMinActive: constant(1), spawnMaxLaunched: constant(1),
            particleScale: { nodes: [{ time: 0, low: 1, high: 1, curve: curve as ParticleTrackCurve }, { time: 1, low: 11, high: 11 }] },
        }] })
        const system = new KernelParticles(packParticleEmitters(data.emitters), 123, 1)
        const render = () => drawParticles(system)[0].a
        try {
            system.step(); assert.equal(render(), 1)
            system.step(2); assert.equal(render(), expected)
            system.step(2); assert.equal(render(), 11)
        } finally { system.dispose() }
    }
})

test('particle snapshots validate the single replay format', () => {
    const snapshot = {
        id: 'pvz:peasplat', seed: 123, ageTicks: 25, accumulatorSeconds: 0.005,
        renderOrder: 10000, tint: { r: 1, g: 2, b: 3, a: 255 },
        extraAdditive: true, spriteOverride: null, playing: true, visible: true, scale: 1.5,
    }
    assert.deepEqual(parseParticlePlayerSnapshot(snapshot), snapshot)
    assert.throws(() => parseParticlePlayerSnapshot({ ...snapshot, unknown: true }), /unknown is not supported/)
    assert.throws(() => parseParticlePlayerSnapshot({ ...snapshot, seed: -1 }), /seed/)
    assert.throws(() => parseParticlePlayerSnapshot({ ...snapshot, accumulatorSeconds: 0.01 }), /below one tick/)
    assert.throws(() => parseParticlePlayerSnapshot({
        ...snapshot, tint: { ...snapshot.tint, r: 256 },
    }), /tint.r/)
})

test('shared particle core replays seeds, batches ticks and compensates parent motion', async () => {
    const { KernelParticles, packParticleEmitters } = await import('@/shared/kernel/particles')
    const constant = (value: number) => ({ nodes: [{ time: 0, low: value, high: value }] })
    const definition = parseDefinition({ emitters: [{
        sprite: 'pvz:test', systemDuration: constant(50), particleDuration: constant(40),
        spawnMinActive: constant(4), spawnMaxLaunched: constant(4),
        launchSpeed: constant(25), randomLaunchSpin: true, particlesDontFollow: true,
        particleScale: { nodes: [{ time: 0, low: .5, high: 1 }, { time: 1, low: 2, high: 2 }] },
        fields: [{ type: 'acceleration', x: constant(0), y: constant(10) }],
    }] })!
    const packed = packParticleEmitters(definition.emitters)
    const source = new KernelParticles(packed, 123, 1)
    const restored = new KernelParticles(packed, 123, 1)
    const moved = new KernelParticles(packed, 123, 1)
    const render = (system: InstanceType<typeof KernelParticles>) => drawParticles(system, [200, 180, 160, 255], 1.5)
    try {
        source.step(10)
        for (let tick = 0; tick < 10; tick++) restored.step()
        assert.deepEqual(render(source), render(restored))
        assert.equal(source.counts[0], 4)
        moved.step()
        moved.motion.set([12, -8])
        moved.step(9)
        const before = render(source), after = render(moved)
        before.forEach((particle, index) => {
            assert.ok(Math.abs(after[index].x - particle.x + 12) < 1e-3)
            assert.ok(Math.abs(after[index].y - particle.y - 8) < 1e-3)
            assert.ok(Math.abs(after[index].a - particle.a) < 1e-5)
            assert.equal(after[index].alpha, particle.alpha)
        })
        source.step(31)
        assert.equal(source.counts[0], 0)
        assert.equal(source.dead, false)
        assert.equal(source.finished, true, 'all four particles launched and gone')
        assert.equal(source.step(9), 9)
        assert.equal(source.dead, false)
        assert.equal(source.step(), 1)
        assert.equal(source.dead, true)
        assert.equal(source.counts[0], -1)
    } finally { source.dispose(); restored.dispose(); moved.dispose() }
    assert.throws(() => source.step(), /step failed/)
})

test('fractional emission reaches the same spawn boundary in the shared core', async () => {
    const { KernelParticles, packParticleEmitters } = await import('@/shared/kernel/particles')
    const constant = (value: number) => ({ nodes: [{ time: 0, low: value, high: value }] })
    const definition = parseDefinition({ emitters: [{
        sprite: 'pvz:test', systemLoops: true, spawnRate: constant(20), particleDuration: constant(40),
    }] })!
    const system = new KernelParticles(packParticleEmitters(definition.emitters), 0, 1)
    try {
        system.step(25)
        assert.equal(system.counts[0], 5)
        // Stopped, it launches no more: its five particles live out their 40 ticks, and it is dead with the last.
        system.stop()
        system.step(20)
        assert.equal(system.counts[0], 4)
        system.step(19)
        assert.deepEqual([system.counts[0], system.dead], [1, false])
        system.step(2)
        assert.equal(system.dead, true)
    } finally { system.dispose() }
})

test('kernel arrays start clear when released memory is reused', async () => {
    const { kernel } = await import('@/shared/kernel/index')
    const api = kernel()
    const previous = api.f64(128)
    previous.fill(123)
    api.release(previous)
    const next = api.f64(128)
    try { assert.ok(next.every(value => value === 0)) }
    finally { api.release(next) }
})

type FakeNode = { name: string, parent: FakeNode | null, children: FakeNode[], isValid: boolean, [key: string]: any }

/**
 * The particle player on nodes of its own, with effects of `emitters` emitters each (by ID, one if not named) whose
 * particles last 5 ticks, one launched by each emitter.
 */
async function particlePlayer(emitters: Record<string, number> = {}) {
    const kernelModule = await import('@/shared/kernel/index')
    const particles = await import('@/shared/kernel/particles')
    const snapshots = await import('@/client/particle/ParticlePlayerSnapshot')
    const constant = (value: number) => ({ nodes: [{ time: 0, low: value, high: value }] })
    const effect = (count: number) => {
        const definition = parseDefinition({ emitters: Array.from({ length: count }, () => ({ sprite: 'pvz:test', systemDuration: constant(50),
            particleDuration: constant(5), spawnMinActive: constant(1), spawnMaxLaunched: constant(1) })) })!
        return { definition, packed: particles.packParticleEmitters(definition.emitters),
            emitters: definition.emitters.map(emitter => ({ definition: emitter, frame: {}, geometry: kernelModule.kernel().f64(kernelModule.IMAGE), cel: { width: 1, height: 1 } })) }
    }
    const effects = new Map<string, ReturnType<typeof effect>>()
    const assets = (id: string) => effects.get(id) ?? effects.set(id, effect(emitters[id] ?? 1)).get(id)!
    const nodes: FakeNode[] = []
    const makeNode = (name: string, parent: FakeNode | null): FakeNode => {
        const node: FakeNode = { name, parent, children: [], isValid: true, worldPosition: { x: 0, y: 0 }, scaleX: 1,
            setPosition() {}, setScale(x: number) { node.scaleX = x }, addComponent(type: new () => any) { const component = new type(); component.node = node; return component },
            once(_event: string, listener: () => void) { node.destroyed = listener },
            destroy() { if (!node.isValid) return; node.isValid = false; node.destroyed?.() } }
        parent?.children.push(node)
        nodes.push(node)
        return node
    }
    const modules: Record<string, unknown> = {
        cc: { _decorator: { ccclass: () => (type: unknown) => type }, Color: class {}, Component: class {}, Sprite: { SizeMode: { CUSTOM: 0 } },
            Node: { EventType: { NODE_DESTROYED: 'destroyed' } } },
        '@/client/view/uiNode': { uiNode: ({ name, parent }: { name: string, parent: FakeNode }) => ({ node: makeNode(name, parent) }) },
        '@/client/render/KernelBatch': { KernelBatch: class { setSource() {} clear() {} } },
        '@/core/GameClock': { gameClock: { delta: (dt: number) => dt } },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: { perfParticlesEnabled: true } },
        '@/shared/content/particle': { PARTICLE_STEP_SECONDS: 0.01 },
        '@/shared/kernel/index': kernelModule, '@/shared/kernel/particles': particles,
        './ParticleAssets': { ParticleAssets: { get: assets } }, './ParticlePlayerSnapshot': snapshots,
    }
    const { ParticlePlayer } = loadScript('assets/scripts/client/particle/ParticlePlayer.ts',
        (id: string) => modules[id] ?? (id === '@/shared/content/renderOrder' ? renderOrderModule : {}))
    // The kernel's systems and its count of particles are shared by every test: each leaves none of its own alive.
    const clear = () => { for (const node of nodes) node.destroy() }
    return { ParticlePlayer, parent: makeNode('Holder', null), kernel: kernelModule.kernel(), clear }
}

test('a finished recyclable particle is reused by the next spawn of its effect and skipped by snapshots', async t => {
    const { ParticlePlayer, parent, clear } = await particlePlayer()
    t.after(clear)
    const snapshots = await import('@/client/particle/ParticlePlayerSnapshot')
    const spawn = (mirrored = false) => ParticlePlayer.spawn({ parent, id: 'pvz:test', x: 0, y: 0, mirrored, recycle: true })
    const first = spawn(true)
    assert.equal(first.node.scaleX, -1)
    first.update(0.2)
    assert.equal(first.node.isValid, true, 'a finished recyclable particle keeps its node')
    assert.equal(first.live, false)
    assert.throws(() => first.snapshot(), /not ready/)
    const second = spawn()
    assert.equal(second, first)
    assert.equal(second.live, true)
    assert.equal(second.node.scaleX, 1, 'a recycled particle drops its old facing')
    assert.equal(parent.children.length, 1)
    assert.equal(spawn() === first, false, 'a playing particle is not reused')
    const saved = spawn(true).snapshot()
    assert.equal(saved.mirrored, true)
    assert.equal(ParticlePlayer.restore({ parent, x: 0, y: 0, snapshot: saved }).node.scaleX, -1, 'a restored particle keeps its facing')
    assert.equal(second.snapshot().mirrored, undefined)
    assert.throws(() => snapshots.parseParticlePlayerSnapshot({ ...saved, mirrored: false }), /mirrored/)

    // What it went with gone, it is stopped where it is: kept by no save, and gone with its last particle.
    const trail = ParticlePlayer.spawn({ parent, id: 'pvz:test', x: 0, y: 0 })
    assert.equal(trail.unsaved, false)
    trail.stop()
    assert.deepEqual([trail.node.isValid, trail.unsaved], [true, true])
    trail.update(0.2)
    assert.equal(trail.node.isValid, false)

    // A frozen plant's particle stands still until it thaws, and goes on from where it stood.
    const chewing = ParticlePlayer.spawn({ parent, id: 'pvz:test', x: 0, y: 0 })
    chewing.update(0.02)
    const age = chewing.ageTicks
    chewing.setPaused(true)
    chewing.update(0.2)
    assert.deepEqual([chewing.ageTicks, chewing.node.isValid], [age, true], 'paused, it neither ages nor runs out')
    chewing.setPaused(false)
    chewing.update(0.01)
    assert.equal(chewing.ageTicks, age + 1)
})

test('TodParticleHolder::AllocParticleSystem: no effect starts while as many are alive as the limit, or its emitters would not fit', async t => {
    const { ParticlePlayer, parent, kernel, clear } = await particlePlayer({ 'pvz:two': 2 })
    ParticlePlayer.useLimits({ systems: 3, emitters: 3, particles: 1024 })
    t.after(() => {
        clear()
        ParticlePlayer.useLimits({ systems: Infinity, emitters: Infinity, particles: Infinity })
        kernel.particlesLimit(65536)
    })
    const spawn = (id = 'pvz:one') => ParticlePlayer.spawn({ parent, id, x: 0, y: 0 })
    const alive = () => [ParticlePlayer.alive.systems, ParticlePlayer.alive.emitters]
    const first = spawn(), second = spawn()
    assert.equal(spawn('pvz:two'), null, 'two emitters more than the three')
    const third = spawn()
    assert.deepEqual(alive(), [3, 3])
    assert.equal(spawn(), null, 'three effects alive')
    // A save had room for what it kept: it comes back whatever is alive, and counts.
    const restored = ParticlePlayer.restore({ parent, x: 0, y: 0, snapshot: third.snapshot() })
    assert.deepEqual(alive(), [4, 4])
    // A finished effect, and one whose node is gone, give their places back.
    first.update(0.2)
    assert.equal(first.node.isValid, false)
    restored.node.destroy()
    second.node.destroy()
    assert.deepEqual(alive(), [1, 1])
    assert.notEqual(spawn('pvz:two'), null)
    assert.deepEqual(alive(), [2, 3])
})

test('TodParticleEmitter::SpawnParticle: no particle is spawned while as many are alive as the limit, over all systems', async () => {
    const { kernel } = await import('@/shared/kernel/index')
    const { KernelParticles, packParticleEmitters } = await import('@/shared/kernel/particles')
    const constant = (value: number) => ({ nodes: [{ time: 0, low: value, high: value }] })
    const packed = packParticleEmitters(parseDefinition({ emitters: [{ sprite: 'pvz:test', systemDuration: constant(50),
        particleDuration: constant(40), spawnMinActive: constant(3), spawnMaxLaunched: constant(3) }] })!.emitters)
    kernel().particlesLimit(4)
    const first = new KernelParticles(packed, 1, 1), second = new KernelParticles(packed, 2, 1)
    try {
        first.step()
        second.step()
        assert.deepEqual([first.counts[0], second.counts[0]], [3, 1], 'four at most, the two systems together')
        second.step()
        assert.equal(second.counts[0], 1, 'none while there is no room')
        // A system destroyed with particles alive leaves their room to the rest.
        first.dispose()
        second.step()
        assert.equal(second.counts[0], 3)
    } finally { first.dispose(); second.dispose(); kernel().particlesLimit(65536) }
})

test('particle frames follow AnimationRate and Animated as in TodParticleEmitter', async () => {
    const { KernelParticles, packParticleEmitters } = await import('@/shared/kernel/particles')
    const constant = (value: number) => ({ nodes: [{ time: 0, low: value, high: value }] })
    // Cell n starts at x = n, so a quad's first corner shows which frame it draws.
    const STRIDE = 9
    const geometry = new Float64Array(Array.from({ length: 4 }, (_, cell) => [cell, cell + 1, 0, 1, 0, 0, 1, 0, 0, 1, 1, 1]).flat())
    const frame = (system: InstanceType<typeof KernelParticles>) => {
        const positions = new Float32Array(4 * STRIDE), vertices = new Float32Array(4 * STRIDE)
        assert.equal(system.write(0, geometry, new Float64Array([255, 255, 255, 255, 1, 0, 0, 1 / 255, STRIDE, 1, 0, 0]), positions, vertices), 1)
        return positions[0]
    }
    const emitter = { sprite: 'pvz:test', columns: 4, frameCount: 4, systemDuration: constant(50),
        spawnMinActive: constant(1), spawnMaxLaunched: constant(1) }
    // AnimationRate 25: a quarter of the frames per tick, wrapping at the end.
    const looping = new KernelParticles(packParticleEmitters(parseDefinition({ emitters: [{
        ...emitter, particleDuration: constant(20), animationRate: constant(25) }] }).emitters), 7, 1)
    // Animated: the frames once over the particle's life (age / (duration - 1)).
    const once = new KernelParticles(packParticleEmitters(parseDefinition({ emitters: [{
        ...emitter, particleDuration: constant(5), animated: true }] }).emitters), 7, 1)
    try {
        const loopFrames = [], onceFrames = []
        for (let tick = 0; tick < 5; tick++) {
            looping.step(); once.step()
            loopFrames.push(frame(looping)); onceFrames.push(frame(once))
        }
        assert.deepEqual(loopFrames, [1, 2, 3, 0, 1])
        assert.deepEqual(onceFrames, [0, 1, 2, 3, 3])
    } finally { looping.dispose(); once.dispose() }
})
