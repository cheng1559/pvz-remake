import { exampleClient } from './example-client'
import { parseParticle } from '@/shared/content/particle'
import { parseReanim } from '@/shared/content/reanim'
import { readBaseContent, readPresentationSource } from '../../tools/mod/content'
import { readModContent } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'
import { spawnSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import test from 'node:test'
import * as fflate from 'fflate'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { ModAssets } from '@/shared/mod/ModAssets'
import { ModHost } from '@/shared/mod/ModHost'
import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import { defineComponent, World } from '@/ecs'
import { DefinitionSources } from '@/shared/content/DefinitionRegistry'
import { createServerModHost } from '@/server/createModHost'
import { ArchiveContentRegistry } from '@/client/content/ArchiveContentRegistry'
import { ContentRegistry } from '@/client/content/ContentRegistry'
import { CONTENT_CATEGORIES } from '@/shared/content'
import * as modApi from '@/shared/mod'
import { buildGameplayContent, buildModStrings, buildPresentationDefinitions } from '@/shared/content/DefinitionRegistry'
import { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'
import { IntegratedGameServer } from '@/server/IntegratedGameServer'
import { GameplayRegistry } from '@/server/GameplayRegistry'
import { runCommand } from '../server/run-command'
import { parseModContent, contentJson } from '@/shared/mod/content'
import { getDebugCliCompletions, parseDebugCliCommand } from '@/shared/debug/DebugCli'

const base = () => readBaseContent().gameplay
const gameplay = () => ({ ownerId: 'example:showcase', data: readModContent('mods/example/content.json').gameplay })
const presentation = () => ({ ownerId: 'example:showcase', data: readModContent('mods/example/content.json').presentation })
const build = (sources = [gameplay()]) => {
    return buildGameplayContent(base(), sources)
}

function installed(id: string, server: any, client?: any) {
    const manifest = modApi.parseModManifest({ schemaVersion: 1, apiVersion: 1, id, version: '1.0.0', contentHash: id, dependencies: [],
        gameplay: { nodeModule: 'node.js', cocosModule: 'server.js' }, ...(client ? { client: { module: 'client.js' } } : {}) })
    return { manifest, content: { resources: {} }, files: { 'sprite.png': new Uint8Array([0]) }, modules: { 'server.js': server, 'client.js': client } }
}

test('Mod JSON decodes UTF-8 without package imports and uses the native single-argument decoder contract', () => {
    const compiled = transpileModule(readFileSync('assets/scripts/shared/mod/ModAssets.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    const exports: any = {}
    let decodes = 0
    class NativeDecoder {
        constructor(readonly encoding: string) { assert.equal(encoding, 'utf-8') }
        decode(...args: Uint8Array[]) {
            assert.equal(args.length, 1)
            assert.ok(args[0] instanceof Uint8Array)
            decodes++
            return new TextDecoder(this.encoding).decode(args[0])
        }
    }
    runInNewContext(compiled.outputText, { exports, TextDecoder: NativeDecoder,
        require: (id: string) => assert.fail(`ModAssets must not import a runtime package: ${id}`) })
    const expected = { name: '玉米投手', description: 'Butter 🧈', damage: 20 }
    const files = { 'assets/test.json': new TextEncoder().encode(JSON.stringify(expected)) }
    const assets = new exports.ModAssets(installed('test:utf8', () => {}).manifest, files)
    assert.deepEqual(JSON.parse(JSON.stringify(assets.json('assets/test.json'))), expected)
    assert.equal(decodes, 1)
})

test('Release preloading loads Mod archive assets without requesting a Cocos bundle config', async () => {
    const registry = new ContentRegistry()
    const table: Record<string, Record<string, string>> = Object.fromEntries(CONTENT_CATEGORIES.map(category =>
        [category, { [`example:${category}`]: `assets/${category}.json` }]))
    const files = new Map(Object.values(table).flatMap(entries =>
        Object.values(entries).map(path => [path, Buffer.from('{}')] as const)))
    const types = { sprites: class SpriteFrame {}, reanim: class JsonAsset {}, particles: class JsonAsset {},
        fonts: class JsonAsset {}, sounds: class AudioClip {}, music: class JsonAsset {}, prefabs: class Prefab {} }
    const loaded = new Set<string>(), bundles: string[] = [], progress: number[] = []
    for (const category of CONTENT_CATEGORIES) {
        for (const [id, path] of Object.entries(table[category] ?? {})) registry.registerEntry({
            category, id, path, bundle: 'pvzmod:///example%3Aarchive/',
            contentId: 'example:archive', contentVersion: '1.0.0', contentHash: 'example', schemaVersion: 2,
        })
    }
    registry.registerEntry({ category: 'sprites', id: 'pvz:background', path: 'sprites/background',
        bundle: 'pvz-base', contentId: 'pvz:base', contentVersion: '1', contentHash: 'base', schemaVersion: 2 })
    const loader = {
        async loadBundle(location: string) {
            assert.ok(!location.startsWith('pvzmod:///'), 'raw Mod archives have no config.json')
            bundles.push(location)
            return { loadDir(_path: string, report: Function, done: Function) { report(1, 1); done(null) } }
        },
        async load(content: any, type: any) {
            const data = files.get(content.path)
            assert.ok(data, `Missing archive fixture: ${content.path}`)
            assert.equal(type.name, types[content.category as keyof typeof types].name)
            if (type.name === 'JsonAsset') JSON.parse(data.toString('utf8'))
            loaded.add(`${content.category}/${content.id}`)
        },
    }
    const modules: Record<string, unknown> = {
        cc: { SpriteFrame: types.sprites, JsonAsset: types.reanim, AudioClip: types.sounds, Prefab: types.prefabs },
        '@/shared/content': { CONTENT_CATEGORIES },
        '@/client/reanim/EntityDisplay': { loadEntityDisplayAssets: async () => ({ content: { registry, loader } }) },
        '@/client/reanim/ReanimPlayer': { ReanimRepository: class {
            async load(id: string) { assert.ok(loaded.has(`reanim/${id}`), 'archive JSON must be preloaded before animation preparation') }
        } },
        '@/client/sound/SoundSystem': { SoundSystem: { async preloadAll() {} } },
        '@/client/particle/ParticleAssets': { ParticleAssets: { async preloadAll() {} } },
        './ModResources': { modResources: { async preload(report: Function) { report(1) } } },
        './preloadTasks': { async preloadTasks(tasks: (() => Promise<unknown>)[], report: (progress: number) => void = () => {}) {
            for (const [index, task] of tasks.entries()) { await task(); report((index + 1) / tasks.length) }
        } },
    }
    const exports: any = {}
    const code = transpileModule(readFileSync('assets/scripts/client/content/PreloadAssets.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    runInNewContext(code.outputText, { exports, require: (id: string) => modules[id] ?? {} })
    await exports.preloadAssets((value: number) => progress.push(value))
    assert.deepEqual(bundles, [], 'ZIP preload never requests Cocos bundles')
    assert.deepEqual([...loaded].sort(), Object.entries(table).flatMap(([kind, entries]) =>
        Object.keys(entries as object).map(id => `${kind}/${id}`)).sort())
    assert.equal(progress.at(-1), 1)
})

/** Exercise the real app loader without requiring the Cocos engine in Node. */
function modLoader(installed: any[], ready = async () => installed, clientModules: Record<string, unknown> = {}) {
    const hosts: ModHost[] = []
    const keep = (host: ModHost) => { hosts.push(host); return host }
    const gameplay = base()
    const presentation = readPresentationSource()
    class Views extends EntityViewRegistry<any, any> {
        constructor() {
            super(context => ({ kind: context.kind, typeId: context.typeId }))
            const views = [...Object.values(presentation.plants), ...Object.values(presentation.zombies)].map((entry: any) => entry.view ?? 'zombie')
            for (const kind of new Set(views)) this.register(kind, () => ({}))
        }
    }
    const failures = new Map<string, string>(), errors: unknown[][] = []
    const compiled = transpileModule(readFileSync('assets/scripts/app/ModLoader.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    const module = { exports: {} as any }
    const modules: Record<string, unknown> = {
        cc: { JsonAsset: class {} },
        '@/client/content/ClientContentLoader': { ClientContentLoader: class {
            async loadBaseContent() { return { content: { gameplay: 'gameplay.json' }, files: {
                'gameplay.json': new TextEncoder().encode(JSON.stringify(gameplay)),
            } } }
        } },
        '@/client/content/ClientAnimationRegistry': { ClientAnimationRegistry },
        '@/shared/mod/content': { contentJson },
        '@/client/content/loadPresentationDefinitions': { loadPresentationDefinitions: async (_manifest: unknown, sources: unknown[]) => {
            assert.equal(sources.length, 0, 'base validation must not recursively load Mods')
            return presentation
        } },
        '@/shared/content/DefinitionRegistry': { DefinitionSources, buildGameplayContent, buildPresentationDefinitions },
        '@/shared/mod/ModAssets': { ModAssets },
        '@/server/GameplayRegistry': { GameplayRegistry },
        '@/server/createModHost': { createServerModHost: (...args: Parameters<typeof createServerModHost>) => keep(createServerModHost(...args)) },
        '@/client/plants/PlantViewRegistry': { PlantViewRegistry: Views },
        '@/client/zombies/ZombieViewRegistry': { ZombieViewRegistry: Views },
        '@/client/content/ArchiveContentRegistry': { ArchiveContentRegistry },
        '@/client/content/createModHost': {
            ClientModAssets: class extends ModAssets { async sprite(path: string) {
                const png = this.bytes(path)
                assert.deepEqual(Array.from(png.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10])
                return { source: path }
            } },
            createClientModHost: (owner: string, sources: DefinitionSources, resources: ArchiveContentRegistry, plants: Views, zombies: Views) =>
                keep(new ModHost(owner, { ...clientModules, 'content/definitions': sources, 'content/resources': resources, 'client/views': { plants, zombies } })),
        },
        '@/client/content/ModManager': { modManager: { ready, failures } },
        '@/client/content/ModRuntime': {
            async mountMod() {},
            async importModModule(owner: string, path: string) {
                const mod = installed.find(mod => mod.manifest.id === owner)
                if (mod.modules) {
                    const entry = mod.modules[path]
                    if (entry instanceof Error) throw entry
                    return { register: entry }
                }
                const cache = new Map<string, Record<string, unknown>>()
                const load = (file: string): Record<string, unknown> => {
                    const cached = cache.get(file)
                    if (cached) return cached
                    const exports: Record<string, unknown> = {}
                    cache.set(file, exports)
                    // Execute the same local SystemJS dependency graph emitted for Cocos.
                    new Function('System', fflate.strFromU8(mod.files[file]))({
                        register(dependencies: string[], declare: Function) {
                            const module = declare((key: string, value: unknown) => { exports[key] = value })
                            dependencies.forEach((dependency, index) => {
                                assert.ok(dependency.startsWith('./'), 'the example must stay self-contained')
                                module.setters[index](load(posix.join(posix.dirname(file), dependency)))
                            })
                            module.execute()
                        },
                    })
                    return exports
                }
                return load(path)
            },
        },
    }
    runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {},
        console: { info() {}, error: (...args: unknown[]) => errors.push(args) } })
    return { load: module.exports.loadInstalledMods, failures, errors, dispose: () => { for (const host of hosts.reverse()) host.dispose() } }
}

test('a failed Mod rolls back both entries and patches; dependants skip while independent Mods keep loading', async () => {
    const target = { value: () => 1 }, registrations: string[] = []
    let disposeHealthy!: () => void
    const first = installed('ok:first', ({ host, assets }: any) => {
        registrations.push(assets.id)
        host.get('content/definitions').register(assets.id, { plants: {} })
        disposeHealthy = host.around(target, 'value', (next: any) => next() + 1)
    })
    const old = installed('old:legacy', (api: any) => api.registerDefinitions('assets/gameplay.json'))
    const dependent = installed('test:dependent', () => assert.fail('A dependant must not execute after its dependency fails'))
    dependent.manifest.dependencies.push({ id: 'old:legacy', version: '1.0.0' })
    const broken = installed('test:broken', ({ host, assets }: any) => {
        const { specs } = host.get('shared/debug/DebugCli')
        host.around(specs, 'list', (next: any) => [...next(), { name: 'test:leaked', parameters: [], minimum: 0 }])
        const { executor } = host.get('server/debug/DebugCommands')
        host.around(executor, 'execute', (next: any, ...args: any[]) =>
            args[3].name === 'test:leaked' ? { ok: true, message: 'Leaked command' } : next(...args))
        host.get('content/definitions').register(assets.id, { plants: { 'test:leaked': {} } })
        const { registry } = host.get('server/GameplayRegistry')
        const behavior = { createState: () => ({}), tick() {} }
        registry.plantBehaviors.register(assets.id, 'test:leaked', behavior)
        registry.zombieBehaviors.register(assets.id, 'test:leaked', behavior)
        registry.components.register(defineComponent('test:leaked-state'))
        host.around(target, 'value', (next: any) => next() + 100)
    }, async ({ host, assets }: any) => {
        host.get('content/definitions').register(assets.id, { strings: { 'test:leaked': 'Leaked' } })
        host.get('content/resources').register(assets, { sprites: { 'test:leaked': 'sprite.png' } })
        const views = host.get('client/views')
        for (const registry of [views.plants, views.zombies]) {
            registry.register('test:leaked', () => ({}))
            registry.freeze()
        }
        host.around(target, 'value', (next: any) => next() * 10)
        await Promise.reject(new Error('client initialization failed'))
    })
    const last = installed('ok:last', ({ assets }: any) => { registrations.push(assets.id) })
    const loader = modLoader([first, old, dependent, broken, last])
    try {
        const result = await loader.load()
        assert.equal(await loader.load(), result, 'a caught error must not leave a rejected startup promise or repeat registrations')
        assert.deepEqual(registrations, ['ok:first', 'ok:last'])
        assert.deepEqual(Array.from(result.manifests, (mod: any) => mod.id), ['ok:first', 'ok:last'])
        assert.equal(target.value(), 2, 'only the healthy Mod patch remains')
        assert.deepEqual(getDebugCliCompletions('/test:leaked', undefined, true), [])
        assert.equal((parseDebugCliCommand('/test:leaked') as { failure: string }).failure, 'syntax')
        assert.equal(result.gameplayDefinitions.length, 1)
        assert.equal(result.presentationDefinitions.length, 0)
        assert.equal([...result.clientContent.entries()].length, 0)
        assert.deepEqual(result.gameplay.components.snapshot(new World()), {})
        for (const views of [result.plantViews, result.zombieViews]) {
            assert.equal(views.has('test:leaked'), false)
            views.register('test:after', () => ({}))
        }
        result.gameplay.freeze(buildGameplayContent(base(), result.gameplayDefinitions).definitions)
        assert.match(loader.failures.get('old:legacy')!, /registerDefinitions is not a function/)
        assert.match(loader.failures.get('test:dependent')!, /Dependency failed to load: old:legacy/)
        assert.match(loader.failures.get('test:broken')!, /client.js.*client initialization failed/)
        assert.equal(loader.errors.length, 3)
    } finally { disposeHealthy?.() }
})

test('import failures and enabled-list errors leave a usable base-game Mod state', async () => {
    const bad = installed('test:bad-import', new Error('Module file is corrupt'))
    for (const loader of [modLoader([bad]), modLoader([], async () => { throw new Error('Cannot read Mod archive') })]) {
        const result = await loader.load()
        assert.equal(result.manifests.length, 0)
        assert.equal(result.gameplayDefinitions.length, 0)
        assert.equal(result.presentationDefinitions.length, 0)
        assert.equal(loader.errors.length, 1)
    }
})

test('invalid registered gameplay and presentation are rejected before UI startup, without rejecting other Mods', async () => {
    const badGameplay = installed('test:bad-config', ({ host, assets }: any) => {
        host.get('content/definitions').register(assets.id, { plants: { 'test:invalid': { maxHealth: -1 } } })
    })
    const badPresentation = installed('test:bad-view', () => {}, ({ host, assets }: any) => {
        host.get('content/definitions').register(assets.id, { plants: { 'test:invalid': { visual: {} } } })
    })
    const good = installed('test:good', () => {})
    const loader = modLoader([badGameplay, badPresentation, good])
    const result = await loader.load()
    assert.deepEqual(Array.from(result.manifests, (mod: any) => mod.id), ['test:good'])
    assert.equal(result.gameplayDefinitions.length, 0)
    assert.equal(result.presentationDefinitions.length, 0)
    assert.match(loader.failures.get('test:bad-config')!, /definitions:/)
    assert.match(loader.failures.get('test:bad-view')!, /definitions:/)
})

test('definition registries reject collisions, foreign namespaces, unresolved references and conflicting level patches', () => {
    assert.throws(() => build([gameplay(), gameplay()]), /duplicate registration/)
    assert.throws(() => build([{ ...gameplay(), ownerId: 'other:mod' }]), /cannot register/)
    const missing = gameplay()
    missing.data.plants['example:rapid_pea'].shooter.projectile = 'example:missing'
    assert.throws(() => build([missing]), /unknown ID/)
    const conflict = { ownerId: 'other:mod', data: { levelPatches: { 'pvz:adventure-1-1': { seedPackets: [] } } } }
    assert.throws(() => build([gameplay(), conflict]), /Conflicting level patch/)
    assert.throws(() => build([{ ownerId: 'other:mod', data: { levelPatches: { 'other:missing': {} } } }]), /unknown level/)

    const source = readPresentationSource()
    const before = JSON.stringify(source)
    const installed = buildPresentationDefinitions(source, [presentation()])
    assert.equal(JSON.stringify(source), before, 'registration cannot change the base asset')
    assert.ok(Object.isFrozen(installed.plants['example:rapid_pea']))
    assert.equal(buildModStrings([presentation()])['example:rapid_pea'], 'Rapid Pea')
    const invalid = presentation()
    delete invalid.data.plants['example:rapid_pea'].animations.blink
    assert.throws(() => buildPresentationDefinitions(source, [invalid]), /missing blink animation/)
})

test('a packed Mod registers both entity kinds, runs custom behaviors and restores without modifying base content', async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'pvz-plant-mod-'))
    let dispose = () => {}
    try {
        const output = join(temporary, 'example')
        const packed = spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'tools/mod/cli.ts', 'pack', 'mods/example', '--out', output], { encoding: 'utf8' })
        assert.equal(packed.status, 0, packed.stdout + packed.stderr)
        const archive = fflate.unzipSync(readFileSync(output + '.zip'))
        const files = Object.fromEntries(Object.entries(archive).map(([name, bytes]) => [name.slice('example/'.length), bytes]))
        const manifest = modApi.parseModManifest(JSON.parse(fflate.strFromU8(files['manifest.json'])))
        assert.match(manifest.contentHash, /^[a-f0-9]{64}$/)
        assert.ok(!Object.keys(files).some(name => name.endsWith('.ts')))
        assert.deepEqual(JSON.parse(fflate.strFromU8(files['assets/gameplay.json'])), gameplay().data)
        assert.deepEqual(JSON.parse(fflate.strFromU8(files['assets/presentation.json'])), presentation().data)
        assert.ok(!Object.keys(files).some(name => /^assets\/(gameplay|presentation)\//.test(name)))
        const client = exampleClient()
        const initialize = client.MainMenuScreen.prototype.initialize
        const execute = client.executor.execute
        const loader = modLoader([{ manifest, files, content: parseModContent(contentJson(files, 'content.json'), files) }], undefined, client.modules)
        dispose = loader.dispose
        const loaded = await loader.load()
        assert.deepEqual([...loader.failures], [])
        assert.deepEqual(Array.from(loaded.manifests, (entry: any) => entry.id), [manifest.id])
        assert.ok(loaded.plantViews.has('example:beacon'))
        assert.deepEqual(getDebugCliCompletions('/example:').sort(), ['/example:charge', '/example:hello'])
        assert.equal((await client.executor.execute('/sun set 1', true, () => assert.fail())).message, 'delegated')
        parseParticle(contentJson(files, 'assets/particles/sparks.json'))
        parseReanim(contentJson(files, 'assets/reanim/beacon.json'))
        const hello = await client.executor.execute('/example:hello', false, () => assert.fail('client command must not reach server'))
        assert.match(hello.message, /Mod Lab/)
        await new Promise(setImmediate)
        assert.equal(client.sounds[0].id, 'example:chime')
        const menu = new client.MainMenuScreen()
        await menu.initialize(menu.ui); await menu.initialize(menu.ui)
        assert.equal(menu.initialized, 2, 'wrapper keeps the original menu initialization')
        assert.equal(client.buttons.length, 1, 're-initializing does not duplicate the Mod panel')
        client.buttons[0].onPress()
        client.buttons[0].options.onClick()
        assert.match(client.dialogs[0].options.message, /example:charge/)
        const view = await loaded.plantViews.create({ kind: 'example:beacon', typeId: 'example:beacon', content: client.game })
        assert.equal(view.body.loadedId, 'example:beacon')
        const particles: unknown[][] = []
        const world = { phase: 'gameplay', result: 'playing', paused: false, gameplayTick: 50, extensions: { 'example:charge': { '1': { remainingTicks: 200 } } } }
        view.sync({ entityId: 1, x: 0, y: 0 }, world, (...args: unknown[]) => particles.push(args))
        view.sync({ entityId: 1, x: 0, y: 0 }, world, (...args: unknown[]) => particles.push(args))
        assert.equal(particles.length, 1, 'drawing the same authoritative tick does not duplicate particles')
        world.paused = true; world.gameplayTick = 100
        view.sync({ entityId: 1, x: 0, y: 0 }, world, (...args: unknown[]) => particles.push(args))
        assert.equal(particles.length, 1)
        assert.equal(view.body.tint.b, 110)
        const baseGameplay = base()
        // The VM emulates Cocos; copy its JSON across the test realm boundary.
        const gameplayDefinitions = JSON.parse(JSON.stringify(loaded.gameplayDefinitions))
        const presentationDefinitions = JSON.parse(JSON.stringify(loaded.presentationDefinitions))
        const { definitions, levels } = buildGameplayContent(baseGameplay, gameplayDefinitions)
        const visuals = buildPresentationDefinitions(readPresentationSource(), presentationDefinitions)
        assert.ok(Object.isFrozen(definitions.plants['example:rapid_pea']))
        assert.ok(visuals.levels?.['example:testing'], 'custom levels must include registered client presentation')
        assert.deepEqual(levels.levels['pvz:adventure-1-1'].seedPackets, ['pvz:peashooter', 'example:rapid_pea', 'example:beacon'])
        assert.deepEqual(baseGameplay.levels['pvz:adventure-1-1'].seedPackets, ['pvz:peashooter'])
        const animations = new ClientAnimationRegistry(visuals)
        assert.equal(animations.resolve('example:rapid_pea').shootHead.rateScale, 1)
        assert.equal(animations.resolve('pvz:peashooter').shootHead.rateScale, 1)
        const systems = loaded.gameplay
        const server = new IntegratedGameServer(definitions, levels, systems)
        const mods = [{ id: manifest.id, version: manifest.version, contentHash: manifest.contentHash }]
        server.start({ protocolVersion: 1, type: 'startSession', sequence: 1, levelId: 'example:testing', randomSeed: 42, initialMoney: 0, firstAdventure: false, mods })
        assert.equal(runCommand(server, { type: 'completeIntro' }), undefined)
        assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'example:rapid_pea' }), undefined)
        assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 0 }), undefined)
        assert.equal(server.snapshot().sun, 225)
        assert.equal(server.snapshot().plants[0].typeId, 'example:rapid_pea')
        server.enqueueDebugCommand(100, '/zombie normal 3 7')
        server.processBoundaryCommands()
        server.drainCommandResults()
        let hit = false
        for (let tick = 0; tick < 300 && !hit; tick++) {
            server.tick()
            hit = server.drainEvents().some(event => event.type === 'projectileImpact' && event.data.typeId === 'example:pea')
        }
        assert.ok(hit, 'the custom projectile must reach and damage the zombie')
        assert.equal(server.snapshot().zombies[0].health, 240)
        server.enqueueDebugCommand(101, '/zombie example:regenerating_zombie 2 9')
        server.processBoundaryCommands()
        assert.equal(server.drainCommandResults()[0].debug?.ok, true)
        const summoned = server.snapshot().zombies.find(zombie => zombie.typeId === 'example:regenerating_zombie' && zombie.row === 1)!
        const saved = server.save()
        const savedPlant = saved.entities.find(entity => entity.plant?.typeId === 'example:rapid_pea')!.plant!
        assert.deepEqual(savedPlant.behaviorState, server.snapshot().plants[0].behaviorState)
        savedPlant.health = 100
        const savedZombie = saved.entities.find(entity => entity.entityId === summoned.entityId)!.zombie!
        assert.deepEqual(savedZombie.behaviorState, { ticks: 0 })
        savedZombie.health = 400
        server.restore(saved, 'example:testing', mods)
        const restored = new IntegratedGameServer(definitions, levels, systems)
        restored.restore(server.save(), 'example:testing', mods)
        for (let tick = 0; tick < 100; tick++) assert.deepEqual(restored.tick(), server.tick())
        assert.equal(server.snapshot().plants[0].health, 110, 'the registered behavior must heal independently of shooting')
        assert.equal(server.snapshot().zombies.find(zombie => zombie.entityId === summoned.entityId)!.health, 410)
        assert.equal(runCommand(server, { type: 'selectSeed', seedId: 'example:beacon' }), undefined)
        assert.equal(runCommand(server, { type: 'placePlant', row: 2, column: 1 }), undefined)
        const beacon = server.snapshot().plants.find(plant => plant.typeId === 'example:beacon')!
        let sequence = 200
        const command = (input: string) => {
            server.enqueueDebugCommand(sequence++, input); server.processBoundaryCommands()
            return server.drainCommandResults()[0].debug!
        }
        assert.equal(command('/example:charge 0 1').ok, false)
        assert.equal(command('/example:charge 3 9').ok, false)
        assert.equal(command('/example:charge 3 2').ok, true)
        assert.equal((server.snapshot().extensions['example:charge'] as any)[beacon.entityId].remainingTicks, 300)
        const chargeSave = server.save()
        const bad = structuredClone(chargeSave)
        bad.entities.find(entity => entity.entityId === beacon.entityId)!.extensions!['example:charge'] = { remainingTicks: 0 }
        assert.throws(() => restored.restore(bad, 'example:testing', mods), /Invalid example charge/)
        assert.equal(runCommand(server, { type: 'pause' }), undefined)
        for (let i = 0; i < 20; i++) server.tick()
        assert.equal((server.snapshot().extensions['example:charge'] as any)[beacon.entityId].remainingTicks, 300)
        assert.equal(runCommand(server, { type: 'resume' }), undefined)
        restored.restore(server.save(), 'example:testing', mods)
        const sun = server.snapshot().sun
        for (let i = 0; i < 300; i++) assert.deepEqual(restored.tick(), server.tick())
        assert.equal(server.snapshot().sun, sun + 75, 'charged beacon earns three times its configured sun')
        assert.equal((server.snapshot().extensions['example:charge'] as any)[beacon.entityId], undefined)
        dispose()
        assert.equal(client.MainMenuScreen.prototype.initialize, initialize)
        assert.equal(client.executor.execute, execute)
        assert.equal(client.dialogs[0].node.isValid, false)
        assert.equal(client.buttons[0].node.isValid, false)
        assert.ok(!getDebugCliCompletions('/example:').some(value => value.includes('example:charge') || value.includes('example:hello')))
    } finally { dispose(); rmSync(temporary, { recursive: true, force: true }) }
})
