import { readGameplaySource, readPresentationSource } from '../../tools/content_source'
import { readModContent } from '../../tools/content_source.mjs'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

const json = (path: string): any => JSON.parse(readFileSync(path, 'utf8'))
const base = () => ['definitions', 'levels', 'strings', 'seed-catalog'].map(name => readGameplaySource(name))
const gameplay = () => ({ ownerId: 'example:plants', data: readModContent('mods/example-plant/content.json').gameplay })
const presentation = () => ({ ownerId: 'example:plants', data: readModContent('mods/example-plant/content.json').presentation })
const build = (sources = [gameplay()]) => {
    const [definitions, levels, strings, seedCatalog] = base()
    return buildGameplayContent(definitions, levels, strings, seedCatalog, sources)
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

test('Release preloading loads Corn archive assets without requesting a Cocos bundle config', async () => {
    const registry = new ContentRegistry(), raw = readModContent('mods/corn/content.json').resources
    const { audio, ...other } = raw
    const table: Record<string, Record<string, unknown>> = { ...other, sounds: audio }
    const types = { sprites: class SpriteFrame {}, reanim: class JsonAsset {}, particles: class JsonAsset {},
        fonts: class JsonAsset {}, sounds: class AudioClip {}, music: class JsonAsset {}, prefabs: class Prefab {} }
    const loaded = new Set<string>(), bundles: string[] = [], progress: number[] = []
    for (const category of CONTENT_CATEGORIES) {
        for (const [id, path] of Object.entries(table[category] ?? {})) registry.registerEntry({
            category, id, path: typeof path === 'string' ? path : (path as any).file, bundle: 'pvzmod:///corn%3Aplants/',
            contentId: 'corn:plants', contentVersion: '0.2.3', contentHash: 'corn', schemaVersion: 2,
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
            const data = readFileSync(`mods/corn/${content.path}`)
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
        '@/client/sound/LegacySoundSystem': { SoundLoader: { async preloadAll() {} } },
        '@/core/Particle/ParticleDefinitionLoader': { ParticleDefinitionLoader: { async preloadAll() {} } },
        './ModResources': { modResources: { async preload(report: Function) { report(1) } } },
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
function modLoader(installed: any[], ready = async () => installed) {
    const [definitions, levels, strings, seedCatalog] = base()
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
            async loadManifest() { return { client: { bundle: 'base' }, gameplay: { definitions: 'definitions', levels: 'levels', strings: 'strings', seedCatalog: 'seedCatalog' } } }
        } },
        '@/client/content/ClientAnimationRegistry': { ClientAnimationRegistry },
        '@/client/content/ModResources': { modResources: { baseJson: async (id: string) => ({ definitions, levels, strings, seedCatalog } as any)[id.replace('pvz:', '')] } },
        '@/client/content/loadPresentationDefinitions': { loadPresentationDefinitions: async (_manifest: unknown, sources: unknown[]) => {
            assert.equal(sources.length, 0, 'base validation must not recursively load Mods')
            return presentation
        } },
        '@/shared/content/DefinitionRegistry': { DefinitionSources, buildGameplayContent, buildPresentationDefinitions },
        '@/shared/mod/ModAssets': { ModAssets },
        '@/server/GameplayRegistry': { GameplayRegistry },
        '@/server/createModHost': { createServerModHost },
        '@/client/plants/PlantViewRegistry': { PlantViewRegistry: Views },
        '@/client/zombies/ZombieViewRegistry': { ZombieViewRegistry: Views },
        '@/client/content/ArchiveContentRegistry': { ArchiveContentRegistry },
        '@/client/content/createModHost': {
            ClientModAssets: ModAssets,
            createClientModHost: (owner: string, sources: DefinitionSources, resources: ArchiveContentRegistry, plants: Views, zombies: Views) =>
                new ModHost(owner, { 'content/definitions': sources, 'content/resources': resources, 'client/views': { plants, zombies } }),
        },
        '@/client/content/ModManager': { modManager: { ready, failures } },
        '@/client/content/ModRuntime': {
            clearModRuntimeCache() {}, async mountMod() {},
            async importModModule(owner: string, path: string) {
                const mod = installed.find(mod => mod.manifest.id === owner)
                if (mod.modules) {
                    const entry = mod.modules[path]
                    if (entry instanceof Error) throw entry
                    return { register: entry }
                }
                const exports: Record<string, unknown> = {}
                // Mod callbacks share the engine's realm, including JSON object prototypes.
                new Function('System', fflate.strFromU8(mod.files[path]))({
                    register(dependencies: string[], declare: Function) {
                        assert.deepEqual(Array.from(dependencies), [])
                        declare((key: string, value: unknown) => { exports[key] = value }).execute()
                    },
                })
                return exports
            },
        },
    }
    runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {},
        console: { info() {}, error: (...args: unknown[]) => errors.push(args) } })
    return { load: module.exports.loadInstalledMods, failures, errors }
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
        assert.equal(result.gameplayDefinitions.length, 1)
        assert.equal(result.presentationDefinitions.length, 0)
        assert.equal([...result.clientContent.entries()].length, 0)
        assert.deepEqual(result.gameplay.components.snapshot(new World()), {})
        for (const views of [result.plantViews, result.zombieViews]) {
            assert.equal(views.has('test:leaked'), false)
            views.register('test:after', () => ({}))
        }
        const [definitions, levels, strings, seedCatalog] = base()
        result.gameplay.freeze(buildGameplayContent(definitions, levels, strings, seedCatalog, result.gameplayDefinitions).definitions)
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
    try {
        const output = join(temporary, 'example')
        const packed = spawnSync(process.execPath, ['tools/mod.mjs', 'pack', 'mods/example-plant', '--out', output], { encoding: 'utf8' })
        assert.equal(packed.status, 0, packed.stdout + packed.stderr)
        const archive = fflate.unzipSync(readFileSync(output + '.zip'))
        const files = Object.fromEntries(Object.entries(archive).map(([name, bytes]) => [name.slice('example/'.length), bytes]))
        const manifest = modApi.parseModManifest(JSON.parse(fflate.strFromU8(files['manifest.json'])))
        assert.match(manifest.contentHash, /^[a-f0-9]{64}$/)
        assert.ok(!Object.keys(files).some(name => name.endsWith('.ts')))
        assert.deepEqual(JSON.parse(fflate.strFromU8(files['assets/gameplay.json'])), gameplay().data)
        assert.deepEqual(JSON.parse(fflate.strFromU8(files['assets/presentation.json'])), presentation().data)
        assert.ok(!Object.keys(files).some(name => /^assets\/(gameplay|presentation)\//.test(name)))
        const loader = modLoader([{ manifest, files, content: parseModContent(contentJson(files, 'content.json'), files) }])
        const loaded = await loader.load()
        const [definitionsValue, levelsValue, stringsValue, seedCatalog] = base()
        // The VM emulates Cocos; copy its JSON across the test realm boundary.
        const gameplayDefinitions = JSON.parse(JSON.stringify(loaded.gameplayDefinitions))
        const presentationDefinitions = JSON.parse(JSON.stringify(loaded.presentationDefinitions))
        const { definitions, levels } = buildGameplayContent(definitionsValue, levelsValue, stringsValue, seedCatalog, gameplayDefinitions)
        const visuals = buildPresentationDefinitions(readPresentationSource(), presentationDefinitions)
        assert.ok(Object.isFrozen(definitions.plants['example:rapid_pea']))
        assert.deepEqual(levels.levels['pvz:adventure-1-1'].seedPackets, ['pvz:peashooter', 'example:rapid_pea'])
        assert.deepEqual(levelsValue.levels['pvz:adventure-1-1'].seedPackets, ['pvz:peashooter'])
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
    } finally { rmSync(temporary, { recursive: true, force: true }) }
})
