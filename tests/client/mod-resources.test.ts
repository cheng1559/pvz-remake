import { decodePremultipliedPng } from '@/client/content/PremultipliedPng'
import { strFromU8,strToU8,unzipSync,zipSync } from 'fflate'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind,ScriptTarget,transpileModule } from 'typescript'
import { readBaseContent } from '../../tools/mod/content'

function setup() {
    const files = new Map<string, any>()
    const storage = new Map<string, string>()
    const requests: string[] = []
    const archives = new Map<string, Uint8Array>()
    const modArchives = new Map<string, Uint8Array>()
    const pendingArchives = new Map<string, Uint8Array>()
    const jsb = { selectFiles: undefined as ((extension: string, callback: (paths: string[], error?: string | null) => void) => void) | undefined }
    let picker: any
    const db = {
        failWrite: false,
        archives,
        createObjectStore() {},
        transaction() {
            const database = this
            const archives = this.archives
            const transaction: any = { objectStore: () => ({
                get(id: string) {
                    const request: any = {}
                    queueMicrotask(() => { request.result = archives.get(id)?.slice(); request.onsuccess() })
                    return request
                },
                getAllKeys() {
                    const request: any = {}
                    queueMicrotask(() => { request.result = [...archives.keys()]; request.onsuccess() })
                    return request
                },
                put(data: Uint8Array, id: string) {
                    queueMicrotask(() => {
                        if (database.failWrite) { transaction.error = new Error('Storage full'); transaction.onabort(); return }
                        archives.set(id, data.slice())
                        transaction.oncomplete()
                    })
                },
                delete(id: string) {
                    queueMicrotask(() => {
                        if (database.failWrite) { transaction.error = new Error('Storage full'); transaction.onabort(); return }
                        archives.delete(id)
                        transaction.oncomplete()
                    })
                },
            }) }
            return transaction
        },
    }
    const modDb = { ...db, archives: modArchives }
    const pendingDb = { ...db, archives: pendingArchives }
    class Asset { name = '' }
    class JsonAsset extends Asset { json: any }
    class TextAsset extends Asset { text = '' }
    class AudioClip extends Asset { nativeUrl = '' }
    class Texture {
        static WrapMode = { CLAMP_TO_EDGE: 0 }
        static Filter = { LINEAR: 1, NEAREST: 0 }
        static PixelFormat = { RGBA8888: 0 }
        width = 100; height = 140
        pixels?: Uint8Array
        reset(size: { width: number; height: number }) { this.width = size.width; this.height = size.height }
        uploadData(pixels: Uint8Array) { this.pixels = pixels.slice() }
        set image(image: any) { this.width = image.width; this.height = image.height }
        setWrapMode() {}
        filters: number[] = []
        setFilters(min: number, mag: number) { this.filters = [min, mag] }
    }
    class Vector {
        width: number; height: number; x: number; y: number
        constructor(...values: number[]) {
            Object.assign(this, values)
            this.x = values[0]; this.y = values[1]
            this.width = values.length > 2 ? values[2] : values[0]
            this.height = values.length > 2 ? values[3] : values[1]
        }
    }
    class Frame { reset(data: any) { Object.assign(this, data) } }
    const asset = (path: string) => {
        requests.push(path)
        const value = files.get(path)
        if (value === undefined) throw new Error(`Missing ${path}`)
        return value
    }
    const modules: Record<string, any> = {
        fflate: { default: { unzipSync, strFromU8 } },
        cc: { Asset, JsonAsset, TextAsset, AudioClip, Texture2D: Texture, SpriteFrame: Frame, Rect: Vector, Size: Vector, Vec2: Vector,
            dynamicAtlasManager: { enabled: true }, macro: {},
            sys: { isNative: false, isBrowser: false, OS: { IOS: 'iOS' }, localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key),
                key: (index: number) => [...storage.keys()][index] ?? null, get length() { return storage.size } } },
            assetManager: { loadRemote: (path: string, options: any, callback?: any) => {
                const complete = callback ?? options
                try {
                    const value = asset(path)
                    if (options.ext === '.png' && value instanceof Uint8Array) {
                        const view = new DataView(value.buffer, value.byteOffset, value.byteLength)
                        complete(null, { width: view.getUint32(16), height: view.getUint32(20) })
                        return
                    }
                    complete(null, /\.(mp3|wav)$/.test(options.ext ?? '') ? Object.assign(new AudioClip(), { nativeUrl: path }) : value)
                } catch (error) { complete(error) }
            }, releaseAsset() {} } },
        './SpriteDensity': { setSpriteDensity() {}, applySpriteDensity(frame: any) { frame.normalized = true } },
        './PremultipliedPng': { decodePremultipliedPng },
    }
    const blobs = new Map<string, Blob>()
    class TestURL extends URL {
        static createObjectURL(blob: Blob) {
            const path = `blob:pack-${files.size}`
            files.set(path, { width: 100, height: 140 })
            blobs.set(path, blob)
            return path
        }
    }
    const load = (path: string) => {
        const module = { exports: {} as Record<string, any> }
        const code = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } })
        runInNewContext(code.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {},
            setTimeout, URL: TestURL, Blob, Uint8Array, DataView, TextDecoder, TextEncoder, jsb, location: { href: 'https://game.example/' },
            indexedDB: { open: (name: string) => {
                const request: any = { result: name === 'pvz-remake-mods' ? modDb : name === 'pvz-remake-mod-pending' ? pendingDb : db }
                queueMicrotask(() => { request.onupgradeneeded(); request.onsuccess() })
                return request
            } },
            document: { body: { appendChild() {} }, createElement: () => picker = { click() {}, remove() {}, addEventListener(name: string, callback: unknown) { this[name] = callback } } },
        })
        return module.exports
    }
    const archive = load('assets/scripts/client/content/InstalledArchives.ts')
    modules['./InstalledArchives'] = modules['@/client/content/InstalledArchives'] = archive
    modules['@/shared/mod'] = modules['@/shared/mod/index'] = load('assets/scripts/shared/mod/index.ts')
    modules['@/shared/mod/content'] = load('assets/scripts/shared/mod/content.ts')
    const { ModManager } = load('assets/scripts/client/content/ModManager.ts')
    const manager = new ModManager()
    modules['./ModManager'] = modules['@/client/content/ModManager'] = { modManager: manager }
    const { ModResources } = load('assets/scripts/client/content/ModResources.ts')
    const fresh = (base?: () => Promise<Uint8Array>) => new ModResources(base, new ModManager())
    const resources = new ModResources(undefined, manager)
    modules['./ModResources'] = modules['@/client/content/ModResources'] = { modResources: resources }
    return { manager, ModManager, ModResources, fresh, resources, files, storage, requests, modules, load,
        Texture, archive, archives: modArchives, pendingArchives, db: modDb, jsb, blobs, picker: () => picker }
}

