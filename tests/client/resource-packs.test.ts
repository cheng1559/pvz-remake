import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { setImmediate } from 'node:timers/promises'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

function setup() {
    const files = new Map<string, any>()
    const storage = new Map<string, string>()
    const requests: string[] = []
    const archives = new Map<string, Uint8Array>()
    const modArchives = new Map<string, Uint8Array>()
    const jsb = { selectFile: undefined as ((extension: string, callback: (path: string | null, error?: string | null) => void) => void) | undefined }
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
        cc: { Asset, JsonAsset, TextAsset, AudioClip, Texture2D: Texture, SpriteFrame: Frame, Rect: Vector, Size: Vector, Vec2: Vector,
            sys: { isNative: false, isBrowser: false, OS: { IOS: 'iOS' }, localStorage: { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value) } },
            assetManager: { loadRemote: (path: string, options: any, callback?: any) => {
                const complete = callback ?? options
                try {
                    const value = asset(path)
                    complete(null, /\.(mp3|wav)$/.test(options.ext ?? '') ? Object.assign(new AudioClip(), { nativeUrl: path }) : value)
                } catch (error) { complete(error) }
            } } },
        './LegacyAssetLoader': { AssetLoader: { async load(path: string) { return asset(path) } } },
        './SpriteDensity': { setSpriteDensity() {}, applySpriteDensity(frame: any) { frame.normalized = true } },
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
            URL: TestURL, Blob, Uint8Array, DataView, jsb, location: { href: 'https://game.example/' },
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
    const { ModManager } = load('assets/scripts/client/content/ModManager.ts')
    const modManager = new ModManager()
    modules['@/client/content/ModManager'] = { modManager }
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
    return { manager, ResourcePackManager, files, storage, requests, modules, load, manifest, sprite, Texture, archives, archive, db, jsb, blobs, picker: () => picker, modManager, ModManager, modArchives, modDb }
}

const packKey = 'pvz-remake:resource-packs'
/** Saved pack state with every listed pack enabled, given lowest priority first like `list()`. */
const enabledPacks = (...ids: string[]) => JSON.stringify(ids.reverse().map(id => ({ id, enabled: true })))

function zipFiles(id = 'custom') {
    const image = new Uint8Array(readFileSync('assets/bundles/pvz-base/sprites/seedpacket_larger.png'))
    return {
        'pack.json': strToU8(JSON.stringify({ id, sprites: { 'pvz:button': { file: 'button.png', width: 50, height: 70, scale: 2 } }, fonts: { 'pvz:demo': 'fonts/demo.json' } })),
        'button.png': image,
        'fonts/demo.json': strToU8(JSON.stringify({ layers: [{ image: 'atlas', textureScale: 4 }] })),
        'fonts/atlas.png': image,
    }
}

