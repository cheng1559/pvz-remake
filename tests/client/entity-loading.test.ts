import { EntityViewRegistry } from '@/client/content/EntityViewRegistry'
import * as plantDefinitions from '@/client/plants/definitions'
import * as zombieDefinitions from '@/client/zombies/definitions'
import { buildPresentationDefinitions } from '@/shared/content/DefinitionRegistry'
import * as modContent from '@/shared/mod/content'
import { contentJson } from '@/shared/mod/content'
import * as modApi from '@/shared/mod'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { loadScript } from '../loadScript'
import { presentationFixture } from './presentationFixture'
import * as kernelModule from '@/shared/kernel/index'
import * as protocolModule from '@/shared/protocol'
import * as gravesModule from '@/shared/content/graves'
import * as animationModule from '@/shared/content/animation'
import * as gameplayModule from '@/shared/content/gameplay'
import * as renderOrderModule from '@/shared/content/renderOrder'
import * as zombieAnimationModule from '@/shared/content/zombieAnimation'
import * as teamsModule from '@/shared/content/teams'
import * as zombieStatesModule from '@/shared/content/zombieStates'
import * as presentationModule from '@/shared/content/presentation'
import { readBaseContent, readGameplaySource } from '../../tools/mod/content'

// Rendering helpers that need the engine; animation frames pass through unchanged.
const clientStubs: Record<string, unknown> = {
    '@/shared/mod': modApi,
    '@/client/render/AnimationAtlas': { animationFrame: (frame: unknown) => frame, animationFrames: (frames: unknown[]) => frames },
    '@/shared/kernel/index': kernelModule,
    '@/shared/protocol': protocolModule,
    '@/shared/protocol/index': protocolModule,
    '@/shared/content/graves': gravesModule,
    // The renderer tells plants and zombies by their views' classes.
    '@/client/plants/PlantView': { PlantView: class PlantView {} },
    '@/client/zombies/ZombieView': { ZombieView: class ZombieView {} },
    '@/platform/debug/GameDebugSettings': { GameDebugSettings: { perfPlantsVisible: true, perfZombiesVisible: true } },
    '@/shared/content/renderOrder': renderOrderModule,
    // What a view reads of the animation it shows.
    '@/shared/content/animation': animationModule,
    '@/shared/content/gameplay': gameplayModule,
    '@/shared/content/zombieAnimation': zombieAnimationModule,
    '@/shared/content/presentation': presentationModule,
}

test('failed entity creation rejects after removing its unfinished view', async () => {
    const error = new Error('missing grave art')
    const node = { isValid: true, active: true, destroy() { this.isValid = false } }
    const { LevelEntityRenderer } = loadClientModule('level/LevelEntityRenderer', { '@/client/view/uiNode': { uiNode: () => ({ node }) } })
    const board = renderer(LevelEntityRenderer, { gridItems: { create: async () => { throw error } } })
    board.syncLayerOrder = () => {}
    const item = { entityId: 1, typeId: 'pvz:grave', row: 0, column: 1 }
    board.sync({ levelId: 'test:level', gameplayTick: 0, plants: [], zombies: [], projectiles: [], items: [], mowers: [], gridItems: [item], cursor: { mode: 'none' } },
        { added: [1], removed: [] }, [])
    await assert.rejects(board.creationTasks.get(1), (reason: unknown) => reason === error)
    assert.equal(node.isValid, false)
    assert.equal(board.node(1), undefined)
})

function loadClientModule(path: string, modules: Record<string, unknown>) {
    return loadScript(`assets/scripts/client/${path}.ts`, (id: string) => modules[id] ?? clientStubs[id] ?? {})
}
clientStubs['@/client/view/EntityAttachments'] = loadClientModule('view/EntityAttachments', {})
clientStubs['@/client/reanim/clips'] = loadClientModule('reanim/clips', {})
clientStubs['./EntityFlashes'] = loadClientModule('level/EntityFlashes', {})
clientStubs['./BoardShadows'] = clientStubs['@/client/level/BoardShadows'] = loadClientModule('level/BoardShadows', {})
clientStubs['./LevelStage'] = clientStubs['@/client/level/LevelStage'] = loadClientModule('level/LevelStage', {})
clientStubs['./zombieParts'] = loadClientModule('zombies/zombieParts', {})

/** The board of a test: a level whose award is the sunflower, and the views it is given, with no event handled. */
function renderer(LevelEntityRenderer: any, views: object, intro: object = { complete: true }) {
    const content = { levels: { levels: { 'test:level': { award: { id: 'pvz:sunflower' } } } }, views: { events: { of: () => [] }, ...views } }
    return new LevelEntityRenderer(content, {}, {}, {}, intro, {})
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
    const snapshot = { levelId: 'test:level', gameplayTick: 0, plants: [], zombies: [], projectiles: [], items: [], mowers: [], gridItems: [grave], cursor: { mode: 'none' } }
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
        '@/client/content/ModResources': { modResources: { async sprite() { return { originalSize: { width: 500, height: 400 } } } } },
        '@/client/render/atlasFrame': { getAtlasFrame(_atlas: unknown, cell: number) { cells.push(cell) } },
        '@/client/sound/SoundSystem': { SoundEffect: { DirtRise: 'dirt_rise' }, SoundSystem: { play: async () => {} } },
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
        presentation: { gridItems: { 'pvz:grave': { view: 'grave', layer: 'graveStone', offset: 3, cell: [-4, -9] } } },
    }
    const world = (gameplayTick = 0, phase = 'intro') => ({ levelId: 'test:level', phase, gameplayTick, plants: [] })
    let particles = 0
    const orders: number[] = []
    const intro = { complete: false, elapsedTicks: 0, graveStartTick: 0 }
    // The board's order of a grave, by its type and row.
    const gridItemOrder = (typeId: string, row: number) => row * 10 + (typeId === 'pvz:grave' ? 1 : 0)
    const stage = { intro, quiet: false, gridItemOrder, particle(_effect: string, _x: number, _y: number, order: number) { particles++; orders.push(order) } }
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
    assert.deepEqual([...orders].sort((left, right) => left - right), [2, 22, 32], 'one over its grave, as the board draws it')
    // GridItem::DrawGraveStone at whole ticks, with mGridItemCounter = ticks + 1 - delay.
    const easeInOut = (start: number, end: number, age: number, from: number, to: number) => animationModule.animateCurve(start, end, age, from, to, 'ease-in-out')
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

    // /griditem grave: a grave added in play rises from its gameplay tick, with the intro's dirt, once.
    const added = { entityId: 9, typeId: 'pvz:grave', row: 1, column: 3, variant: 4, riseDelay: 0, offsetX: 0, offsetY: 0, riseAtTick: 500 }
    const root = new Node(), board = { intro: { complete: true }, quiet: false, gridItemOrder, particle() { particles++ } }
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

