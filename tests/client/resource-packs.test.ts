import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

function setup() {
    const files = new Map<string, any>()
    const storage = new Map<string, string>()
    const requests: string[] = []
    const archives = new Map<string, Uint8Array>()
    const jsb = { selectFile: undefined as ((extension: string, callback: (path: string | null, error?: string | null) => void) => void) | undefined }
    let picker: any
    const db = {
        failWrite: false,
        createObjectStore() {},
        transaction() {
            const transaction: any = { objectStore: () => ({
                get(id: string) {
                    const request: any = {}
                    queueMicrotask(() => { request.result = archives.get(id)?.slice(); request.onsuccess() })
                    return request
                },
                put(data: Uint8Array, id: string) {
                    queueMicrotask(() => {
                        if (db.failWrite) { transaction.error = new Error('Storage full'); transaction.onabort(); return }
                        archives.set(id, data.slice())
                        transaction.oncomplete()
                    })
                },
                delete(id: string) {
                    queueMicrotask(() => {
                        if (db.failWrite) { transaction.error = new Error('Storage full'); transaction.onabort(); return }
                        archives.delete(id)
                        transaction.oncomplete()
                    })
                },
            }) }
            return transaction
        },
    }
    class JsonAsset { json: any }
    class Texture {
        static WrapMode = { CLAMP_TO_EDGE: 0 }
        static Filter = { LINEAR: 1, NEAREST: 0 }
        width = 100; height = 140
        set image(image: any) { this.width = image.width; this.height = image.height }
        setWrapMode() {}
        setFilters() {}
    }
    class Vector { constructor(...values: number[]) { Object.assign(this, values) } }
    class Frame { reset(data: any) { Object.assign(this, data) } }
    const asset = (path: string) => {
        requests.push(path)
        const value = files.get(path)
        if (value === undefined) throw new Error(`Missing ${path}`)
        return value
    }
    const modules: Record<string, any> = {
        fflate: { default: { unzipSync, strFromU8 } },
        cc: { JsonAsset, Texture2D: Texture, SpriteFrame: Frame, Rect: Vector, Size: Vector, Vec2: Vector,
            sys: { isNative: false, isBrowser: false, OS: { IOS: 'iOS' }, localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) } },
            assetManager: { loadRemote: (path: string, options: any, callback?: any) => {
                const complete = callback ?? options
                try { complete(null, asset(path)) } catch (error) { complete(error) }
            } } },
        './LegacyAssetLoader': { AssetLoader: { async load(path: string) { return asset(path) } } },
        './SpriteDensity': { setSpriteDensity() {}, applySpriteDensity(frame: any) { frame.normalized = true } },
    }
    class TestURL extends URL {
        static createObjectURL() {
            const path = `blob:pack-${files.size}`
            files.set(path, { width: 100, height: 140 })
            return path
        }
    }
    const load = (path: string) => {
        const module = { exports: {} as Record<string, any> }
        const code = transpileModule(readFileSync(path, 'utf8'), { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } })
        runInNewContext(code.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {},
            URL: TestURL, Blob, Uint8Array, DataView, jsb, location: { href: 'https://game.example/' },
            indexedDB: { open: () => {
                const request: any = { result: db }
                queueMicrotask(() => { request.onupgradeneeded(); request.onsuccess() })
                return request
            } },
            document: { body: { appendChild() {} }, createElement: () => picker = { click() {}, remove() {}, addEventListener(name: string, callback: unknown) { this[name] = callback } } },
        })
        return module.exports
    }
    const archive = load('assets/scripts/client/content/ResourcePackArchive.ts')
    modules['./ResourcePackArchive'] = modules['@/client/content/ResourcePackArchive'] = archive
    const { ResourcePackManager } = load('assets/scripts/client/content/ResourcePacks.ts')
    const manager = new ResourcePackManager()
    modules['./ResourcePacks'] = modules['@/client/content/ResourcePacks'] = { resourcePacks: manager }
    modules['@/client/content/LegacyAssetLoader'] = modules['./LegacyAssetLoader']
    const manifest = (name: string, entries: any, fonts = {}) => {
        const data: Record<string, Uint8Array> = zipFiles(name)
        data['pack.json'] = strToU8(JSON.stringify({ id: name, sprites: entries, fonts }))
        for (const entry of Object.values(entries) as any[]) data[entry.file] = data['button.png']
        for (const file of Object.values(fonts) as string[]) {
            data[file] = data['fonts/demo.json']
            data[file.slice(0, file.lastIndexOf('/') + 1) + 'atlas.png'] = data['button.png']
        }
        archives.set(name, zipSync(data))
    }
    const sprite = { file: 'button.png', width: 50, height: 70, scale: 2 }
    return { manager, ResourcePackManager, files, storage, requests, modules, load, manifest, sprite, Texture, archives, archive, db, jsb, picker: () => picker }
}

