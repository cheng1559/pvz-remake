import assert from 'node:assert/strict'
import test from 'node:test'
import { loadScript } from '../loadScript'
import * as animationModule from '@/shared/content/animation'
import * as gameplayModule from '@/shared/content/gameplay'
import * as protocolModule from '@/shared/protocol'
import * as renderOrderModule from '@/shared/content/renderOrder'
import * as teamsModule from '@/shared/content/teams'
import { MOWER_INTRO_X, MOWER_READY_X } from '@/shared/content/gameplay'

/** A client module run with `modules` for its imports, the shared ones real and the rest empty. */
function load(path: string, modules: Record<string, unknown> = {}): Record<string, any> {
    const shared: Record<string, unknown> = {
        '@/shared/content/animation': animationModule, '@/shared/content/gameplay': gameplayModule,
        '@/shared/protocol': protocolModule, '@/shared/protocol/index': protocolModule,
        '@/shared/content/renderOrder': renderOrderModule, '@/shared/content/teams': teamsModule,
    }
    return loadScript(`assets/scripts/client/${path}.ts`, (id: string) => modules[id] ?? shared[id] ?? {})
}

const { animateCurve } = animationModule

class Node {
    isValid = true
    active = true
    angle = 0
    name = ''
    position = { x: 0, y: 0 }
    readonly children: Node[] = []
    component?: Player
    setPosition(x: number, y: number) { this.position = { x, y } }
    setScale() {}
    destroy() { this.isValid = false }
    addComponent(Type: new () => Player) { return this.component = Object.assign(new Type(), { node: this }) }
}
class Player {
    node!: Node
    playing = false
    fps = 0
    change() {}
    play(options: { fps: number }) { this.playing = true; this.fps = options.fps }
    pause() { this.playing = false }
}

const MOWER = 'pvz:lawnmower', ROW = 2, Y = 303
const content = {
    definitions: { projectiles: { [MOWER]: { hitbox: { x: 0, y: 0, width: 50, height: 80 } } } },
    presentation: { projectiles: { [MOWER]: { view: 'mowing', clips: { fly: { reanimId: MOWER, x: 6, y: -19, scale: 0.85, fps: 70, loop: true } }, plantShadow: { x: 36, y: 65 }, layer: 'lawnMower' } } },
}

/** A view of `path` (MowerView, MowingProjectileView) on a board whose intro has brought a row's mower `arrival` of its way on. */
async function projectileView(path: string, name: string, mower: object) {
    const ProjectileViewModule = load('projectiles/ProjectileView', {
        cc: { Sprite: { SizeMode: { RAW: 0 } } },
        '@/client/level/LevelStage': {
            boardToLayer: (x: number, y: number) => ({ x: x - 400, y: 300 - y }), plantShadow: async () => ({ originalSize: { width: 80, height: 30 } }),
        },
        '@/client/reanim/clips': load('reanim/clips', { './ReanimAssets': { prepareReanims: async () => {} } }),
        '@/client/reanim/ReanimPlayer': { ReanimPlayer: Player },
        '@/client/view/uiNode': { uiNode(options: any) {
            const node = options.node ?? new Node()
            node.name = options.name ?? node.name
            if (options.position) node.setPosition(options.position.x, options.position.y)
            options.parent?.children.push(node)
            return { node }
        } },
    })
    const View = load(path, { './ProjectileView': ProjectileViewModule, '../projectiles/ProjectileView': ProjectileViewModule })[name]
    const intro = { complete: false, arrival: 0, mowerArrival(row: number) { assert.equal(row, ROW); return this.arrival } }
    const stage = { layer: new Node(), content, intro }
    const node = new Node(), view = new View({ node, content, projectile: mower, stage })
    await view.initialize()
    return { view, node, stage, intro }
}

