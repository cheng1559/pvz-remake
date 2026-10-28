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
            sys: { isNative: false, isBrowser: false, OS: { IOS: 'iOS' }, localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } },
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

function modFiles(id = 'local:screen', version = '1.0.0', dependencies: { id: string, version: string }[] = []) {
    return {
        'manifest.json': strToU8(JSON.stringify({ schemaVersion: 1, id, version, apiVersion: 1, contentHash: `${id}-${version}`, dependencies,
            client: { module: 'client/index.js' } })),
        'content.json': strToU8('{"resources":{}}'),
        'client/index.js': strToU8('System.register([], function () { return { execute: function () {} }; });'),
    }
}

function zipFiles(id = 'local:hd', tag = 'first', options: any = {}) {
    const image = new Uint8Array(readFileSync(`mods/pvz-base/${readBaseContent().resources.sprites['pvz:seedpacket_larger'].file}`))
    const resources = { sprites: { 'pvz:button': { file: 'button.png', width: 50, height: 70, scale: 2, ...options } },
        fonts: { 'pvz:demo': 'fonts/demo.json' }, audio: { 'pvz:chomp': 'audio/chomp.mp3' },
        json: { 'pvz:config': 'config.json' }, text: { 'pvz:note': 'note.txt' } }
    return { 'manifest.json': strToU8(JSON.stringify({ schemaVersion: 1, id, version: '1.0.0', apiVersion: 1, contentHash: tag, dependencies: [] })),
        'content.json': strToU8(JSON.stringify({ resources })), 'button.png': image,
        'fonts/demo.json': strToU8(JSON.stringify({ layers: [{ image: 'atlas', textureScale: 4 }] })), 'fonts/atlas.png': image,
        'audio/chomp.mp3': strToU8('ID3-' + tag), 'config.json': strToU8(JSON.stringify({ tag })), 'note.txt': strToU8(tag) }
}

const key = 'pvz-remake:active-mods'


