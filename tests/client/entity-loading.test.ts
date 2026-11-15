import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import * as plantDefinitions from '@/client/plants/definitions'
import * as zombieDefinitions from '@/client/zombies/definitions'
import { buildPresentationDefinitions } from '@/shared/content/DefinitionRegistry'
import { contentJson } from '@/shared/mod/content'
import * as modApi from '@/shared/mod'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { loadScript } from '../loadScript'
import { presentationFixture } from './presentationFixture'
import * as kernelModule from '@/shared/kernel/index'
import * as protocolModule from '@/shared/protocol'
import * as animationModule from '@/shared/content/animation'
import * as gameplayModule from '@/shared/content/gameplay'
import * as renderOrderModule from '@/shared/content/renderOrder'
import * as zombieAnimationModule from '@/shared/content/zombieAnimation'
import * as teamsModule from '@/shared/content/teams'
import { readBaseContent } from '../../tools/mod/content'

// Rendering helpers that need the engine; animation frames pass through unchanged.
const clientStubs: Record<string, unknown> = {
    '@/shared/mod': modApi,
    '@/client/render/AnimationAtlas': { animationFrame: (frame: unknown) => frame, animationFrames: (frames: unknown[]) => frames },
    '@/shared/kernel/index': kernelModule,
    '@/shared/protocol': protocolModule,
    '@/shared/protocol/index': protocolModule,
    // The renderer tells plants and zombies by their views' classes.
    '@/client/plants/PlantView': { PlantView: class PlantView {} },
    '@/client/zombies/ZombieView': { ZombieView: class ZombieView {} },
    '@/platform/debug/GameDebugSettings': { GameDebugSettings: { perfPlantsVisible: true, perfZombiesVisible: true } },
    '@/shared/content/renderOrder': renderOrderModule,
    // What a view reads of the animation it shows.
    '@/shared/content/animation': animationModule,
    '@/shared/content/gameplay': gameplayModule,
    '@/shared/content/zombieAnimation': zombieAnimationModule,
}

function loadClientModule(path: string, modules: Record<string, unknown>) {
    return loadScript(`assets/scripts/client/${path}.ts`, (id: string) => modules[id] ?? clientStubs[id] ?? {})
}
clientStubs['@/client/view/EntityAttachments'] = loadClientModule('view/EntityAttachments', {})
clientStubs['./EntityFlashes'] = loadClientModule('level/EntityFlashes', {})
clientStubs['./LevelStage'] = clientStubs['@/client/level/LevelStage'] = loadClientModule('level/LevelStage', {})
clientStubs['./zombieParts'] = loadClientModule('zombies/zombieParts', {})

/** The board of a test: a level whose award is the sunflower, and the views it is given, with no event handled. */
function renderer(LevelEntityRenderer: any, views: object, intro: object = { complete: true }) {
    const content = { levels: { levels: { 'test:level': { award: { id: 'pvz:sunflower' } } } }, views: { events: { of: () => [] }, ...views } }
    return new LevelEntityRenderer(content, {}, {}, {}, {}, intro, {})
}

test('a thing of a cell is drawn by its view like any entity: made when it comes, synced, and gone with it', async () => {
    const node = { isValid: true, setPosition() {}, destroy() { this.isValid = false } }
    const { LevelEntityRenderer } = loadClientModule('level/LevelEntityRenderer', { '@/client/view/uiNode': { uiNode: () => ({ node }) } })
    const made: any[] = [], synced: unknown[] = []
    let destroyed = 0
    const board = renderer(LevelEntityRenderer, { gridItems: { async create(context: any) {
        made.push({ ...context, quiet: context.stage.quiet })
        return { sync(item: unknown) { synced.push(item) }, destroy() { destroyed++ } }
    } } })
    board.syncLayerOrder = () => {}
    const grave = { entityId: 4, typeId: 'pvz:grave', row: 2, column: 1 }
    const snapshot = { levelId: 'test:level', gameplayTick: 0, plants: [], zombies: [], projectiles: [], items: [], mowerRows: [], gridItems: [grave], cursor: { mode: 'none' } }
    board.sync(snapshot, { added: [4], removed: [] }, [])
    await board.creationTasks.get(4)
    assert.equal(made.length, 1)
    assert.equal(made[0].item, grave)
    assert.equal(made[0].quiet, true, 'what the level starts with comes without what goes with coming')
    assert.deepEqual(synced, [grave], 'shown as soon as it is made')
    board.sync(snapshot, { added: [], removed: [] }, [])
    assert.equal(synced.length, 2)
    board.sync({ ...snapshot, gridItems: [] }, { added: [], removed: [4] }, [])
    assert.equal(destroyed, 1)
    assert.equal(board.node(4), undefined)
    board.sync({ ...snapshot, gridItems: [{ ...grave, entityId: 5 }] }, { added: [5], removed: [] }, [])
    await board.creationTasks.get(5)
    assert.equal(made[1].quiet, false, 'one that comes during play')
})

