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
import test from 'node:test'
import * as fflate from 'fflate'
import { loadScript } from '../loadScript'
import { ModAssets } from '@/shared/mod/ModAssets'
import { ModHost } from '@/shared/mod/ModHost'
import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import { defineComponent, World } from '@/ecs'
import { DefinitionSources } from '@/shared/content/DefinitionRegistry'
import { createServerModHost } from '@/server/session/createModHost'
import * as modApi from '@/shared/mod'
import { buildGameplayContent, buildPresentationDefinitions } from '@/shared/content/DefinitionRegistry'
import { parsePresentationDefinitions } from '@/shared/content/presentation'
import { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'
import { assertPresented } from '@/client/content/assertPresented'
import { IntegratedGameServer } from '@/server/session/IntegratedGameServer'
import { GameplayRegistry } from '@/server/registry/GameplayRegistry'
import { runCommand } from '../server/run-command'
import { parseModContent, contentJson } from '@/shared/mod/content'
import { debugSuccess, getDebugCliCompletions, parseDebugCliCommand, type DebugCliCommand } from '@/shared/debug/DebugCli'
import { executor } from '@/server/debug/debugCommands'
import { startFromSave } from '../server/start-from-save'

const base = () => readBaseContent().gameplay
const gameplay = () => ({ ownerId: 'example', data: readModContent('mods/example/content.json').gameplay })
const presentation = () => ({ ownerId: 'example', data: readModContent('mods/example/content.json').presentation })
const build = (sources = [gameplay()]) => {
    return buildGameplayContent(base(), sources)
}

function installed(id: string, server: any, client?: any) {
    const manifest = modApi.parseModManifest({ schemaVersion: 1, apiVersion: 1, id, version: '1.0.0', contentHash: id, dependencies: [],
        gameplay: { nodeModule: 'node.js', cocosModule: 'server.js' }, ...(client ? { client: { module: 'client.js' } } : {}) })
    return { manifest, content: { resources: {} }, files: { 'sprite.png': new Uint8Array([0]) }, modules: { 'server.js': server, 'client.js': client } }
}

test('Mod JSON decodes UTF-8 without package imports and uses the native single-argument decoder contract', () => {
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
    const exports = loadScript('assets/scripts/shared/mod/ModAssets.ts',
        (id: string) => assert.fail(`ModAssets must not import a runtime package: ${id}`), { TextDecoder: NativeDecoder })
    const expected = { name: '玉米投手', description: 'Butter 🧈', damage: 20 }
    const files = { 'assets/test.json': new TextEncoder().encode(JSON.stringify(expected)) }
    const assets = new exports.ModAssets(installed('utf8', () => {}).manifest, files)
    assert.deepEqual(JSON.parse(JSON.stringify(assets.json('assets/test.json'))), expected)
    assert.equal(decodes, 1)
})

test('Release preloading loads every running pack\'s resources, then has each animation ready to play', async () => {
    const steps: string[] = [], progress: number[] = []
    const modules: Record<string, unknown> = {
        './ModResources': { modResources: {
            async preload(report: (progress: number) => void) { steps.push('resources'); report(1) },
            async ids(kind: string) { return kind === 'reanim' ? ['pvz:sunflower', 'example:solar'] : [] },
        } },
        '@/client/reanim/ReanimAssets': { async prepareReanims(ids: string[]) { steps.push(...ids) } },
        '@/client/sound/SoundSystem': { SoundSystem: { async preloadAll() { steps.push('sounds') } } },
        '@/client/particle/ParticleAssets': { ParticleAssets: { async preloadAll() { steps.push('particles') } } },
        './preloadTasks': { async preloadTasks(tasks: (() => Promise<unknown>)[], report: (progress: number) => void = () => {}) {
            for (const [index, task] of tasks.entries()) { await task(); report((index + 1) / tasks.length) }
        } },
    }
    const exports = loadScript('assets/scripts/client/content/PreloadAssets.ts', (id: string) => modules[id] ?? {})
    await exports.preloadAssets((value: number) => progress.push(value))
    assert.deepEqual(steps, ['resources', 'pvz:sunflower', 'example:solar', 'sounds', 'particles'],
        'the archives\' resources are loaded before the animations are made ready from them')
    assert.ok(progress.every((value, index) => index === 0 || value >= progress[index - 1]))
    assert.equal(progress.at(-1), 1)
})

/** Exercise the real app loader without requiring the Cocos engine in Node. */
function modLoader(installed: any[], ready = async () => installed, clientModules: Record<string, unknown> = {}) {
    const hosts: ModHost[] = []
    const keep = (host: ModHost) => { hosts.push(host); return host }
    const gameplay = base()
    const presentation = parsePresentationDefinitions(readPresentationSource())
    // Each registry draws a type by its table's `view`, or its own kind without one, for the entity in its context, as the client's do.
    class Views extends EntityViewRegistry<any, any> {
        constructor(table: string, own: string | undefined, entity: string) {
            super((presentation: any, typeId) => presentation[table][typeId] && (presentation[table][typeId].view ?? own), context => context[entity].typeId)
            const views = [...Object.values(presentation.plants).map((entry: any) => entry.view ?? 'plant'), ...Object.values(presentation.zombies).map((entry: any) => entry.view ?? 'zombie'),
                ...Object.values(presentation.projectiles).map((entry: any) => entry.view ?? 'projectile'), ...Object.values(presentation.gridItems).map((entry: any) => entry.view),
                ...Object.values(presentation.items).map((entry: any) => entry.view ?? 'item'), 'award']
            for (const kind of new Set(views)) this.register(kind, () => ({}))
        }
    }
    class ClientViews {
        plants = new Views('plants', 'plant', 'plant'); zombies = new Views('zombies', 'zombie', 'zombie')
        projectiles = new Views('projectiles', 'projectile', 'projectile'); gridItems = new Views('gridItems', undefined, 'item'); items = new Views('items', 'item', 'item')
        events = { register() {}, checkpoint: () => () => {}, freeze() {} }
        checkpoint() {
            const undo = [this.plants, this.zombies, this.projectiles, this.gridItems, this.items, this.events].map(registry => registry.checkpoint())
            return () => { for (const step of undo.reverse()) step() }
        }
        freeze() { for (const registry of [this.plants, this.zombies, this.projectiles, this.gridItems, this.items, this.events]) registry.freeze() }
    }
    const failures = new Map<string, string>(), errors: unknown[][] = []
    const modules: Record<string, unknown> = {
        cc: { JsonAsset: class {} },
        '@/client/content/ModResources': { modResources: {
            async baseContent() { return { content: { gameplay: 'gameplay.json' }, files: {
                'gameplay.json': new TextEncoder().encode(JSON.stringify(gameplay)),
            } } },
        } },
        '@/client/content/ClientAnimationRegistry': { ClientAnimationRegistry },
        '@/client/content/assertPresented': { assertPresented },
        '@/shared/mod/content': { contentJson },
        // The base's own tables: validating it must not load the Mods it is validating them against.
        '@/client/content/loadPresentationDefinitions': { basePresentationJson: () => readPresentationSource() },
        '@/shared/content/DefinitionRegistry': { DefinitionSources, buildGameplayContent, buildPresentationDefinitions },
        '@/shared/mod/ModAssets': { ModAssets },
        '@/server/registry/GameplayRegistry': { GameplayRegistry },
        '@/server/session/createModHost': { createServerModHost: (...args: Parameters<typeof createServerModHost>) => keep(createServerModHost(...args)) },
        '@/client/content/ClientViews': { ClientViews },
        '@/client/content/createModHost': {
            ClientModAssets: class extends ModAssets { async sprite(path: string) {
                const png = this.bytes(path)
                assert.deepEqual(Array.from(png.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10])
                return { source: path }
            } },
            createClientModHost: (owner: string, sources: DefinitionSources, views: Record<string, Views>) =>
                keep(new ModHost(owner, { ...clientModules, 'content/definitions': sources, 'client/views': views })),
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
    const loader = loadScript('assets/scripts/app/ModLoader.ts', (id: string) => modules[id] ?? {},
        { console: { info() {}, error: (...args: unknown[]) => errors.push(args) } })
    return { load: loader.loadInstalledMods, failures, errors, dispose: () => { for (const host of hosts.reverse()) host.dispose() } }
}

test('a failed Mod rolls back both entries and patches; dependants skip while independent Mods keep loading', async () => {
    const target = { value: () => 1 }, registrations: string[] = []
    let disposeHealthy!: () => void
    const first = installed('first', ({ host, assets }: any) => {
        registrations.push(assets.id)
        host.get('content/definitions').register(assets.id, { plants: {} })
        disposeHealthy = host.around(target, 'value', (next: any) => next() + 1)
    })
    const old = installed('legacy', (api: any) => api.registerDefinitions('assets/gameplay.json'))
    const dependent = installed('dependent', () => assert.fail('A dependant must not execute after its dependency fails'))
    dependent.manifest.dependencies.push({ id: 'legacy', version: '1.0.0' })
    const broken = installed('broken', ({ host, assets }: any) => {
        const { specs } = host.get('shared/debug/DebugCli')
        host.around(specs, 'list', (next: any) => [...next(), { name: 'broken:leaked', parameters: [], minimum: 0 }])
        const { executor } = host.get('server/debug/debugCommands')
        host.around(executor, 'execute', (next: any, session: unknown, command: DebugCliCommand) =>
            command.name === 'broken:leaked' ? debugSuccess('Leaked command') : next(session, command))
        host.get('content/definitions').register(assets.id, { plants: { 'broken:leaked': {} } })
        const registry = host.get('gameplay/registry')
        const behavior = { createState: () => ({}), tick() {} }
        registry.plantBehaviors.register(assets.id, 'broken:leaked', behavior)
        registry.zombieBehaviors.register(assets.id, 'broken:leaked', behavior)
        registry.components.register(defineComponent('broken:leaked-state'))
        host.around(target, 'value', (next: any) => next() + 100)
    }, async ({ host, assets }: any) => {
        host.get('content/definitions').register(assets.id, { plants: { 'broken:leaked': {} } })
        const views = host.get('client/views')
        for (const registry of [views.plants, views.zombies]) {
            registry.register('broken:leaked', () => ({}))
            registry.freeze()
        }
        host.around(target, 'value', (next: any) => next() * 10)
        // Its server patches are live until it fails.
        live = [parseDebugCliCommand('/broken:leaked'), executor.execute(undefined as never, { name: 'broken:leaked', args: [] })]
        await Promise.reject(new Error('client initialization failed'))
    })
    const last = installed('last', ({ assets }: any) => { registrations.push(assets.id) })
    const execute = executor.execute
    let live: unknown[] = []
    const loader = modLoader([first, old, dependent, broken, last])
    try {
        const result = await loader.load()
        assert.equal(await loader.load(), result, 'a caught error must not leave a rejected startup promise or repeat registrations')
        assert.deepEqual(registrations, ['first', 'last'])
        assert.deepEqual(Array.from(result.manifests, (mod: any) => mod.id), ['first', 'last'])
        assert.equal(target.value(), 2, 'only the healthy Mod patch remains')
        assert.deepEqual(live, [{ name: 'broken:leaked', args: [] }, debugSuccess('Leaked command')])
        assert.deepEqual(getDebugCliCompletions('/broken:leaked', undefined, true), [])
        assert.equal((parseDebugCliCommand('/broken:leaked') as { failure: string }).failure, 'syntax')
        assert.equal(executor.execute, execute, 'the game command executor is unwrapped')
        assert.equal(result.gameplayDefinitions.length, 1)
        assert.equal(result.presentationDefinitions.length, 0)
        assert.deepEqual(result.gameplay.components.snapshot(new World()), {})
        for (const views of [result.views.plants, result.views.zombies]) {
            assert.equal(views.has('broken:leaked'), false)
            views.register('test:after', () => ({}))
        }
        const content = buildGameplayContent(base(), result.gameplayDefinitions)
        result.gameplay.freeze(content.definitions, content.levels)
        assert.match(loader.failures.get('legacy')!, /registerDefinitions is not a function/)
        assert.match(loader.failures.get('dependent')!, /Dependency failed to load: legacy/)
        assert.match(loader.failures.get('broken')!, /client.js.*client initialization failed/)
        assert.equal(loader.errors.length, 3)
    } finally { disposeHealthy?.() }
})

test('import failures and enabled-list errors leave a usable base-game Mod state', async () => {
    const bad = installed('bad-import', new Error('Module file is corrupt'))
    for (const loader of [modLoader([bad]), modLoader([], async () => { throw new Error('Cannot read Mod archive') })]) {
        const result = await loader.load()
        assert.equal(result.manifests.length, 0)
        assert.equal(result.gameplayDefinitions.length, 0)
        assert.equal(result.presentationDefinitions.length, 0)
        assert.equal(loader.errors.length, 1)
    }
})

test('invalid registered gameplay and presentation are rejected before UI startup, without rejecting other Mods', async () => {
    const badGameplay = installed('bad-config', ({ host, assets }: any) => {
        host.get('content/definitions').register(assets.id, { plants: { 'bad-config:invalid': { maxHealth: -1 } } })
    })
    const badPresentation = installed('bad-view', () => {}, ({ host, assets }: any) => {
        host.get('content/definitions').register(assets.id, { plants: { 'bad-view:invalid': { visual: {} } } })
    })
    const good = installed('good', () => {})
    const loader = modLoader([badGameplay, badPresentation, good])
    const result = await loader.load()
    assert.deepEqual(Array.from(result.manifests, (mod: any) => mod.id), ['good'])
    assert.equal(result.gameplayDefinitions.length, 0)
    assert.equal(result.presentationDefinitions.length, 0)
    assert.match(loader.failures.get('bad-config')!, /definitions:/)
    assert.match(loader.failures.get('bad-view')!, /definitions:/)
})

test('definition registries reject collisions, foreign namespaces, unresolved references and conflicting level patches', () => {
    assert.throws(() => build([gameplay(), gameplay()]), /duplicate registration/)
    assert.throws(() => build([{ ...gameplay(), ownerId: 'other' }]), /cannot register/)
    const missing = gameplay()
    missing.data.plants['example:rapid_pea'].shooter.projectile = 'example:missing'
    assert.throws(() => build([missing]), /unknown ID/)
    const conflict = { ownerId: 'other', data: { levelPatches: { 'pvz:adventure-1-1': { seedPackets: [] } } } }
    assert.throws(() => build([gameplay(), conflict]), /Conflicting level patch/)
    assert.throws(() => build([{ ownerId: 'other', data: { levelPatches: { 'other:missing': {} } } }]), /unknown level/)

    const source = readPresentationSource()
    const before = JSON.stringify(source)
    const installed = buildPresentationDefinitions(source, [presentation()])
    assert.equal(JSON.stringify(source), before, 'registration cannot change the base asset')
    assert.ok(Object.isFrozen(installed.plants['example:rapid_pea']))
    const invalid = presentation()
    delete invalid.data.plants['example:rapid_pea'].clips.blink
    // What draws a plant has the pictures of every clip its animation plays.
    const any = { draws: () => true }, views = { plants: any, zombies: any, projectiles: any, gridItems: any, items: any }
    assert.doesNotThrow(() => assertPresented(build(), installed, views))
    assert.throws(() => assertPresented(build(), buildPresentationDefinitions(source, [invalid]), views), /missing blink animation/)
})

test('a Mod adds and overrides item, award and rule presentations, and one missing fails at load', () => {
    const source = readPresentationSource()
    const any = { draws: () => true }, views = { plants: any, zombies: any, projectiles: any, gridItems: any, items: any }
    const sun = source.items['pvz:sun'], almanac = source.awards['pvz:almanac'], whack = source.rules['pvz:whack-a-zombie']
    // Like every other table: new IDs in the Mod's own namespace, anyone's through overrides.
    const plain = buildPresentationDefinitions(source, [presentation()])
    const added = buildPresentationDefinitions(source, [{ ownerId: 'example', data: { ...presentation().data,
        items: { 'example:moon': sun }, awards: { 'example:key': almanac }, rules: { 'example:rule': whack },
        overrides: { items: { 'pvz:sun': { ...sun, offset: [1, 2] } }, awards: { 'pvz:almanac': { ...almanac, x: 7 } }, rules: { 'pvz:whack-a-zombie': { ...whack, seedBankSlide: 3 } } },
    } }])
    assert.deepEqual([added.items['example:moon'], added.awards!['example:key'], added.rules!['example:rule']], [sun, almanac, whack])
    assert.deepEqual([added.items['pvz:sun'].offset, added.awards!['pvz:almanac'].x, added.rules!['pvz:whack-a-zombie'].seedBankSlide], [[1, 2], 7, 3])
    for (const kind of ['items', 'awards', 'rules']) {
        assert.throws(() => buildPresentationDefinitions(source, [{ ownerId: 'other', data: { [kind]: { 'pvz:extra': {} } } }]), /cannot register pvz:extra/)
    }

    // A gameplay item or a level award the presentation has nothing for fails as content is put together.
    const content = build()
    const item = { ...content, definitions: { ...content.definitions, items: { ...content.definitions.items, 'example:moon': content.definitions.items['pvz:sun'] } } }
    assert.throws(() => assertPresented(item, plain, views), /Item presentation is not installed: example:moon/)
    assert.doesNotThrow(() => assertPresented(item, added, views))
    const level = content.levels.levels['pvz:adventure-1-4'], award = { ...level.award, id: 'example:key' } as typeof level.award
    const awarded = { ...content, levels: { ...content.levels, levels: { ...content.levels.levels, 'example:level': { ...level, award } } } }
    assert.throws(() => assertPresented(awarded, plain, views), /Award presentation is not installed: example:key/)
    assert.doesNotThrow(() => assertPresented(awarded, added, views))
    const note = { ...content.levels.levels['pvz:adventure-1-9'].award, id: 'example:key' } as typeof level.award
    const noted = { ...content, levels: { ...content.levels, levels: { ...content.levels.levels, 'example:level': { ...level, award: note } } } }
    assert.throws(() => assertPresented(noted, added, views), /Award presentation is not installed: example:key/, 'a note needs its pages')
})

test('overrides replace whole existing definitions by ID, one Mod per ID, before level patches apply', () => {
    const basePlants = base().plants
    const peashooter = { ...basePlants['pvz:peashooter'], maxHealth: 999 }
    const level = build([]).levels.levels['pvz:adventure-1-1'] as any
    const override = { ownerId: 'other', data: { overrides: {
        plants: { 'pvz:peashooter': peashooter },
        levels: { 'pvz:adventure-1-1': { ...level, seedPackets: ['pvz:sunflower'] } },
    } } }
    const result = build([override])
    assert.equal(result.definitions.plants['pvz:peashooter'].maxHealth, 999, 'the base ID now resolves to the Mod definition')
    assert.equal(base().plants['pvz:peashooter'].maxHealth, basePlants['pvz:peashooter'].maxHealth, 'the base asset is unchanged')
    assert.deepEqual(result.levels.levels['pvz:adventure-1-1'].seedPackets, ['pvz:sunflower'])
    const patch = { ownerId: 'third', data: { levelPatches: { 'pvz:adventure-1-1': { seedPackets: ['pvz:peashooter'] } } } }
    assert.deepEqual(build([override, patch]).levels.levels['pvz:adventure-1-1'].seedPackets, ['pvz:peashooter'], 'level patches apply to the overridden level')
    // Another Mod's IDs can be overridden too, whatever the load order.
    const rapid = gameplay().data.plants['example:rapid_pea']
    const late = { ownerId: 'other', data: { overrides: { plants: { 'example:rapid_pea': { ...rapid, maxHealth: 7 } } } } }
    assert.equal(build([late, gameplay()]).definitions.plants['example:rapid_pea'].maxHealth, 7)
    assert.throws(() => build([override, { ...override, ownerId: 'third' }]), /Conflicting override: plants\/pvz:peashooter/)
    assert.throws(() => build([{ ownerId: 'other', data: { overrides: { plants: { 'pvz:missing': peashooter } } } }]), /overrides unknown plants/)
    assert.throws(() => build([{ ownerId: 'other', data: { overrides: { plants: { 'pvz:peashooter': { ...peashooter, maxHealth: -1 } } } } }]), /maxHealth/,
        'overridden definitions are validated like any other')

    const source = readPresentationSource()
    const view = { ...source.plants['pvz:sunflower'] }
    const visuals = buildPresentationDefinitions(source, [{ ownerId: 'other', data: { overrides: { plants: { 'pvz:peashooter': view } } } }])
    assert.deepEqual(visuals.plants['pvz:peashooter'], buildPresentationDefinitions(source).plants['pvz:sunflower'], 'presentation overrides work the same way')
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
        assert.ok(loaded.views.plants.has('example:beacon'))
        assert.deepEqual(getDebugCliCompletions('/example:').sort(), ['/example:charge', '/example:hello'])
        assert.deepEqual(await client.executor.execute('/sun set 1', true, () => assert.fail()), { ok: false, failure: 'condition', key: 'DEBUG_NO_ACTIVE_GAME' }, 'failed conditions name a string key')
        parseParticle(contentJson(files, 'assets/particles/sparks.json'))
        parseReanim(contentJson(files, 'assets/reanim/beacon.json'))
        const hello = await client.executor.execute('/example:hello', false, () => assert.fail('client command must not reach server'))
        assert.match(hello.ok ? hello.message : '', /Mod Lab/)
        await new Promise(setImmediate)
        assert.deepEqual(client.sounds, ['example:chime'])
        const menu = new client.MainMenuScreen()
        await menu.initialize(menu.ui); await menu.initialize(menu.ui)
        assert.equal(menu.initialized, 2, 'wrapper keeps the original menu initialization')
        assert.equal(client.buttons.length, 1, 're-initializing does not duplicate the Mod panel')
        client.buttons[0].onClick()
        assert.match(client.dialogs[0].options.message, /example:charge/)
        const particles: unknown[][] = []
        const view = await loaded.views.plants.create({ node: new client.Node(), plant: { typeId: 'example:beacon' },
            content: { presentation: { plants: { 'example:beacon': { view: 'example:beacon' } } } },
            stage: { particle: (...args: unknown[]) => particles.push(args) } })
        assert.equal(view.body.loadedId, 'example:beacon')
        const world = { phase: 'gameplay', result: 'playing', paused: false, gameplayTick: 50, extensions: { 'example:charge': { '1': { remainingTicks: 200 } } } }
        view.sync({ entityId: 1, x: 0, y: 0 }, world)
        view.sync({ entityId: 1, x: 0, y: 0 }, world)
        assert.equal(particles.length, 1, 'drawing the same authoritative tick does not duplicate particles')
        world.paused = true; world.gameplayTick = 100
        view.sync({ entityId: 1, x: 0, y: 0 }, world)
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
        assert.equal(baseGameplay.levels['pvz:adventure-1-1'].seedPackets, undefined, 'the base 1-1 bank comes from the available seeds')
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
        startFromSave(server, saved, { levelId: 'example:testing', mods: mods })
        const restored = new IntegratedGameServer(definitions, levels, systems)
        startFromSave(restored, server.save(), { levelId: 'example:testing', mods: mods })
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
        assert.throws(() => startFromSave(restored, bad, { levelId: 'example:testing', mods: mods }), /Invalid example charge/)
        assert.equal(runCommand(server, { type: 'pause' }), undefined)
        for (let i = 0; i < 20; i++) server.tick()
        assert.equal((server.snapshot().extensions['example:charge'] as any)[beacon.entityId].remainingTicks, 300)
        assert.equal(runCommand(server, { type: 'resume' }), undefined)
        startFromSave(restored, server.save(), { levelId: 'example:testing', mods: mods })
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