function zipFiles(id = 'custom') {
    const image = new Uint8Array(readFileSync('assets/bundles/pvz-base/sprites/seedpacket_larger.png'))
    return {
        'pack.json': strToU8(JSON.stringify({ id, sprites: { 'pvz:button': { file: 'button.png', width: 50, height: 70, scale: 2 } }, fonts: { 'pvz:demo': 'fonts/demo.json' } })),
        'button.png': image,
        'fonts/demo.json': strToU8(JSON.stringify({ layers: [{ image: 'atlas', textureScale: 4 }] })),
        'fonts/atlas.png': image,
    }
}

test('ZIP installation and replacement take effect on restart and leave current resources unchanged', async () => {
    const { manager, ResourcePackManager, storage, archives, db } = setup()
    const entries = zipFiles()
    let bytes = zipSync(Object.fromEntries(Object.entries(entries).map(([name, value]) => [`custom/${name}`, value])))
    assert.equal(await manager.install(bytes), 'custom')
    assert.deepEqual(JSON.parse(storage.get('pvz-remake:active-resource-packs')!), ['custom'])
    assert.equal(await manager.sprite('pvz:button'), undefined)
    assert.equal(manager.revision, 0, 'installation must not invalidate current UI assets')
    const restored = new ResourcePackManager()
    assert.deepEqual(Array.from(await restored.list()), ['custom'])
    assert.ok(await restored.sprite('pvz:button'))
    await restored.unload('custom')
    await restored.load('custom')
    assert.equal((await restored.font('pvz:demo')).config.json.layers[0].textureScale, 4)
    entries['fonts/demo.json'] = strToU8(JSON.stringify({ layers: [{ image: 'atlas', textureScale: 2 }] }))
    bytes = zipSync(entries)
    const revision = restored.revision
    await restored.install(bytes)
    assert.equal(restored.revision, revision)
    assert.equal((await restored.font('pvz:demo')).config.json.layers[0].textureScale, 4)
    assert.equal((await new ResourcePackManager().font('pvz:demo')).config.json.layers[0].textureScale, 2)
    const installed = archives.get('custom')
    db.failWrite = true
    await assert.rejects(restored.install(bytes), /Storage full/)
    assert.equal(archives.get('custom'), installed)
    assert.equal((await restored.font('pvz:demo')).config.json.layers[0].textureScale, 4)
})

test('invalid ZIP paths, missing dependencies and mismatched images leave the active pack untouched', async () => {
    const { manager, archive, manifest, sprite, archives } = setup()
    manifest('first', { 'pvz:button': sprite })
    await manager.load('first')
    const valid = zipFiles()
    assert.throws(() => archive.unpackResourcePack(zipSync({ ...valid, '../outside.png': valid['button.png'] })), /Invalid ZIP path/)
    assert.throws(() => archive.unpackResourcePack(zipSync({ ...valid, 'nested/pack.json': valid['pack.json'] })), /exactly one/)
    assert.throws(() => archive.unpackResourcePack(new Uint8Array([1, 2, 3])), /zip/i)
    for (const changed of [
        { ...valid, 'button.png': new Uint8Array([1, 2]) },
        { ...valid, 'fonts/demo.json': strToU8('{"layers":[{"image":"missing"}]}') },
        { ...valid, 'pack.json': strToU8('{"id":"custom","sprites":{"pvz:button":{"file":"button.png","width":1,"height":1}},"fonts":{}}') },
    ]) {
        const data = zipSync(changed)
        await assert.rejects(manager.install(data))
        assert.deepEqual(Array.from(await manager.list()), ['first'])
        assert.deepEqual([...archives.keys()], ['first'])
    }
})

