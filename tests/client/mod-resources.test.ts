import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { setImmediate } from 'node:timers/promises'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { readBaseContent } from '../../tools/content_source'
import { decodePremultipliedPng } from '@/client/content/PremultipliedPng'

function setup() {
    const files = new Map<string, any>()
    const storage = new Map<string, string>()
    const requests: string[] = []
    const archives = new Map<string, Uint8Array>()
    const modArchives = new Map<string, Uint8Array>()
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
            sys: { isNative: false, isBrowser: false, OS: { IOS: 'iOS' }, localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) } },
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
        './LegacyAssetLoader': { AssetLoader: { async load(path: string) { return asset(path) } } },
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
                const request: any = { result: name === 'pvz-remake-mods' ? modDb : db }
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
        Texture, archive, archives: modArchives, db: modDb, jsb, blobs, picker: () => picker }
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
    const image = new Uint8Array(readFileSync('tools/generated/pvz-base/sprites/seedpacket_larger.png'))
    const resources = { sprites: { 'pvz:button': { file: 'button.png', width: 50, height: 70, scale: 2, ...options } },
        fonts: { 'pvz:demo': 'fonts/demo.json' }, audio: { 'pvz:chomp': 'audio/chomp.mp3' },
        json: { 'pvz:config': 'config.json' }, text: { 'pvz:note': 'note.txt' } }
    return { 'manifest.json': strToU8(JSON.stringify({ schemaVersion: 1, id, version: '1.0.0', apiVersion: 1, contentHash: tag, dependencies: [] })),
        'content.json': strToU8(JSON.stringify({ resources })), 'button.png': image,
        'fonts/demo.json': strToU8(JSON.stringify({ layers: [{ image: 'atlas', textureScale: 4 }] })), 'fonts/atlas.png': image,
        'audio/chomp.mp3': strToU8('ID3-' + tag), 'config.json': strToU8(JSON.stringify({ tag })), 'note.txt': strToU8(tag) }
}

const key = 'pvz-remake:active-mods'