test('every particle of the board is drawn at its order among the entities, one node per order, and a save puts it back there', async () => {
    class Node {
        isValid = true
        name = ''
        parent?: Node
        readonly children: Node[] = []
        setParent(parent: Node) {
            if (this.parent) this.parent.children.splice(this.parent.children.indexOf(this), 1)
            parent.children.push(this)
            this.parent = parent
        }
    }
    const spawned: any[] = [], restored: any[] = []
    const player = (args: any) => {
        const node = new Node()
        node.setParent(args.parent)
        return { node, renderOrder: args.renderOrder, args, whenReady: async () => {} }
    }
    const ParticlePlayer = {
        spawn(args: any) { const made = player(args); spawned.push(made); return made },
        restore(args: any) { const made = player({ ...args, renderOrder: args.snapshot.renderOrder }); restored.push(made); return made },
    }
    const uiNode = (options: any) => {
        const node = new Node()
        node.name = options.name ?? ''
        if (options.parent) node.setParent(options.parent)
        return { node }
    }
    const modules = { '@/client/view/uiNode': { uiNode }, '@/client/particle/ParticlePlayer': { ParticlePlayer } }
    const { LevelEntityRenderer } = loadClientModule('level/LevelEntityRenderer', modules)
    const content = {
        levels: { levels: { 'test:level': { award: { id: 'pvz:sunflower' }, lawnMower: 'test:mower' } } },
        presentation: { projectiles: { 'test:pea': {}, 'test:mower': { layer: 'lawnMower' } } },
        views: { events: { of: () => [] } },
    }
    const layer = new Node(), board = new LevelEntityRenderer(content, layer, {}, {}, { complete: true }, {})
    const holder = (order: number) => layer.children.find(child => child.name === `BoardParticles-${order}`)
    board.particle('test:dirt', 100, 50, 500, undefined, true)
    assert.deepEqual([spawned[0].node.parent, spawned[0].renderOrder, spawned[0].args.x, spawned[0].args.y, spawned[0].args.recycle, spawned[0].args.mirrored],
        [holder(500), 500, 100 - 400, 300 - 50, true, true], 'in board coordinates, kept for the next once through')
    const armor = board.spawnParticle(500, { id: 'test:armor', x: 1, y: 2 })
    assert.deepEqual([armor.node.parent, armor.args.recycle], [holder(500), undefined], 'played as asked, after the other of its order')
    assert.deepEqual(holder(500)!.children, [spawned[0].node, armor.node])
    // A trail goes with its projectile's order.
    const order = board.projectileOrder('test:pea', 2), trail = board.spawnParticle(order, { id: 'test:trail', x: 0, y: 0, unsaved: true })
    assert.equal(order, renderOrderModule.renderOrder('projectile', 2))
    board.reorderParticle(trail, board.projectileOrder('test:pea', 3))
    assert.deepEqual([trail.node.parent, trail.renderOrder], [holder(renderOrderModule.renderOrder('projectile', 3)), renderOrderModule.renderOrder('projectile', 3)])
    assert.equal(holder(order)!.children.length, 0)
    const snapshot = { levelId: 'test:level', plants: [], zombies: [], projectiles: [], items: [], mowers: [] }
    assert.deepEqual([...board.collectLayerEntries(snapshot)].map((entry: any) => [entry.node.name, entry.order]),
        [500, order, renderOrderModule.renderOrder('projectile', 3)].map(value => [`BoardParticles-${value}`, value]), 'each order once, at its order')
    // A save's particle of the board's layer goes back into the node of its order.
    const { LevelParticlePresenter } = loadClientModule('level/LevelParticlePresenter', {
        cc: { Vec3: class {} }, '@/client/particle/ParticlePlayer': { ParticlePlayer }, './LevelEntityRenderer': {},
    })
    const root = { getComponentsInChildren: () => [] }, presenter = new LevelParticlePresenter(root, new Map([['entity-layer', layer]]), board, {})
    await presenter.restore([{ instanceId: 1, owner: { kind: 'screen', slot: 'entity-layer', x: 3, y: 4, z: 0 }, playback: { renderOrder: 500 } }])
    assert.deepEqual([restored[0].node.parent, restored[0].args.x, restored[0].args.y], [holder(500), 3, 4])
    assert.equal(board.projectileOrder('test:mower', 1), renderOrderModule.renderOrder('lawnMower', 1), "a mower's by its type's layer")
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
        const entity = { entityId: 1, typeId: 'test:entity' }
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
        items: [], mowers: [], cursor: { mode: 'none' } }
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
    await board.restore({ entities: [{ kind, entityId: 1 }], flashes: [{ entityId: 1, tick: 0, ticks: 25 }] })
    assert.equal(restored, true)
    assert.equal(board.flashes.zombie(1, 5).flash, 20, 'the board takes back its flashes with what its views kept')
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
        setScale() {}
        destroy() { this.isValid = false; if (this.player) this.player.node = null }
        addComponent(Type: any) { return this.player = Object.assign(new Type(), { node: this }) }
    }
    class Player {
        node: Node | null = null
        onFinish?: () => void
        change() {}
        play(options: { onFinish: () => void }) { playCount++; this.onFinish = options.onFinish }
    }
    const drops: Node[] = []
    const { ZombieView } = loadClientModule('zombies/ZombieView', {
        '@/client/reanim/clips': loadClientModule('reanim/clips', { './ReanimAssets': { prepareReanims: () => loading } }),
        '@/client/reanim/ReanimPlayer': { ReanimPlayer: Player },
        '@/client/view/uiNode': { uiNode(options: any) {
            if (options.node) return { node: options.node }
            const node = new Node(); drops.push(node); return { node }
        } },
    })
    const { EntityAttachments } = clientStubs['@/client/view/EntityAttachments'] as any
    const view = Object.assign(Object.create(ZombieView.prototype), {
        context: { content: {} }, node: new Node(), shadowNode: new Node(), layers: { player: () => ({ loadedId: null }), shown: [], show() {} }, animation: 'walk',
        attachments: new EntityAttachments(), mirrored: false, turned: false, scale: 1, shadowSize: { width: 0, height: 0 },
        presentation: presentationFixture.zombies['pvz:newspaper'], gameplay: {}, applyHitFlash() {}, applyColor() {}, applyParts() {},
    })
    view.armorDropped('shield')
    await new Promise(resolve => setImmediate(resolve))
    const finished = drops[0].player!
    finished.onFinish!()
    assert.equal(finished.node, null, 'Cocos clears a destroyed component node')
    assert.doesNotThrow(() => view.sync({ state: 'walking', animations: { body: { clip: 'walk', time: 0, rate: 12 } }, hasHead: true }, { result: 'playing' }))

    let finishLoad!: () => void
    loading = new Promise(resolve => { finishLoad = resolve })
    view.armorDropped('shield')
    view.sync({ state: 'dying', animations: { body: { clip: 'walk', time: 0, rate: 12 } }, hasHead: true }, { result: 'playing' })
    assert.equal(drops[1].isValid, false, 'death removes a drop even while its animation is loading')
    finishLoad()
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(playCount, 1, 'a drop destroyed during loading must not start playing')
    assert.doesNotThrow(() => view.sync({ state: 'walking', animations: { body: { clip: 'walk', time: 0, rate: 12 } }, hasHead: true }, { result: 'playing' }))
})

test('the presentation is built once from the base archive and the running Mods, and its foley goes to the sound system', async () => {
    const base = { content: { presentation: 'presentation.json' },
        files: { 'presentation.json': new TextEncoder().encode(JSON.stringify(presentationFixture)) } }
    let builds = 0, foley = 0
    const load = (archive: object) => loadClientModule('content/loadPresentationDefinitions', {
        './ModResources': { modResources: { baseContent: async () => archive } },
        './installedMods': { installedMods: async () => ({ presentationDefinitions: [] }) },
        '@/client/sound/SoundSystem': { SoundSystem: { useFoley() { foley++ } } },
        '@/shared/content/DefinitionRegistry': { buildPresentationDefinitions: (...args: Parameters<typeof buildPresentationDefinitions>) => {
            builds++
            return buildPresentationDefinitions(...args)
        } },
        '@/shared/mod/content': { contentJson },
    }).loadPresentationDefinitions
    const loadPresentation = load(base)
    const presentation = await loadPresentation()
    assert.deepEqual(presentation, presentationFixture)
    assert.equal(await loadPresentation(), presentation, 'the UI and the game draw with the same one')
    assert.deepEqual([builds, foley], [1, 1])
    await assert.rejects(load({ ...base, content: {} })(), /does not define presentation/)
})