test('pack install delegates to its dialog and ZIP picker cancellation leaves packs untouched', async () => {
    const { modules, load, picker, manager, archive, ResourcePackManager } = setup()
    modules.cc.sys.isBrowser = true
    modules['@/shared/debug/DebugCli'] = load('assets/scripts/shared/debug/DebugCli.ts')
    const { executeDebugCliCommand } = load('assets/scripts/platform/debug/DebugCliCommands.ts')
    const execute = (command: string) => executeDebugCliCommand(command, false, () => assert.fail('must not request gameplay'))
    assert.equal((await execute('/pack install')).action, 'installPack')
    const importing = archive.selectResourcePackZip()
    const data = zipSync(zipFiles())
    picker().files = [{ arrayBuffer: async () => data.buffer }]
    picker().onchange()
    await manager.install(await importing)
    const cancelled = archive.selectResourcePackZip()
    picker().cancel()
    assert.equal(await cancelled, null)
    assert.deepEqual(Array.from(await manager.list()), ['custom'])
    assert.deepEqual(Array.from(await new ResourcePackManager().list()), ['custom'])
    assert.equal((await execute('/pack install custom.zip')).failure, 'syntax')
    assert.equal((await execute('/pack install https://packs.example/custom.zip')).failure, 'syntax')
})

test('Native ZIP installation copies files into writable storage and rolls back a failed replacement', async () => {
    const { manager, ResourcePackManager, modules, files, jsb, archive } = setup()
    const directories = new Set<string>()
    let failCommit = false
    modules.cc.sys.isNative = true
    modules.cc.sys.os = 'iOS'
    modules.cc.native = { fileUtils: {
        getWritablePath: () => '/app/',
        isFileExist: (path: string) => files.has(path),
        isDirectoryExist: (path: string) => directories.has(path),
        createDirectory: (path: string) => directories.add(path),
        removeDirectory(path: string) {
            for (const name of [...directories]) if (name === path || name.startsWith(path + '/')) directories.delete(name)
            for (const name of files.keys()) if (name.startsWith(path + '/')) files.delete(name)
            return true
        },
        getDataFromFile: (path: string) => files.get(path).slice().buffer,
        removeFile: (path: string) => files.delete(path),
        writeDataToFile(buffer: ArrayBuffer, path: string) { files.set(path, new Uint8Array(buffer)); return true },
        renameFile(from: string, to: string) {
            if (failCommit && from.endsWith('.installing')) return false
            for (const name of [...directories]) if (name === from || name.startsWith(from + '/')) { directories.delete(name); directories.add(to + name.slice(from.length)) }
            for (const [name, data] of [...files]) if (name.startsWith(from + '/')) { files.delete(name); files.set(to + name.slice(from.length), data) }
            return true
        },
    } }
    const data = zipSync(zipFiles())
    files.set('/Downloads/custom.zip', data)
    let select!: (path: string | null, error?: string | null) => void
    jsb.selectFile = (extension, callback) => { assert.equal(extension, 'zip'); select = callback }
    const selected = archive.selectResourcePackZip()
    assert.equal(files.has('/Downloads/custom.zip'), true, 'wait for the system picker before reading')
    select('/Downloads/custom.zip')
    await manager.install(await selected)
    assert.equal(files.has('/Downloads/custom.zip'), false, 'remove the temporary iOS import')
    jsb.selectFile = (_, callback) => callback(null)
    assert.equal(await archive.selectResourcePackZip(), null)
    jsb.selectFile = (_, callback) => callback(null, 'Could not read the selected file')
    await assert.rejects(archive.selectResourcePackZip(), /Could not read/)
    modules.cc.sys.os = 'OS X'
    files.set('/Downloads/custom.zip', data)
    jsb.selectFile = (_, callback) => callback('/Downloads/custom.zip')
    assert.deepEqual(await archive.selectResourcePackZip(), data)
    assert.equal(files.has('/Downloads/custom.zip'), true, 'preserve the original macOS file')
    assert.deepEqual(files.get('/app/resource-packs/custom/.archive.zip'), data)
    assert.deepEqual(files.get('/app/resource-packs/custom/button.png'), zipFiles()['button.png'])
    assert.deepEqual(Array.from(await new ResourcePackManager().list()), ['custom'])
    failCommit = true
    await assert.rejects(manager.install(data), /finish installing/)
    assert.deepEqual(files.get('/app/resource-packs/custom/.archive.zip'), data)
    assert.ok(!directories.has('/app/resource-packs/custom.installing'))
    assert.ok(!directories.has('/app/resource-packs/custom.previous'))
    assert.equal(await manager.uninstall('custom'), true)
    assert.equal(files.has('/app/resource-packs/custom/.archive.zip'), false)
    assert.deepEqual(Array.from(await new ResourcePackManager().list()), [])
    await assert.rejects(manager.load('custom'), /not installed/)
})