function modFiles(id = 'screen', version = '1.0.0', dependencies: { id: string, version: string }[] = []) {
    return {
        'manifest.json': strToU8(JSON.stringify({ schemaVersion: 1, id, version, apiVersion: 1, contentHash: `${id}-${version}`, dependencies,
            client: { module: 'client/index.js' } })),
        'content.json': strToU8('{"resources":{}}'),
        'client/index.js': strToU8('System.register([], function () { return { execute: function () {} }; });'),
    }
}

function zipFiles(id = 'hd', tag = 'first', options: any = {}) {
    const image = new Uint8Array(readFileSync(`mods/pvz-base/${readBaseContent().resources.sprites['pvz:seedpacket_larger'].file}`))
    const { locale, ...sprite } = options
    const resources = { sprites: { 'pvz:button': { file: 'button.png', width: 50, height: 70, scale: 2, ...sprite } },
        fonts: { 'pvz:demo': 'fonts/demo.json' }, audio: { 'pvz:chomp': 'audio/chomp.mp3' },
        json: { 'pvz:config': 'config.json' }, text: { 'pvz:note': 'note.txt' } }
    return { 'manifest.json': strToU8(JSON.stringify({ schemaVersion: 1, id, version: '1.0.0', apiVersion: 1, contentHash: tag, dependencies: [],
            ...(locale ? { locale } : {}) })),
        'content.json': strToU8(JSON.stringify({ resources })), 'button.png': image,
        'fonts/demo.json': strToU8(JSON.stringify({ layers: [{ image: 'atlas', textureScale: 4 }] })), 'fonts/atlas.png': image,
        'audio/chomp.mp3': strToU8('ID3-' + tag), 'config.json': strToU8(JSON.stringify({ tag })), 'note.txt': strToU8(tag) }
}