test('the base Mod prefab keeps its compiled engine bindings after moving into assets', async () => {
    class Prefab {}
    const prefab = new Prefab()
    const source = readBaseContent().resources.prefabs['pvz:level']
    const requests: string[] = []
    const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value))
    const files = {
        'manifest.json': encode({ schemaVersion: 1, id: 'pvz', version: '1.0.0', apiVersion: 1, contentHash: 'base' }),
        'content.json': encode({ resources: { prefabs: { 'pvz:level': source } } }),
        [source]: new Uint8Array(readFileSync(`mods/pvz-base/${source}`)),
    }
    const { ModResources } = loadClientModule('content/ModResources', {
        cc: { Prefab, macro: {}, dynamicAtlasManager: {}, sys: { isNative: false }, resources: {
            load(path: string, type: unknown, complete: (error: null, value: Prefab) => void) {
                requests.push(path)
                assert.equal(type, Prefab)
                assert.deepEqual(readFileSync(`assets/resources/${path}.prefab`), readFileSync(`mods/pvz-base/${source}`))
                complete(null, prefab)
            },
        } },
        './InstalledArchives': { unpackArchive: () => files },
        '@/shared/mod/content': modContent,
    })
    const resources = new ModResources(async () => new Uint8Array(), { ready: async () => [], failures: new Map() })
    assert.equal(await resources.prefab('pvz:level'), prefab)
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
    const daveTracks = new Set(Object.entries<{ reanimId: string }>(dave.clips).filter(([name]) => !['blink', 'hand', 'hammer'].includes(name)).flatMap(([, clip]) => trackIds(clip.reanimId)))
    for (const track of [dave.parts.mouth, dave.parts.head, ...dave.parts.eyes, dave.clips.hand.attachmentTrackId]) assert.ok(daveTracks.has(track), `Dave lists ${track}`)
    const menu = JSON.parse(readFileSync('mods/pvz-base/presentation/definitions/main-menu.json', 'utf8'))
    const selector = new Set([menu.clips.open.reanimId, menu.clips.sign.reanimId].flatMap(trackIds))
    const { tracks: menuTracks, startAdventure } = menu
    for (const track of [...menu.buttons.map((button: { track: string }) => button.track), menuTracks.sky, menuTracks.anchor, menuTracks.profileSign,
        ...menuTracks.replaced, startAdventure.track, startAdventure.shadow, startAdventure.adventureShadow, menu.keyShadow.track, menu.trophy.track]) {
        assert.ok(selector.has(track), `the main menu lists ${track}`)
    }
    const hand = new Set(trackIds(menu.clips.zombie_hand.reanimId))
    for (const track of menu.hand.rocks) assert.ok(hand.has(track), `the zombie hand lists ${track}`)
    const screens = JSON.parse(readFileSync('mods/pvz-base/presentation/definitions/screens.json', 'utf8'))
    const layers = (value: unknown): any[] => Array.isArray(value) ? value.flatMap(layers)
        : value && typeof value === 'object' ? 'onlyTracks' in value ? [value] : Object.values(value).flatMap(layers) : []
    for (const layer of layers(screens)) {
        const tracks = new Set(trackIds(layer.reanimId))
        for (const track of layer.onlyTracks) assert.ok(tracks.has(track), `${layer.reanimId} lists ${track}`)
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

test('Dave shows the held mallet on line 405 and puts it away on line 406', () => {
    const config = presentationFixture.dave
    const strings = JSON.parse(readFileSync('mods/pvz-base/assets/json/strings.json', 'utf8'))
    const track = {}, root = {}
    const body = { getTrackNode: () => track, setTrackSpriteOverride() {}, setTracksVisible() {} }
    let animation: string | undefined
    const { CrazyDaveView } = loadClientModule('characters/CrazyDaveView', {
        '@/client/sound/SoundSystem': { SoundEffect: {}, SoundSystem: { play: async () => {} } },
        '@/client/reanim/clips': { showClip(_player: unknown, clip: { reanimId: string }) { animation = clip.reanimId } },
    })
    const item = () => ({ node: { active: false, parent: root, setParent(parent: object) { this.parent = parent } } })
    const items = { hammer: item(), hand: item() }
    const view = Object.assign(Object.create(CrazyDaveView.prototype), {
        node: root, body, blink: { node: { active: false } }, items, config,
        bubble: {}, label: { renderer: { contentHeight: 0 }, setPosition() {} },
    })
    view.show(strings.CRAZY_DAVE_405)
    assert.equal(animation, config.clips.talk_handing.reanimId)
    assert.equal(items.hammer.node.active, true)
    assert.equal(items.hammer.node.parent, track)
    assert.equal(items.hand.node.active, false)
    assert.deepEqual([config.clips.hammer.reanimId, config.clips.hammer.start, config.clips.hammer.hold], ['pvz:hammer', 'end', true])
    view.show(strings.CRAZY_DAVE_406)
    assert.equal(items.hammer.node.active, false)
    assert.equal(items.hammer.node.parent, root)
})

test('Grave Buster chewing follows board pause and a late load cannot outlive the level', async () => {
    const effect = 'pvz:gravebusterchomp'
    for (const native of [false, true]) {
        const heard: string[] = []
        const engine = {
            play2d() { heard.push('play'); return 1 },
            pause() { heard.push('pause') }, resume() { heard.push('resume') },
            stop() { heard.push('stop') }, setVolume() {}, setFinishCallback() {},
        }
        const { SoundSystem } = loadScript('assets/scripts/client/sound/SoundSystem.ts', id => ({
            cc: { sys: { isNative: native }, AudioSource: { EventType: { ENDED: 'ended' } } },
            '@/platform/debug/GameDebugSettings': { GameDebugSettings: { perfSfxEnabled: true } },
        }[id]), { jsb: { AudioEngine: engine } })
        const clip = { nativeUrl: 'gravebusterchomp' }
        SoundSystem.useFoley(presentationFixture.foley)
        SoundSystem.load = async () => clip
        SoundSystem._createPersistentAudioNode = () => ({
            addComponent: () => ({ play: () => heard.push('play'), pause: engine.pause, stop: engine.stop }),
            once() {}, destroy() {},
        })
        await SoundSystem.play(effect, { foley: true })
        SoundSystem.pauseGameSounds(true)
        SoundSystem.pauseGameSounds(false)
        SoundSystem.stopGameSounds()
        assert.deepEqual(heard, ['play', 'pause', native ? 'resume' : 'play', 'stop'])
        SoundSystem._foleyLastPlayedAt.clear()
        let finish!: (value: typeof clip) => void
        SoundSystem.load = () => new Promise(resolve => { finish = resolve })
        const pending = SoundSystem.play(effect, { foley: true })
        SoundSystem.stopGameSounds()
        finish(clip)
        await pending
        assert.equal(heard.length, 4)
    }
})

test('focus mute affects active and late sounds and restores the current volume without unpausing the board', async () => {
    const volumes: number[] = [], changes: number[] = [], resumed: number[] = []
    const loops: boolean[] = [], paused: number[] = []
    const engine = {
        play2d(_url: string, loop: boolean, value: number) { loops.push(loop); volumes.push(value); return volumes.length },
        setVolume(_id: number, value: number) { changes.push(value) }, stop() {}, setFinishCallback() {},
        pause(id: number) { paused.push(id) }, resume(id: number) { resumed.push(id) },
    }
    const { SoundSystem } = loadScript('assets/scripts/client/sound/SoundSystem.ts', id => ({
        cc: { sys: { isNative: true } }, '@/platform/debug/GameDebugSettings': { GameDebugSettings: { perfSfxEnabled: true } },
    }[id]), { jsb: { AudioEngine: engine } })
    SoundSystem.load = async () => ({ nativeUrl: 'sample' })
    SoundSystem.setSfxVolume(0.6)
    await SoundSystem.play('hit')
    const late = SoundSystem.play('pvz:digger_zombie', { channel: 'sodRoll', loop: true, pauseWithGame: true })
    SoundSystem.setFocusMuted(true)
    SoundSystem.pauseGameSounds(true)
    await late
    assert.deepEqual(loops, [false, true])
    assert.deepEqual(paused, [2])
    assert.deepEqual(volumes, [0.6, 0])
    assert.deepEqual(changes, [0])
    SoundSystem.setMusicVolume(0.5)
    SoundSystem.setSfxVolume(0.3)
    assert.deepEqual([SoundSystem.getSfxVolume(), SoundSystem.getMusicVolume(), SoundSystem.getMusicOutputVolume()], [0.3, 0.5, 0])
    SoundSystem.setFocusMuted(false)
    assert.deepEqual(changes.slice(-2), [0.3, 0.3])
    assert.equal(SoundSystem.getMusicOutputVolume(), 0.5)
    assert.deepEqual(resumed, [])
    SoundSystem.pauseGameSounds(false)
    assert.deepEqual(resumed, [2])
})

test('sound channels reserve during loading, keep or replace requests, and release on completion', async () => {
    const played: string[] = [], stopped: number[] = [], paused: number[] = [], resumed: number[] = []
    const ended = new Map<number, () => void>()
    const engine = {
        play2d(url: string) { played.push(url); return played.length },
        pause(id: number) { paused.push(id) }, resume(id: number) { resumed.push(id) },
        stop(id: number) { stopped.push(id) }, setPitch() { return true }, setVolume() {},
        setFinishCallback(id: number, callback: () => void) { ended.set(id, callback) },
    }
    const { SoundSystem } = loadScript('assets/scripts/client/sound/SoundSystem.ts', id => ({
        cc: { sys: { isNative: true } },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: { perfSfxEnabled: true } },
    }[id]), { jsb: { AudioEngine: engine } })
    const loads: string[] = []
    let ready!: (clip: { nativeUrl: string }) => void
    SoundSystem.load = (id: string) => {
        loads.push(id)
        return id === 'slow' ? new Promise(resolve => { ready = resolve }) : Promise.resolve({ nativeUrl: id })
    }

    const dance = { channel: 'dancer', ifBusy: 'keep', pauseWithGame: true }
    const first = SoundSystem.play('slow', dance)
    assert.equal(SoundSystem.isChannelActive('dancer'), true)
    await SoundSystem.play('duplicate', dance)
    assert.deepEqual(loads, ['slow'])
    SoundSystem.pauseGameSounds(true)
    ready({ nativeUrl: 'dance' })
    await first
    assert.deepEqual(paused, [1])
    SoundSystem.pauseGameSounds(false)
    assert.deepEqual(resumed, [1])

    const speech = { foley: true, pitch: 2, channel: 'crazyDave' }
    const late = SoundSystem.play('slow', speech)
    await SoundSystem.play('line two', speech)
    ready({ nativeUrl: 'stale' })
    await late
    await SoundSystem.play('line three', speech)
    assert.deepEqual(played, ['dance', 'line two', 'line three'])
    assert.deepEqual(stopped, [2])
    ended.get(2)!()
    assert.equal(SoundSystem.isChannelActive('crazyDave'), true)
    SoundSystem.stopGameSounds()
    assert.deepEqual(stopped, [2, 1])
    assert.equal(SoundSystem.isChannelActive('dancer'), false)
    ended.get(3)!()
    assert.equal(SoundSystem.isChannelActive('crazyDave'), false)
})