test('music stems, SFX, animation JSON and text share pack priority before warm built-in caches', async () => {
    const { manager, archives, storage, modules, load, files, blobs, ResourcePackManager } = setup()
    const json = (value: unknown) => strToU8(JSON.stringify(value))
    const animation = (durationSeconds: number) => ({
        schemaVersion: 2, id: 'pvz:demo', durationSeconds,
        tracks: [{ id: 'root', zIndex: 0, keyframes: [{ timeSeconds: 0, x: 0, y: 0,
            scaleX: 1, scaleY: 1, skewX: 0, skewY: 0, alpha: 1, sprite: null, interpolation: 'linear' }] }],
    })
    archives.set('first', zipSync({
        'pack.json': json({ id: 'first', audio: {
            'pvz:day_grasswalk_main': 'main.mp3', 'pvz:day_grasswalk_drums': 'drums.mp3',
            'pvz:day_grasswalk_hihats': 'hihats.mp3', 'pvz:chomp': 'chomp.mp3', 'author:custom_main': 'main.mp3',
        }, json: {
            'pvz:demo': 'animation.json', 'pvz:audio/music/music_manifest': 'music.json',
            'pvz:properties/lawnstrings': 'strings.json', 'pvz:particles/demo': 'particle.json',
        }, text: { 'pvz:properties/credits': 'credits.txt' } }),
        'main.mp3': strToU8('ID3-first-main'), 'drums.mp3': strToU8('ID3-drums'),
        'hihats.mp3': strToU8('ID3-hihats'), 'chomp.mp3': strToU8('ID3-first-chomp'),
        'animation.json': json(animation(1)), 'strings.json': json({ MUSIC: 'First' }),
        'particle.json': json({ emitters: [], replacement: true }), 'credits.txt': strToU8('Credits from ZIP'),
        'music.json': json({ tunes: { day_grasswalk: { durationSec: 10, loopStartSec: 0, loopEndSec: 10,
            stems: { main: 'audio/music/day_grasswalk_main', drums: 'audio/music/day_grasswalk_drums', hihats: 'audio/music/day_grasswalk_hihats' } } } }),
    }))
    archives.set('last', zipSync({
        'pack.json': json({ id: 'last', audio: { 'pvz:day_grasswalk_main': 'main.mp3', 'pvz:chomp': 'chomp.mp3' },
            json: { 'pvz:demo': 'animation.json', 'pvz:properties/lawnstrings': 'strings.json' } }),
        'main.mp3': strToU8('ID3-last-main'), 'chomp.mp3': strToU8('ID3-last-chomp'),
        'animation.json': json(animation(2)), 'strings.json': json({ MUSIC: 'Last' }),
    }))
    storage.set(packKey, enabledPacks('first', 'last'))
    const { AudioClip, JsonAsset, TextAsset } = modules.cc
    let originalReads = 0
    files.set('properties/lawnstrings', { json: { MUSIC: 'Original' } })
    files.set('particles/demo', { name: 'demo', json: { replacement: false } })
    modules.cc.resources = {
        get(path: string) { originalReads++; return files.get(path) },
        load() { assert.fail('an overridden resource must not load the original') },
        getDirWithPath() { return [{ path: 'particles/demo' }] },
    }
    const { AssetLoader } = load('assets/scripts/client/content/LegacyAssetLoader.ts')
    modules['@/client/content/LegacyAssetLoader'] = { AssetLoader }
    assert.equal((await AssetLoader.load('properties/lawnstrings', JsonAsset)).json.MUSIC, 'Last')
    assert.equal((await AssetLoader.load('properties/credits', TextAsset)).text, 'Credits from ZIP')
    assert.equal((await AssetLoader.loadDir('particles', JsonAsset))[0].json.replacement, true)

    const { SoundLoader } = load('assets/scripts/client/sound/LegacySoundSystem.ts')
    modules['@/client/sound/LegacySoundSystem'] = { SoundLoader }
    const { MusicSystem } = load('assets/scripts/client/music/MusicSystem.ts')
    await MusicSystem.preloadAllTunes()
    for (const [stem, expected] of [['main', 'ID3-last-main'], ['drums', 'ID3-drums'], ['hihats', 'ID3-hihats']]) {
        const clip = await MusicSystem._loadClip(`audio/music/day_grasswalk_${stem}`)
        assert.equal(await blobs.get(clip.nativeUrl)!.text(), expected)
        assert.equal(blobs.get(clip.nativeUrl)!.type, 'audio/mpeg')
    }
    assert.equal(await blobs.get((await SoundLoader.load('chomp')).nativeUrl)!.text(), 'ID3-last-chomp')

    modules.cc.Component = class {}
    modules.cc._decorator = { ccclass: () => (value: unknown) => value }
    modules['@/shared/content/reanim'] = load('assets/scripts/shared/content/reanim.ts')
    const contentLoader = load('assets/scripts/client/content/ClientContentLoader.ts')
    const loader = new contentLoader.ClientContentLoader()
    const customClip = await loader.load({ id: 'author:custom_music', category: 'music', path: 'music/custom_main', bundle: 'base' }, AudioClip)
    assert.equal(await blobs.get(customClip.nativeUrl)!.text(), 'ID3-first-main', 'derived music clips retain their Mod namespace')
    modules['@/client/content/ClientContentLoader'] = contentLoader
    const { ReanimRepository } = load('assets/scripts/client/reanim/ReanimPlayer.ts')
    const registry = { resolve: () => ({ id: 'pvz:demo', category: 'reanim', path: 'reanim/demo', bundle: 'base', contentHash: 'base' }) }
    const prepared = await new ReanimRepository(registry, loader).load('pvz:demo')
    assert.equal(prepared.data.durationSeconds, 2)
    assert.equal(originalReads, 0)

    const loadRemote = modules.cc.assetManager.loadRemote
    modules.cc.assetManager.loadRemote = (_path: string, _options: unknown, done: Function) => done(new Error('Audio decoding failed'))
    modules['./ResourcePacks'].resourcePacks = new ResourcePackManager()
    const { AssetLoader: retryLoader } = load('assets/scripts/client/content/LegacyAssetLoader.ts')
    await assert.rejects(retryLoader.load('audio/sfx/chomp', AudioClip), /Audio decoding failed/)
    assert.equal(originalReads, 0, 'decode failures cannot fall back to cached original audio')
    modules.cc.assetManager.loadRemote = loadRemote
    assert.ok(await retryLoader.load('audio/sfx/chomp', AudioClip), 'failed audio loads can retry')
    await manager.preload(() => {})
})