const key = 'pvz-remake:player-mods:none:state'
/** The stored archive a player's Mod points at. */
const archiveOf = (storage: Map<string, string>, id: string, profile: number | 'none' = 'none') =>
    JSON.parse(storage.get(`pvz-remake:player-mods:${profile}:state`) ?? '{"installed":{}}').installed[id] as string | undefined


test('bootstrap artwork loads from the base archive without waiting for Mod installation', async () => {
    const { ModResources, modules } = setup()
    let baseReads = 0, modReads = 0
    const resources = new ModResources(async () => { baseReads++; return zipSync(zipFiles('pvz')) }, {
        ready: async () => { modReads++; return [] },
    })
    const frame = await resources.baseAsset('pvz:button', modules.cc.SpriteFrame)
    assert.ok(frame)
    assert.equal(modReads, 0)
    await resources.ready()
    assert.equal(modReads, 1)
    assert.equal(baseReads, 1, 'ordinary loading reuses the archive already opened for the logo')
    assert.equal(await resources.baseAsset('pvz:button', modules.cc.SpriteFrame), frame)
})

test('the builtin archive and resource-only Mods share validation and decoding', async () => {
    const { manager, fresh, modules } = setup()
    const bytes = new Uint8Array(readFileSync('assets/resources/base.zip'))
    const base = fresh(async () => bytes)
    const archive = await base.baseContent()
    const definitions = JSON.parse(new TextDecoder().decode(archive.files[archive.content.gameplay!]))
    assert.equal(definitions.seeds['pvz:peashooter'].sunCost, 100)
    const source = readBaseContent()
    assert.deepEqual(definitions, source.gameplay, 'the ZIP matches the shared authoring index')
    assert.deepEqual(JSON.parse(new TextDecoder().decode(archive.files[archive.content.presentation!])), source.presentation)
    assert.equal(archive.files['base-content.json'], undefined)
    assert.equal(archive.content.resources.json['pvz:content'], undefined)
    const animation = await base.asset('pvz:sodroll', modules.cc.JsonAsset, undefined, 'reanim')
    const particle = await base.asset('pvz:sodroll', modules.cc.JsonAsset, undefined, 'particles')
    assert.ok(Array.isArray(animation.json.tracks), 'same-name animation resolves within its own category')
    assert.ok(Array.isArray(particle.json.emitters), 'same-name particle resolves within its own category')
    assert.notEqual(animation, particle)

    const font = await base.font('pvz:briannetod12')
    assert.ok(font.textures.length > 0)
    for (const texture of font.textures) assert.deepEqual(texture.filters, [1, 0], 'base fonts blend thin strokes when shrinking and retain nearest magnification')
    assert.ok((await base.ids(modules.cc.JsonAsset)).includes('pvz:selector_open'))
    await manager.install(zipSync(zipFiles()))
    const resources = fresh()
    const frame = await resources.sprite('pvz:button')
    assert.equal(frame.originalSize.width, 50)
    assert.equal(frame.originalSize.height, 70)
    assert.equal(await resources.sprite('pvz:button'), frame)
    const modFont = await resources.font('pvz:demo')
    assert.equal(modFont.config.json.layers[0].textureScale, 4)
    for (const texture of modFont.textures) assert.deepEqual(texture.filters, [1, 1], 'Mod fonts keep their existing linear sampling')
    assert.equal((await resources.asset('pvz:config', modules.cc.JsonAsset)).json.tag, 'first')
    assert.equal((await resources.asset('pvz:note', modules.cc.TextAsset)).text, 'first')
    assert.ok(await resources.asset('pvz:chomp', modules.cc.AudioClip))
})