test('pack priority, scoped animation parts, persistence and unloading resolve by resource ID', async () => {
    const { manager, ResourcePackManager, manifest, sprite } = setup()
    manifest('first', { 'pvz:button': sprite, 'pvz:zombie_head': { ...sprite, animations: ['pvz:loadbar_zombiehead'] } })
    manifest('second', { 'pvz:button': sprite })
    await manager.load('first')
    assert.equal(await manager.sprite('pvz:button'), undefined, 'enabling waits for restart')
    const running = new ResourcePackManager()
    const first = await running.sprite('pvz:button')
    assert.equal(first.normalized, true)
    assert.equal(await running.sprite('pvz:zombie_head', 'pvz:zombie_walk'), undefined)
    assert.ok(await running.sprite('pvz:zombie_head', 'pvz:loadbar_zombiehead'))
    assert.equal(await running.sprite('pvz:zombie_head'), undefined, 'a cached UI part must not leak into other animations')
    await running.load('second')
    assert.equal(await running.sprite('pvz:button'), first)
    const restarted = new ResourcePackManager()
    const second = await restarted.sprite('pvz:button')
    assert.notEqual(second, first)
    assert.deepEqual(Array.from(await new ResourcePackManager().list()), ['first', 'second'])
    await restarted.unload('second')
    assert.equal(await restarted.sprite('pvz:button'), second, 'disabling also waits for restart')
    assert.ok(await new ResourcePackManager().sprite('pvz:button'))
    assert.equal(await restarted.uninstall('first'), true)
    assert.equal(await restarted.sprite('pvz:button'), second, 'uninstalling preserves the resources of the current runtime')
    await assert.rejects(restarted.load('first'), /not installed/)
    await manager.unload('all')
    assert.equal(await new ResourcePackManager().sprite('pvz:button'), undefined)
    for (const source of ['https://packs.example/custom/pack.json', '/Downloads/custom', 'https://packs.example/custom.zip', 'missing']) {
        await assert.rejects(manager.load(source), /installed|install ZIPs/)
    }
    assert.deepEqual(Array.from(await manager.list()), [])
})