function modFiles(id = 'local:screen', version = '1.0.0', dependencies: { id: string, version: string }[] = []) {
    return {
        'mod.json': strToU8(JSON.stringify({
            schemaVersion: 1, id, version, apiVersion: 1, contentHash: `${id}-${version}`, dependencies,
            client: { module: 'client/cocos/index.js' },
        })),
        'client/cocos/index.js': strToU8('System.register([], function (_export) { return { execute: function () { _export("register", function () {}); } }; });'),
    }
}

test('package dialog keeps uninstall drafts on disk until Apply and restart confirmation', async () => {
    for (const kind of ['mod', 'pack']) {
        const env = setup()
        const id = kind === 'mod' ? 'local:screen' : 'custom'
        const initial = kind === 'mod' ? env.modManager : env.manager
        await initial.install(zipSync(kind === 'mod' ? modFiles(id) : zipFiles(id)))
        const manager = kind === 'mod' ? new env.ModManager() : new env.ResourcePackManager()
        env.modules[kind === 'mod' ? '@/client/content/ModManager' : '@/client/content/ResourcePacks'] = {
            [kind === 'mod' ? 'modManager' : 'resourcePacks']: manager,
        }
        const archives = kind === 'mod' ? env.modArchives : env.archives
        const buttons: any[] = [], errors: string[] = []
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
            Button: { EventType: { CLICK: 'click' } }, KeyCode: {}, UITransform: class {} }
        env.modules['@/client/font'] = { FontMetricsUtil: {
            getMetrics: () => ({ height: 14, ascentPadding: 0 }), measureTextWidth: () => 50,
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
            button() {}, label: () => ({ renderer: {} }), checkbox: () => ({ node: node(), value: true }),
        }
        const { showPackageDialog } = env.load('assets/scripts/client/screens/PackageDialog.ts')
        const open = async () => {
            buttons.length = 0
            return showPackageDialog(node(), ui, kind, { restart: async () => { restarts++ } })
        }
        let dialog = await open()
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
        assert.equal(buttons.length, kind === 'mod' ? 2 : 4, 'the installed row returns after Cancel')
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
    }
})