test('bootstrap artwork loads from the base archive without waiting for Mod installation', async () => {
    const { ModResources, modules } = setup()
    let baseReads = 0, modReads = 0
    const resources = new ModResources(async () => { baseReads++; return zipSync(zipFiles('pvz:base')) }, {
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
    await manager.install(zipSync(zipFiles('local:first', 'first')))
    await manager.install(zipSync(zipFiles('local:last', 'last', { animations: ['pvz:blink'] })))
    assert.equal((await manager.ready()).length, 0)
    const running = fresh()
    assert.equal((await running.asset('pvz:config', modules.cc.JsonAsset)).json.tag, 'last')
    assert.notEqual(await running.sprite('pvz:button'), await running.sprite('pvz:button', 'pvz:blink'))
    assert.equal(await manager.setEnabled(['local:last', 'local:first']), true)
    assert.equal((await running.asset('pvz:config', modules.cc.JsonAsset)).json.tag, 'last')
    assert.equal((await fresh().asset('pvz:config', modules.cc.JsonAsset)).json.tag, 'first')
    assert.deepEqual(Array.from(await new ModManager().list()), ['local:last', 'local:first'])
    await manager.install(zipSync(zipFiles('local:last', 'updated')))
    assert.deepEqual(Array.from(await new ModManager().list()), ['local:last', 'local:first'], 'updating a Mod preserves its saved priority')
    assert.equal((await fresh().asset('pvz:config', modules.cc.JsonAsset)).json.tag, 'first')
    assert.equal(await manager.unload('all'), true)
    assert.equal(await fresh().asset('pvz:config', modules.cc.JsonAsset), undefined)
})

test('disabled Mods retain their saved positions across restart, toggles and updates', async () => {
    const { manager, ModManager } = setup()
    await manager.install(zipSync(zipFiles('local:first')))
    await manager.install(zipSync(zipFiles('local:last')))
    await manager.install(zipSync(zipFiles('local:disabled')), false)
    const enabled = ['local:last', 'local:first']
    await manager.setEnabled(enabled, ['local:first', 'local:disabled', 'local:last'])
    const order = ['local:disabled', 'local:first', 'local:last']
    assert.equal(await manager.setEnabled(enabled, order), false, 'moving only a disabled row does not require restarting')
    const restarted = new ModManager()
    const installed = async () => Array.from(await new ModManager().installed(), (entry: any) => entry.id)
    assert.deepEqual(await installed(), order)
    assert.deepEqual(Array.from(await restarted.list()), enabled)
    await restarted.load('local:disabled')
    assert.deepEqual(Array.from(await restarted.list()), ['local:last', 'local:first', 'local:disabled'])
    await restarted.unload('local:disabled')
    await restarted.install(zipSync(zipFiles('local:disabled', 'updated')), false)
    assert.deepEqual(await installed(), order)
    await restarted.uninstall('local:disabled')
    assert.deepEqual(await installed(), ['local:first', 'local:last'])
})

test('updates, uninstalls and failed writes preserve running bytes', async () => {
    const { manager, fresh, ModManager, archives, db, modules } = setup()
    const original = zipSync(zipFiles())
    await manager.install(original)
    const running = fresh()
    assert.equal((await running.asset('pvz:config', modules.cc.JsonAsset)).json.tag, 'first')
    const saved = archives.get('local:hd')
    db.failWrite = true
    await assert.rejects(manager.install(zipSync(zipFiles('local:hd', 'second'))), /Storage full/)
    assert.equal(archives.get('local:hd'), saved)
    db.failWrite = false
    await manager.install(zipSync(zipFiles('local:hd', 'second')))
    assert.equal((await fresh().asset('pvz:config', modules.cc.JsonAsset)).json.tag, 'second')
    await manager.uninstall('local:hd')
    assert.equal((await running.asset('pvz:config', modules.cc.JsonAsset)).json.tag, 'first')
    assert.equal((await new ModManager().ready()).length, 0)
})

test('importing pvz:base is rejected without changing installed archives or settings', async () => {
    const { manager, archives, storage } = setup()
    await manager.install(zipSync(modFiles('local:existing')))
    const beforeArchives = new Map(archives), beforeStorage = new Map(storage)
    for (const enable of [true, false]) {
        await assert.rejects(manager.install(zipSync(modFiles('pvz:base')), enable), /pvz:base is built in and cannot be imported/)
        assert.deepEqual(archives, beforeArchives)
        assert.deepEqual(storage, beforeStorage)
    }
    await assert.rejects(manager.prepareImport(zipSync(modFiles('pvz:base'))), /pvz:base is built in and cannot be imported/)
})

test('cancelled draft imports discard staged ZIPs and preserve installed archives and settings', async () => {
    const { manager, archives, pendingArchives, storage } = setup()
    await manager.install(zipSync(modFiles('local:parent')))
    await manager.installed()
    const beforeArchives = new Map(archives), beforeStorage = new Map(storage)
    const child = await manager.prepareImport(zipSync(modFiles('local:child', '1.0.0', [{ id: 'local:parent', version: '>=2.0.0' }])))
    const parent = await manager.prepareImport(zipSync(modFiles('local:parent', '2.0.0')))
    assert.deepEqual(archives, beforeArchives, 'selecting an update does not replace the installed ZIP')
    assert.deepEqual(storage, beforeStorage, 'a cancelled draft has no persistent changes')
    await assert.rejects(manager.queueChanges({ enabled: ['local:parent', 'local:child'], order: ['local:child', 'local:parent'], imports: [child], uninstalls: [] }), /requires local:parent/)
    assert.deepEqual(archives, beforeArchives, 'invalid dependencies are rejected before saving any imports')
    assert.deepEqual(storage, beforeStorage)
    await manager.discardImports([child, parent])
    assert.equal(pendingArchives.size, 0)
    assert.deepEqual(archives, beforeArchives)
    assert.deepEqual(storage, beforeStorage)
})

test('Apply queues metadata without decoding ZIPs or changing installed Mods; startup applies and retries the job', async () => {
    const { manager, ModManager, archives, pendingArchives, storage, modules, db } = setup()
    await manager.install(zipSync(modFiles('local:parent')))
    await manager.install(zipSync(modFiles('local:remove')))
    await manager.installed()
    const child = await manager.prepareImport(zipSync(modFiles('local:child', '1.0.0', [{ id: 'local:parent', version: '>=2.0.0' }])))
    const parent = await manager.prepareImport(zipSync(modFiles('local:parent', '2.0.0')))
    const before = new Map(archives), enabled = storage.get(key)
    const unzip = modules.fflate.default.unzipSync
    modules.fflate.default.unzipSync = () => assert.fail('Apply must not decode ZIP files')
    await manager.queueChanges({ enabled: ['local:parent', 'local:child'], order: ['local:child', 'local:parent'],
        imports: [child, parent], uninstalls: ['local:remove'] })
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
    assert.equal(archives.has('local:remove'), false)
    assert.equal(archives.size, 2)
    assert.deepEqual(Array.from(await boot.list()), ['local:parent', 'local:child'])
    assert.equal((await boot.installed()).find((mod: any) => mod.id === 'local:parent').version, '2.0.0')
    const cancelled = await boot.prepareImport(zipSync(modFiles('local:cancelled')))
    await boot.discardImports([cancelled])
    assert.equal(pendingArchives.size, 0)
    assert.equal(archives.has('local:cancelled'), false)
})

test('ZIP, geometry and dependency failures do not change installed state', async () => {
    const { manager, archives } = setup()
    await assert.rejects(manager.install(zipSync({ ...zipFiles(), '../escape.txt': strToU8('x') })), /Invalid ZIP path/)
    await assert.rejects(manager.install(zipSync(zipFiles('local:bad', 'bad', { width: 49 }))), /dimensions/)
    await assert.rejects(manager.install(zipSync(modFiles('local:child', '1.0.0', [{ id: 'local:parent', version: '>=1.0.0' }]))), /missing mod/)
    await manager.install(zipSync(modFiles('local:parent')))
    await manager.install(zipSync(modFiles('local:child', '1.0.0', [{ id: 'local:parent', version: '>=1.0.0' }])))
    await assert.rejects(manager.unload('local:parent'), /missing mod/)
    assert.equal(archives.size, 2)
    const broken = modFiles(); delete (broken as any)['client/index.js']
    await assert.rejects(manager.install(zipSync(broken)), /Missing Mod module/)
})

test('startup repairs missing and corrupt records while leaving a usable manager', async () => {
    const { manager, storage, archives } = setup()
    storage.set(key, JSON.stringify(['local:missing', 'local:broken', 'local:hd']))
    archives.set('local:broken', new Uint8Array([1, 2, 3]))
    archives.set('local:hd', zipSync(zipFiles()))
    assert.deepEqual(Array.from(await manager.running()), ['local:hd'])
    assert.deepEqual(JSON.parse(storage.get(key)!), ['local:hd'])
    assert.ok((await manager.installed()).find((entry: any) => entry.id === 'local:broken').error)
    await manager.uninstall('local:broken')
    assert.equal(archives.has('local:broken'), false)
})







test('Native installation, picker cleanup and on-demand installed reads share the Mod store', async () => {
    const { manager, ModManager, fresh, modules, files, archive, jsb, load } = setup()
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
    const installedFile = '/app/mods/local%3Ahd/.archive.zip'
    assert.deepEqual(files.get(installedFile), data)
    const unzip = modules.fflate.default.unzipSync
    modules.fflate.default.unzipSync = (bytes: Uint8Array, options: any) => unzip(bytes, { filter(entry: any) {
        const selected = options.filter(entry)
        assert.equal(selected, false, 'native restart must not inflate ZIP entries')
        return selected
    } })
    const getDataFromFile = modules.cc.native.fileUtils.getDataFromFile, reads: string[] = []
    modules.cc.native.fileUtils.getDataFromFile = (path: string) => { reads.push(path); return getDataFromFile(path) }
    const [reloaded] = await new ModManager().ready()
    assert.deepEqual(reads.map(path => path.slice('/app/mods/local%3Ahd/'.length)).sort(), ['.archive.zip', 'content.json', 'manifest.json'],
        'a restart reads only the index of an installed Mod')
    assert.equal(strFromU8(reloaded.files['.hidden']), 'hidden file')
    const running = fresh()
    const frame = await running.file('local:hd', 'button.png', modules.cc.SpriteFrame)
    assert.equal(await running.file('local:hd', 'button.png', modules.cc.SpriteFrame), frame)
    const clip = await running.asset('pvz:chomp', modules.cc.AudioClip)
    assert.equal(clip.nativeUrl, '/app/mods/local%3Ahd/audio/chomp.mp3', 'native loaders read installed files in place')
    assert.ok(![...files.keys()].some(path => path.startsWith('/app/mod-resources/')))
    modules.cc.native.fileUtils.getDataFromFile = getDataFromFile
    modules.fflate.default.unzipSync = unzip
    failCommit = true
    await assert.rejects(manager.install(zipSync(zipFiles('local:hd', 'second'))), /finish installing/)
    assert.deepEqual(files.get(installedFile), data)
    failCommit = false
    await manager.install(zipSync(zipFiles('local:hd', 'second')))
    const updated = await fresh().asset('pvz:chomp', modules.cc.AudioClip)
    assert.equal(strFromU8(files.get(updated.nativeUrl)), 'ID3-second')
    await manager.uninstall('local:hd')
    assert.equal(files.has(installedFile), false)
    assert.equal((await new ModManager().list()).length, 0)
    const base = fresh(async () => zipSync(zipFiles('pvz:base', 'base', { width: 100, height: 140, scale: 1 })))
    modules['@/client/content/ModResources'] = { modResources: base }
    modules.cc.dynamicAtlasManager = { enabled: true }
    modules.cc.macro = {}
    const frameWithoutMods = await base.asset('pvz:button', modules.cc.SpriteFrame)
    assert.equal(frameWithoutMods.originalSize.width, 100)
    assert.equal(modules.cc.dynamicAtlasManager.enabled, false, 'native 1x sprites must not copy released CPU images into an atlas')
    const pending = await manager.prepareImport(zipSync(modFiles('local:deferred')))
    const staging = `/app/mod-pending/${pending.stagingId}/`
    assert.deepEqual([...files.keys()].filter(path => path.startsWith(staging)), [staging + '.archive.zip'])
    const deferredFile = '/app/mods/local%3Adeferred/.archive.zip'
    await manager.queueChanges({ enabled: ['local:deferred'], order: ['local:deferred'], imports: [pending], uninstalls: [] })
    assert.equal(files.has(deferredFile), false)
    await new ModManager().ready()
    assert.equal(files.has(deferredFile), true)
    assert.equal(files.has(staging + '.archive.zip'), false)
    modules.cc.sys.isNative = false
    await fresh().ready()
    assert.equal(modules.cc.dynamicAtlasManager.enabled, true, 'Web retains source images and can still batch sprites')
})
