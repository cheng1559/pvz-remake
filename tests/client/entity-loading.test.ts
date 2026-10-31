import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import * as plantDefinitions from '@/client/plants/definitions'
import * as zombieDefinitions from '@/client/zombies/definitions'
import { buildPresentationDefinitions } from '@/shared/content/DefinitionRegistry'
import { contentJson } from '@/shared/mod/content'
import * as modApi from '@/shared/mod'
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
    '@/shared/mod': modApi,
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
clientStubs['@/client/view/EntityAttachments'] = loadClientModule('view/EntityAttachments', {})

test('graves added after level creation are drawn, removed and can be generated again in the same cell', async () => {
    class Node {
        isValid = true
        children: Node[] = []
        setPosition() {}
        destroy() { this.isValid = false }
    }
    const roots: Node[] = []
    const { LevelGraves } = loadClientModule('level/LevelGraves', {
        cc: { Mask: { Type: { GRAPHICS_RECT: 0 } }, Sprite: { SizeMode: { RAW: 0 } } },
        '@/client/content/ClientContentLoader': { SpriteRepository: class {
            async load() { return { originalSize: { width: 500, height: 400 } } }
        } },
        '@/client/hud/SeedPacketRenderer': { getAtlasFrame() {} },
        '@/client/view/GameScreenMath': loadClientModule('view/GameScreenMath', {}),
        '@/client/view/uiNode': { uiNode(options: any) {
            const node = new Node()
            options.parent?.children.push(node)
            return { node, transform: { width: options.size?.width, setContentSize() {} } }
        } },
    })
    const graves = await LevelGraves.create(new Node(), { addScenery(node: Node) { roots.push(node) } }, {},
        { origin: { x: 40, y: 80 }, cell: { width: 80, height: 100 } }, [])
    graves.sync(Infinity)
    const snapshot = { graves: [{ row: 2, column: 1, variant: 0, riseDelay: 0, offsetX: 0, offsetY: 0 }], plants: [] }
    graves.syncWorld(snapshot, () => undefined)
    graves.syncWorld(snapshot, () => undefined)
    assert.equal(roots.length, 1)
    assert.equal(roots[0].isValid, true)
    graves.syncWorld({ ...snapshot, graves: [] }, () => undefined)
    assert.equal(roots[0].isValid, false)
    graves.syncWorld(snapshot, () => undefined)
    assert.equal(roots.length, 2)
    assert.equal(roots[1].isValid, true)
})

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