test('Mod ZIP updates and uninstall preserve running code until restart and persist independently of packs', async () => {
    const { modManager, ModManager, archives, modArchives, modDb } = setup()
    const original = zipSync(modFiles())
    assert.equal(await modManager.install(original), 'local:screen')
    assert.equal((await modManager.ready()).length, 0, 'installation cannot activate code in the current session')
    assert.equal(archives.size, 0, 'Mod ZIPs must use their own database')
    const running = new ModManager()
    assert.equal((await running.ready())[0].manifest.version, '1.0.0')
    await running.install(zipSync(modFiles('local:screen', '1.1.0')))
    assert.equal((await running.ready())[0].manifest.version, '1.0.0')
    assert.equal((await new ModManager().ready())[0].manifest.version, '1.1.0')
    const saved = modArchives.get('local:screen')
    modDb.failWrite = true
    await assert.rejects(running.install(original), /Storage full/)
    assert.equal(modArchives.get('local:screen'), saved)
    modDb.failWrite = false
    assert.equal(await running.uninstall('local:screen'), true)
    assert.equal((await running.ready())[0].manifest.version, '1.0.0')
    assert.equal((await new ModManager().ready()).length, 0)
    assert.equal(modArchives.has('local:screen'), false)
    await assert.rejects(running.load('local:screen'), /not installed/)
})

test('Mod startup removes missing records and allows reinstall while preserving archive and dependency validation', async () => {
    const { modManager, ModManager, storage, modArchives } = setup()
    const key = 'pvz-remake:active-mods'
    storage.set(key, '["local:widescreen"]')
    assert.equal((await modManager.ready()).length, 0)
    assert.equal(storage.get(key), '[]', 'missing installation records are removed persistently')
    await assert.rejects(modManager.load('local:widescreen'), /not installed/)
    await modManager.install(zipSync(modFiles('local:widescreen')))
    assert.equal((await new ModManager().ready())[0].manifest.id, 'local:widescreen')

    modArchives.set('local:base', zipSync(modFiles('local:base')))
    modArchives.set('local:addon', zipSync(modFiles('local:addon', '1.0.0', [{ id: 'local:base', version: '1.0.0' }])))
    storage.set(key, '["local:addon","local:gone","local:base"]')
    const running = new ModManager()
    assert.deepEqual(Array.from(await running.ready(), (mod: any) => mod.manifest.id), ['local:base', 'local:addon'])
    assert.deepEqual(Array.from(await running.list()), ['local:addon', 'local:base'], 'saved priority order is preserved')
    modArchives.delete('local:base')
    await assert.rejects(new ModManager().ready(), /missing mod/, 'remaining installed Mods must still satisfy their dependencies')

    modArchives.set('local:broken', new Uint8Array([1, 2, 3]))
    storage.set(key, '["local:broken"]')
    await assert.rejects(new ModManager().ready(), /zip/i)
    assert.equal(storage.get(key), '["local:broken"]', 'corrupt installed Mods are not silently disabled')
})

test('Mod validation prevents missing modules and dependencies, incompatible updates, and disabling a required Mod', async () => {
    const { modManager, ModManager, modArchives } = setup()
    const addon = zipSync(modFiles('local:addon', '1.0.0', [{ id: 'local:base', version: '1.0.0' }]))
    await assert.rejects(modManager.install(addon), /missing mod/)
    assert.equal(modArchives.size, 0)
    const base = zipSync(modFiles('local:base'))
    await modManager.install(base)
    await modManager.install(addon)
    assert.deepEqual(Array.from(await modManager.list()), ['local:base', 'local:addon'])
    const updated = new ModManager()
    assert.deepEqual(Array.from(await updated.ready(), (mod: any) => mod.manifest.id), ['local:base', 'local:addon'])
    await assert.rejects(modManager.unload('local:base'), /missing mod/)
    await assert.rejects(modManager.uninstall('local:base'), /missing mod/)
    await assert.rejects(modManager.install(zipSync(modFiles('local:base', '2.0.0'))), /requires local:base/)
    assert.deepEqual(modArchives.get('local:base'), base)
    await assert.rejects(modManager.install(zipSync({ 'mod.json': modFiles()['mod.json'] })), /Missing Mod module/)
    await assert.rejects(modManager.install(zipSync(zipFiles())), /mod.json/)
    await assert.rejects(modManager.install(zipSync({ ...modFiles(), '../outside.js': strToU8('') })), /Invalid ZIP path/)
    assert.equal(await modManager.unload('all'), true)
    assert.equal(await modManager.unload('all'), false)
})