test('one saved order controls overrides, scoped sprites and restart-only activation', async () => {
    const { manager, fresh, ModManager, modules } = setup()
    await manager.install(zipSync(zipFiles('first', 'first', { locale: 'zh-CN' })))
    await manager.install(zipSync(zipFiles('last', 'last', { animations: ['pvz:blink'] })))
    assert.equal((await manager.ready()).length, 0)
    const running = fresh()
    assert.equal((await running.asset('pvz:config', modules.cc.JsonAsset)).json.tag, 'last')
    assert.deepEqual(Array.from(await running.jsonLayers('pvz:config'), (layer: any) => layer.json.tag), ['first', 'last'],
        'text tables merge every layer, lowest priority first')
    assert.equal(await running.locale(), 'zh-CN', 'the text language comes from the last running Mod that declares one')
    assert.notEqual(await running.sprite('pvz:button'), await running.sprite('pvz:button', 'pvz:blink'))
    assert.equal(await manager.setEnabled(['last', 'first']), true)
    assert.equal((await running.asset('pvz:config', modules.cc.JsonAsset)).json.tag, 'last')
    assert.equal((await fresh().asset('pvz:config', modules.cc.JsonAsset)).json.tag, 'first')
    assert.deepEqual(Array.from(await new ModManager().list()), ['last', 'first'])
    await manager.install(zipSync(zipFiles('last', 'updated')))
    assert.deepEqual(Array.from(await new ModManager().list()), ['last', 'first'], 'updating a Mod preserves its saved priority')
    assert.equal((await fresh().asset('pvz:config', modules.cc.JsonAsset)).json.tag, 'first')
    assert.equal(await manager.unload('all'), true)
    assert.equal(await fresh().asset('pvz:config', modules.cc.JsonAsset), undefined)
})

test('disabled Mods retain their saved positions across restart, toggles and updates', async () => {
    const { manager, ModManager } = setup()
    await manager.install(zipSync(zipFiles('first')))
    await manager.install(zipSync(zipFiles('last')))
    await manager.install(zipSync(zipFiles('disabled')), false)
    const enabled = ['last', 'first']
    await manager.setEnabled(enabled, ['first', 'disabled', 'last'])
    const order = ['disabled', 'first', 'last']
    assert.equal(await manager.setEnabled(enabled, order), false, 'moving only a disabled row does not require restarting')
    const restarted = new ModManager()
    const installed = async () => Array.from(await new ModManager().installed(), (entry: any) => entry.id)
    assert.deepEqual(await installed(), order)
    assert.deepEqual(Array.from(await restarted.list()), enabled)
    await restarted.load('disabled')
    assert.deepEqual(Array.from(await restarted.list()), ['last', 'first', 'disabled'])
    await restarted.unload('disabled')
    await restarted.install(zipSync(zipFiles('disabled', 'updated')), false)
    assert.deepEqual(await installed(), order)
    await restarted.uninstall('disabled')
    assert.deepEqual(await installed(), ['first', 'last'])
})

test('updates, uninstalls and failed writes preserve running bytes', async () => {
    const { manager, fresh, ModManager, archives, db, modules, storage } = setup()
    const original = zipSync(zipFiles())
    await manager.install(original)
    const running = fresh()
    assert.equal((await running.asset('pvz:config', modules.cc.JsonAsset)).json.tag, 'first')
    const stored = archiveOf(storage, 'hd')!, saved = archives.get(stored)
    assert.ok(saved)
    db.failWrite = true
    await assert.rejects(manager.install(zipSync(zipFiles('hd', 'second'))), /Storage full/)
    assert.equal(archiveOf(storage, 'hd'), stored)
    assert.equal(archives.get(stored), saved)
    db.failWrite = false
    await manager.install(zipSync(zipFiles('hd', 'second')))
    assert.equal((await fresh().asset('pvz:config', modules.cc.JsonAsset)).json.tag, 'second')
    assert.equal(archives.has(stored), false, 'the replaced version is removed once no player uses it')
    await manager.uninstall('hd')
    assert.equal(archives.size, 0)
    assert.equal((await running.asset('pvz:config', modules.cc.JsonAsset)).json.tag, 'first')
    assert.equal((await new ModManager().ready()).length, 0)
})