test('only attachments a zombie view registers keep playing while it walks into the house', async () => {
    const node = { isValid: true, active: true, setPosition() {}, destroy() {} }
    const { LevelEntityRenderer } = loadClientModule('level/LevelEntityRenderer', {
        '@/client/view/uiNode': { uiNode: () => ({ node }) },
    })
    const flag = { isValid: true, isChildOf: () => false }
    const cloth = { isValid: true, isChildOf: (parent: unknown) => parent === flag }
    const body = { isValid: true, isChildOf: () => false }
    const content = { levels: { levels: { 'test:level': { award: { id: 'pvz:sunflower' } } } },
        zombieViews: { create(context: any) { context.attachments.add(flag); return { sync() {}, destroy() {} } } } }
    const renderer = new LevelEntityRenderer(0, content, {}, {}, {}, {}, {}, {}, { complete: true })
    await renderer.create(1, { levelId: 'test:level', gameplayTick: 0, plants: [], lawnMowers: [], projectiles: [], items: [],
        zombies: [{ entityId: 1, typeId: 'test:zombie' }] })
    assert.equal(renderer.runsDuringGameOver(1, { node: flag }), true)
    assert.equal(renderer.runsDuringGameOver(1, { node: cloth }), true, 'parts of an attachment follow it')
    assert.equal(renderer.runsDuringGameOver(1, { node: body }), false, 'the body follows the scripted walk instead')
    flag.isValid = false
    assert.equal(renderer.runsDuringGameOver(1, { node: flag }), false, 'a destroyed attachment leaves the slot')
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

test('a finished or cancelled helm drop cannot leave a component with a null node in zombie sync', async () => {
    let loading = Promise.resolve(), playCount = 0
    class Node {
        isValid = true
        position = { x: 0, y: 0 }
        player?: Player
        setPosition() {}
        destroy() { this.isValid = false; if (this.player) this.player.node = null }
        addComponent(Type: any) { return this.player = Object.assign(new Type(), { node: this }) }
    }
    class Player {
        node: Node | null = null
        onFinish?: () => void
        async load() { await loading }
        play(options: { onFinish: () => void }) { playCount++; this.onFinish = options.onFinish }
    }
    const drops: Node[] = []
    const { ZombieView } = loadClientModule('zombies/ZombieView', {
        '@/client/reanim/ReanimPlayer': { ReanimPlayer: Player },
        '@/client/view/uiNode': { uiNode(options: any) {
            if (options.node) return { node: options.node }
            const node = new Node(); drops.push(node); return { node }
        } },
    })
    const { EntityAttachments } = clientStubs['@/client/view/EntityAttachments'] as any
    const view = Object.assign(Object.create(ZombieView.prototype), {
        node: new Node(), shadowNode: new Node(), player: null, animation: 'anim_walk', attachments: new EntityAttachments(),
        presentation: presentationFixture.zombies['pvz:newspaper'], applyHitFlash() {}, applyColor() {}, applyParts() {},
    })
    view.helmDropped()
    await new Promise(resolve => setImmediate(resolve))
    const finished = drops[0].player!
    finished.onFinish!()
    assert.equal(finished.node, null, 'Cocos clears a destroyed component node')
    assert.doesNotThrow(() => view.sync({ state: 'walking', animation: 'anim_walk', animationTime: 0, hasHead: true }))

    let finishLoad!: () => void
    loading = new Promise(resolve => { finishLoad = resolve })
    view.helmDropped()
    view.sync({ state: 'dying', animation: 'anim_walk', animationTime: 0, hasHead: true })
    assert.equal(drops[1].isValid, false, 'death removes a drop even while its animation is loading')
    finishLoad()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(playCount, 1, 'a drop destroyed during loading must not start playing')
    assert.doesNotThrow(() => view.sync({ state: 'walking', animation: 'anim_walk', animationTime: 0, hasHead: true }))
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
    assert.equal(await new ClientContentLoader().load({ category: 'prefabs', contentId: 'pvz',
        id: 'pvz:level', contentHash: 'base', path: source }, Prefab), prefab)
    assert.deepEqual(requests, ['ui/level'])
})

test('body colors reach players attached to its tracks, including nested ones, but no longer reach detached players', () => {
    class Color {
        static WHITE = new Color(255, 255, 255)
        static BLACK = new Color(0, 0, 0)
        constructor(readonly r: number, readonly g: number, readonly b: number, readonly a = 255) {}
        clone() { return new Color(this.r, this.g, this.b, this.a) }
    }
    const { ReanimPlayer } = loadClientModule('reanim/ReanimPlayer', {
        cc: { Component: class {}, Color, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/shared/content/reanim': { sampleReanimTrack: () => ({}) },
    })
    const player = () => Object.assign(Object.create(ReanimPlayer.prototype), {
        isValid: true, attachment: null, trackAttachments: new Set(), colorOverride: Color.WHITE, extraAdditive: false,
        extraAdditiveColor: Color.BLACK, applyPose() {}, requireData: () => ({ tracks: [{ id: 'anim_stem' }] }),
    })
    const body = player(), head = player(), blink = player(), dropped = player()
    head.attachToTrack(body, 'anim_stem')
    blink.attachToTrack(head, 'anim_stem')
    dropped.attachToTrack(body, 'anim_stem')
    dropped.attachToTrack(head, 'anim_stem')
    const blue = new Color(75, 75, 255), gray = new Color(30, 30, 30)
    body.setColorOverride(blue)
    body.setExtraAdditiveDraw(true, gray)
    for (const attached of [head, blink, dropped]) {
        assert.deepEqual([attached.colorOverride, attached.extraAdditive, attached.extraAdditiveColor], [blue, true, gray])
    }
    dropped.attachToTrack(player(), 'anim_stem')
    body.setColorOverride(Color.WHITE)
    assert.deepEqual([head.colorOverride, blink.colorOverride, dropped.colorOverride], [Color.WHITE, Color.WHITE, blue],
        'a player moved to another parent keeps that parent\'s colors')
})

test('presentation track lists name exact tracks that exist in their clips; losing the newspaper arm keeps the other hand', () => {
    const zombies = JSON.parse(readFileSync('mods/pvz-base/presentation/definitions/zombies.json', 'utf8'))
    const content = readBaseContent()
    const trackIds = (reanimId: string): string[] => JSON.parse(readFileSync(`mods/pvz-base/${content.resources.reanim[reanimId]}`, 'utf8'))
        .tracks.map((track: { id: string }) => track.id)
    for (const [id, zombie] of Object.entries<any>(zombies)) {
        const tracks = new Set(Object.values<any>(zombie.animations).flatMap(clip => trackIds(clip.reanimId)))
        const { flagArm, upperArm, ...lists } = zombie.parts
        const flag = flagArm ? [...flagArm.holding, ...flagArm.free, flagArm.front] : []
        for (const track of [upperArm, ...Object.values<string[]>(lists).flat(), ...flag, ...zombie.enragedHead ? [zombie.enragedHead.track] : []]) {
            assert.ok(tracks.has(track), `${id} lists ${track}, which none of its clips has`)
        }
    }
    const plants = JSON.parse(readFileSync('mods/pvz-base/presentation/definitions/plants.json', 'utf8'))
    for (const [id, plant] of Object.entries<any>(plants)) {
        // A plant without its own clips (the explode-o-nut) draws those of its animationTarget.
        const clips = plant.animations ?? plants[plant.animationTarget]?.animations ?? {}
        const tracks = new Set(Object.values<any>(clips).flatMap(clip => trackIds(clip.reanimId)))
        const { eyes = [], glow = [], face } = plant.parts ?? {}
        for (const track of [...eyes, ...glow, ...face ? [face] : []]) assert.ok(tracks.has(track), `${id} lists ${track}`)
    }
    const dave = JSON.parse(readFileSync('mods/pvz-base/presentation/definitions/dave.json', 'utf8'))
    const daveTracks = new Set(Object.entries<string>(dave.clips).filter(([name]) => name !== 'blink').flatMap(([, id]) => trackIds(id)))
    for (const track of [dave.parts.mouth, dave.parts.head, ...dave.parts.eyes, dave.hand.track]) assert.ok(daveTracks.has(track), `Dave lists ${track}`)
    const menu = JSON.parse(readFileSync('mods/pvz-base/presentation/definitions/main-menu.json', 'utf8'))
    const selector = new Set(['pvz:selector_open', 'pvz:selector_sign'].flatMap(trackIds))
    const { tracks: menuTracks, startAdventure } = menu
    for (const track of [...menu.buttons.map((button: { track: string }) => button.track), menuTracks.sky, menuTracks.anchor, menuTracks.profileSign,
        ...menuTracks.replaced, startAdventure.track, startAdventure.shadow, startAdventure.adventureShadow, menu.keyShadow.track, menu.trophy.track]) {
        assert.ok(selector.has(track), `the main menu lists ${track}`)
    }
    const hand = new Set(trackIds('pvz:selector_zombie_hand'))
    for (const track of menuTracks.handRocks) assert.ok(hand.has(track), `the zombie hand lists ${track}`)
    const screens = JSON.parse(readFileSync('mods/pvz-base/presentation/definitions/screens.json', 'utf8'))
    const layers = (value: unknown): any[] => Array.isArray(value) ? value.flatMap(layers)
        : value && typeof value === 'object' ? 'visibleTracks' in value ? [value] : Object.values(value).flatMap(layers) : []
    for (const layer of layers(screens)) {
        const tracks = new Set(trackIds(layer.reanimId))
        for (const track of layer.visibleTracks) assert.ok(tracks.has(track), `${layer.name} lists ${track}`)
    }
    // The no-paper clips add Zombie_paper_hands2, the other hand, which the old prefix also hid.
    assert.deepEqual(zombies['pvz:newspaper'].parts.arm, ['Zombie_paper_leftarm_lower', 'Zombie_paper_hands'])
    const { ReanimPlayer } = loadClientModule('reanim/ReanimPlayer', {
        cc: { Component: class {}, _decorator: { ccclass: () => (value: unknown) => value } },
    })
    const views = new Map(['Zombie_paper_hands', 'Zombie_paper_hands2', 'Zombie_paper_leftarm_lower'].map(id => [id, { visible: true }]))
    const player = Object.assign(Object.create(ReanimPlayer.prototype), { views, applyPose() {} })
    player.setTracksVisible(zombies['pvz:newspaper'].parts.arm, false)
    assert.deepEqual([...views.values()].map(view => view.visible), [false, true, false])
})

test('a plant blink keeps the base pose from its first blink when the body animation changes', () => {
    const { AnimatedPlantView } = loadClientModule('plants/AnimatedPlantView', {
        cc: { Color: class { constructor(readonly r = 0, readonly g = 0, readonly b = 0) {} } },
        './definitions': { plantDefinition: () => ({}) },
        '@/shared/content/presentation': { attachmentTrack: (clip: { attachmentTrackId: string }) => clip.attachmentTrackId },
    })
    // Sun-shroom faces: small (0.36) before anim_grow, big (0.54) after it.
    const small = { scaleX: 0.36 }, big = { scaleX: 0.54 }
    // The puff-shroom's body sits 5px down; its blink follows the body's offset.
    const body = (face: object) => ({ face, setTracksVisible() {}, node: { position: { x: 0, y: -5 }, scale: { x: 1, y: 1, z: 1 } } })
    const blink = {
        attachmentTrackId: null as string | null, attachmentBasePose: null as object | null,
        node: { position: null as object | null, setPosition(position: object) { this.position = position }, setScale() {} },
        attachToTrack(parent: { face: object }, trackId: string, base?: object) {
            this.attachmentTrackId = trackId
            this.attachmentBasePose = base ?? parent.face
        },
        play() {},
    }
    const view = Object.assign(Object.create(AnimatedPlantView.prototype), {
        extras: new Map([['Blink', blink]]), attachmentBases: new Map(), blinking: false, blinkAtTick: 0,
        animations: { nextPlantBlinkTicks: () => 400 }, extraClip: () => ({ attachmentTrackId: 'anim_face' }),
        blinkPlayer: () => blink, body: body(small), context: { plant: { typeId: 'pvz:sunshroom' } },
    })
    view.attachExtras()
    view.syncBlink(0)
    view.blinking = false
    view.body = body(big)
    view.attachExtras()
    assert.equal(blink.attachmentBasePose, small, 'the grown sun-shroom blink still scales from the small face')
    assert.deepEqual(blink.node.position, { x: 0, y: -5 }, 'an attachment sits where the body is drawn')
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