test('a screen door zombie holds its door with the door arms, lowers them to eat, and keeps a lost arm hidden', () => {
    const { ZombieView } = loadClientModule('zombies/ZombieView', {})
    const presentation = JSON.parse(readFileSync('mods/pvz-base/presentation/definitions/zombies.json', 'utf8'))['pvz:screendoor']
    const shown = new Map<string, boolean>()
    const player = { loadedId: 'pvz:door_zombie_walk', setTracksVisible(tracks: string[], visible: boolean) { for (const track of tracks) shown.set(track, visible) }, setTrackSpriteOverride() {} }
    const view = Object.assign(Object.create(ZombieView.prototype), {
        layers: { player: () => player }, presentation, parts: '', gameplay: { shield: { type: 'door', health: 1100 } }, sprites: {},
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

test('a screen door zombie sets its shield\'s colors once for a flash, and again when its body changes to another Reanim', () => {
    class Color {
        static WHITE = new Color(255, 255, 255)
        static BLACK = new Color(0, 0, 0)
        constructor(readonly r: number, readonly g: number, readonly b: number, readonly a = 255) {}
    }
    const { ZombieView } = loadClientModule('zombies/ZombieView', { cc: { Color } })
    const presentation = JSON.parse(readFileSync('mods/pvz-base/presentation/definitions/zombies.json', 'utf8'))['pvz:screendoor']
    const overrides: string[] = []
    const player = { loadedId: 'pvz:door_zombie_eat', setExtraAdditiveDraw() {}, setTrackRenderOverride(track: string) { overrides.push(track) } }
    const view = Object.assign(Object.create(ZombieView.prototype), { layers: { player: () => player }, presentation, flash: { flash: 0, through: false, past: false } })
    const zombie = { shieldHealth: 1100, state: 'eating' }
    view.applyHitFlash(zombie)
    view.applyHitFlash(zombie)
    assert.deepEqual(overrides, ['anim_screendoor'], 'the same flash is not set again')
    // The body's new Reanim has its tracks anew, without the override (ZombieView.pose).
    view.applyHitFlash(zombie, true)
    assert.deepEqual(overrides, ['anim_screendoor', 'anim_screendoor'])
})

test('a player changes to another clip of its body in place: its batches stay, and it blends from the pose it showed', async () => {
    const track = (id: string, zIndex: number) => ({ id, zIndex, keyframes: [{ sprite: `pvz:${id}` }] })
    const clips: Record<string, unknown> = {
        'pvz:walk': { id: 'pvz:walk', tracks: [track('leg', 2), track('arm', 1)] },
        'pvz:death': { id: 'pvz:death', tracks: [track('head', 3), track('arm', 1)] },
    }
    const reanims = loadClientModule('reanim/ReanimAssets', {
        '@/client/content/ModResources': { modResources: {
            async json(_kind: string, id: string, parse: (json: unknown) => unknown) { return parse(clips[id]) },
            async sprite(id: string) { return { id } },
        } },
        '@/shared/content/reanim': { parseReanim: (json: unknown) => json },
        '@/client/render/KernelBatch': { loadKernelMaterial: async () => {} },
    })
    const { ReanimPlayer } = loadClientModule('reanim/ReanimPlayer', {
        cc: { Component: class {}, isValid: (node?: { isValid: boolean }) => node?.isValid === true,
            _decorator: { ccclass: () => (value: unknown) => value } },
        '@/shared/content/reanim': { parseReanim: (json: unknown) => json, sampleReanimTrack: (item: { id: string }) => ({ sprite: `pvz:${item.id}`, x: 7 }) },
        './ReanimAssets': reanims,
        '@/client/render/KernelBatch': { loadKernelMaterial: async () => {} },
    })
    const batches = [{}]
    const player = Object.assign(Object.create(ReanimPlayer.prototype), {
        data: null, views: new Map(), frames: new Map(), frameOverrides: new Map(), followers: new Map(),
        blendFromPoses: new Map(), batches, blendDuration: 0, blendElapsed: 0, timeSeconds: 5, drawingStale: false, applyPose() {},
    })
    assert.throws(() => player.change('pvz:walk'), /reanim is not loaded: pvz:walk/, 'a clip is in memory before it is played')
    await reanims.prepareReanims(['pvz:walk', 'pvz:death'])
    player.change('pvz:walk', 0.2)
    assert.deepEqual([[...player.views.keys()], player.blendDuration, player.blendFromPoses.size], [['arm', 'leg'], 0.2, 0], 'nothing to blend from before the first clip')

    // What was set on single tracks starts over; a track both clips have keeps its own node, the others' go.
    const node = () => ({ isValid: true, active: false, destroy() { this.isValid = false } })
    const arm = node(), leg = node()
    Object.assign(player.views.get('arm'), { node: arm, visible: false })
    Object.assign(player.views.get('leg'), { node: leg })
    player.followers.set('arm', [{}]).set('leg', [{}])
    player.timeSeconds = 3
    player.change('pvz:death', 0.2)
    assert.equal(player.loadedId, 'pvz:death')
    assert.deepEqual([...player.views.keys()], ['arm', 'head'])
    assert.deepEqual([player.views.get('arm').node, player.views.get('arm').visible, arm.active, arm.isValid, leg.isValid], [arm, true, true, true, false])
    assert.deepEqual([[...player.followers.keys()], [...player.frames.keys()].sort()], [['arm'], ['pvz:arm', 'pvz:head']])
    assert.equal(player.batches, batches, 'what draws it is not rebuilt')
    assert.deepEqual([[...player.blendFromPoses.keys()], player.blendDuration, player.blendElapsed, player.timeSeconds, player.drawingStale], [['arm'], 0.2, 0, 0, true],
        'it blends the tracks both clips have, from the start of the new one')

    // A Mod's local replacement survives replay. Two slots can show different tracks of that same resource.
    const extended = { ...player.getAnimation(), durationSeconds: 3 }
    player.replaceAnimation(extended)
    player.change('pvz:death', 0, ['head'])
    assert.equal(arm.active, false)
    player.change('pvz:death', 0, ['arm'])
    assert.equal(arm.active, true)
    assert.equal(player.durationSeconds, 3)

    // The same clip again (a repeated shot) only starts a blend from where it was.
    const views = [...player.views.values()]
    player.blendFromPoses.clear()
    player.change('pvz:death', 0.1)
    assert.deepEqual([[...player.views.values()], [...player.blendFromPoses.keys()].sort(), player.blendDuration], [views, ['arm', 'head'], 0.1])
})

test('a replaced animation keeps a finished player at its end, and a running one where it was', () => {
    const { ReanimPlayer } = loadClientModule('reanim/ReanimPlayer', {
        cc: { Component: class {}, isValid: () => true, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/shared/content/reanim': { parseReanim: (json: unknown) => json, sampleReanimTrack: () => null },
        './ReanimAssets': {},
        '@/client/render/KernelBatch': { loadKernelMaterial: async () => {} },
    })
    const poses = (durationSeconds: number) => ({ id: 'pvz:cloud', durationSeconds, tracks: [{ id: 'cloud', keyframes: [] }] })
    const player = Object.assign(Object.create(ReanimPlayer.prototype), {
        data: poses(10), views: new Map([['cloud', { track: null, visible: true }]]), frames: new Map(),
        timeSeconds: 10, drawingStale: false, applyPose() {},
    })
    // A widescreen cloud that finished its flight across a narrow window, holding its blank last pose: widened, it
    // stays finished instead of reappearing mid-sky, still.
    player.replaceAnimation(poses(14))
    assert.equal(player.timeSeconds, 14)
    player.timeSeconds = 6
    player.replaceAnimation(poses(8))
    assert.equal(player.timeSeconds, 6, 'one still flying keeps its time')
    player.timeSeconds = 7.5
    player.replaceAnimation(poses(5))
    assert.equal(player.timeSeconds, 5, 'past the end of shorter poses, it is at their end')
})

test('a stopped player driven by seek takes its blend on by itself, staying where it is in its clip', () => {
    const { ReanimPlayer } = loadClientModule('reanim/ReanimPlayer', {
        cc: { Component: class {}, isValid: () => true, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/shared/content/reanim': { parseReanim: (json: unknown) => json, sampleReanimTrack: () => null },
        './ReanimAssets': {},
        '@/client/render/KernelBatch': { loadKernelMaterial: async () => {} },
    })
    let poses = 0
    const player = Object.assign(Object.create(ReanimPlayer.prototype), {
        blendFromPoses: new Map([['arm', { sprite: 'pvz:arm' }]]), blendDuration: 0.2, blendElapsed: 0, timeSeconds: 3,
        playing: false, drawingStale: false, applyPose() { poses++ },
    })
    player.advanceBlend(0.1)
    assert.deepEqual([player.blendElapsed, player.blendDuration, player.blendFromPoses.size, player.timeSeconds, poses], [0.1, 0.2, 1, 3, 1])
    player.advanceBlend(0.15)
    assert.deepEqual([player.blendElapsed, player.blendDuration, player.blendFromPoses.size, player.drawingStale, player.timeSeconds, poses], [0, 0, 0, true, 3, 2],
        'its blend done, it shows its clip alone')
    player.advanceBlend(0.1)
    assert.equal(poses, 2, 'without a blend there is nothing to draw again')
    assert.throws(() => player.advanceBlend(-1), /finite and non-negative/)
})

test('an animation loads once for every player with the pictures its packs have for it, and a failed load can retry', async () => {
    let reads = 0, parses = 0
    const sprites: string[] = []
    let fail = true
    const { loadReanim } = loadClientModule('reanim/ReanimAssets', {
        '@/client/content/ModResources': { modResources: {
            async json(kind: string, id: string, parse: (json: unknown) => unknown) { reads++; return parse({ kind, id }) },
            async sprite(id: string, animation: string) {
                sprites.push(`${animation}:${id}`)
                if (fail) throw new Error('sprite unavailable')
                return {}
            },
        } },
        '@/shared/content/reanim': { parseReanim: (json: { kind: string, id: string }) => {
            parses++
            assert.equal(json.kind, 'reanim')
            return { id: json.id, tracks: [{ keyframes: [{ sprite: 'pvz:leaf' }, { sprite: 'pvz:leaf' }] }] }
        } },
        '@/client/render/KernelBatch': { loadKernelMaterial: async () => {} },
    })
    await assert.rejects(loadReanim('pvz:demo'), /sprite unavailable/)
    fail = false
    const preparing = loadReanim('pvz:demo')
    assert.equal(loadReanim('pvz:demo'), preparing)
    const prepared = await preparing
    assert.equal(await loadReanim('pvz:demo'), prepared)
    assert.deepEqual([reads, parses], [2, 2], 'only the failed load is read again')
    assert.deepEqual(sprites, ['pvz:demo:pvz:leaf', 'pvz:demo:pvz:leaf'], 'each picture once, as the pack has it for this animation')
})

test('sound playback loads overridden base effects and namespaced Mod effects through shared resources', async () => {
    const click = {}, modEffect = {}
    const assets = new Map<string, unknown>([['pvz:buttonclick', click], ['example:effect', modEffect]])
    const reads: string[] = []
    const { SoundSystem, SoundEffect } = loadClientModule('sound/SoundSystem', {
        cc: { AudioClip: class {} },
        '@/client/content/ModResources': { modResources: { async audio(id: string) {
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

test("a grave buster's dirt is 4 over the buster, at the board's order of the plant it was", () => {
    const { GraveBusterView } = loadClientModule('plants/GraveBusterView', { './PlantView': { PlantView: class {} } })
    const asked: unknown[] = [], particles: unknown[][] = []
    const stage = {
        plantOrder(plant: unknown) { asked.push(plant); return 1000 },
        particle(...args: unknown[]) { particles.push(args) },
    }
    GraveBusterView.busted(stage, { type: 'graveBusted', data: { typeId: 'pvz:gravebuster', row: 2, x: 120, y: 280, team: 'zombies' } })
    assert.deepEqual(JSON.parse(JSON.stringify(asked)), [{ typeId: 'pvz:gravebuster', row: 2, x: 120 }])
    assert.deepEqual(JSON.parse(JSON.stringify(particles)), [['pvz:gravebusterdie', 160, 360, 1004, null, true]])
})

test('a collected item says how far it is on its way to its counter, which the sun is eased toward the pinned counter by', () => {
    const { ItemView } = loadClientModule('items/ItemView', {
        '@/client/view/uiNode': { uiNode: () => ({}) },
        '@/client/particle/ParticlePlayer': { ParticlePlayer: {} },
    })
    const node = { position: { x: 0, y: 0 }, setPosition(x: number, y: number) { this.position = { x, y } }, setScale() {} }
    const content = { definitions: { items: { 'test:sun': { kind: 'sun' }, 'test:coin': { kind: 'money' } } }, presentation: { items: { 'test:sun': {}, 'test:coin': {} } } }
    const shown = (typeId: string) => {
        const view = new ItemView({ node, content, item: { typeId }, stage: { sunBankOffset: () => 100 } })
        view.animation = {}
        return view
    }
    const sun = shown('test:sun'), at = (x: number, y: number, state = 'collecting') => ({ typeId: 'test:sun', x, y, scale: 1, alpha: 255, state })
    sun.sync(at(315, 400, 'available'))
    assert.equal(sun.collectProgress, 0, 'not on its way before it is collected')
    sun.sync(at(315, 400))
    assert.equal(sun.collectProgress, 0)
    sun.sync(at(165, 200))
    assert.equal(sun.collectProgress, 0.5, 'half way to the sun counter at (15, 0)')
    assert.equal(node.position.x, 165 + 30 + 100 * 0.5, 'half the way to the pinned counter as well')
    const coin = shown('test:coin')
    coin.sync({ ...at(39 + 300, 558), typeId: 'test:coin' })
    coin.sync({ ...at(39 + 100, 558), typeId: 'test:coin' })
    assert.ok(Math.abs(coin.collectProgress - 2 / 3) < 1e-9, 'money, to the coin bank')
    assert.equal(node.position.x, 39 + 100 + 30, 'which is not pinned')
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
    const zombieNode = {}
    const stage = {
        node: (id: number) => id === 7 ? zombieNode : undefined,
        // The board's order of a projectile, by its type and row; what it draws at an order.
        projectileOrder: (typeId: string, row: number) => row * 1000 + (typeId === 'test:melon' ? 7 : 0),
        spawnParticle(order: number, args: object) { spawned.push({ ...args, order }) },
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
    assert.equal(spawned[1].parent, undefined, "the board's own stays on the board")
    assert.deepEqual([spawned[1].x, spawned[1].y, spawned[1].order], [280 + 50 - 400, 300 - (90 + 20), 1007 + 1],
        'at the middle of its hitbox, one over what flies in its row')
    impact({ projectileId: 6, typeId: 'test:pea', x: 290, y: 120, targetId: 2, target: 'plant', row: 1 })
    assert.deepEqual([spawned[2].parent, spawned[2].order], [undefined, renderOrderModule.renderOrder('top')], 'a splat on a plant stays on the board, over everything')
    impact({ projectileId: 5, typeId: 'test:pea', x: 290, y: 120, targetId: 7, row: 1, through: true })
    assert.equal(spawned.length, 3, 'one that flies on through does not splat')
    assert.deepEqual(sounds, ['splat', 'thud', 'splat', 'splat'])
})

test('a clip that ends plays over its own pictures and goes on where they end; a clip that fits its time is stretched', () => {
    const { shownLayer } = loadClientModule('view/layerPlayback', {})
    // A pack's shooting head of 18 pictures where the animation has 25 (JiangNan's repeater), at 45 a second.
    const played: Record<string, object> = { shootHead: { frames: 25, fps: { min: 45, max: 45 }, next: 'idleHead' }, idleHead: { frames: 25, sync: 'body' },
        land: { frames: 7, fit: true, hold: true }, blink: { frames: 3, once: true } }
    const clips = {
        picture: (name: string) => ({ reanimId: name, rateScale: 1 }), played: (name: string) => played[name],
        frames: (reanimId: string) => ({ shootHead: 18, idleHead: 17, land: 9, blink: 2, body: 4 } as Record<string, number>)[reanimId],
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
    // pictures are counted in frames of their own, whatever pace they were made at (the cherry bomb's 14, at 30 a second).
    played.death = { frames: 39, hold: true }
    played.explode = { frames: 14, hold: true }
    const longer = shownLayer({ clip: 'death', time: 39, rate: 27 }, layers, { ...clips, frames: (id: string) => id === 'death' ? 77 : clips.frames(id) })
    assert.equal(longer.frames, 39)
    const cherry = shownLayer({ clip: 'explode', time: 5, rate: 12 }, layers,
        { ...clips, frames: () => 14 })
    assert.deepEqual([cherry.once, cherry.frames], [true, undefined], 'its 14 pictures are as long as the clip')
})

/** A layer's player that only says what it was told, for LayerPlayers of one layer (`body`). */
class CallPlayer {
    node = { setPosition() {}, setScale() {} }; durationSeconds = 17 / 12; fps = 12; trackIds = []; fullLastFrame = false; playbackFps = 12
    calls: unknown[][] = []
    change() {} setTracksVisible() {} hide() {}
    play(options: { fps: number }) { this.calls.push(['play', options.fps]); this.playbackFps = options.fps }
    setFps(fps: number) { this.calls.push(['fps', fps]); this.playbackFps = fps }
    seek(time: number) { this.calls.push(['seek', time]) }
}

function bodyLayer() {
    const player = new CallPlayer()
    const { LayerPlayers } = loadClientModule('view/layerPlayback', {
        '@/client/view/uiNode': { uiNode: () => ({ node: { addComponent: () => player } }) },
    })
    return { player, layers: new LayerPlayers({}, ['body']) }
}

test('a layer frozen when its view is made stands still at rate 0, and goes on at its rate once it thaws', () => {
    // A plant or zombie frozen in a save: its view is made from a snapshot whose body goes at 0.
    const { player, layers } = bodyLayer()
    const clip = { reanimId: 'pvz:iceshroom' }
    const show = (rate: number, time: number) => layers.show(() => ({ key: 'body', clip, time, rate }), { blend: () => 0, place() {} })
    show(0, 3)
    show(0, 3)
    show(12, 3.12)
    assert.deepEqual(player.calls, [['play', 0], ['fps', 12], ['seek', 0.26]], 'it takes the pace it goes at as it changes')

    const { ReanimPlayer } = loadClientModule('reanim/ReanimPlayer', {
        cc: { Component: class {}, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/client/render/KernelBatch': { loadKernelMaterial: async () => {} },
    })
    const real = Object.assign(Object.create(ReanimPlayer.prototype), { data: { fps: 12 } })
    real.setFps(0)
    assert.equal(real.playbackFps, 0, 'a player stands still at 0')
    assert.throws(() => real.setFps(-1), /finite and non-negative/)
})

test('a frame of the same time leaves a layer where it has played on to, and the next tick sets it right', () => {
    // With the game clock stopped (D), a click still brings a frame of the same gameplay tick (the shovel taken, a
    // pause): set back to the tick's time, every layer twitched by the part of a tick it had played on.
    const { player, layers } = bodyLayer()
    const clip = { reanimId: 'pvz:sunflower' }
    const show = (time: number) => layers.show(() => ({ key: 'body', clip, time, rate: 12 }), { blend: () => 0, place() {} })
    show(3)
    show(3)
    show(3)
    assert.deepEqual(player.calls, [['play', 12]], 'frames of the same tick leave it playing on')
    show(3.12)
    assert.deepEqual(player.calls, [['play', 12], ['seek', 0.26]], 'the next tick sets it right')
})

test('on the board, a tick that leaves a layer at its time stops it there, and the tick that moves it plays it on from there', () => {
    // The plants of an intro (Plant::Update leaves them still) or of a repick: ticks come, their times do not move.
    // Played on, each plant ran ahead through the whole intro and jumped back to its first pose as play began.
    const { player, layers } = bodyLayer()
    const clip = { reanimId: 'pvz:sunflower' }
    const show = (time: number) => layers.show(() => ({ key: 'body', clip, time, rate: 12 }), { blend: () => 0, place() {}, holdsStill: true })
    show(3)
    show(3)
    show(3)
    assert.deepEqual(player.calls, [['play', 12], ['fps', 0]], 'held where it played on to, without being set back')
    show(3.12)
    assert.deepEqual(player.calls, [['play', 12], ['fps', 0], ['fps', 12], ['seek', 0.26]], 'the tick that moves it plays it on, set right')
})

test('a Mod hears of an event after the base, at the time it asks, and a Mod that failed to load takes its handlers away', () => {
    // The base's handlers are the views' statics: any function stands in for them here.
    const statics = new Proxy({}, { get: () => () => {} })
    const views = Object.fromEntries([['plants/PlantView', 'PlantView'], ['plants/ShooterView', 'ShooterView'], ['plants/ProducerView', 'ProducerView'],
        ['plants/SunShroomView', 'SunShroomView'], ['plants/FusePlantView', 'FusePlantView'], ['plants/PotatoMineView', 'PotatoMineView'],
        ['plants/ChomperView', 'ChomperView'], ['plants/GraveBusterView', 'GraveBusterView'], ['plants/BowlingNutView', 'BowlingNutView'],
        ['zombies/ZombieView', 'ZombieView'], ['zombies/DancerView', 'DancerView'], ['zombies/NewspaperView', 'NewspaperView'], ['zombies/PoleVaulterView', 'PoleVaulterView'],
        ['projectiles/ProjectileView', 'ProjectileView'], ['mowers/MowerView', 'MowerView'],
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

test("the board's flashes are raised by their handlers before the frame's views draw it, and saved once, with the board", async () => {
    const node = { isValid: true, active: true, setPosition() {}, destroy() { this.isValid = false } }
    const { LevelEntityRenderer } = loadClientModule('level/LevelEntityRenderer', { '@/client/view/uiNode': { uiNode: () => ({ node }) } })
    const { EntityFlashes } = clientStubs['./EntityFlashes'] as any
    const { ZombieView } = clientStubs['@/client/zombies/ZombieView'] as any
    const { PlantView } = clientStubs['@/client/plants/PlantView'] as any
    const drawn: number[] = []
    const board = renderer(LevelEntityRenderer, { zombies: { create(context: any) {
        return Object.assign(new ZombieView(), { sync(zombie: any, world: any) { drawn.push(context.stage.flashes.zombie(zombie.entityId, world.gameplayTick).flash) } })
    } } })
    board.content.views.events = { of: (type: string, time: string) => type === 'zombieHit' && time === 'before' ? [EntityFlashes.zombieHit] : [] }
    board.syncLayerOrder = () => {}
    const zombie = { entityId: 1, typeId: 'test:zombie', row: 0, x: 500, y: 100 }
    const snapshot = { levelId: 'test:level', gameplayTick: 10, plants: [], zombies: [zombie], projectiles: [], items: [], mowers: [], cursor: { mode: 'none' } }
    board.sync(snapshot, { added: [1], removed: [] }, [])
    await board.creationTasks.get(1)
    assert.ok(board.view(1, ZombieView), "an entity's view of the class asked for")
    assert.equal(board.view(1, PlantView), undefined, 'and none of another')
    assert.equal(board.view(1), board.view(1, ZombieView))
    // Entity 9 came and went between two frames: its flash is no entity's.
    board.sync({ ...snapshot, gameplayTick: 12 }, { added: [], removed: [] }, [
        { eventId: 1, type: 'zombieHit', data: { entityId: 1 } }, { eventId: 2, type: 'zombieHit', data: { entityId: 9 } }])
    assert.deepEqual(drawn.slice(-1), [25], 'a hit shows in the frame it comes in')
    assert.deepEqual(JSON.parse(JSON.stringify(await board.snapshot())), { entities: [], flashes: [{ entityId: 1, tick: 12, ticks: 25 }] })
})

test('the winner of a lost level takes its shadow with it into the house, and shows both', () => {
    const { ZombieView } = loadClientModule('zombies/ZombieView', {})
    const parent = {}, node = (name: string) => ({ name, parent: {}, active: false, setParent(to: object) { this.parent = to } })
    const view = Object.assign(Object.create(ZombieView.prototype), { node: node('zombie'), shadowNode: node('shadow'), layers: { player: () => ({ loadedId: null }) } })
    view.syncGameOverWalk({ entityId: 1 }, parent, 0, 300)
    assert.deepEqual([view.node.parent, view.node.active, view.shadowNode.parent, view.shadowNode.active], [parent, true, parent, true])
})

test("the winner's blend into its walk goes on by the game over's ticks, its player standing still with the lawn", () => {
    const { ZombieView } = loadClientModule('zombies/ZombieView', {})
    const steps: unknown[] = []
    const player = {
        loadedId: 'pvz:walk', durationSeconds: 1, fps: 12, lastFrameTimeSeconds: 0.9, sampleTrack: () => ({ x: 0 }),
        advanceBlend(seconds: number) { steps.push(['blend', Math.round(seconds * 1000) / 1000]) },
        seek(seconds: number) { steps.push(['seek', Math.round(seconds * 1000) / 1000]) },
    }
    const node = () => ({ parent: null as unknown, active: true, setParent(to: unknown) { this.parent = to }, setPosition() {} })
    const view = Object.assign(Object.create(ZombieView.prototype), {
        node: node(), shadowNode: null, scale: 1, gameOverTicks: 0, layers: { player: () => player },
        presentation: { parts: { ground: '_ground' } }, playback: () => ({ fps: 12, timeSeconds: 0 }), placeShadow() {},
    })
    const parent = {}
    view.syncGameOverWalk({ entityId: 1 }, parent, 0, 300, 5)
    view.syncGameOverWalk({ entityId: 1 }, parent, 0, 300, 20)
    view.syncGameOverWalk({ entityId: 1 }, parent, 30, 300, 100)
    assert.deepEqual(steps, [['blend', 0.05], ['seek', 0.05], ['blend', 0.15], ['seek', 0.2], ['blend', 1.1], ['seek', 0.3]],
        'its approach and walk both take the blend on, before its pose is drawn where the walk is')
})

test("the level's award is collected by its own view: its sounds, the starburst, its glow gone and its own effect behind it", async () => {
    class FakeNode {
        isValid = true
        active = true
        children: FakeNode[] = []
        components: any[] = []
        constructor(readonly name = '', public parent?: FakeNode) { parent?.children.push(this) }
        setPosition() {}
        setScale() {}
        getComponent(type: any) { return this.components.find(component => component instanceof type) ?? null }
        getComponentsInChildren(type: any): any[] { return this.children.flatMap(child => [...child.components.filter(component => component instanceof type), ...child.getComponentsInChildren(type)]) }
        destroy() { this.isValid = false; this.parent!.children.splice(this.parent!.children.indexOf(this), 1) }
    }
    const spawned: { id: string, parent: FakeNode }[] = [], played: string[] = []
    class ParticlePlayer {
        constructor(readonly id: string, readonly node: FakeNode) {}
        overrideScale() {}
        static spawn({ parent, id }: { parent: FakeNode, id: string }) {
            const node = new FakeNode(id, parent)
            node.components.push(new ParticlePlayer(id, node))
            spawned.push({ id, parent })
            return { node }
        }
    }
    const { AwardView } = loadClientModule('items/AwardView', {
        cc: { Sprite: { SizeMode: { RAW: 0 } } },
        '@/client/view/uiNode': { uiNode: (options: any) => ({ node: options.node ?? new FakeNode(options.name, options.parent) }) },
        '@/client/particle/ParticlePlayer': { ParticlePlayer },
        '@/client/sound/SoundSystem': { SoundEffect: { SeedLift: 'seedlift', Drop: 'tap2' }, SoundSystem: { play(effect: string) { played.push(effect) } } },
        '@/client/content/ModResources': { modResources: { font: async () => ({}) } },
        '@/client/hud/SeedPacketRenderer': { SEED_PACKET_WIDTH: 50, SEED_PACKET_HEIGHT: 70, SeedPacketRenderer: { drawSeedPacket: ({ parent, name }: any) => new FakeNode(name, parent) } },
        '@/client/level/LevelGeometry': { levelAwardSize: () => ({ width: 50, height: 70 }) },
        '@/client/plants/definitions': { plantPacket: () => ({ plant: {} }) },
    })
    const layer = new FakeNode('AwardLayer'), node = new FakeNode('Entity-5', layer)
    const stage: any = { level: { award: { id: 'test:seed', kind: 'seed' } }, levelEndTicks: () => -1 }
    const view = new AwardView({ node, stage, content: { presentation: {}, definitions: { seeds: { 'test:seed': { sunCost: 50 } } } } })
    await view.initialize()
    stage.view = (entityId: number, type: any) => entityId === 5 && view instanceof type ? view : undefined
    const item = { entityId: 5, x: 100, y: 200, scale: 1, alpha: 255, landed: true, state: 'available' }
    view.sync(item)
    const back = node.children.find(child => child.name === AwardView.BACK)!
    assert.deepEqual(back.children.map(child => child.name), ['pvz:seedpacket'], 'a landed seed packet glows')
    AwardView.collected(stage, { eventId: 1, type: 'levelAwardCollected', data: { entityId: 5, awardId: 'test:seed', x: 100, y: 200 } }, {})
    assert.deepEqual(played, ['seedlift', 'tap2'])
    assert.deepEqual(spawned.slice(1).map(({ id, parent }) => [id, parent.name]), [['pvz:starburst', 'AwardLayer'], ['pvz:award', AwardView.BACK]])
    assert.deepEqual(back.children.map(child => child.name), ['pvz:award'], 'the glow goes as it is collected')
    view.sync({ ...item, state: 'collecting' })
    assert.deepEqual(back.children.map(child => child.name), ['pvz:award'], 'and nothing else takes what is behind it away')
    AwardView.collected(stage, { eventId: 2, type: 'levelAwardCollected', data: { entityId: 6, x: 0, y: 0 } }, {})
    assert.deepEqual(played, ['seedlift', 'tap2', 'seedlift', 'tap2'], 'heard even before its view is made')
})

test('each flash event is heard once by its flash handler, before the frame is drawn', () => {
    const statics = new Proxy({}, { get: () => () => {} })
    const views = Object.fromEntries([['plants/PlantView', 'PlantView'], ['plants/ShooterView', 'ShooterView'], ['plants/ProducerView', 'ProducerView'],
        ['plants/SunShroomView', 'SunShroomView'], ['plants/FusePlantView', 'FusePlantView'], ['plants/PotatoMineView', 'PotatoMineView'],
        ['plants/ChomperView', 'ChomperView'], ['plants/GraveBusterView', 'GraveBusterView'], ['plants/BowlingNutView', 'BowlingNutView'],
        ['zombies/ZombieView', 'ZombieView'], ['zombies/DancerView', 'DancerView'], ['zombies/NewspaperView', 'NewspaperView'], ['zombies/PoleVaulterView', 'PoleVaulterView'],
        ['projectiles/ProjectileView', 'ProjectileView'], ['mowers/MowerView', 'MowerView'],
        ['items/ItemView', 'ItemView'], ['items/AwardView', 'AwardView']].map(([path, name]) => [`@/client/${path}`, { [name]: statics }]))
    const { StageEventRegistry } = loadClientModule('level/StageEventRegistry', views)
    const { EntityFlashes } = clientStubs['./EntityFlashes'] as any
    const registry = new StageEventRegistry()
    for (const [type, handler] of [['zombieChewedPlant', 'plantHit'], ['plantHit', 'plantHit'], ['sunProduced', 'produced'], ['sunDrained', 'produced'],
        ['zombieHit', 'zombieHit'], ['zombieBurned', 'zombieBurned']]) {
        assert.deepEqual([...registry.of(type, 'before')], [EntityFlashes[handler]], type)
        assert.ok(!registry.of(type, 'after').includes(EntityFlashes[handler]), type)
    }
})

test('the grave rise effect faces the same way as the zombie it raises', () => {
    const { ZombieView } = loadClientModule('zombies/ZombieView', {
        '@/client/sound/SoundSystem': { SoundSystem: { playSounds() {} } },
    })
    const particles: unknown[][] = []
    const stage = { graveRise: { particle: 'pvz:zombierise', sounds: [] }, particle: (...args: unknown[]) => particles.push(args) }
    for (const team of [undefined, 'plants']) {
        ZombieView.rose(stage, { data: { entityId: 1 } }, { zombies: [{ entityId: 1, x: 200, y: 100, row: 2, team }] })
    }
    const order = renderOrderModule.renderOrder('particle', 2)
    assert.deepEqual(particles, [['pvz:zombierise', 260, 210, order, undefined, false], ['pvz:zombierise', 260, 210, order, undefined, true]])
})

test('a zombie with steps kicks up their effect under its feet as its walk comes to each mark, mirrored walking right', () => {
    const { ZombieView } = loadClientModule('zombies/ZombieView', { '@/shared/content/teams': teamsModule })
    const definitions = gameplayModule.parseGameplayDefinitions(readGameplaySource('definitions'))
    const particles: unknown[][] = []
    const view = Object.assign(Object.create(ZombieView.prototype), {
        context: { stage: { particle: (...args: unknown[]) => particles.push(args), zombieOrder: (row: number) => 100 + row } },
        presentation: presentationFixture.zombies['pvz:football'],
        animation: definitions.zombies['pvz:football'].animation,
    })
    const walk = (time: number, zombie: object = {}) =>
        view.step({ x: 300.7, y: 50.2, row: 2, state: 'walking', animations: { body: { clip: 'walk', time, rate: 20 } }, ...zombie })
    // Zombie::UpdateZombieWalking: 0.03 and 0.61 of the 30-frame walk, (81, 106) and (87, 110) from (mX, mY), at mRenderOrder - 1.
    walk(0); walk(1); walk(18); walk(19)
    walk(31, { team: 'plants' })
    walk(40, { state: 'eating' })
    walk(0, { animations: { body: { clip: 'eat', time: 0, rate: 36 } } }); walk(20, { animations: { body: { clip: 'eat', time: 20, rate: 36 } } })
    assert.deepEqual(particles, [
        ['pvz:dust_foot', 381, 156, 101, undefined, false],
        ['pvz:dust_foot', 387, 160, 101, undefined, false],
        ['pvz:dust_foot', 300 + 120 - 81, 156, 101, undefined, true],
    ], 'none while it eats, nor on another clip')
})

test('a mind-controlled zombie is drawn purple, between purple and blue while cold, and a burned one black without either', () => {
    const { ZombieView } = loadClientModule('zombies/ZombieView', {
        cc: { Color: { BLACK: 'black', WHITE: 'white' } }, '@/client/view/tints': loadClientModule('view/tints', {}),
    })
    const drawn: unknown[][] = []
    const player = { loadedId: 'test', setColorOverride(color: unknown) { drawn.push(['color', color]) }, setTint(tint: unknown) { drawn.push(['tint', tint]) } }
    const view = Object.assign(Object.create(ZombieView.prototype), { layers: { player: () => player }, color: 'normal' })
    for (const zombie of [{ chilled: true }, { chilled: true, mindControlled: true }, { frozen: true, mindControlled: true }, { mindControlled: true },
        { mindControlled: true }, { state: 'burned', mindControlled: true }, {}]) {
        view.applyColor({ state: 'walking', ...zombie })
    }
    assert.deepEqual(JSON.parse(JSON.stringify(drawn)), [
        ['color', 'white'], ['tint', { r: 75, g: 75, b: 255 }],
        ['color', 'white'], ['tint', { r: 102, g: 70, b: 224 }],
        ['color', 'white'], ['tint', { r: 128, g: 64, b: 192 }],
        ['color', 'black'], ['tint', null],
        ['color', 'white'], ['tint', null],
    ], 'both tints halfway while it is mind-controlled and cold (frozen is cold too), and nothing new while it stays so')
})

test("a shot leaves the muzzle effect of the plant that fired it just over the row's mowers, mirrored across its hitbox for the zombies' side", () => {
    const { ShooterView } = loadClientModule('plants/ShooterView', { '@/shared/content/teams': teamsModule, './PlantView': { PlantView: class {} } })
    const definitions = gameplayModule.parseGameplayDefinitions(readGameplaySource('definitions'))
    const particles: unknown[][] = []
    const stage = { content: { presentation: presentationFixture, definitions }, particle(...args: unknown[]) { particles.push(args) } }
    const shot = (data: object) => ShooterView.shot(stage, { type: 'projectileFired', data: { typeId: 'pvz:spore', x: 100, y: 120, row: 2, ...data } })
    shot({ plantTypeId: 'pvz:puffshroom' })
    shot({ plantTypeId: 'pvz:scaredyshroom', team: 'zombies' })
    shot({ plantTypeId: 'pvz:snowpea', typeId: 'pvz:snow_pea' })
    shot({ plantTypeId: 'pvz:peashooter', typeId: 'pvz:pea' })
    // Plant::Fire: aOriginX + 18 (+ 27, + 8), aOriginY + 13, at RENDER_LAYER_LAWN_MOWER and 1 in the row.
    const order = renderOrderModule.renderOrder('lawnMower', 2, 1)
    assert.deepEqual(JSON.parse(JSON.stringify(particles)), [
        ['pvz:puffshroommuzzle', 118, 133, order, null, false],
        // The spore's hitbox runs from -15 to 40: 27 in from one side is 2 out from the other.
        ['pvz:puffshroommuzzle', 98, 133, order, null, true],
        ['pvz:snowpeapuff', 108, 133, order, null, false],
    ], 'the peashooter has none')
})

test('a spore grows from 0.3 of its size to whole over its first 30 ticks, as Projectile::Draw draws a puff', () => {
    const { ProjectileView } = loadClientModule('projectiles/ProjectileView', {
        cc: { Sprite: { SizeMode: { RAW: 0 } } }, '@/client/level/LevelStage': loadClientModule('level/LevelStage', {}),
        '@/shared/content/teams': teamsModule,
    })
    const spore = presentationFixture.projectiles['pvz:spore']
    assert.deepEqual(spore.grow, { ticks: 30, from: 0.3 })
    assert.deepEqual([0, 1, 15, 30, 75].map(age => Math.round(ProjectileView.grown(spore, age) * 1000) / 1000), [0.3, 0.323, 0.65, 1, 1])
    assert.equal(ProjectileView.grown(spore, undefined), 1, 'without an age (a waiting mower) it is whole')
    assert.equal(ProjectileView.grown(presentationFixture.projectiles['pvz:pea'], 1), 1, 'a pea does not grow')
})

test("the zombies that do something of their own add it to the zombie's view: a dancer's facing and rise, a pole vaulter's landing, a newspaper zombie's rage", async () => {
    const base = loadClientModule('zombies/ZombieView', {})
    const { DancerView } = loadClientModule('zombies/DancerView', { './ZombieView': base, '@/shared/content/zombieStates': zombieStatesModule })
    const { PoleVaulterView } = loadClientModule('zombies/PoleVaulterView', { './ZombieView': base })
    const { NewspaperView } = loadClientModule('zombies/NewspaperView', { './ZombieView': base })
    const graves = { zombie: { depth: 1 } }, rise = { depth: 2 }
    const context = { content: { presentation: { graves } } }
    const dancer = Object.assign(Object.create(DancerView.prototype), { context, presentation: { dance: { rise } } })
    const plain = Object.assign(Object.create(base.ZombieView.prototype), { context })
    const moonwalking = { state: 'walking', own: { phase: 'moonwalk' } }
    assert.deepEqual([dancer.turnedRound(moonwalking), dancer.turnedRound({ ...moonwalking, team: 'plants' }), dancer.turnedRound({ ...moonwalking, state: 'eating' }),
        plain.turnedRound(moonwalking), plain.turnedRound({ team: 'plants' })], [true, false, false, false, true], 'it moonwalks in the other way round from its side, not as it eats')
    assert.deepEqual([dancer.rise({ own: { phase: 'rise' } }), dancer.rise({ own: { phase: 'walk' } }), plain.rise({ own: { phase: 'rise' } })], [rise, graves.zombie, graves.zombie])
    assert.throws(() => dancer.turnedRound({ typeId: 'pvz:dancer', own: { phase: 'tango' } }), /pvz:dancer\.own\.phase/, 'its view reads its own as its kind has it')
    const danced = (from: string, to: string, won = false, state = 'walking') => {
        Object.assign(dancer, { bodyClip: from, won })
        return dancer.bodyBlend({ state, animations: { body: { clip: to } } })
    }
    assert.deepEqual([danced('walk', 'raise'), danced('raise', 'walk'), danced('point', 'walk'), danced('walk', 'eat'), danced('eat', 'raise'),
        danced('raise', 'walk', true), danced('walk', 'mowered', false, 'mowered')], [0.1, 0.1, 0.2, 0.2, 0.2, 0, 0],
        'from beat to beat over 10 ticks, into its other clips over 20; into the house and mowed at once')

    const vaulter = Object.create(PoleVaulterView.prototype)
    const blend = (from: string, zombie: object, won = false) => { Object.assign(vaulter, { bodyClip: from, won }); return vaulter.bodyBlend({ state: 'walking', ...zombie }) }
    assert.deepEqual([blend('jump', { own: { hasPole: false } }), blend('run', { own: { hasPole: false } }, true), blend('jump', { own: { hasPole: false }, state: 'airborne' }),
        blend('walk', {}), blend('walk', { state: 'mowered' })], [0, 0, 0.2, 0.2, 0],
        "StartWalkAnim(0) as it lands and as it walks into the house (WalkIntoHouse); a mowed one is its driver at once")
    vaulter.bodyClip = 'jump'
    assert.deepEqual([vaulter.mowedOnWalk({ own: { hasPole: false } }), vaulter.mowedOnWalk({ own: { hasPole: true } }), plain.mowedOnWalk({})], [true, false, false])

    const clips = { walk: { id: 'walk' }, walk2: { id: 'walk2' }, eat: { id: 'eat' }, enragedWalk: { id: 'enragedWalk' }, enragedEat: { id: 'enragedEat' }, gasp: { id: 'gasp' } }
    const newspaper = Object.assign(Object.create(NewspaperView.prototype), {
        context: { content: { animations: { resolve: () => clips } } }, presentation: { enragedHead: { track: 'head', sprite: 'mad' } }, sprites: { mad: 'madhead' },
    })
    const shown = (enraged: boolean) => { newspaper.latestZombie = enraged ? { own: { enraged: true } } : {}; return ['walk', 'walk2', 'eat', 'gasp'].map(name => newspaper.clip(name).id) }
    assert.deepEqual([shown(false), shown(true)], [['walk', 'walk2', 'eat', 'gasp'], ['enragedWalk', 'enragedWalk', 'enragedEat', 'gasp']])
    const heads: unknown[] = [], player = { setTrackSpriteOverride: (track: string, sprite: unknown) => heads.push([track, sprite]) }
    for (const [enraged, clip] of [[false, 'walk'], [true, 'gasp'], [true, 'enragedWalk']] as const) newspaper.putOnParts({ ...enraged ? { own: { enraged } } : {}, animations: { body: { clip } } }, player)
    assert.deepEqual(heads, [['head', null], ['head', null], ['head', 'madhead']], 'its enraged head once it has gasped')

    // The sprites of every zombie load once, by the base view, not again by each kind.
    await assert.rejects(() => base.ZombieView.preload({}))
    assert.equal(await DancerView.preload({}), undefined)
})

test("each of the base's zombies is drawn by a view the registry has", () => {
    const view = (name: string) => ({ [name]: class {} })
    const { ZombieViewRegistry } = loadClientModule('zombies/ZombieViewRegistry', {
        '@/client/content/EntityViewRegistry': { EntityViewRegistry }, './ZombieView': view('ZombieView'), './DancerView': view('DancerView'),
        './NewspaperView': view('NewspaperView'), './PoleVaulterView': view('PoleVaulterView'),
    })
    const registry = new ZombieViewRegistry()
    const zombies = JSON.parse(readFileSync('mods/pvz-base/presentation/definitions/zombies.json', 'utf8')) as Record<string, { view?: string }>
    for (const [id, zombie] of Object.entries(zombies)) assert.ok(registry.has(zombie.view ?? 'zombie'), id)
    assert.deepEqual(['pvz:pole_vaulter', 'pvz:newspaper', 'pvz:dancer', 'pvz:backup_dancer'].map(id => zombies[id].view), ['polevaulter', 'newspaper', 'dancer', 'dancer'])
})

test('the flag zombie shows the arm that holds its flag while it carries it, and its free arm once it has let it go', () => {
    const base = loadClientModule('zombies/ZombieView', {})
    const { FlagZombieView } = loadClientModule('zombies/FlagZombieView', { './ZombieView': base })
    const flagArm = { holding: ['Zombie_flaghand'], free: ['anim_innerarm1'], front: 'Zombie_innerarm_screendoor' }
    const view = Object.assign(Object.create(FlagZombieView.prototype), { presentation: { parts: { flagArm } } })
    const plain = Object.create(base.ZombieView.prototype)
    const walk = { body: { clip: 'walk', time: 0, rate: 12 } }, shown = (value: unknown) => JSON.parse(JSON.stringify(value))
    assert.deepEqual(shown(view.ownParts({ animations: { ...walk, flag: { clip: 'flag', time: 0, rate: 15 } } })), [[flagArm.free, false], [flagArm.holding, true]])
    assert.deepEqual(shown(view.ownParts({ animations: walk })), [[flagArm.free, true], [flagArm.holding, false]], 'Zombie::DropFlag')
    assert.deepEqual(shown(plain.ownParts({ animations: walk })), [])
})