test("a row's mower waiting is rolled in by the intro's time and held where it waits, on the board's plant shadow", async () => {
    const ready = { entityId: 1, typeId: MOWER, x: MOWER_READY_X, y: Y, row: ROW }
    const { view, node, stage, intro } = await projectileView('mowers/MowerView', 'MowerView', ready)
    // One shadow, the board's plant shadow on the ground layer, as a running projectile's.
    assert.deepEqual(stage.layer.children.map(child => child.name), ['ProjectileShadow'])
    const shadow = stage.layer.children[0], animation = node.children.find(child => child.name === 'ProjectileAnimation')!
    view.sync(ready)
    assert.deepEqual([node.active, shadow.active], [false, false], 'nothing shows before the intro brings it on')
    assert.deepEqual([animation.position, animation.component!.playing], [{ x: -4, y: -19 }, false], 'held on its first frame where the cached frame is')
    // CutScene::UpdateIntro: CalcPosition(start, start + TimeLawnMowerDuration, -80, -21), at whole pixels.
    for (let tick = 0; tick <= 25; tick += 0.5) {
        intro.arrival = tick / 25
        view.sync(ready)
        const x = animateCurve(0, 25, tick, MOWER_INTRO_X, MOWER_READY_X, 'ease-in-out')
        assert.deepEqual([node.active, shadow.active, node.position.x], [tick > 0, tick > 0, x - 400], `tick ${tick}`)
        assert.equal(shadow.position.x, x + 36 - 400, 'its shadow under it')
    }
    assert.equal(node.position.y, 300 - Y)
    assert.deepEqual([animation.position, animation.component!.playing], [{ x: -4, y: -19 }, false], 'still held: set off, it is a projectile of its own')
    view.destroy()
    assert.equal(shadow.isValid, false)
})

test("a mowing projectile is drawn by its own view, running from the start where it runs", async () => {
    const fired = { entityId: 5, typeId: MOWER, x: 120, y: Y - 40, row: ROW, height: 40 }
    const { view, node, stage } = await projectileView('projectiles/MowingProjectileView', 'MowingProjectileView', fired)
    view.sync(fired)
    const animation = node.children.find(child => child.name === 'ProjectileAnimation')!
    assert.deepEqual([node.active, animation.position, animation.component!.playing, animation.component!.fps], [true, { x: 6, y: -19 }, true, 70])
    assert.equal(stage.layer.children[0].position.y, 300 - (Y - 40) - 65 - 40, 'its shadow on the ground under it')
})

test("the board makes a waiting mower's view by the mowers' registry, syncs it while it waits and draws it at the mower's layer", async () => {
    const node = { isValid: true, active: true, setPosition() {}, destroy() { this.isValid = false } }
    const { LevelEntityRenderer } = load('level/LevelEntityRenderer', {
        '@/client/view/uiNode': { uiNode: () => ({ node }) },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: { perfPlantsVisible: true, perfZombiesVisible: true } },
        './EntityFlashes': load('level/EntityFlashes'),
        './LevelStage': { boardToLayer: (x: number, y: number) => ({ x, y }) },
    })
    const made: any[] = [], synced: number[] = []
    let destroyed = 0
    const content = {
        levels: { levels: { 'test:level': { award: { id: 'pvz:sunflower' }, lawnMower: MOWER } } },
        presentation: { projectiles: { [MOWER]: { layer: 'lawnMower' } } },
        views: { events: { of: () => [] }, mowers: { async create(context: any) {
            made.push(context.projectile)
            return { sync(mower: { x: number }) { synced.push(mower.x) }, destroy() { destroyed++ } }
        } } },
    }
    const board = new LevelEntityRenderer(content, {}, {}, {}, { complete: true }, {})
    const orders: number[] = []
    board.syncLayerOrder = (snapshot: object) => { for (const entry of board.collectLayerEntries(snapshot)) orders.push(entry.order) }
    const mower = { entityId: 3, typeId: MOWER, x: MOWER_READY_X, y: Y, row: ROW }
    const frame = (mowers: object[]) => ({ levelId: 'test:level', plants: [], zombies: [], projectiles: [], items: [], mowers, cursor: { mode: 'none' } })
    board.sync(frame([mower]), { added: [3], removed: [] }, [])
    await board.creationTasks.get(3)
    board.sync(frame([mower]), { added: [], removed: [] }, [])
    assert.deepEqual([made, synced], [[mower], [MOWER_READY_X, MOWER_READY_X]], 'one view, made and synced as it waits')
    assert.ok(orders.includes(renderOrderModule.renderOrder('lawnMower', ROW)))
    board.sync(frame([]), { added: [], removed: [3] }, [])
    assert.deepEqual([destroyed, board.node(3)], [1, undefined], 'gone with its entity, as it sets off')
})

