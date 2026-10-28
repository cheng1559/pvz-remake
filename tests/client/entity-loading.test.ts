import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import * as plantDefinitions from '@/client/plants/definitions'
import * as zombieDefinitions from '@/client/zombies/definitions'
import { buildPresentationDefinitions } from '@/shared/content/DefinitionRegistry'
import { contentJson } from '@/shared/mod/content'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind,ScriptTarget,transpileModule } from 'typescript'
import { presentationFixture } from './presentationFixture'
import * as kernelModule from '@/shared/kernel/index'
import { readBaseContent } from '../../tools/mod/content'

// Rendering helpers that need the engine; animation frames pass through unchanged.
const clientStubs: Record<string, unknown> = {
    '@/client/render/AnimationAtlas': { animationFrame: (frame: unknown) => frame, animationFrames: (frames: unknown[]) => frames },
    '@/shared/kernel/index': kernelModule,
}

function loadClientModule(path: string, modules: Record<string, unknown>) {
    const module = { exports: {} as Record<string, any> }
    const code = transpileModule(readFileSync(`assets/scripts/client/${path}.ts`, 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    runInNewContext(code.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? clientStubs[id] ?? {} })
    return module.exports
}





test('plant and zombie Mod view factories share registration, conflict and freeze rules', async () => {
    for (const [kind, definitions, className] of [
        ['plant', plantDefinitions, 'PlantViewRegistry'], ['zombie', zombieDefinitions, 'ZombieViewRegistry'],
    ] as const) {
        const module = loadClientModule(`${kind}s/${className}`, {
            '@/client/content/EntityViewRegistry': { EntityViewRegistry }, './definitions': definitions,
        })
        const registry = new module[className]()
        const view = { sync() {}, snapshot() {}, restore() {} }
        registry.register('example:custom', () => view)
        assert.throws(() => registry.register('example:custom', () => view), /duplicate/)
        registry.freeze()
        assert.equal(await registry.create({
            [kind]: { typeId: 'example:entity' }, animations: { definitions: { [`${kind}s`]: { 'example:entity': { view: 'example:custom' } } } },
        }), view)
        assert.throws(() => registry.register('example:late', () => view), /frozen/)
    }
    assert.throws(() => zombieDefinitions.zombieDefinition(presentationFixture, 'example:missing'), /not installed/)
})

test('removing an entity while its custom view loads disposes the completed plant or zombie view', async () => {
    for (const kind of ['plant', 'zombie']) {
        const node = { isValid: true, destroy() { this.isValid = false } }
        const { LevelEntityRenderer } = loadClientModule('level/LevelEntityRenderer', {
            '@/client/view/uiNode': { uiNode: () => ({ node }) },
        })
        let finish!: (view: unknown) => void
        let context: any
        const factory = { create(value: unknown) { context = value; return new Promise(resolve => { finish = resolve }) } }
        const content = { plantViews: factory, zombieViews: factory, levels: { levels: { 'test:level': { award: { id: 'pvz:sunflower' } } } } }
        const renderer = new LevelEntityRenderer(0, content, {}, {}, {}, {}, {}, {}, {})
        const entity = { entityId: 1, typeId: 'test:entity', behaviorState: { ticks: 3 } }
        const snapshot = { levelId: 'test:level', gameplayTick: 5, plants: [], zombies: [], lawnMowers: [], projectiles: [], items: [],
            [kind + 's']: [entity] }
        const pending = renderer.create(1, snapshot)
        assert.equal(context[kind], entity)
        renderer.remove(1)
        let disposed = 0
        finish({ destroy() { disposed++ } })
        await pending
        assert.equal(disposed, 1)
        assert.equal(renderer.node(1), undefined)
    }
})

for (const kind of ['plant', 'zombie'] as const) test(`${kind} factories stay hidden while loading and paused restore reveals the current state`, async () => {
    const node = { isValid: true, active: true, setPosition() {}, destroy() { this.isValid = false } }
    const settings = { perfPlantsVisible: true, perfZombiesVisible: true }
    const { LevelEntityRenderer } = loadClientModule('level/LevelEntityRenderer', {
        '@/client/view/uiNode': { uiNode: (options: any) => { node.active = options.active; return { node } } },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: settings },
    })
    let finish!: () => void
    const loading = new Promise<void>(resolve => { finish = resolve })
    const synced: unknown[] = []
    let restored = false
    const view = { sync(plant: unknown) {
        if (synced.length === 0) assert.equal(node.active, false, 'the initial pose must be applied before showing the entity')
        synced.push(plant)
    }, restore() { restored = true } }
    const content = { levels: { levels: { 'test:level': { award: { id: 'pvz:sunflower' } } } },
        [kind + 'Views']: { async create() {
            assert.equal(node.active, false, 'raw animation tracks must stay hidden while the factory loads')
            await loading
            return view
        } } }
    const renderer = new LevelEntityRenderer(0, content, {}, {}, {}, {}, {}, {}, { complete: true })
    renderer.syncLayerOrder = () => {}
    const plant = { entityId: 1, typeId: 'test:plant', x: 40, y: 280, health: 300 }
    const snapshot = { levelId: 'test:level', gameplayTick: 0, paused: true, plants: [], zombies: [], [kind + 's']: [plant], projectiles: [],
        items: [], lawnMowers: [], cursor: { mode: 'none' } }
    const changes = { added: [1], removed: [] }
    renderer.sync(snapshot, changes, [])
    const creation = renderer.creationTasks.get(1)
    renderer.sync(snapshot, changes, [])
    assert.equal(node.active, false, 'normal visibility updates must not reveal a pending plant')
    const current = { ...plant, health: 200 }
    renderer.sync({ ...snapshot, [kind + 's']: [current] }, { added: [], removed: [] }, [])
    finish()
    await creation
    assert.equal(node.active, false, 'factory completion alone must not expose its stale initial state')
    await renderer.restore([{ kind, entityId: 1 }])
    assert.equal(restored, true)
    assert.deepEqual(synced, [current])
    assert.equal(node.active, true, 'paused restore must reveal entities without waiting for another tick')
    settings.perfPlantsVisible = settings.perfZombiesVisible = false
    renderer.sync(snapshot, { added: [], removed: [] }, [])
    assert.equal(node.active, false, 'the performance visibility switch still applies')
})