test('declared premultiplied images normalize once for both resource IDs and raw Mod paths', async () => {
    const { manager, fresh, modules, requests } = setup()
    const files = zipFiles('local:alpha', 'alpha', { width: 74, height: 397, scale: 1, alphaMode: 'premultiplied' })
    files['button.png'] = new Uint8Array(readFileSync('mods/widescreen/assets/images/background1_gameover_mask.png'))
    await manager.install(zipSync(files))
    const resources = fresh()
    const frame = await resources.asset('pvz:button', modules.cc.SpriteFrame)
    const raw = await resources.file('local:alpha', 'button.png', modules.cc.SpriteFrame)
    assert.equal(frame.texture, raw.texture, 'both access paths use the same decoded texture cache')
    assert.deepEqual([...frame.texture.pixels.slice(40, 44)], [247, 231, 206, 233])
    assert.equal(frame.packable, false, 'raw GPU uploads do not retain an ImageAsset for dynamic atlas copies')
    assert.equal(requests.length, 0, 'premultiplied bytes bypass platform PNG decoders')
    const font = await resources.font('pvz:demo')
    assert.equal(font!.textures[0].pixels, undefined, 'unmarked images keep the existing decoder')
    assert.equal(requests.length, 1)
    const invalid = zipFiles('local:bad-alpha', 'bad-alpha', { alphaMode: 'guess' })
    await assert.rejects(manager.install(zipSync(invalid)), /Invalid sprite alpha mode/)
    const conflict = zipFiles('local:alpha-conflict', 'conflict', { alphaMode: 'premultiplied' })
    const content = JSON.parse(strFromU8(conflict['content.json']))
    content.resources.sprites['pvz:other'] = { ...content.resources.sprites['pvz:button'], alphaMode: 'straight' }
    conflict['content.json'] = strToU8(JSON.stringify(content))
    await assert.rejects(manager.install(zipSync(conflict)), /Conflicting sprite alpha modes/)
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

test('/mod is the only package command and uses the common manager', async () => {
    const { modules, load } = setup()
    modules['@/shared/debug/DebugCli'] = load('assets/scripts/shared/debug/DebugCli.ts')
    const { executeDebugCliCommand } = load('assets/scripts/platform/debug/DebugCliCommands.ts')
    const execute = (command: string) => executeDebugCliCommand(command, false, () => assert.fail('gameplay command'))
    assert.equal((await execute('/mod')).action, 'manageMods')
    assert.equal((await execute('/pack')).ok, false)
    for (const args of ['install', 'load local:hd', 'unload all', 'uninstall local:hd', 'list']) {
        assert.equal((await execute('/mod ' + args)).failure, 'syntax')
    }
})

test('package dialog keeps uninstall drafts on disk until Apply and restart confirmation', async () => {
    for (const scripted of [true, false]) {
        const env = setup()
        const id = scripted ? 'local:screen' : 'local:hd'
        const initial = env.manager
        await initial.install(zipSync(scripted ? modFiles(id) : zipFiles(id)))
        const manager = new env.ModManager()
        env.modules['@/client/content/ModManager'] = { modManager: manager }
        const archives = env.archives
        const buttons: any[] = [], errors: string[] = [], labels: string[] = [], checkboxes: any[] = []
        let importButton: any
        let acceptRestart = false, acceptDiscard = false, discardPrompts = 0, restarts = 0
        const node = (name = '', parent?: any): any => {
            const value: any = { name, parent, children: [], position: { x: 0, y: 0 }, isValid: true,
                active: true, activeInHierarchy: true, on() {}, setScale() {},
                addComponent() { const button = {}; buttons.push(button); return button },
                getComponent: () => ({ width: 480 }),
                getComponentsInChildren: () => [{ node: node() }, { node: node() }],
                destroy() { this.isValid = false; this.children.forEach((child: any) => child.destroy()) },
            }
            parent?.children.push(value)
            return value
        }
        env.modules.cc = { ...env.modules.cc, Color: class { static BLACK = {}; static WHITE = {} },
            Button: { EventType: { CLICK: 'click' } }, KeyCode: {}, UITransform: class {},
            director: { once(_event: string, callback: () => void) {
                assert.equal(labels.at(-1), 'Loading...', 'paint the loading message before reading Mods')
                assert.equal(importButton.interactable, true, 'Import keeps its normal appearance while loading')
                callback()
            } }, Director: { EVENT_AFTER_DRAW: 'after-draw' } }
        env.modules['@/client/font'] = { FontMetricsUtil: {
            getMetrics: () => ({ height: 14, ascentPadding: 0 }), measureTextWidth: (_font: any, text: string) => text.length * 6,
        } }
        env.modules['@/client/ui/UIButton'] = { UIButton: class {} }
        env.modules['@/client/view/uiNode'] = { uiNode: (args: any) => ({
            node: node(args.name, args.parent), graphics: {
                fillRect() {}, rect() {}, stroke() {}, clear() {}, moveTo() {}, lineTo() {}, close() {}, fill() {},
            },
        }) }
        const ui = {
            assets: { fonts: { profile: { config: {} } } }, text: (key: string, fallback?: string) => fallback ?? key,
            dialog(_parent: any, args: any): any {
                if (!args.width) {
                    if (args.title === 'Error') errors.push(args.message)
                    if (args.message?.startsWith('Unapplied changes')) {
                        discardPrompts++
                        return { result: Promise.resolve(acceptDiscard) }
                    }
                    return { result: Promise.resolve(args.title === 'Restart Game?' ? acceptRestart : true) }
                }
                return { node: node(), content: node(), close() { this.node.activeInHierarchy = false } }
            },
            scroll: () => ({ content: node(), contentWidth: 338, offset: 0, setContentHeight() {} }),
            button(_parent: any, args: any) { return importButton = { interactable: args.enabled ?? true } },
            label: (parent: any, args: any) => {
                if (args.text === 'Loading...') assert.equal(parent.name, 'PackageList', 'Loading belongs inside the Mod list box')
                labels.push(args.text)
                return { node: node('', parent), renderer: {} }
            },
            checkbox: (_parent: any, args: any) => {
                const checkbox = { node: node(), value: args.value, button: { interactable: true } }
                checkboxes.push(checkbox)
                return checkbox
            },
        }
        const { showPackageDialog } = env.load('assets/scripts/client/screens/PackageDialog.ts')
        const open = async () => {
            buttons.length = 0
            labels.length = checkboxes.length = 0
            return showPackageDialog(node(), ui, { restart: async () => { restarts++ } })
        }
        let dialog = await open()
        assert.equal(labels.at(-1), 'pvz:base')
        assert.equal(checkboxes.at(-1).button.interactable, false)
        dialog.onCancel()
        await setImmediate()
        assert.equal(discardPrompts, 0, 'an unchanged draft closes without a warning')
        assert.equal(dialog.node.activeInHierarchy, false)
        dialog = await open()
        buttons[0].onClick()
        await setImmediate()
        assert.equal(archives.has(id), true, 'Uninstall only edits the draft')
        dialog.onCancel()
        await setImmediate()
        assert.equal(discardPrompts, 1)
        assert.equal(dialog.node.activeInHierarchy, true, 'declining discard keeps the manager open')
        acceptDiscard = true
        dialog.onCancel()
        await setImmediate()
        assert.equal(dialog.node.activeInHierarchy, false)
        dialog = await open()
        assert.equal(buttons.length, 4, 'the installed row returns after Cancel')
        buttons[0].onClick()
        await setImmediate()
        dialog.onConfirm()
        await setImmediate()
        assert.equal(archives.has(id), true, 'cancelling restart cannot delete the ZIP')
        assert.deepEqual(Array.from(await manager.list()), [id], 'cancelling restart cannot disable it')
        acceptRestart = true
        dialog.onConfirm()
        await setImmediate()
        assert.equal(archives.has(id), false)
        assert.equal(restarts, 1)
        assert.deepEqual(errors, [])
        await manager.install(zipSync(modFiles('local:off-a')), false)
        await manager.install(zipSync(modFiles('local:off-b')), false)
        dialog = await open()
        buttons[3].onClick()
        await setImmediate()
        dialog.onConfirm()
        await setImmediate()
        const savedOrder = ['local:off-a', 'local:off-b']
        assert.deepEqual(Array.from(await new env.ModManager().installed(), (entry: any) => entry.id), savedOrder)
        assert.equal(restarts, 1, 'saving disabled row order does not restart the game')
        dialog = await open()
        buttons[3].onClick()
        await setImmediate()
        dialog.onCancel()
        await setImmediate()
        assert.deepEqual(Array.from(await new env.ModManager().installed(), (entry: any) => entry.id), savedOrder, 'Cancel discards order changes')
        const longId = 'local:' + 'long-mod-name-'.repeat(8)
        await manager.install(zipSync(modFiles(longId)), false)
        await open()
        const shortened = labels.find(text => text.startsWith('local:long-mod-name'))!
        assert.ok(shortened.endsWith('...  1.0.0'), 'only the ID is shortened; its version stays visible')
        assert.ok(shortened.length * 6 <= 176, 'the name stays clear of the sorting and uninstall controls')
        assert.ok(labels.includes('local:off-a  1.0.0'), 'short IDs are unchanged')
    }
})


test('Native builtin ZIP loading reads nativeUrl when the Asset has no nativeAsset', async () => {
    const { modules, load } = setup()
    const path = 'assets/resources/native/base.zip'
    const data = zipSync(zipFiles('pvz:base', 'native-base'))
    const reads: string[] = []
    modules.cc.sys.isNative = true
    modules.cc.native = { fileUtils: {
        getWritablePath: () => '/app/',
        removeDirectory() {},
        getDataFromFile(file: string) { reads.push(file); assert.equal(file, path); return data.slice().buffer },
    } }
    modules.cc.resources = { load(name: string, _type: unknown, done: Function) {
        assert.equal(name, 'base')
        done(null, { nativeUrl: path })
    } }
    modules.cc.assetManager.downloader = { register() {} }
    modules.cc.assetManager.parser = { register() {} }
    modules['./ModManager'] = { modManager: { ready: async () => [] } }
    const { modResources } = load('assets/scripts/client/content/ModResources.ts')
    assert.equal((await modResources.baseJson('pvz:config')).tag, 'native-base')
    assert.deepEqual(reads, [path])
})

test('raw Mod paths preserve declared density and share the image and JSON decoders', async () => {
    const { manager, fresh, modules } = setup()
    await manager.install(zipSync(zipFiles()))
    const resources = fresh()
    const frame = await resources.file('local:hd', 'button.png', modules.cc.SpriteFrame)
    assert.equal(frame.originalSize.width, 50)
    assert.equal(frame.originalSize.height, 70)
    assert.equal(frame.texture.width, 100)
    const registered = await resources.asset('pvz:button', modules.cc.SpriteFrame)
    assert.equal(registered.texture, frame.texture)
    assert.equal(registered.originalSize.width, frame.originalSize.width)
    assert.equal(await resources.file('local:hd', 'button.png', modules.cc.SpriteFrame), frame)
    assert.equal((await resources.file('local:hd', 'config.json', modules.cc.JsonAsset)).json.tag, 'first')
    const registeredFirst = fresh()
    await registeredFirst.asset('pvz:button', modules.cc.SpriteFrame)
    assert.equal((await registeredFirst.file('local:hd', 'button.png', modules.cc.SpriteFrame)).originalSize.width, 50)
})

test('Windows ZIP selection preserves Unicode paths, multiple files, cancellation and picker errors', async () => {
    const { modules, archive, jsb } = setup()
    modules.cc.sys.isNative = true
    modules.cc.sys.os = 'Windows'
    const paths = ['C:\\Mods\\选择 测试.zip', 'C:\\Mods\\second.zip']
    modules.cc.native = { fileUtils: { getDataFromFile(path: string) {
        assert.ok(paths.includes(path))
        return strToU8(path).buffer
    }, removeFile() { assert.fail('Windows selections must not delete the original file') } } }
    jsb.selectFiles = (extension, callback) => { assert.equal(extension, 'zip'); callback(paths) }
    const selected = await archive.selectZips()
    assert.deepEqual(Array.from(selected, (file: any) => file.name), ['选择 测试.zip', 'second.zip'])
    for (let i = 0; i < selected.length; i++) {
        assert.equal(strFromU8(await selected[i].read()), paths[i])
        selected[i].dispose()
    }
    jsb.selectFiles = (_extension, callback) => callback([])
    assert.equal((await archive.selectZips()).length, 0)
    jsb.selectFiles = (_extension, callback) => callback([], 'Picker failed')
    await assert.rejects(archive.selectZips(), /Picker failed/)
})

test('Native installation, picker cleanup and runtime snapshots share the Mod store', async () => {
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
    const data = zipSync(zipFiles())
    files.set('/Imports/hd.zip', data)
    jsb.selectFiles = (_extension, callback) => callback(['/Imports/hd.zip'])
    const selected = (await archive.selectZips())[0]
    await manager.install(await selected.read())
    selected.dispose()
    assert.equal(files.has('/Imports/hd.zip'), false)
    const installedFile = '/app/mods/local%3Ahd/.archive.zip'
    assert.deepEqual(files.get(installedFile), data)
    const running = fresh()
    const frame = await running.file('local:hd', 'button.png', modules.cc.SpriteFrame)
    assert.equal(await running.file('local:hd', 'button.png', modules.cc.SpriteFrame), frame)
    const clip = await running.asset('pvz:chomp', modules.cc.AudioClip)
    assert.match(clip.nativeUrl, /mod-resources/)
    assert.equal(strFromU8(files.get(clip.nativeUrl)), 'ID3-first')
    failCommit = true
    await assert.rejects(manager.install(zipSync(zipFiles('local:hd', 'second'))), /finish installing/)
    assert.deepEqual(files.get(installedFile), data)
    failCommit = false
    await manager.install(zipSync(zipFiles('local:hd', 'second')))
    const updated = await fresh().asset('pvz:chomp', modules.cc.AudioClip)
    assert.equal(strFromU8(files.get(updated.nativeUrl)), 'ID3-second')
    assert.equal(strFromU8(files.get(clip.nativeUrl)), 'ID3-first')
    await manager.uninstall('local:hd')
    assert.equal(files.has(installedFile), false)
    assert.equal((await new ModManager().list()).length, 0)
    assert.equal(strFromU8(files.get(clip.nativeUrl)), 'ID3-first')
    const base = fresh(async () => zipSync(zipFiles('pvz:base', 'base', { width: 100, height: 140, scale: 1 })))
    modules['@/client/content/ModResources'] = { modResources: base }
    modules['@/client/content/SpriteDensity'] = { getSpriteDensity: () => 1 }
    modules['./SpriteResourceManifest'] = { SpriteResourceManifest: { getSampling: () => 'linear' } }
    modules.cc.dynamicAtlasManager = { enabled: true }
    modules.cc.macro = {}
    const { SpriteLoader } = load('assets/scripts/core/SpriteLoader.ts')
    const frameWithoutMods = await SpriteLoader.load('pvz:button')
    assert.equal(frameWithoutMods.originalSize.width, 100)
    assert.equal(modules.cc.dynamicAtlasManager.enabled, false, 'native 1x sprites must not copy released CPU images into an atlas')
    modules.cc.sys.isNative = false
    load('assets/scripts/core/SpriteLoader.ts').SpriteLoader._configureDynamicAtlas()
    assert.equal(modules.cc.dynamicAtlasManager.enabled, true, 'Web retains source images and can still batch sprites')
})