test('graves rise as GridItem::DrawGraveStone draws them: whole pixels, one counted tick early, the special stone from row 0', async () => {
    class Node {
        isValid = true
        name = ''
        children: Node[] = []
        position = { x: 0, y: 0 }
        setPosition(x: number, y: number) { this.position = { x, y } }
        setScale() {}
        destroy() { this.isValid = false }
    }
    const cells: number[] = [], heights = new Map<Node, number>()
    const { GraveView } = loadClientModule('gridItems/GraveView', {
        cc: { Mask: { Type: { GRAPHICS_RECT: 0 } }, Sprite: { SizeMode: { RAW: 0 } } },
        '@/client/content/ClientContentLoader': { SpriteRepository: class {
            async load() { return { originalSize: { width: 500, height: 400 } } }
        } },
        '@/client/hud/SeedPacketRenderer': { getAtlasFrame(_atlas: unknown, cell: number) { cells.push(cell) } },
        '@/client/sound/SoundSystem': { SoundEffect: { DirtRise: 'dirt_rise' }, SoundSystem: { playFoley: async () => {} } },
        '@/client/view/GameScreenMath': loadClientModule('view/GameScreenMath', {}),
        '@/client/view/uiNode': { uiNode(options: any) {
            const node = new Node()
            node.name = options.name ?? ''
            options.parent?.children.push(node)
            return { node, transform: { width: options.size?.width, setContentSize(_width: number, height: number) { heights.set(node, height) } } }
        } },
    })
    const makeGrave = async (context: object) => {
        const view = new GraveView(context)
        await view.initialize()
        return view
    }
    const content = {
        definitions: { boards: { 'test:board': { origin: { x: 40, y: 80 }, cell: { width: 80, height: 100 } } }, plants: {} },
        levels: { levels: { 'test:level': { board: 'test:board' } } },
        presentation: { gridItems: { 'pvz:grave': { view: 'grave', layer: 'graveStone', offset: 3 } } },
    }
    const world = (gameplayTick = 0, phase = 'intro') => ({ levelId: 'test:level', phase, gameplayTick, plants: [] })
    let particles = 0
    const intro = { complete: false, elapsedTicks: 0, graveStartTick: 0 }
    const stage = { intro, quiet: false, particle() { particles++ } }
    const graves = [
        { row: 2, column: 1, variant: 7, riseDelay: 0, offsetX: 0, offsetY: 0, special: true },
        { row: 3, column: 1, variant: 7, riseDelay: 30, offsetX: 0, offsetY: 0 },
        { row: 0, column: 2, variant: 7, riseDelay: 0, offsetX: 0, offsetY: 0, special: true },
    ].map((grave, index) => ({ entityId: index + 1, typeId: 'pvz:grave', ...grave }))
    const roots = graves.map(() => new Node()), views: any[] = []
    for (const [index, grave] of graves.entries()) views.push(await makeGrave({ node: roots[index], content, item: grave, stage }))
    // Stone and dirt per grave: the special stone uses row 0, the others row 2 + look % 2, and the first lawn row row 1.
    assert.deepEqual(cells, [2, 2, 17, 17, 7, 7])
    const stone = (root: Node) => heights.get(root.children.find(child => child.name === 'Stone')!)!
    assert.equal(stone(roots[0]), 100, 'made risen, as it stands off the board')
    // The level's own graves rise by the intro's time, from its grave tick.
    const sync = (ticks: number) => {
        intro.elapsedTicks = ticks
        graves.forEach((grave, index) => views[index].sync(grave, world()))
    }
    for (let tick = -2; tick < 140; tick += 0.37) {
        sync(tick)
        for (const index of [0, 1]) assert.ok(Number.isInteger(stone(roots[index])), `whole pixels at tick ${tick}`)
    }
    assert.equal(particles, 3, 'the dirt of each as the rise starts')
    // GridItem::DrawGraveStone at whole ticks, with mGridItemCounter = ticks + 1 - delay.
    const { easeInOut } = loadClientModule('view/GameScreenMath', {})
    const round = (value: number) => Math.trunc(value + 0.5)
    const expected = (counter: number) => {
        const position = round(easeInOut(0, 100, counter, 1000, 0))
        // A negative source height draws nothing, as an empty clip does.
        return Math.max(0, round(easeInOut(0, 1000, position, 100, 0)) - round(easeInOut(0, 50, position, 0, 14)))
    }
    for (let tick = -1; tick <= 100; tick++) {
        sync(tick)
        assert.equal(stone(roots[0]), expected(tick + 1), `the first grave at tick ${tick}`)
        assert.equal(stone(roots[1]), expected(tick + 1 - 30), `the delayed grave at tick ${tick}`)
    }
    sync(-1)
    assert.equal(stone(roots[0]), 0, 'nothing shows before the rise')
    particles = 0
    intro.elapsedTicks = 99
    stage.quiet = true
    graves.forEach((grave, index) => views[index].sync(grave, world()))
    stage.quiet = false
    assert.equal(stone(roots[0]), 100, 'counter 100 shows the whole cel')
    assert.equal(particles, 0, 'a restored game takes the state without the dirt')
    views[0].sync(graves[0], world(0, 'gameplay'))
    assert.equal(stone(roots[0]), 100, 'a level in play has them risen')

    // /grave: a grave added in play rises from its gameplay tick, with the intro's dirt, once.
    const added = { entityId: 9, typeId: 'pvz:grave', row: 1, column: 3, variant: 4, riseDelay: 0, offsetX: 0, offsetY: 0, riseAtTick: 500 }
    const root = new Node(), board = { intro: { complete: true }, quiet: false, particle() { particles++ } }
    const playing = await makeGrave({ node: root, content, item: added, stage: board })
    playing.sync(added, world(500, 'gameplay'))
    assert.equal(particles, 1)
    assert.deepEqual(root.position, { x: 40 + 3 * 80 - 4 - 400, y: 300 - 80 - 100 + 9 }, 'its corner 4 left of and 9 above its cell')
    assert.equal(root.children.find(child => child.name === 'Stone')!.position.y, -100, 'before it rises, its top is at the bottom of the whole stone')
    for (let tick = 500; tick <= 600; tick++) {
        playing.sync(added, world(tick, 'gameplay'))
        assert.equal(stone(root), expected(tick - 500), `the added grave at tick ${tick}, counting from the tick after`)
    }
    assert.equal(particles, 1, 'the dirt shows once')
    const late = { ...added, entityId: 10, riseAtTick: 100 }
    const shown = await makeGrave({ node: new Node(), content, item: late, stage: board })
    shown.sync(late, world(900, 'gameplay'))
    assert.equal(particles, 1, 'a grave that shows up past its rise tick spawns no dirt')
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
            [kind]: { typeId: 'example:entity' }, content: { presentation: { [`${kind}s`]: { 'example:entity': { view: 'example:custom' } } } },
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
        const board = renderer(LevelEntityRenderer, { plants: factory, zombies: factory })
        const entity = { entityId: 1, typeId: 'test:entity', behaviorState: { ticks: 3 } }
        const pending = board.create(kind, entity)
        assert.equal(context[kind], entity)
        board.remove(1)
        let disposed = 0
        finish({ destroy() { disposed++ } })
        await pending
        assert.equal(disposed, 1)
        assert.equal(board.node(1), undefined)
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
    const { EntityAttachments } = clientStubs['@/client/view/EntityAttachments'] as any
    const { ZombieView } = clientStubs['@/client/zombies/ZombieView'] as any
    const board = renderer(LevelEntityRenderer, { zombies: { create() {
        const view = Object.assign(new ZombieView(), { attachments: new EntityAttachments(), sync() {}, destroy() {} })
        view.attachments.add(flag)
        return view
    } } })
    await board.create('zombie', { entityId: 1, typeId: 'test:zombie' })
    assert.equal(board.runsDuringGameOver(1, { node: flag }), true)
    assert.equal(board.runsDuringGameOver(1, { node: cloth }), true, 'parts of an attachment follow it')
    assert.equal(board.runsDuringGameOver(1, { node: body }), false, 'the body follows the scripted walk instead')
    flag.isValid = false
    assert.equal(board.runsDuringGameOver(1, { node: flag }), false, 'a destroyed attachment leaves the slot')
})