test('presentation definitions use the common ZIP resolver without mutating base data', async () => {
    const asset = { json: presentationFixture }
    let current: unknown = asset
    const manifest = { content: { presentation: 'presentation.json' },
        files: { 'presentation.json': new TextEncoder().encode(JSON.stringify(presentationFixture)) } }
    const { loadPresentationDefinitions } = loadClientModule('content/loadPresentationDefinitions', {
        cc: { JsonAsset: class {} },
        './ModResources': { modResources: { async asset(id: string) {
            assert.equal(id, 'pvz:presentation/definitions')
            return current
        } } },
        '@/app/ModLoader': { loadInstalledMods: async () => ({ presentationDefinitions: [] }) },
        '@/shared/content/DefinitionRegistry': { buildPresentationDefinitions },
        '@/shared/mod/content': { contentJson },
    })
    assert.deepEqual(await loadPresentationDefinitions(manifest), presentationFixture)
    const alternate = structuredClone(presentationFixture)
    current = { json: alternate }
    assert.deepEqual(await loadPresentationDefinitions(manifest), alternate)
    assert.equal(asset.json, presentationFixture)
    current = undefined
    assert.deepEqual(await loadPresentationDefinitions(manifest), presentationFixture)
    await assert.rejects(loadPresentationDefinitions({ ...manifest, content: {} }), /does not define presentation/)
})


test('ZIP caches are shared across content loaders and failed requests can retry', async () => {
    const assets = new Map<string, unknown>([['pvz:ready', {}]])
    const manifest = {}
    let loads = 0
    const packs = {
        async baseContent() { return manifest },
        async asset(id: string) {
            if (assets.has(id)) return assets.get(id)
            if (++loads === 1) throw new Error('temporary read failure')
            const asset = {}
            assets.set(id, asset)
            return asset
        },
    }
    const { ClientContentLoader } = loadClientModule('content/ClientContentLoader', {
        cc: { JsonAsset: class {} },
        './ModResources': { modResources: packs },
    })
    const content = { bundle: 'base', contentHash: 'hash', category: 'sprites', id: 'pvz:ready', path: 'ready' }
    class Asset {}
    const loader = new ClientContentLoader()
    assert.equal(await loader.load(content, Asset), assets.get('pvz:ready'))
    assert.equal(await new ClientContentLoader().load(content, Asset), assets.get('pvz:ready'))
    assert.equal(await loader.loadBaseContent(), manifest)
    assert.equal(loads, 0)
    const missing = { ...content, id: 'pvz:missing', path: 'missing' }
    await assert.rejects(loader.load(missing, Asset), /temporary read failure/)
    const first = loader.load(missing, Asset)
    assert.equal(loader.load(missing, Asset), first)
    await first
    assert.equal(loads, 2)
})