test('Mod CLI mirrors pack installation, state-change restarts, list and uninstall behavior', async () => {
    const { modules, load, modManager, modArchives } = setup()
    modules['@/shared/debug/DebugCli'] = load('assets/scripts/shared/debug/DebugCli.ts')
    const { executeDebugCliCommand } = load('assets/scripts/platform/debug/DebugCliCommands.ts')
    const execute = (command: string) => executeDebugCliCommand(command, false, () => assert.fail('must not request gameplay'))
    assert.equal((await execute('/mod install')).action, 'installMod')
    assert.equal((await execute('/mod install custom.zip')).failure, 'syntax')
    assert.equal((await execute('/mod load')).failure, 'syntax')
    await modManager.install(zipSync(modFiles()))
    assert.equal((await execute('/mod load local:screen')).action, undefined)
    assert.match((await execute('/mod list')).message, /local:screen/)
    assert.equal((await execute('/mod unload local:screen')).action, 'restartForMods')
    assert.equal((await execute('/mod unload local:screen')).action, undefined)
    assert.equal((await execute('/mod load local:screen')).action, 'restartForMods')
    assert.equal((await execute('/mod uninstall local:screen')).action, 'restartForMods')
    assert.equal(modArchives.size, 0)
    assert.match((await execute('/mod list')).message, /none/)
    assert.equal((await execute('/mod load local:screen')).failure, 'condition')
})