test('rolling sod starts one board-paused loop and stops it when the lawn is unrolled', () => {
    const calls: unknown[] = []
    const { LevelAudioPresenter } = load('level/LevelAudioPresenter', {
        '@/client/sound/SoundSystem': { SoundEffect: { DiggerZombie: 'digger' }, SoundSystem: {
            play: (id: string, options: { channel: string, loop: boolean, pauseWithGame: boolean }) =>
                calls.push([id, options.channel, options.loop, options.pauseWithGame]),
            stopChannel: (channel: string) => calls.push(channel),
        } },
    })
    const { AdventureIntro } = load('level/adventure/AdventureIntro')
    const intro = new AdventureIntro({}, {}, [], { rolls: [{}, {}] }, null, [], new Map(), {}, {}, {}, new LevelAudioPresenter({}))
    intro.sync = intro.startSodRoll = () => {}
    intro.update(5.99)
    assert.deepEqual(calls, [])
    intro.update(0.01)
    intro.update(1.99)
    assert.deepEqual(calls, [['digger', 'sodRoll', true, true]])
    intro.update(0.01)
    assert.equal(calls[1], 'sodRoll')
})

test("the intro brings each row's mower on as CutScene::UpdateIntro does: the higher rows later, after the sod and the graves", () => {
    const { AdventureIntro } = load('level/adventure/AdventureIntro')
    const intro = (rolls: number, graves: boolean) => {
        const made = new AdventureIntro({}, {}, [], { rolls: Array(rolls).fill({}), width: 0 }, null, [], new Map(), {}, {}, {}, {})
        made.graveTicks = graves ? 100 : 0
        return made
    }
    const plain = intro(0, false)
    // TimeLawnMowerStart: 6300 down to 6100 in steps of 50 for rows 0 to 4, over TimeLawnMowerDuration 250.
    for (const [row, start] of [[0, 630], [2, 620], [4, 610]]) {
        for (const [ticks, arrival] of [[start - 1, 0], [start, 0], [start + 12.5, 0.5], [start + 25, 1], [start + 40, 1]]) {
            plain.ticks = ticks
            assert.equal(plain.mowerArrival(row), arrival, `row ${row} at ${ticks}`)
        }
    }
    const later = intro(1, true)
    later.ticks = 620 + 200 + 100 + 12.5
    assert.equal(later.mowerArrival(2), 0.5, 'mSodTime and mGraveStoneTime delay it')
    later.ticks = later.endTick
    assert.equal(later.mowerArrival(0), 1, 'a complete intro has every one in place')
})

test("the street before an adventure level leaves out the zombie that leads the flag waves (CutScene::PlaceStreetZombies)", () => {
    const { adventurePreviewTypes } = load('level/adventure/AdventureIntro')
    const counts = { 'pvz:normal': 6, 'pvz:flag': 2, 'pvz:conehead': 2 }
    assert.deepEqual(JSON.parse(JSON.stringify(adventurePreviewTypes(counts, { flagWave: { zombie: 'pvz:flag' } }, 4))),
        ['pvz:normal', 'pvz:normal', 'pvz:normal', 'pvz:conehead'])
    assert.ok(adventurePreviewTypes(counts, { flagWave: { zombie: 'pvz:conehead' } }, 4).includes('pvz:flag'), 'whichever zombie the settings name')
})