test('the base Mod prefab keeps its compiled engine bindings after moving into assets', async () => {
    class Prefab {}
    const prefab = new Prefab()
    const source = readBaseContent().resources.prefabs['pvz:level']
    const requests: string[] = []
    const { ClientContentLoader } = loadClientModule('content/ClientContentLoader', {
        cc: { Prefab, resources: { load(path: string, type: unknown, complete: (error: null, value: Prefab) => void) {
            requests.push(path)
            assert.equal(type, Prefab)
            assert.deepEqual(readFileSync(`assets/resources/${path}.prefab`), readFileSync(`mods/pvz-base/${source}`))
            complete(null, prefab)
        } } },
    })
    assert.equal(await new ClientContentLoader().load({ category: 'prefabs', contentId: 'pvz:base',
        id: 'pvz:level', contentHash: 'base', path: source }, Prefab), prefab)
    assert.deepEqual(requests, ['ui/level'])
})

test('preloaded animation frames are shared by registry and failed preparation can retry', async () => {
    let reads = 0, parses = 0
    const sprites: string[] = []
    const asset = { json: {} }
    let fail = true
    const { ReanimRepository } = loadClientModule('reanim/ReanimPlayer', {
        cc: { Component: class {}, JsonAsset: class {}, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/shared/content/reanim': { parseReanim: () => {
            parses++
            return { id: 'pvz:demo', tracks: [{ keyframes: [{ sprite: 'pvz:leaf' }, { sprite: 'pvz:leaf' }] }] }
        } },
        '@/client/content/ClientContentLoader': { SpriteRepository: class {
            async load(id: string, animation: string) {
                sprites.push(`${animation}:${id}`)
                if (fail) throw new Error('sprite unavailable')
                return {}
            }
        } },
    })
    const registry = { resolve: () => ({}) }, loader = { async load() { reads++; return asset } }
    await assert.rejects(new ReanimRepository(registry, loader).load('pvz:demo'), /sprite unavailable/)
    fail = false
    const preparing = new ReanimRepository(registry, loader).load('pvz:demo')
    assert.equal(new ReanimRepository(registry, loader).load('pvz:demo'), preparing)
    const prepared = await preparing
    assert.equal(await new ReanimRepository(registry, loader).load('pvz:demo'), prepared)
    assert.equal(reads, 2)
    assert.equal(parses, 1)
    assert.deepEqual(sprites, ['pvz:demo:pvz:leaf', 'pvz:demo:pvz:leaf'])
    assert.notEqual(await new ReanimRepository({ resolve: () => ({}) }, loader).load('pvz:demo'), prepared,
        'registries with different sprite overrides must not share prepared frames')
})





