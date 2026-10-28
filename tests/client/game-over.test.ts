import { readBaseContent } from '../../tools/mod/content'
import { presentationFixture } from './presentationFixture'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { getBoardPresentation } from '@/client/level/boards/definitions'
import { easeInOut, lerp } from '@/client/view/GameScreenMath'
import { sampleReanimTrack } from '@/shared/content/reanim'

function load(file: string, modules: Record<string, unknown>) {
    const module = { exports: {} as Record<string, any> }
    const code = transpileModule(readFileSync(`assets/scripts/client/level/${file}.ts`, 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    runInNewContext(code.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {} })
    return module.exports
}

for (const startX of [-100, -150, -200]) test(`failure from x=${startX} approaches in front of the door and preserves the eleven-second timeline`, () => {
    class Node {
        active = true
        children: Node[] = []
        parent?: Node
        x = 0; y = 0; scale = 1
        width = 800; height = 600
        constructor(public name = '') {}
        setPosition(x: number, y: number) { this.x = x; this.y = y }
        setScale(scale: number) { this.scale = scale }
        getComponent() { return this }
        getSiblingIndex() { return this.parent?.children.indexOf(this) ?? 0 }
        setSiblingIndex(index: number) {
            if (!this.parent) return
            this.parent.children.splice(this.getSiblingIndex(), 1)
            this.parent.children.splice(index, 0, this)
        }
    }
    const sounds: string[] = []
    const fills: number[][] = []
    let resize!: (width: number, height: number) => void
    const modules = {
        cc: { Node, UITransform: class {}, Sprite: { SizeMode: { RAW: 0 } }, Mask: { Type: { GRAPHICS_RECT: 0 } },
            Color: class { constructor(public r: number, public g: number, public b: number, public a: number) {} } },
        '@/client/view/GameScreenMath': { easeInOut, lerp },
        '@/client/view/ClientViewport': { fitViewport(node: Node, redraw: () => void) {
            resize = (width, height) => { node.width = width; node.height = height; redraw() }
            resize(800, 600)
        } },
        '@/client/sound/SoundSystem': { SoundEffect: { LoseMusic: 'lose', Chomp: 'chomp', Scream: 'scream' },
            SoundSystem: { play: (sound: string) => sounds.push(sound), playFoley: (sound: string) => sounds.push(sound) } },
        '@/client/view/uiNode': { uiNode(options: any) {
            const node = new Node(options.name)
            if (options.parent) { node.parent = options.parent; node.parent!.children.push(node) }
            return { node, graphics: { node, clear() {}, fillRect(...rect: number[]) { fills.push(rect) }, fillColor: null } }
        } },
    }
    const { LevelGameOverPresenter } = load('LevelGameOverPresenter', modules)
    const board = new Node(), bank = new Node(), entities = new Node(), overlay = new Node()
    entities.parent = board; board.children.push(entities)
    let walkTicks = 0, approachTicks = 0, winnerX = 0, winnerY = 0, visible = false, stops = 0
    let winnerParent: Node | undefined
    const gameOver = new LevelGameOverPresenter(board, bank, entities, overlay, {
        syncGameOverWinner(zombie: { x: number }, parent: Node, show: boolean, ticks: number, y: number, approach: number) {
            walkTicks = ticks; visible = show; winnerX = zombie.x; winnerY = y; approachTicks = approach; winnerParent = parent
        },
    }, { stop() { stops++ } }, [{}, {}, {}], getBoardPresentation(presentationFixture, 'pvz:day').gameOver)
    const winner = { entityId: 1, x: startX, y: 90 }
    gameOver.sync({ zombies: [winner] }, [{ type: 'levelLost', data: { zombieId: 1 } }])
    const title = overlay.children.find(node => node.name === 'ZombiesWonTitle')!
    assert.equal(bank.active, false)
    assert.equal(title.active, false)
    assert.equal(visible, true, 'the winner remains visible at its original row instead of disappearing')
    assert.equal(winnerParent, entities, 'the approach is outside the doorway mask')
    assert.ok(entities.getSiblingIndex() > board.children.find(node => node.name === 'GameOverDoorMask')!.getSiblingIndex())
    assert.equal(winnerX, startX, 'the approach starts at the authoritative loss position')
    assert.equal(winnerY, 90)
    gameOver.update(0.75)
    assert.equal(winnerY, 190, 'the winner walks toward the doorway before the camera pan')
    assert.equal(walkTicks, 0, 'entry behind the doorway waits until the approach finishes')
    assert.equal(approachTicks, 75)
    assert.equal(winnerParent, entities, 'late loss thresholds do not put the approach behind the frame')
    assert.equal(winnerX, Math.round((startX + Math.max(startX, -123)) / 2))
    assert.equal(gameOver.update(0.75), false)
    assert.equal(winnerY, 290)
    assert.equal(approachTicks, 150)
    assert.equal(winnerParent, board.children.find(node => node.name === 'GameOverWinner'))
    assert.equal(winnerX, Math.max(startX, -123), 'entry starts at the clipping edge instead of already behind the door')
    assert.equal(winner.x, startX, 'presentation must not rewrite the authoritative loss position')
    assert.equal(board.x, 0)
    assert.equal(gameOver.update(1), false)
    assert.equal(board.x, 110)
    assert.equal(visible, true)
    assert.equal(walkTicks, 100)
    assert.equal(approachTicks, 150, 'the walking phase continues from the end of the approach')
    gameOver.update(1)
    assert.equal(board.x, 220)
    gameOver.update(1.6)
    assert.deepEqual(sounds, ['lose', 'chomp'])
    gameOver.update(0)
    assert.deepEqual(sounds, ['lose', 'chomp'], 'a stopped global clock does not replay timeline events')
    gameOver.update(0.5)
    gameOver.update(0.4)
    assert.equal(title.active, true)
    assert.deepEqual(sounds, ['lose', 'chomp', 'chomp', 'scream'])
    assert.equal(gameOver.update(4.99), false)
    assert.equal(gameOver.update(0.01), true)
    assert.equal(title.active, false)
    assert.deepEqual(fills.at(-1), [-400, -300, 800, 600])
    const titlePosition = [title.x, title.y, title.scale]
    for (const [width, height] of [[1400, 600], [600 * 32 / 9, 600], [800, 600]]) {
        resize(width, height)
        assert.deepEqual(fills.at(-1), [-width / 2, -height / 2, width, height], 'the death cover follows viewport changes even after the cutscene ends')
        assert.deepEqual([title.x, title.y, title.scale], titlePosition, 'resizing the cover preserves the original title animation coordinates')
    }
    const { LevelView } = load('LevelView', modules)
    const view = Object.create(LevelView.prototype)
    view.entityRenderer = { setFrameDelta() {}, sync() { board.setPosition(0, 0); walkTicks = 0; visible = false } }
    view.end = { sync() {}, cancelWarnings() {} }
    view.hud = { sync() {} }
    view.audio = { play() {} }
    view.intro = { complete: true }
    view.setPaused = view.syncHitboxes = view.syncSeedChooserIntro = view.hideConveyorBank = () => {}
    view.gameOver = gameOver
    view.sync({ result: 'lost', paused: true, items: [] }, { added: [], removed: [] }, [])
    assert.equal(board.x, 220, 'opening the dialog preserves the final camera position')
    assert.equal(walkTicks, 950, 'pause synchronization reapplies the final house-entry pose')
    assert.equal(visible, true)
    assert.equal(title.active, false)
    assert.deepEqual(sounds, ['lose', 'chomp', 'chomp', 'scream'])
    assert.equal(stops, 1)
})

test('the winning zombie walks with the original ground track while the authoritative world stays frozen', () => {
    const data = JSON.parse(readFileSync(`mods/pvz-base/${readBaseContent().resources.reanim['pvz:zombie_walk']}`, 'utf8'))
    const ground = data.tracks.find((track: any) => track.id === '_ground')
    const duration = ground.keyframes.at(-1).timeSeconds
    const { ZombieView } = load('../zombies/ZombieView', {})
    const view = Object.create(ZombieView.prototype)
    let x = 0, y = 0, time = 0
    view.node = { setPosition(nextX: number, nextY: number) { x = nextX; y = nextY; this.position = { x, y } } }
    view.shadowNode = { setPosition() {} }
    view.presentation = presentationFixture.zombies['pvz:normal']
    view.animations = { resolve: () => ({ walk: { rateScale: 1 } }) }
    view.player = { lastFrameTimeSeconds: duration, sampleTrack: (_id: string, t: number) => sampleReanimTrack(ground, t), seek(t: number) { time = t } }
    const zombie = { x: -100, animation: 'anim_walk', animationTime: 0, animationSpeed: 1 }
    view.syncGameOverWalk(zombie, duration * 100, 290)
    assert.equal(x, -500 - (ground.keyframes.at(-1).x - ground.keyframes[0].x))
    assert.equal(y, 10, 'all winners enter the house at the original y=290')
    assert.ok(Math.abs(time) < 1e-10)
    assert.equal(zombie.x, -100, 'game-over motion belongs to presentation')
    const from = { ...zombie, y: 90, animationTime: 7 }
    view.syncGameOverWalk(from, 0, 90, 0)
    assert.equal(x, -500)
    assert.equal(y, 210)
    view.syncGameOverWalk(from, 0, 190, 75)
    const approachTime = (7 / 12 + 0.75) % duration
    assert.equal(x, -500, 'the approach stays outside the doorway clipping boundary')
    assert.equal(y, 110)
    assert.ok(Math.abs(time - approachTime) < 1e-10, 'the walk cycle advances while approaching the door')
    view.syncGameOverWalk(from, 0, 290, 150)
    const entryTime = time
    assert.equal(x, -500)
    view.syncGameOverWalk(from, 0.01, 290, 150)
    assert.ok(Math.abs(x + 500) < 1, 'the first entry frame continues from the approach without jumping')
    assert.ok(Math.abs(time - entryTime) < 0.001)
    assert.equal(from.y, 90, 'the approach must not mutate the authoritative zombie row')
})
