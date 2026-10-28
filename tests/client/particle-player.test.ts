import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { parseParticle, type ParticleTrackCurve } from '@/shared/content/particle'
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
    const registry = { entries: () => [[empty.id, empty]] }
    const modules: Record<string, unknown> = {
        '@/client/content/ClientContentLoader': {
            ParticleRepository: class { async load(id: string) { return definitions.get(id) } },
            SpriteRepository: class { async load() { throw new Error('image unavailable') } },
        },
        '@/client/content/loadClientContent': { loadClientContent: async () => ({ registry, loader: {} }) },
        '@/client/content/preloadTasks': { preloadTasks: async (tasks: (() => Promise<unknown>)[]) => {
            for (const task of tasks) await task()
        } },
        '@/shared/kernel/particles': { packParticleEmitters },
    }
    const exports: any = {}
    const code = transpileModule(readFileSync('assets/scripts/client/particle/ParticleAssets.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    runInNewContext(code.outputText, { exports, require: (id: string) => modules[id] ?? {}, console: { warn() {} } })
    await exports.ParticleAssets.preloadAll()
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

test('a finished recyclable particle is reused by the next spawn of its effect and skipped by snapshots', async () => {
    const kernelModule = await import('@/shared/kernel/index')
    const particles = await import('@/shared/kernel/particles')
    const snapshots = await import('@/client/particle/ParticlePlayerSnapshot')
    const constant = (value: number) => ({ nodes: [{ time: 0, low: value, high: value }] })
    const definition = parseDefinition({ emitters: [{ sprite: 'pvz:test', systemDuration: constant(50),
        particleDuration: constant(5), spawnMinActive: constant(1), spawnMaxLaunched: constant(1) }] })!
    const assets = { definition, packed: particles.packParticleEmitters(definition.emitters),
        emitters: [{ definition: definition.emitters[0], frame: {}, geometry: kernelModule.kernel().f64(kernelModule.IMAGE) }] }
    type FakeNode = { name: string, parent: FakeNode | null, children: FakeNode[], isValid: boolean, [key: string]: any }
    const makeNode = (name: string, parent: FakeNode | null): FakeNode => {
        const node: FakeNode = { name, parent, children: [], isValid: true, worldPosition: { x: 0, y: 0 },
            setPosition() {}, addComponent(type: new () => any) { const component = new type(); component.node = node; return component },
            once(_event: string, listener: () => void) { node.destroyed = listener },
            destroy() { node.isValid = false; node.destroyed?.() } }
        parent?.children.push(node)
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
        './ParticleAssets': { ParticleAssets: { get: () => assets } }, './ParticlePlayerSnapshot': snapshots,
    }
    const exports: any = {}
    const code = transpileModule(readFileSync('assets/scripts/client/particle/ParticlePlayer.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    runInNewContext(code.outputText, { exports, require: (id: string) => modules[id] ?? {} })
    const { ParticlePlayer } = exports
    const parent = makeNode('Holder', null)
    const spawn = () => ParticlePlayer.spawn({ parent, id: 'pvz:test', x: 0, y: 0, recycle: true })
    const first = spawn()
    first.update(0.2)
    assert.equal(first.node.isValid, true, 'a finished recyclable particle keeps its node')
    assert.equal(first.live, false)
    assert.throws(() => first.snapshot(), /not ready/)
    const second = spawn()
    assert.equal(second, first)
    assert.equal(second.live, true)
    assert.equal(parent.children.length, 1)
    assert.equal(spawn() === first, false, 'a playing particle is not reused')
})