test('pack CLI requests restart only for enabled-state changes and uninstalls saved archives', async () => {
    const { modules, load, manifest, sprite, archives, db } = setup()
    manifest('hd', { 'pvz:button': sprite })
    modules['@/shared/debug/DebugCli'] = load('assets/scripts/shared/debug/DebugCli.ts')
    const { executeDebugCliCommand } = load('assets/scripts/platform/debug/DebugCliCommands.ts')
    const execute = (command: string) => executeDebugCliCommand(command, false, () => { throw new Error('must not request gameplay') })
    assert.equal((await execute('/pack load hd')).action, 'restartForPacks')
    assert.equal((await execute('/pack load hd')).action, undefined)
    const listed = await execute('/pack list')
    assert.match(listed.message, /hd/)
    assert.equal(listed.action, undefined)
    assert.equal((await execute('/pack load missing')).failure, 'condition')
    assert.equal((await execute('/pack load')).failure, 'syntax')
    assert.equal((await execute('/pack unload all')).action, 'restartForPacks')
    assert.equal((await execute('/pack unload hd')).action, undefined)
    assert.match((await execute('/pack list')).message, /none/)
    assert.equal((await execute('/pack uninstall hd')).action, undefined)
    assert.equal(archives.has('hd'), false)
    assert.equal((await execute('/pack load hd')).failure, 'condition')
    manifest('hd', { 'pvz:button': sprite })
    await execute('/pack load hd')
    db.failWrite = true
    assert.equal((await execute('/pack uninstall hd')).failure, 'condition')
    assert.equal(archives.has('hd'), true)
    assert.match((await execute('/pack list')).message, /hd/)
    db.failWrite = false
    assert.equal((await execute('/pack uninstall hd')).action, 'restartForPacks')
    assert.equal(archives.has('hd'), false)
    assert.equal((await execute('/pack uninstall hd')).failure, 'condition')
    assert.equal((await execute('/pack uninstall')).failure, 'syntax')
})

test('sprite and font entry points select pack assets before loading originals, and failures never fall back', async () => {
    const { manager, ResourcePackManager, files, requests, modules, load, manifest, sprite, Texture } = setup()
    manifest('hd', { 'pvz:button': sprite, 'mod:button': sprite }, { 'pvz:demo': 'fonts/demo.json' })
    files.set('fonts/demo', { json: { layers: [{ image: 'atlas' }] } })
    files.set('fonts/atlas/texture', new Texture())
    const { loadBitmapFont } = load('assets/scripts/client/font/BitmapFontLoader.ts')
    const original = await loadBitmapFont('demo')
    await manager.load('hd')
    modules['./ResourcePacks'].resourcePacks = new ResourcePackManager()
    requests.length = 0
    const font = await loadBitmapFont('demo')
    assert.equal(font.config.json.layers[0].textureScale, 4)
    assert.ok(requests.length > 0 && requests.every(path => path.startsWith('blob:')))
    const { SpriteRepository, FontRepository } = load('assets/scripts/client/content/ClientContentLoader.ts')
    const registry = { resolve: () => { throw new Error('original registry must not be consulted') } }
    const loader = { load: () => { throw new Error('original asset must not be loaded') } }
    assert.ok(await new SpriteRepository(registry, loader).load('mod:button'))
    assert.equal(await new FontRepository(registry, loader).load('pvz:demo'), font)
    manifest('broken', { 'pvz:button': sprite }, { 'pvz:demo': 'fonts/demo.json' })
    await manager.load('broken')
    modules['./ResourcePacks'].resourcePacks = new ResourcePackManager()
    modules.cc.assetManager.loadRemote = (_path: string, _options: unknown, callback: (error: Error) => void) => callback(new Error('ZIP image failed'))
    await assert.rejects(new SpriteRepository(registry, loader).load('pvz:button'), /ZIP image failed/)
    await assert.rejects(loadBitmapFont('demo'), /ZIP image failed/)
    await manager.unload('all')
    modules['./ResourcePacks'].resourcePacks = new ResourcePackManager()
    assert.equal((await loadBitmapFont('demo')).config, original.config)
    manifest('invalid', { 'pvz:button': { ...sprite, file: '../outside.png' } })
    await assert.rejects(manager.load('invalid'), /Invalid/)
    assert.deepEqual(Array.from(await manager.list()), [])
})