test('ZIP installation and replacement take effect on restart and leave current resources unchanged', async () => {
    const { manager, ResourcePackManager, storage, archives, db } = setup()
    const entries = zipFiles()
    let bytes = zipSync(Object.fromEntries(Object.entries(entries).map(([name, value]) => [`custom/${name}`, value])))
    assert.equal(await manager.install(bytes), 'custom')
    assert.deepEqual(JSON.parse(storage.get(packKey)!), [{ id: 'custom', enabled: true }])
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

test('startup removes missing pack records, allows reinstall, and still rejects corrupt installed packs', async () => {
    const { manager, ResourcePackManager, storage, archives, manifest, sprite } = setup()
    const key = packKey
    storage.set(key, enabledPacks('missing'))
    await manager.ready()
    assert.deepEqual(Array.from(await manager.list()), [])
    assert.equal(storage.get(key), '[]', 'repair is persisted for the next startup')
    await assert.rejects(manager.load('missing'), /not installed/)
    await manager.install(zipSync(zipFiles('missing')))
    assert.ok(await new ResourcePackManager().sprite('pvz:button'), 'ZIP installation works after startup repair')

    manifest('first', { 'pvz:button': sprite })
    manifest('last', { 'pvz:button': sprite })
    storage.set(key, enabledPacks('first', 'gone', 'last'))
    assert.deepEqual(Array.from(await new ResourcePackManager().list()), ['first', 'last'], 'installed packs keep their priority order')

    archives.set('broken', new Uint8Array([1, 2, 3]))
    storage.set(key, enabledPacks('first', 'broken'))
    await assert.rejects(new ResourcePackManager().ready(), /zip/i)
    assert.equal(storage.get(key), enabledPacks('first', 'broken'), 'corrupt installed packs are not silently disabled')
})

test('invalid ZIP paths, missing dependencies and mismatched images leave the active pack untouched', async () => {
    const { manager, archive, manifest, sprite, archives } = setup()
    manifest('first', { 'pvz:button': sprite })
    await manager.load('first')
    const valid = zipFiles()
    assert.throws(() => archive.unpackArchive(zipSync({ ...valid, '../outside.png': valid['button.png'] }), 'pack.json'), /Invalid ZIP path/)
    assert.throws(() => archive.unpackArchive(zipSync({ ...valid, 'nested/pack.json': valid['pack.json'] }), 'pack.json'), /exactly one/)
    assert.throws(() => archive.unpackArchive(new Uint8Array([1, 2, 3]), 'pack.json'), /zip/i)
    for (const changed of [
        { ...valid, 'button.png': new Uint8Array([1, 2]) },
        { ...valid, 'fonts/demo.json': strToU8('{"layers":[{"image":"missing"}]}') },
        { ...valid, 'pack.json': strToU8('{"id":"custom","sprites":{"pvz:button":{"file":"button.png","width":1,"height":1}},"fonts":{}}') },
        { 'pack.json': strToU8('{"id":"custom","audio":{"pvz:chomp":"missing.mp3"}}') },
        { 'pack.json': strToU8('{"id":"custom","audio":{"pvz:chomp":"sound.ogg"}}'), 'sound.ogg': strToU8('OggS') },
        { 'pack.json': strToU8('{"id":"custom","json":{"pvz:demo":"broken.json"}}'), 'broken.json': strToU8('{broken') },
        { 'pack.json': strToU8('{"id":"custom","unknown":{}}') },
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
    const importing = archive.selectZip()
    const data = zipSync(zipFiles())
    picker().files = [{ arrayBuffer: async () => data.buffer }]
    picker().onchange()
    await manager.install(await importing)
    const cancelled = archive.selectZip()
    picker().cancel()
    assert.equal(await cancelled, null)
    assert.deepEqual(Array.from(await manager.list()), ['custom'])
    assert.deepEqual(Array.from(await new ResourcePackManager().list()), ['custom'])
    assert.equal((await execute('/pack install custom.zip')).failure, 'syntax')
    assert.equal((await execute('/pack install https://packs.example/custom.zip')).failure, 'syntax')
})

test('Native ZIP installation copies files into writable storage and rolls back a failed replacement', async () => {
    const { manager, ResourcePackManager, modules, files, jsb, archive, Texture } = setup()
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
    const packFiles: Record<string, Uint8Array> = { ...zipFiles(), 'audio/chomp.mp3': strToU8('ID3-original'), 'audio/later.mp3': strToU8('ID3-later') }
    const packManifest = JSON.parse(strFromU8(packFiles['pack.json']))
    packManifest.audio = { 'pvz:chomp': 'audio/chomp.mp3', 'pvz:later': 'audio/later.mp3' }
    for (let index = 0; index < 8; index++) {
        const file = `icons/${index}.png`
        packFiles[file] = packFiles['button.png']
        packManifest.sprites[`pvz:icon${index}`] = { ...packManifest.sprites['pvz:button'], file }
    }
    packFiles['pack.json'] = strToU8(JSON.stringify(packManifest))
    const data = zipSync(packFiles)
    files.set('/Downloads/custom.zip', data)
    let select!: (path: string | null, error?: string | null) => void
    jsb.selectFile = (extension, callback) => { assert.equal(extension, 'zip'); select = callback }
    const selected = archive.selectZip()
    assert.equal(files.has('/Downloads/custom.zip'), true, 'wait for the system picker before reading')
    select('/Downloads/custom.zip')
    await manager.install(await selected)
    assert.equal(files.has('/Downloads/custom.zip'), false, 'remove the temporary iOS import')
    jsb.selectFile = (_, callback) => callback(null)
    assert.equal(await archive.selectZip(), null)
    jsb.selectFile = (_, callback) => callback(null, 'Could not read the selected file')
    await assert.rejects(archive.selectZip(), /Could not read/)
    modules.cc.sys.os = 'OS X'
    files.set('/Downloads/custom.zip', data)
    jsb.selectFile = (_, callback) => callback('/Downloads/custom.zip')
    assert.deepEqual(await archive.selectZip(), data)
    assert.equal(files.has('/Downloads/custom.zip'), true, 'preserve the original macOS file')
    assert.deepEqual(files.get('/app/resource-packs/custom/.archive.zip'), data)
    assert.deepEqual(files.get('/app/resource-packs/custom/button.png'), zipFiles()['button.png'])
    assert.deepEqual(Array.from(await new ResourcePackManager().list()), ['custom'])
    directories.add('/app/resource-packs').add('/app/resource-packs/custom.installing')
    assert.deepEqual(Array.from(await manager.installed()), ['custom'], 'list installed folders, skipping interrupted staging')
    directories.delete('/app/resource-packs/custom.installing')
    const running = new ResourcePackManager()
    const clip = await running.asset('pvz:chomp', modules.cc.AudioClip)
    assert.match(clip.nativeUrl, /resource-pack-runtime/)
    assert.deepEqual(files.get(clip.nativeUrl), packFiles['audio/chomp.mp3'])

    // Startup must bound decoder memory even when fonts, animations and sprites load together.
    const loadRemote = modules.cc.assetManager.loadRemote
    modules.cc.assetManager.loadRemote = (_path: string, _options: unknown, done: Function) => done(new Error('PNG decode failed'))
    await assert.rejects(running.sprite('pvz:button'), /PNG decode failed/)
    const uploaded = new Set<object>(), released = new Set<object>(), pending: Function[] = []
    let peak = 0
    modules.cc.Texture2D = class extends Texture {
        set image(value: any) { super.image = value; uploaded.add(value) }
    }
    modules.cc.assetManager.releaseAsset = (image: object) => {
        assert.ok(uploaded.has(image), 'release CPU pixels only after the texture upload')
        released.add(image)
    }
    modules.cc.assetManager.loadRemote = (path: string, options: any, done: Function) => {
        if (options.ext !== '.png') return loadRemote(path, options, done)
        assert.ok(files.has(path))
        pending.push(() => done(null, { width: 100, height: 140 }))
        peak = Math.max(peak, pending.length)
    }
    const preload = running.preload(() => {})
    await setImmediate()
    while (pending.length) {
        for (const finish of pending.splice(0)) finish()
        await setImmediate()
    }
    await preload
    assert.equal(peak, 4, 'failed decodes must return their slot; large packs use at most four simultaneous decoders')
    assert.equal(released.size, 10, 'each sprite and font image is released after upload')
    assert.equal(uploaded.size, released.size)
    modules.cc.assetManager.loadRemote = loadRemote

    failCommit = true
    await assert.rejects(manager.install(data), /finish installing/)
    assert.deepEqual(files.get('/app/resource-packs/custom/.archive.zip'), data)
    assert.ok(!directories.has('/app/resource-packs/custom.installing'))
    assert.ok(!directories.has('/app/resource-packs/custom.previous'))
    failCommit = false
    await manager.install(zipSync({ ...packFiles, 'audio/chomp.mp3': strToU8('ID3-updated') }))
    assert.deepEqual(files.get(clip.nativeUrl), packFiles['audio/chomp.mp3'], 'updates preserve the playing runtime snapshot')
    const updated = await new ResourcePackManager().asset('pvz:chomp', modules.cc.AudioClip)
    assert.notEqual(updated.nativeUrl, clip.nativeUrl)
    assert.equal(strFromU8(files.get(updated.nativeUrl)), 'ID3-updated')
    assert.equal(await running.uninstall('custom'), true)
    assert.equal(files.has('/app/resource-packs/custom/.archive.zip'), false)
    assert.deepEqual(Array.from(await new ResourcePackManager().list()), [])
    assert.deepEqual(files.get(clip.nativeUrl), packFiles['audio/chomp.mp3'], 'uninstall keeps audio available until restart')
    const later = await running.asset('pvz:later', modules.cc.AudioClip)
    assert.equal(strFromU8(files.get(later.nativeUrl)), 'ID3-later', 'unloaded assets can still load from the running pack after uninstall')
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

test('package manager lists installed archives and saves a draft enabled list with priority and dependency checks', async () => {
    const { manager, ResourcePackManager, manifest, sprite, modManager, ModManager, modules, load } = setup()
    manifest('hd', { 'pvz:button': sprite })
    manifest('zh-cn', { 'pvz:button': sprite })
    assert.deepEqual(Array.from(await manager.installed()), ['hd', 'zh-cn'])
    const ids = async () => Array.from(await manager.entries(), (entry: any) => `${entry.id}${entry.enabled ? '+' : ''}`)
    assert.deepEqual(await ids(), ['hd', 'zh-cn'], 'packs never placed are listed as disabled')
    await manager.setEntries([{ id: 'zh-cn', enabled: true }, { id: 'hd', enabled: false }])
    assert.deepEqual(await ids(), ['zh-cn+', 'hd'], 'disabled packs keep their place')
    await manager.setEntries([{ id: 'hd', enabled: true }, { id: 'zh-cn', enabled: true }])
    assert.deepEqual(Array.from(await manager.list()), ['zh-cn', 'hd'], 'list() keeps load order, lowest priority first')
    assert.deepEqual(Array.from(await manager.running()), [], 'saving waits for restart')
    assert.deepEqual(Array.from(await new ResourcePackManager().running()), ['zh-cn', 'hd'])
    await assert.rejects(manager.setEntries([{ id: 'missing', enabled: true }]), /not installed/)
    await assert.rejects(manager.setEntries([{ id: 'hd', enabled: true }, { id: 'hd', enabled: false }]), /Duplicate/)
    assert.deepEqual(await ids(), ['hd+', 'zh-cn+'], 'a rejected draft leaves the saved list unchanged')
    assert.equal(await manager.install(zipSync(zipFiles('extra')), false), 'extra')
    assert.deepEqual(await ids(), ['hd+', 'zh-cn+', 'extra'], 'installing without enabling lists the pack last')
    await manager.unload('hd')
    assert.deepEqual(await ids(), ['hd', 'zh-cn+', 'extra'], 'the CLI disables a pack in place')
    await manager.load('extra')
    assert.deepEqual(await ids(), ['extra+', 'hd', 'zh-cn+'], 'the CLI enables a pack at the highest priority')
    await manager.uninstall('hd')
    assert.deepEqual(await ids(), ['extra+', 'zh-cn+'])

    const addon = zipSync(modFiles('local:addon', '1.0.0', [{ id: 'local:base', version: '1.0.0' }]))
    assert.equal(await modManager.install(addon, false), 'local:addon', 'dependencies are checked when the Mod is enabled')
    await modManager.install(zipSync(modFiles('local:base', '1.0.0')), false)
    assert.deepEqual(Array.from(await modManager.installed(), (mod: any) => `${mod.id}@${mod.version}`), ['local:addon@1.0.0', 'local:base@1.0.0'])
    assert.deepEqual(Array.from(await modManager.list()), [])
    await assert.rejects(modManager.setEnabled(['local:addon']), /missing mod/)
    assert.equal(await modManager.setEnabled(['local:addon', 'local:base']), true)
    assert.equal(await modManager.setEnabled(['local:base', 'local:addon']), false, 'Mod load order comes from dependencies')
    const session = new ModManager()
    assert.deepEqual(Array.from(await session.running()), ['local:base', 'local:addon'])
    session.failures.set('local:addon', 'client/index.js: initialization failed')
    assert.deepEqual(Array.from(await session.running()), ['local:base'])
    assert.deepEqual(Array.from(await session.list()), ['local:addon', 'local:base'], 'a runtime failure must not change saved enable states')
    assert.equal((await session.installed()).find((mod: any) => mod.id === 'local:addon').error, 'client/index.js: initialization failed')

    modules['@/shared/debug/DebugCli'] = load('assets/scripts/shared/debug/DebugCli.ts')
    const { executeDebugCliCommand } = load('assets/scripts/platform/debug/DebugCliCommands.ts')
    const execute = (command: string) => executeDebugCliCommand(command, false, () => assert.fail('must not request gameplay'))
    assert.equal((await execute('/pack')).action, 'managePacks')
    assert.equal((await execute('/mod')).action, 'manageMods')
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