test('blink attachments follow both the moving head and its parent stem', () => {
    class Color {
        static WHITE = new Color()
        static BLACK = new Color()
        constructor(public r = 255, public g = 255, public b = 255, public a = 255) {}
        clone() { return new Color(this.r, this.g, this.b, this.a) }
    }
    const modules: Record<string, any> = {
        cc: { Color, Component: class {}, Node: { EventType: {} }, Sprite: { SizeMode: { RAW: 0 } }, toRadian: (degrees: number) => degrees * Math.PI / 180,
            _decorator: { ccclass: () => (value: unknown) => value } },
        '@/shared/mod/index': { isQualifiedId: () => true },
        // Track nodes created by the player; see the atlas page check below.
        '@/client/view/uiNode': { uiNode: (options: any) => ({ node: { name: options.name, setPosition() {}, setScale() {} }, sprite: {}, skew: { setSkew() {} } }) },
    }
    const load = (path: string) => {
        const module = { exports: {} as Record<string, any> }
        const code = transpileModule(readFileSync(path, 'utf8'), {
            compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
        })
        runInNewContext(code.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? clientStubs[id] ?? {} })
        return module.exports
    }
    modules['@/shared/content/reanim'] = load('assets/scripts/shared/content/reanim.ts')
    const { ReanimPlayer } = load('assets/scripts/client/reanim/ReanimPlayer.ts')
    const player = (trackId: string, from: number[], to = from) => {
        const result = new ReanimPlayer()
        result.data = { schemaVersion: 2, id: 'pvz:test', durationSeconds: 2, tracks: [{ id: trackId, zIndex: 0,
            keyframes: [from, to].map(([x, y], timeSeconds) => ({
                timeSeconds, x, y, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0,
                alpha: 1, sprite: 'pvz:test', interpolation: 'linear',
            })),
        }] }
        result.frames.set('pvz:test', {})
        result.views.set(trackId, { node: { position: { x: 0, y: 0 }, setPosition(x: number, y: number) { this.position = { x, y } }, setScale() {} }, sprite: {}, skew: { setSkew() {} } })
        return result
    }
    const body = player('stem', [0, 0], [20, 40])
    const head = player('face', [10, 20], [20, 30])
    const blink = player('eyelid', [15, 25])
    head.attachToTrack(body, 'stem')
    blink.attachToTrack(head, 'face')
    body.seek(0.5)
    head.seek(0.5)
    blink.seek(0)
    const position = () => blink.views.get('eyelid').node.position
    assert.deepEqual(Object.values(position()), [30, -50])
    body.seek(1)
    blink.seek(0)
    assert.deepEqual(Object.values(position()), [40, -70], 'the eyelid must inherit later movement of the stem too')
    const trackNode = head.getTrackNode('face'), replacement = head.getAnimation()
    replacement.tracks[0].keyframes[1].x += 5
    head.replaceAnimation(replacement)
    assert.equal(head.getTrackNode('face'), trackNode, 'animation replacement must preserve attached UI nodes')
    assert.equal(head.timeSeconds, 0.5)
    assert.equal(head.playing, false, 'replacement cannot resume a paused animation')
    const other = player('other', [0, 0])
    head.data.tracks.push(other.data.tracks[0])
    head.views.set('other', other.views.get('other'))
    other.views.get('other').node.setPosition = () => assert.fail('a sprite override must not rebuild unrelated tracks')
    const frame = {}
    head.setTrackSpriteOverride('face', frame)
    assert.equal(head.views.get('face').sprite.spriteFrame, frame)
    head.setTrackSpriteOverride('face', null)
    assert.equal(head.views.get('face').sprite.spriteFrame, head.frames.get('pvz:test'))
    head.data.tracks.pop()
    assert.throws(() => head.replaceAnimation({ ...replacement, tracks: [] }))
    assert.equal(head.getTrackNode('face'), trackNode, 'invalid replacements leave the original intact')

    head.setTrackColorOverride('face', new Color(55, 55, 55))
    head.seek(0.75)
    head.setColorOverride(new Color(128, 128, 128))
    assert.equal(head.views.get('face').sprite.color.r, 28, 'track color survives animation redraws and multiplies the body tint')
    head.setTrackColorOverride('face', null)
    assert.equal(head.views.get('face').sprite.color.r, 128)
    assert.throws(() => head.setTrackColorOverride('missing', new Color()), /unknown reanim track/)

    // Interrupted shots must capture the blended local pose, without applying the stem twice.
    const idle = player('face', [10, 20])
    const shoot = player('face', [70, 80], [110, 120])
    shoot.attachToTrack(body, 'stem')
    shoot.blendFrom(idle, 0.2)
    shoot.play({ loop: false, timeSeconds: 0, rate: 45 / 12, hideOnFinish: false })
    shoot.advance(0.05)
    assert.equal(shoot.blendElapsed, 0.05, 'blend duration is independent of the clip playback rate')
    const visiblePosition = { ...shoot.views.get('face').node.position }
    shoot.blendFrom(shoot, 0.2)
    shoot.play({ loop: false, timeSeconds: 0, rate: 45 / 12, hideOnFinish: false })
    assert.deepEqual(shoot.views.get('face').node.position, visiblePosition, 'repeated shots retain the visible pose')
    shoot.advance(0.05)
    const returning = player('face', [10, 20])
    returning.attachToTrack(body, 'stem')
    returning.blendFrom(shoot, 0.2)
    returning.play({ timeSeconds: 0 })
    assert.deepEqual(returning.views.get('face').node.position, shoot.views.get('face').node.position,
        'switching players also retains an unfinished blend')

    head.data.tracks.length = 0
    blink.seek(0)
    assert.equal(blink.views.get('eyelid').sprite.enabled, false, 'a removed parent track must hide its attachment')

    // A flag drawn after its hand track stays there, below the gripping arm, through later pose writes.
    const root = { children: [] as any[], once() {} }
    const node = (name: string, parent: any = root) => {
        const result: any = { name, parent: null, position: { x: 0, y: 0 }, setPosition() {}, setScale() {},
            setParent(next: any) {
                result.parent?.children.splice(result.parent.children.indexOf(result), 1)
                result.parent = next; next.children.push(result)
            },
            setSiblingIndex(index: number) {
                const siblings = result.parent.children
                siblings.splice(siblings.indexOf(result), 1); siblings.splice(index, 0, result)
            } }
        result.setParent(parent)
        return result
    }
    const zombie = player('hand', [0, 0])
    zombie.node = root
    zombie.data.tracks.push({ ...zombie.data.tracks[0], id: 'arm' })
    zombie.views.set('hand', { ...zombie.views.get('hand'), node: node('hand') })
    zombie.views.set('arm', { track: zombie.data.tracks[1], node: node('arm'), sprite: {}, skew: { setSkew() {} } })
    zombie.drawAfterTrack(node('flag', { children: [] }), 'hand')
    zombie.seek(1)
    assert.deepEqual(root.children.map(child => child.name), ['hand', 'flag', 'arm'])

    // A batch binds one texture, so a track whose images landed on different atlas pages draws through its own node.
    const paged = player('antenna', [0, 0])
    paged.node = { children: [], once() {} }
    paged.data.tracks[0].keyframes[1].sprite = 'pvz:other'
    const page = (texture: object) => ({ texture, trimmedBorder: { x: 0, y: 0, z: 0, w: 0 }, originalSize: { width: 1, height: 1 }, uv: [0, 0, 1, 0, 0, 1, 1, 1] })
    paged.frames.set('pvz:test', page({})); paged.frames.set('pvz:other', page({}))
    paged.views.set('antenna', { track: paged.data.tracks[0] })
    paged.seek(0)
    assert.equal(paged.views.get('antenna').node?.name, 'antenna')
})