test('importing pvz is rejected without changing installed archives or settings', async () => {
    const { manager, archives, storage } = setup()
    await manager.install(zipSync(modFiles('existing')))
    const beforeArchives = new Map(archives), beforeStorage = new Map(storage)
    for (const enable of [true, false]) {
        await assert.rejects(manager.install(zipSync(modFiles('pvz')), enable), /pvz is built in and cannot be imported/)
        assert.deepEqual(archives, beforeArchives)
        assert.deepEqual(storage, beforeStorage)
    }
    await assert.rejects(manager.prepareImport(zipSync(modFiles('pvz'))), /pvz is built in and cannot be imported/)
})

test('the Mod list reads only manifests of Mods not loaded this session, and enabling one validates it on Apply', async () => {
    const { manager, ModManager, modules } = setup()
    await manager.install(zipSync(modFiles('idle', '3.1.0')), false)
    const manager2 = new ModManager()
    const unzip = modules.fflate.default.unzipSync, inflated: string[] = []
    modules.fflate.default.unzipSync = (data: Uint8Array, options?: { filter?: (entry: { name: string }) => boolean }) => {
        const entries = unzip(data, options)
        inflated.push(...Object.keys(entries))
        return entries
    }
    const versions = await manager2.installed()
    modules.fflate.default.unzipSync = unzip
    assert.equal(versions.find((mod: any) => mod.id === 'idle').version, '3.1.0')
    assert.deepEqual(inflated, ['manifest.json'], 'opening the list inflates only the manifest')
    inflated.length = 0
    modules.fflate.default.unzipSync = (...args: Parameters<typeof unzip>) => { inflated.push('read'); return unzip(...args) }
    await manager2.installed()
    modules.fflate.default.unzipSync = unzip
    assert.deepEqual(inflated, [], 'reopening the list reuses the versions it read')
    await manager2.install(zipSync(modFiles('idle', '3.2.0')), false)
    assert.equal((await manager2.installed()).find((mod: any) => mod.id === 'idle').version, '3.2.0')
    await manager2.queueChanges({ enabled: ['idle'], order: ['idle'], imports: [], uninstalls: [] })
    assert.equal(manager2.hasPendingChanges(), true)
})

test('cancelled draft imports discard staged ZIPs and preserve installed archives and settings', async () => {
    const { manager, archives, pendingArchives, storage } = setup()
    await manager.install(zipSync(modFiles('parent')))
    await manager.installed()
    const beforeArchives = new Map(archives), beforeStorage = new Map(storage)
    const child = await manager.prepareImport(zipSync(modFiles('child', '1.0.0', [{ id: 'parent', version: '>=2.0.0' }])))
    const parent = await manager.prepareImport(zipSync(modFiles('parent', '2.0.0')))
    assert.deepEqual(archives, beforeArchives, 'selecting an update does not replace the installed ZIP')
    assert.deepEqual(storage, beforeStorage, 'a cancelled draft has no persistent changes')
    await assert.rejects(manager.queueChanges({ enabled: ['parent', 'child'], order: ['child', 'parent'], imports: [child], uninstalls: [] }), /requires parent/)
    assert.deepEqual(archives, beforeArchives, 'invalid dependencies are rejected before saving any imports')
    assert.deepEqual(storage, beforeStorage)
    await manager.discardImports([child, parent])
    assert.equal(pendingArchives.size, 0)
    assert.deepEqual(archives, beforeArchives)
    assert.deepEqual(storage, beforeStorage)
})