for (const kind of ['plant', 'zombie'] as const) test(`${kind} factories stay hidden while loading and paused restore reveals the current state`, async () => {
    const node = { isValid: true, active: true, setPosition() {}, setScale() {}, destroy() { this.isValid = false } }
    const settings = { perfPlantsVisible: true, perfZombiesVisible: true }
    const { LevelEntityRenderer } = loadClientModule('level/LevelEntityRenderer', {
        '@/client/view/uiNode': { uiNode: (options: any) => { node.active = options.active; return { node } } },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: settings },
    })
    let finish!: () => void
    const loading = new Promise<void>(resolve => { finish = resolve })
    const synced: unknown[] = []
    let restored = false
    const show = (plant: unknown) => {
        if (synced.length === 0) assert.equal(node.active, false, 'the initial pose must be applied before showing the entity')
        synced.push(plant)
    }
    const view = { sync: show, restore() { restored = true } }
    const board = renderer(LevelEntityRenderer, { [kind + 's']: { async create() {
        assert.equal(node.active, false, 'raw animation tracks must stay hidden while the factory loads')
        await loading
        return view
    } } })
    board.syncLayerOrder = () => {}
    const plant = { entityId: 1, typeId: 'test:plant', x: 40, y: 280, health: 300 }
    const snapshot = { levelId: 'test:level', gameplayTick: 0, paused: true, plants: [], zombies: [], [kind + 's']: [plant], projectiles: [],
        items: [], mowerRows: [], cursor: { mode: 'none' } }
    const changes = { added: [1], removed: [] }
    board.sync(snapshot, changes, [])
    const creation = board.creationTasks.get(1)
    board.sync(snapshot, changes, [])
    assert.equal(node.active, false, 'normal visibility updates must not reveal a pending plant')
    const current = { ...plant, health: 200 }
    board.sync({ ...snapshot, [kind + 's']: [current] }, { added: [], removed: [] }, [])
    finish()
    await creation
    assert.equal(node.active, false, 'factory completion alone does not show it')
    assert.deepEqual(synced, [current], 'a view made is shown as its entity is now, not as it was when it was asked for')
    await board.restore([{ kind, entityId: 1 }])
    assert.equal(restored, true)
    assert.deepEqual(synced, [current, current])
    assert.equal(node.active, true, 'paused restore must reveal entities without waiting for another tick')
    settings.perfPlantsVisible = settings.perfZombiesVisible = false
    board.sync(snapshot, { added: [], removed: [] }, [])
    assert.equal(node.active, false, 'the performance visibility switch still applies')
})