test('sound playback loads overridden base effects and namespaced Mod effects through shared resources', async () => {
    const click = {}, modEffect = {}
    const assets = new Map<string, unknown>([['pvz:buttonclick', click], ['example:effect', modEffect]])
    const reads: string[] = []
    const { SoundSystem, SoundEffect } = loadClientModule('sound/SoundSystem', {
        cc: { AudioClip: class {} },
        '@/client/content/ModResources': { modResources: { async asset(id: string) {
            reads.push(id)
            return assets.get(id)
        } } },
    })
    assert.equal(await SoundSystem.load(SoundEffect.ButtonClick), click)
    assert.equal(await SoundSystem.load('example:effect'), modEffect)
    assert.deepEqual(reads, ['pvz:buttonclick', 'example:effect'])
    assert.equal(await SoundSystem.load('example:late'), null)
    assets.set('example:late', modEffect)
    assert.equal(await SoundSystem.load('example:late'), modEffect, 'a missing effect must not poison future loads')
})

test('layer ordering moves only misplaced entries and leaves an unlisted child where it is', () => {
    const { LevelEntityRenderer } = loadClientModule('level/LevelEntityRenderer', {})
    const layer = { children: [] as any[] }
    let moves = 0
    const node = (name: string) => {
        const value = { name, parent: layer, setSiblingIndex(index: number) {
            moves++
            layer.children.splice(layer.children.indexOf(value), 1)
            layer.children.splice(index, 0, value)
        } }
        return value
    }
    const [a, b, c, d, leaving] = ['a', 'b', 'c', 'd', 'leaving'].map(node)
    layer.children.push(a, leaving, c, b, d)
    const renderer = { entityLayer: layer, collectLayerEntries: () => [d, c, a, b].map(value => ({ node: value, order: 'abcd'.indexOf(value.name) })) }
    LevelEntityRenderer.prototype.syncLayerOrder.call(renderer, {})
    assert.deepEqual(layer.children.map(value => value.name), ['a', 'leaving', 'b', 'c', 'd'])
    assert.equal(moves, 1)
    LevelEntityRenderer.prototype.syncLayerOrder.call(renderer, {})
    assert.equal(moves, 1, 'a sorted layer needs no engine calls')
})