test('Apply queues metadata without decoding ZIPs or changing installed Mods; startup applies and retries the job', async () => {
    const { manager, ModManager, archives, pendingArchives, storage, modules, db } = setup()
    await manager.install(zipSync(modFiles('parent')))
    await manager.install(zipSync(modFiles('remove')))
    await manager.installed()
    const child = await manager.prepareImport(zipSync(modFiles('child', '1.0.0', [{ id: 'parent', version: '>=2.0.0' }])))
    const parent = await manager.prepareImport(zipSync(modFiles('parent', '2.0.0')))
    const before = new Map(archives), enabled = storage.get(key), removed = archiveOf(storage, 'remove')!
    const unzip = modules.fflate.default.unzipSync
    modules.fflate.default.unzipSync = () => assert.fail('Apply must not decode ZIP files')
    await manager.queueChanges({ enabled: ['parent', 'child'], order: ['child', 'parent'],
        imports: [child, parent], uninstalls: ['remove'] })
    modules.fflate.default.unzipSync = unzip
    assert.deepEqual(archives, before)
    assert.equal(storage.get(key), enabled)
    assert.equal(pendingArchives.size, 2)
    assert.equal(manager.hasPendingChanges(), true)
    db.failWrite = true
    await assert.rejects(new ModManager().applyPendingChanges(), /Storage full/)
    assert.deepEqual(archives, before)
    assert.equal(manager.hasPendingChanges(), true, 'failed jobs retain the queue and original staged ZIPs for retry')
    assert.equal(pendingArchives.size, 2)
    db.failWrite = false
    const boot = new ModManager(), progress: number[] = []
    boot.deferPendingChanges()
    let resourcesReady = false
    const loading = boot.ready().then(() => { resourcesReady = true })
    await Promise.resolve()
    assert.equal(resourcesReady, false, 'resource requests wait until the existing startup logo starts applying changes')
    assert.deepEqual(archives, before)
    await boot.applyPendingChanges(async (value: number) => { progress.push(value) })
    await loading
    assert.equal(resourcesReady, true)
    assert.equal(progress.at(-1), 1)
    assert.equal(boot.hasPendingChanges(), false)
    assert.equal(pendingArchives.size, 0)
    assert.equal(archives.has(removed), false)
    assert.equal(archives.size, 2)
    assert.deepEqual(Array.from(await boot.list()), ['parent', 'child'])
    assert.equal((await boot.installed()).find((mod: any) => mod.id === 'parent').version, '2.0.0')
    const cancelled = await boot.prepareImport(zipSync(modFiles('cancelled')))
    await boot.discardImports([cancelled])
    assert.equal(pendingArchives.size, 0)
    assert.equal(archives.has('cancelled'), false)
})

test('ZIP, geometry and dependency failures do not change installed state', async () => {
    const { manager, archives } = setup()
    await assert.rejects(manager.install(zipSync({ ...zipFiles(), '../escape.txt': strToU8('x') })), /Invalid ZIP path/)
    await assert.rejects(manager.install(zipSync(zipFiles('bad', 'bad', { width: 49 }))), /dimensions/)
    await assert.rejects(manager.install(zipSync(modFiles('child', '1.0.0', [{ id: 'parent', version: '>=1.0.0' }]))), /missing mod/)
    await manager.install(zipSync(modFiles('parent')))
    await manager.install(zipSync(modFiles('child', '1.0.0', [{ id: 'parent', version: '>=1.0.0' }])))
    await assert.rejects(manager.unload('parent'), /missing mod/)
    assert.equal(archives.size, 2)
    const broken = modFiles(); delete (broken as any)['client/index.js']
    await assert.rejects(manager.install(zipSync(broken)), /Missing Mod module/)
})

test('startup repairs missing and corrupt records while leaving a usable manager', async () => {
    const { manager, storage, archives } = setup()
    const ids = ['missing', 'broken', 'hd']
    storage.set(key, JSON.stringify({ installed: Object.fromEntries(ids.map(id => [id, `${id}@stored`])), enabled: ids, order: [] }))
    archives.set('broken@stored', new Uint8Array([1, 2, 3]))
    archives.set('hd@stored', zipSync(zipFiles()))
    // Device-wide installs from before players had their own Mods are dropped.
    storage.set('pvz-remake:active-mods', JSON.stringify(['old']))
    archives.set('old', zipSync(zipFiles('old')))
    assert.deepEqual(Array.from(await manager.running()), ['hd'])
    assert.deepEqual(JSON.parse(storage.get(key)!).enabled, ['hd'])
    assert.deepEqual([storage.has('pvz-remake:active-mods'), archives.has('old')], [false, false])
    assert.ok((await manager.installed()).find((entry: any) => entry.id === 'broken').error)
    await manager.uninstall('broken')
    assert.equal(archives.has('broken@stored'), false)
})