test('a finished or cancelled shield drop cannot leave a component with a null node in zombie sync', async () => {
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
        context: { content: {} }, node: new Node(), shadowNode: new Node(), layers: { player: () => ({ loadedId: null }), shown: [], show() {} }, animation: 'walk',
        attachments: new EntityAttachments(), mirrored: false,
        presentation: presentationFixture.zombies['pvz:newspaper'], applyHitFlash() {}, applyColor() {}, applyParts() {},
    })
    view.armorDropped('shield')
    await new Promise(resolve => setImmediate(resolve))
    const finished = drops[0].player!
    finished.onFinish!()
    assert.equal(finished.node, null, 'Cocos clears a destroyed component node')
    assert.doesNotThrow(() => view.sync({ state: 'walking', animations: { body: { clip: 'walk', time: 0, rate: 12 } }, hasHead: true }))

    let finishLoad!: () => void
    loading = new Promise(resolve => { finishLoad = resolve })
    view.armorDropped('shield')
    view.sync({ state: 'dying', animations: { body: { clip: 'walk', time: 0, rate: 12 } }, hasHead: true })
    assert.equal(drops[1].isValid, false, 'death removes a drop even while its animation is loading')
    finishLoad()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(playCount, 1, 'a drop destroyed during loading must not start playing')
    assert.doesNotThrow(() => view.sync({ state: 'walking', animations: { body: { clip: 'walk', time: 0, rate: 12 } }, hasHead: true }))
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
        './installedMods': { installedMods: async () => ({ presentationDefinitions: [] }) },
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
    const content = { contentHash: 'hash', category: 'sprites', id: 'pvz:ready', path: 'ready', contentId: 'pvz' }
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
        const tracks = new Set(Object.values<any>(zombie.clips).flatMap(clip => trackIds(clip.reanimId)))
        const { flagArm, shieldArms, upperArm, ...lists } = zombie.parts
        const flag = [...flagArm ? [...flagArm.holding, ...flagArm.free, flagArm.front] : [], ...shieldArms ? [...shieldArms.holding, ...shieldArms.free] : []]
        for (const track of [upperArm, ...Object.values<string[]>(lists).flat(), ...flag, ...zombie.enragedHead ? [zombie.enragedHead.track] : []]) {
            assert.ok(tracks.has(track), `${id} lists ${track}, which none of its clips has`)
        }
    }
    const plants = JSON.parse(readFileSync('mods/pvz-base/presentation/definitions/plants.json', 'utf8'))
    for (const [id, plant] of Object.entries<any>(plants)) {
        // A plant whose clips are another's (the explode-o-nut) draws those.
        const clips = plant.clips?.from ? plants[plant.clips.from].clips : plant.clips ?? {}
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

test('a screen door zombie holds its door with the door arms, lowers them to eat, and keeps a lost arm hidden', () => {
    const { ZombieView } = loadClientModule('zombies/ZombieView', {})
    const presentation = JSON.parse(readFileSync('mods/pvz-base/presentation/definitions/zombies.json', 'utf8'))['pvz:screendoor']
    const shown = new Map<string, boolean>()
    const player = { loadedId: 'pvz:door_zombie_walk', setTracksVisible(tracks: string[], visible: boolean) { for (const track of tracks) shown.set(track, visible) }, setTrackSpriteOverride() {} }
    const view = Object.assign(Object.create(ZombieView.prototype), {
        layers: { player: () => player }, presentation, parts: '', holdingFlag: false, gameplay: { shield: { type: 'door', health: 1100 } }, context: { stage: { assets: { zombieSprites: { helms: {}, damagedArm: {} } } } },
    })
    const zombie = { hasHead: true, hasTongue: false, hasArm: true, helmHealth: 0, shieldHealth: 1100, state: 'walking', animations: { body: { clip: 'walk', time: 0, rate: 12 } } }
    const visible = (...tracks: string[]) => tracks.map(track => shown.get(track))
    view.applyParts(zombie)
    assert.deepEqual(visible('anim_screendoor', 'Zombie_outerarm_screendoor', 'Zombie_innerarm_screendoor_hand', 'Zombie_outerarm_hand', 'anim_innerarm1', 'Zombie_outerarm_upper'),
        [true, true, true, false, false, false], 'Zombie::SetupDoorArms(true)')
    view.applyParts({ ...zombie, state: 'eating', animations: { body: { clip: 'eat', time: 0, rate: 36 } } })
    assert.deepEqual(visible('anim_screendoor', 'Zombie_outerarm_screendoor', 'Zombie_outerarm_hand', 'anim_innerarm1'), [true, false, true, true],
        'StartEating shows the free arms behind the door')
    view.applyParts({ ...zombie, shieldHealth: 0, hasArm: false })
    assert.deepEqual(visible('anim_screendoor', 'Zombie_innerarm_screendoor', 'Zombie_outerarm_hand', 'Zombie_outerarm_lower', 'Zombie_outerarm_upper', 'anim_innerarm2'),
        [false, false, false, false, true, true], 'DetachShield restores the arms, except the lost lower arm and hand')
})

test('a player changes to another clip of its body in place: its batches stay, and it blends from the pose it showed', async () => {
    const track = (id: string, zIndex: number) => ({ id, zIndex, keyframes: [{ sprite: `pvz:${id}` }] })
    const clips: Record<string, unknown> = {
        'pvz:walk': { id: 'pvz:walk', tracks: [track('leg', 2), track('arm', 1)] },
        'pvz:death': { id: 'pvz:death', tracks: [track('head', 3), track('arm', 1)] },
    }
    const { ReanimPlayer, ReanimRepository } = loadClientModule('reanim/ReanimPlayer', {
        cc: { Component: class {}, JsonAsset: class {}, isValid: (node?: { isValid: boolean }) => node?.isValid === true,
            _decorator: { ccclass: () => (value: unknown) => value } },
        '@/shared/content/reanim': { parseReanim: (json: unknown) => json, sampleReanimTrack: (item: { id: string }) => ({ sprite: `pvz:${item.id}`, x: 7 }) },
        '@/client/content/ClientContentLoader': { SpriteRepository: class { async load(id: string) { return { id } } } },
        '@/client/render/KernelBatch': { loadKernelMaterial: async () => {} },
    })
    const registry = { resolve: (_category: string, id: string) => ({ id }) }
    const loader = { async load(content: { id: string }) { return { json: clips[content.id] } } }
    const batches = [{}]
    const player = Object.assign(Object.create(ReanimPlayer.prototype), {
        data: null, views: new Map(), frames: new Map(), frameOverrides: new Map(), followers: new Map(),
        blendFromPoses: new Map(), batches, blendDuration: 0, blendElapsed: 0, timeSeconds: 5, drawingStale: false, applyPose() {},
    })
    assert.throws(() => player.change('pvz:walk', registry), /reanim is not loaded: pvz:walk/, 'a clip is in memory before it is played')
    await new ReanimRepository(registry, loader).prepare(['pvz:walk', 'pvz:death'])
    player.change('pvz:walk', registry, 0.2)
    assert.deepEqual([[...player.views.keys()], player.blendDuration, player.blendFromPoses.size], [['arm', 'leg'], 0.2, 0], 'nothing to blend from before the first clip')

    // What was set on single tracks starts over; a track both clips have keeps its own node, the others' go.
    const node = () => ({ isValid: true, active: false, destroy() { this.isValid = false } })
    const arm = node(), leg = node()
    Object.assign(player.views.get('arm'), { node: arm, visible: false })
    Object.assign(player.views.get('leg'), { node: leg })
    player.followers.set('arm', [{}]).set('leg', [{}])
    player.timeSeconds = 3
    player.change('pvz:death', registry, 0.2)
    assert.equal(player.loadedId, 'pvz:death')
    assert.deepEqual([...player.views.keys()], ['arm', 'head'])
    assert.deepEqual([player.views.get('arm').node, player.views.get('arm').visible, arm.active, arm.isValid, leg.isValid], [arm, true, true, true, false])
    assert.deepEqual([[...player.followers.keys()], [...player.frames.keys()].sort()], [['arm'], ['pvz:arm', 'pvz:head']])
    assert.equal(player.batches, batches, 'what draws it is not rebuilt')
    assert.deepEqual([[...player.blendFromPoses.keys()], player.blendDuration, player.blendElapsed, player.timeSeconds, player.drawingStale], [['arm'], 0.2, 0, 0, true],
        'it blends the tracks both clips have, from the start of the new one')

    // The same clip again (a repeated shot) only starts a blend from where it was.
    const views = [...player.views.values()]
    player.blendFromPoses.clear()
    player.change('pvz:death', registry, 0.1)
    assert.deepEqual([[...player.views.values()], [...player.blendFromPoses.keys()].sort(), player.blendDuration], [views, ['arm', 'head'], 0.1])
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

test("a projectile's impact sounds and splats without a view of the projectile, the board's own over its row", () => {
    const spawned: any[] = [], sounds: unknown[] = []
    const { ProjectileView } = loadClientModule('projectiles/ProjectileView', {
        cc: { Sprite: { SizeMode: { RAW: 0 } } },
        '@/client/particle/ParticlePlayer': { ParticlePlayer: { spawn(args: unknown) { spawned.push(args) } } },
        '@/client/level/LevelStage': loadClientModule('level/LevelStage', {}),
        '@/client/sound/SoundSystem': { SoundSystem: { playSounds(value: unknown) { if (value) sounds.push(value) } } },
        '@/shared/content/teams': teamsModule,
    })
    const layer = {}, zombieNode = {}
    const stage = {
        layer, node: (id: number) => id === 7 ? zombieNode : undefined,
        assets: { projectileFrames: { 'test:pea': { originalSize: { width: 28, height: 28 } } } },
        content: {
            definitions: { projectiles: { 'test:pea': { hitbox: { x: 0, y: 0, width: 28, height: 28 } }, 'test:melon': { hitbox: { x: 20, y: 0, width: 60, height: 40 } } } },
            presentation: { zombies: {}, projectiles: {
                'test:pea': { impact: { id: 'test:splat' }, impactSounds: 'splat' },
                'test:melon': { impact: { id: 'test:splash', free: true }, impactSounds: 'thud' },
            } },
        },
    }
    const world = { zombies: [{ entityId: 7, x: 300, y: 100 }] }
    const impact = (data: object) => ProjectileView.impact(stage, { eventId: 1, type: 'projectileImpact', data }, world)
    // Projectile 3 was never drawn: it hit in the tick it was fired.
    impact({ projectileId: 3, typeId: 'test:pea', x: 290, y: 120, targetId: 7, row: 1 })
    assert.deepEqual(sounds, ['splat'])
    assert.equal(spawned[0].parent, zombieNode, 'a splat on a zombie goes with it')
    assert.deepEqual([spawned[0].id, spawned[0].x, spawned[0].y], ['test:splat', 290 + 14 + 35 - 300, -(120 + 14 - 2 - 100)], "ahead of its picture's middle, from the zombie")
    impact({ projectileId: 4, typeId: 'test:melon', x: 280, y: 90, targetId: 7, row: 1, above: true })
    assert.equal(spawned[1].parent, layer, "the board's own stays on the board")
    assert.deepEqual([spawned[1].x, spawned[1].y, spawned[1].renderOrder], [280 + 50 - 400, 300 - (90 + 20), renderOrderModule.renderOrder('projectile', 1) + 1],
        'at the middle of its hitbox, one over what flies in its row')
    impact({ projectileId: 5, typeId: 'test:pea', x: 290, y: 120, targetId: 7, row: 1, through: true })
    assert.equal(spawned.length, 2, 'one that flies on through does not splat')
    assert.deepEqual(sounds, ['splat', 'thud', 'splat'])
})

test('a clip that ends plays over its own pictures and goes on where they end; a clip that fits its time is stretched', () => {
    const { shownLayer } = loadClientModule('view/layerPlayback', {})
    // A pack's shooting head of 18 pictures where the animation has 25 (JiangNan's repeater), at 45 a second.
    const played: Record<string, object> = { shootHead: { frames: 25, fps: { min: 45, max: 45 }, next: 'idleHead' }, idleHead: { frames: 25, sync: 'body' },
        land: { frames: 7, fit: true, hold: true }, blink: { frames: 3, once: true } }
    const clips = {
        picture: (name: string) => ({ reanimId: name, rateScale: 1 }), played: (name: string) => played[name],
        duration: (reanimId: string) => ({ shootHead: 18, idleHead: 17, land: 9, blink: 2, body: 4 } as Record<string, number>)[reanimId] / 12,
    }
    const layers = { body: { clip: 'body', time: 40, rate: 17 } }
    const shown = (clip: string, time: number) => JSON.parse(JSON.stringify(shownLayer({ clip, time, rate: 45 }, layers, clips) ?? null))
    assert.deepEqual(shown('shootHead', 11.25), { key: 'shootHead', clip: { reanimId: 'shootHead', rateScale: 1 }, time: 11.25, rate: 45, once: true })
    // Past its 18 pictures, the head is back on its idling, before the server's 25 frames are through: at its body's
    // time, starting where its body is as a part of its own 4 pictures (Reanimation::mAnimTime is a part of a clip).
    assert.deepEqual(shown('shootHead', 20), { key: 'idleHead', clip: { reanimId: 'idleHead', rateScale: 1 }, time: 40, rate: 17, sync: { time: 40, own: 4 } })
    assert.equal(shown('blink', 2.5), null, 'a blink is gone once its pictures are')
    assert.equal(shown('land', 3).frames, 7, 'a clip that fits its time is stretched over it')
    // Pictures longer than the clip are stretched over it (a pack's death of 77 pictures for the animation's 39), and
    // pictures made at another pace are counted at it (the cherry bomb's 14 at 30 a second).
    played.death = { frames: 39, hold: true }
    played.explode = { frames: 14, hold: true }
    const longer = shownLayer({ clip: 'death', time: 39, rate: 27 }, layers, { ...clips, duration: (id: string) => id === 'death' ? 77 / 12 : clips.duration(id) })
    assert.equal(longer.frames, 39)
    const cherry = shownLayer({ clip: 'explode', time: 5, rate: 12 }, layers,
        { ...clips, picture: (name: string) => ({ reanimId: name, rateScale: 1, fps: 30 }), duration: () => 14 / 30 })
    assert.deepEqual([cherry.once, cherry.frames], [true, undefined], 'its 14 pictures are as long as the clip')
})

test('a Mod hears of an event after the base, at the time it asks, and a Mod that failed to load takes its handlers away', () => {
    // The base's handlers are the views' statics: any function stands in for them here.
    const statics = new Proxy({}, { get: () => () => {} })
    const views = Object.fromEntries([['plants/PlantView', 'PlantView'], ['plants/ChomperView', 'ChomperView'], ['plants/GraveBusterView', 'GraveBusterView'],
        ['zombies/ZombieView', 'ZombieView'], ['projectiles/ProjectileView', 'ProjectileView'], ['projectiles/MowerView', 'MowerView'],
        ['items/ItemView', 'ItemView'], ['items/AwardView', 'AwardView']].map(([path, name]) => [`@/client/${path}`, { [name]: statics }]))
    const { StageEventRegistry } = loadClientModule('level/StageEventRegistry', views)
    const registry = new StageEventRegistry()
    const base = registry.of('plantExploded', 'after').length
    assert.ok(base > 0)
    const undo = registry.checkpoint()
    const mine = () => {}
    registry.register('plantExploded', mine)
    registry.register('example:zap', mine, 'before')
    assert.equal(registry.of('plantExploded', 'after').at(-1), mine)
    // The registry is of the module's own realm: its lists are compared by what is in them.
    assert.deepEqual([...registry.of('example:zap', 'before')], [mine])
    assert.equal(registry.of('example:zap', 'after').length, 0)
    undo()
    assert.equal(registry.of('plantExploded', 'after').length, base)
    assert.equal(registry.of('example:zap', 'before').length, 0)
    registry.freeze()
    assert.throws(() => registry.register('example:late', mine), /frozen/)
})
