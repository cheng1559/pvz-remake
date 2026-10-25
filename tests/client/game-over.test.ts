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

test('failure pans the live board, plays each sound once, and waits eleven game seconds before the dialog', () => {
    class Node {
        active = true
        children: Node[] = []
        parent?: Node
        x = 0; y = 0; scale = 1
        constructor(public name = '') {}
        setPosition(x: number, y: number) { this.x = x; this.y = y }
        setScale(scale: number) { this.scale = scale }
        getSiblingIndex() { return this.parent?.children.indexOf(this) ?? 0 }
        setSiblingIndex(index: number) {
            if (!this.parent) return
            this.parent.children.splice(this.getSiblingIndex(), 1)
            this.parent.children.splice(index, 0, this)
        }
    }
    const sounds: string[] = []
    const modules = {
        cc: { Node, Sprite: { SizeMode: { RAW: 0 } }, Mask: { Type: { GRAPHICS_RECT: 0 } },
            Color: class { constructor(public r: number, public g: number, public b: number, public a: number) {} } },
        '@/client/view/GameScreenMath': { easeInOut, lerp },
        '@/client/sound/LegacySoundSystem': { SoundEffect: { LoseMusic: 'lose', Chomp: 'chomp', Scream: 'scream' },
            SoundLoader: { play: (sound: string) => sounds.push(sound), playFoley: (sound: string) => sounds.push(sound) } },
        '@/client/view/uiNode': { uiNode(options: any) {
            const node = new Node(options.name)
            if (options.parent) { node.parent = options.parent; node.parent!.children.push(node) }
            return { node, graphics: { clear() {}, fillRect() {}, fillColor: null } }
        } },
    }
    const { LevelGameOverPresenter } = load('LevelGameOverPresenter', modules)
    const board = new Node(), bank = new Node(), entities = new Node(), overlay = new Node()
    entities.parent = board; board.children.push(entities)
    let walkTicks = 0, visible = false, stops = 0
    const gameOver = new LevelGameOverPresenter(board, bank, entities, overlay, {
        syncGameOverWinner(_zombie: unknown, _parent: unknown, show: boolean, ticks: number) { walkTicks = ticks; visible = show },
    }, { stop() { stops++ } }, [{}, {}, {}], getBoardPresentation(presentationFixture, 'pvz:day').gameOver)
    gameOver.sync({ zombies: [{ entityId: 1, x: -100 }] }, [{ type: 'levelLost', data: { zombieId: 1 } }])
    const title = overlay.children.find(node => node.name === 'ZombiesWonTitle')!
    assert.equal(bank.active, false)
    assert.equal(title.active, false)
    assert.equal(visible, false)
    assert.equal(gameOver.update(1.5), false)
    assert.equal(board.x, 0)
    assert.equal(gameOver.update(1), false)
    assert.equal(board.x, 110)
    assert.equal(visible, true)
    assert.equal(walkTicks, 100)
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
    const { LevelView } = load('LevelView', modules)
    const view = Object.create(LevelView.prototype)
    view.entityRenderer = { sync() { board.setPosition(0, 0); walkTicks = 0; visible = false } }
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
    const data = JSON.parse(readFileSync('tools/generated/pvz-base/reanim/zombie_walk.json', 'utf8'))
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
})