test('each player has their own Mods and versions; identical ZIPs are stored once and another set needs a restart', async () => {
    const { ModManager, archives, storage } = setup()
    const player = (id: number | null) => { const manager = new ModManager(); manager.useProfiles(() => id); return manager }
    const v1 = zipSync(modFiles('shared', '1.0.0')), v2 = zipSync(modFiles('shared', '2.0.0'))
    await player(1).install(v1)
    assert.deepEqual(Array.from(await player(2).installed()), [], 'other players see none of them')
    const running = player(1)
    assert.deepEqual(Array.from(await running.running()), ['shared'])
    assert.deepEqual([running.hasMods(1), running.hasMods(2)], [true, false])
    assert.deepEqual([await running.needsRestartFor(1), await running.needsRestartFor(2)], [false, true])
    running.copyMods(1, 2)
    assert.equal(await running.needsRestartFor(2), false, 'a synced player runs the same Mods')
    await player(3).install(v1)
    assert.equal(archives.size, 1, 'synced players and identical ZIPs share one stored archive')
    assert.equal(await running.needsRestartFor(3), false)
    await player(2).install(v2)
    assert.equal(archives.size, 2)
    assert.equal((await player(1).installed())[0].version, '1.0.0', 'updating affects only that player')
    assert.equal(await running.needsRestartFor(2), true, 'another version needs a restart')
    // Deleting players removes their records with the profile; their archives go at the next startup.
    storage.delete('pvz-remake:player-mods:1:state')
    storage.delete('pvz-remake:player-mods:3:state')
    await player(2).ready()
    assert.equal(archives.size, 1)
    // The first player takes over what was installed before any player existed.
    await player(null).install(zipSync(modFiles('early')))
    running.copyMods(null, 4, true)
    assert.deepEqual(Array.from(await player(4).list()), ['early'])
    assert.equal(storage.has(key), false)
})

test('Native installation, picker cleanup and on-demand installed reads share the Mod store', async () => {
    const { manager, ModManager, fresh, modules, files, archive, jsb, storage } = setup()
    const directories = new Set<string>()
    let failCommit = false
    modules.cc.sys.isNative = true
    modules.cc.sys.os = 'iOS'
    modules.cc.native = { fileUtils: {
        getWritablePath: () => '/app/',
        isFileExist: (path: string) => files.has(path),
        isDirectoryExist: (path: string) => directories.has(path),
        createDirectory(path: string) {
            const parts = path.split('/').filter(Boolean)
            parts.forEach((_part, index) => directories.add('/' + parts.slice(0, index + 1).join('/')))
            return true
        },
        removeDirectory(path: string) {
            path = path.replace(/\/$/, '')
            for (const name of [...directories]) if (name === path || name.startsWith(path + '/')) directories.delete(name)
            for (const name of files.keys()) if (name.startsWith(path + '/')) files.delete(name)
            return true
        },
        getDataFromFile: (path: string) => files.get(path).slice().buffer,
        listFiles: (path: string) => ['.', '..', ...directories].filter(name => name.slice(0, name.lastIndexOf('/')) === path).map(name => `${name}/`),
        removeFile: (path: string) => files.delete(path),
        writeDataToFile(buffer: ArrayBuffer, path: string) { files.set(path, new Uint8Array(buffer)); return true },
        renameFile(from: string, to: string) {
            if (failCommit && from.endsWith('.installing')) return false
            for (const name of [...directories]) if (name === from || name.startsWith(from + '/')) { directories.delete(name); directories.add(to + name.slice(from.length)) }
            for (const [name, data] of [...files]) if (name.startsWith(from + '/')) { files.delete(name); files.set(to + name.slice(from.length), data) }
            return true
        },
    } }
    const source = { ...zipFiles(), '.hidden': strToU8('hidden file') }
    const data = zipSync(source)
    files.set('/Imports/hd.zip', data)
    jsb.selectFiles = (_extension, callback) => callback(['/Imports/hd.zip'])
    const selected = (await archive.selectZips())[0]
    await manager.install(await selected.read())
    selected.dispose()
    assert.equal(files.has('/Imports/hd.zip'), false)
    const installedRoot = `/app/mods/${encodeURIComponent(archiveOf(storage, 'hd')!)}/`
    assert.deepEqual(files.get(installedRoot + '.archive.zip'), data)
    const unzip = modules.fflate.default.unzipSync
    modules.fflate.default.unzipSync = (bytes: Uint8Array, options: any) => unzip(bytes, { filter(entry: any) {
        const selected = options.filter(entry)
        assert.equal(selected, false, 'native restart must not inflate ZIP entries')
        return selected
    } })
    const getDataFromFile = modules.cc.native.fileUtils.getDataFromFile, reads: string[] = []
    modules.cc.native.fileUtils.getDataFromFile = (path: string) => { reads.push(path); return getDataFromFile(path) }
    const [reloaded] = await new ModManager().ready()
    assert.deepEqual(reads.map(path => path.slice(installedRoot.length)).sort(), ['.archive.zip', 'content.json', 'manifest.json'],
        'a restart reads only the index of an installed Mod')
    assert.equal(strFromU8(reloaded.files['.hidden']), 'hidden file')
    const running = fresh()
    const frame = await running.file('hd', 'button.png', modules.cc.SpriteFrame)
    assert.equal(await running.file('hd', 'button.png', modules.cc.SpriteFrame), frame)
    const clip = await running.asset('pvz:chomp', modules.cc.AudioClip)
    assert.equal(clip.nativeUrl, installedRoot + 'audio/chomp.mp3', 'native loaders read installed files in place')
    assert.ok(![...files.keys()].some(path => path.startsWith('/app/mod-resources/')))
    modules.cc.native.fileUtils.getDataFromFile = getDataFromFile
    modules.fflate.default.unzipSync = unzip
    failCommit = true
    await assert.rejects(manager.install(zipSync(zipFiles('hd', 'second'))), /finish installing/)
    assert.deepEqual(files.get(installedRoot + '.archive.zip'), data)
    failCommit = false
    await manager.install(zipSync(zipFiles('hd', 'second')))
    const updated = await fresh().asset('pvz:chomp', modules.cc.AudioClip)
    assert.equal(strFromU8(files.get(updated.nativeUrl)), 'ID3-second')
    await manager.uninstall('hd')
    assert.ok(![...files.keys()].some(path => path.startsWith('/app/mods/hd')), 'both versions are gone once nobody uses them')
    assert.equal((await new ModManager().list()).length, 0)
    const base = fresh(async () => zipSync(zipFiles('pvz', 'base', { width: 100, height: 140, scale: 1 })))
    modules['@/client/content/ModResources'] = { modResources: base }
    modules.cc.dynamicAtlasManager = { enabled: true }
    modules.cc.macro = {}
    const frameWithoutMods = await base.asset('pvz:button', modules.cc.SpriteFrame)
    assert.equal(frameWithoutMods.originalSize.width, 100)
    assert.equal(modules.cc.dynamicAtlasManager.enabled, false, 'native 1x sprites must not copy released CPU images into an atlas')
    const pending = await manager.prepareImport(zipSync(modFiles('deferred')))
    const staging = `/app/mod-pending/${pending.stagingId}/`
    assert.deepEqual([...files.keys()].filter(path => path.startsWith(staging)), [staging + '.archive.zip'])
    const deferred = () => [...files.keys()].filter(path => path.startsWith('/app/mods/deferred%40') && path.endsWith('/.archive.zip'))
    await manager.queueChanges({ enabled: ['deferred'], order: ['deferred'], imports: [pending], uninstalls: [] })
    assert.deepEqual(deferred(), [])
    await new ModManager().ready()
    assert.deepEqual(deferred(), [`/app/mods/${encodeURIComponent(archiveOf(storage, 'deferred')!)}/.archive.zip`])
    assert.equal(files.has(staging + '.archive.zip'), false)
    modules.cc.sys.isNative = false
    await fresh().ready()
    assert.equal(modules.cc.dynamicAtlasManager.enabled, true, 'Web retains source images and can still batch sprites')
})
