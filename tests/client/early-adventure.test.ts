import { readGameplaySource, readPresentationSource } from '../../tools/content_source'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { easeInOut, linearFloat } from '@/client/view/GameScreenMath'
import { parsePresentationDefinitions } from '@/shared/content/presentation'
import { parseReanim, sampleReanimTrack } from '@/shared/content/reanim'
import { levelAwardSize, seedBankExtraWidth } from '@/client/level/LevelGeometry'

const definitions = parsePresentationDefinitions(readPresentationSource())
function loadLevelModule(name: string, modules: Record<string, unknown>) {
    const exports: Record<string, any> = {}
    const code = transpileModule(readFileSync(`assets/scripts/client/level/${name}.ts`, 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    runInNewContext(code.outputText, { exports, require: (id: string) => modules[id] ?? {} })
    return exports
}

test('conveyor keyboard selection uses packet identity and respects page and dialog scopes', () => {
    const page = {}, modal: any = { activeModalRoot: page, isInputBlocked: false }
    const settings = { hotkeysEnabled: true }
    const { LevelInputPresenter } = loadLevelModule('LevelInputPresenter', {
        cc: { KeyCode: { SPACE: 32, ENTER: 13, DIGIT_0: 48, DIGIT_1: 49, KEY_D: 68, KEY_F: 70 } },
        '@/client/input/UIHoverManager': { UIHoverManager: modal },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: settings },
        '@/platform/Haptics': { Haptics: { play() {} } },
    })
    const commands: any[] = []
    const snapshot: any = { paused: false, phase: 'gameplay', result: 'playing', cursor: { mode: 'none' },
        seedPackets: [], conveyorPackets: [{ id: 17, seedId: 'nut' }] }
    const input = new LevelInputPresenter({ isChildOf: (node: unknown) => node === page },
        { render: () => snapshot, command: (command: unknown) => commands.push(command), update() {} },
        { introComplete: true, seedPacketAt: (_snapshot: unknown, index: number) => index === 0 ? {
            selected: snapshot.cursor.packetId === 17,
            cooldownRemaining: 0, canAfford: true, command: { type: 'selectConveyorPacket', packetId: 17 },
        } : undefined, audio: { seedPacketSelected() {}, plantingCancelled() {} } })
    input.enabled = true
    input.onKeyDown({ keyCode: 49 })
    assert.deepEqual({ ...commands.pop() }, { type: 'selectConveyorPacket', packetId: 17 })
    snapshot.cursor = { mode: 'seed', seedId: 'nut', packetId: 17 }
    input.onKeyDown({ keyCode: 49 })
    assert.equal(commands.pop().type, 'clearCursor')
    for (const command of [{ type: 'selectSeed', seedId: 'pea' }, { type: 'selectConveyorPacket', packetId: 18 }]) {
        snapshot.cursor = { mode: 'seed', seedId: 'nut', packetId: 17 }
        const previous = input.view.seedPacketAt
        input.view.seedPacketAt = () => ({ selected: false, availability: {}, command })
        input.onKeyDown({ keyCode: 50 })
        assert.deepEqual({ ...commands.pop() }, command, 'another slot replaces the held plant without clearing it first')
        assert.equal(commands.length, 0)
        input.view.seedPacketAt = previous
    }
    const shovel = { toolId: 'pvz:shovel', button: { node: { activeInHierarchy: true }, interactable: true } }
    input.toolButtons = [shovel]
    snapshot.cursor = { mode: 'none' }
    input.onKeyDown({ keyCode: 70 })
    assert.deepEqual({ ...commands.pop() }, { type: 'selectTool', toolId: 'pvz:shovel' })
    snapshot.cursor = { mode: 'tool', toolId: 'pvz:shovel' }
    input.onKeyDown({ keyCode: 70 })
    assert.equal(commands.pop().type, 'clearCursor')
    shovel.button.interactable = false
    input.onKeyDown({ keyCode: 70 })
    assert.equal(commands.length, 0, 'unavailable tools cannot be picked by keyboard')
    modal.activeModalRoot = {}
    input.onKeyDown({ keyCode: 49 })
    assert.equal(commands.length, 0, 'a dialog blocks board shortcuts, while the page itself does not')

    modal.activeModalRoot = page
    input.view.dialogReady = true
    settings.hotkeysEnabled = false
    input.onKeyDown({ keyCode: 32 })
    for (const keyCode of [32, 32, 13]) input.onKeyPressing({ keyCode })
    assert.deepEqual(commands.map(command => command.type), Array(4).fill('advanceDialog'),
        'holding Space or Enter advances Dave dialogue independently of the hotkeys switch')
    commands.length = 0
    modal.activeModalRoot = {}
    input.onKeyPressing({ keyCode: 32 })
    assert.equal(commands.length, 0, 'modal input still blocks repeated dialogue keys')
    modal.activeModalRoot = page
    input.view.dialogReady = false
    settings.hotkeysEnabled = true
    for (const keyCode of [32, 13, 49, 68, 70]) input.onKeyPressing({ keyCode })
    assert.equal(commands.length, 0, 'holding a key after dialogue must not repeat board shortcuts')
})

function introFixture(index: number) {
    const particles: any[] = []
    const module = { exports: {} as Record<string, any> }
    const code = transpileModule(readFileSync('assets/scripts/client/level/adventure/AdventureIntro.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    runInNewContext(code.outputText, { exports: module.exports, require: (id: string) => ({
        '@/client/view/uiNode': { uiNode: (args: any) => {
            const result = args.node ?? node()
            if (args.position) result.setPosition(args.position.x, args.position.y)
            if (args.size) Object.assign(result.transform, args.size)
            return { node: result, transform: result.transform }
        } },
        '@/client/view/GameScreenMath': { easeInOut, linearFloat },
        '@/core/Particle': { TodParticleSystem: { spawn: (value: any) => particles.push(value) } },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: { isMobileMode: () => false } },
    }[id] ?? {}) })
    const node = () => ({ isValid: true, active: true, position: { x: 0, y: 0 },
        transform: { height: 600, width: 0, setContentSize(width: number) { this.width = width } },
        setPosition(x: number, y: number) { this.position = { x, y } }, addComponent: () => ({}) })
    const board = node(), sod = node(), bank = node(), house = node(), readyNode = node()
    bank.transform.height = 87
    const sounds: string[] = []
    const ready = { node: readyNode, time: 0, seek(time: number) { this.time = time } }
    const layout = definitions.levels![`pvz:adventure-1-${index}`].intro
    const intro = new module.exports.AdventureIntro(board, sod, [], layout, ready, [], new Map(), definitions, bank, house,
        { origin: { y: 80 }, cell: { height: 100 } }, () => [],
        { sodRollStarted: () => sounds.push('sod'), readySetPlant: () => sounds.push('ready') }, {}, {}, {})
    return { intro, board, sod, bank, ready, sounds, particles, node, previewTypes: module.exports.adventurePreviewTypes }
}

test('preview zombie tooltips use their localized type, body bounds and chooser lifetime', () => {
    const { intro, node } = introFixture(8)
    const zombie = node(), surface = { activeInHierarchy: true }
    const tooltips: any[] = []
    const ui = { text: (key: string) => `localized:${key}`, tooltip: () => {
        const tooltip = { title: '', visible: false, show() { this.visible = true }, hide() { this.visible = false } }
        tooltips.push(tooltip)
        return tooltip
    } }
    const gameplay = readGameplaySource('definitions')
    intro.introZombies.push(zombie)
    intro.previewTypes.set(zombie, 'pvz:buckethead')
    intro.installPreviewTooltips(ui, surface, gameplay)
    const { hit } = intro.previewTooltips.get(zombie)
    assert.equal(tooltips[0].title, 'localized:BUCKETHEAD_ZOMBIE')
    assert.deepEqual([hit.position.x, hit.transform.width, hit.transform.height], [36, 42, 115])
    intro.sync()
    assert.equal(hit.active, false)
    intro.update(4.25, 425)
    assert.equal(hit.active, true)
    tooltips[0].show()
    intro.previewTypes.set(zombie, 'pvz:conehead')
    intro.syncPreviewTooltip(zombie)
    assert.equal(tooltips[0].title, 'localized:CONEHEAD_ZOMBIE')
    intro.update(0.01)
    assert.equal(hit.active, false)
    assert.equal(tooltips[0].visible, false)
})

test('shovel placement follows bank width and stays hidden during seed choice', () => {
    assert.equal(definitions.shovel.x + seedBankExtraWidth(6), 456)
    assert.equal(definitions.shovel.x + seedBankExtraWidth(10), 609)
    const { LevelBoardHud } = loadLevelModule('LevelBoardHud', {
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: { hotkeysEnabled: false } },
    })
    const hud = new LevelBoardHud({}, { presentation: definitions }, {})
    const bank = { active: true, setPosition() {} }
    hud.shovelBank = bank
    hud.shovelHotkey = { node: {} }
    hud.shovelButton = {}
    hud.shovel = {}
    hud.cursor = {}
    const frame = { result: 'playing', phase: 'intro', seedChooser: { choosing: true },
        extensions: { 'pvz:tools': { available: [] } }, tutorial: { step: 'complete' }, cursor: { mode: 'none' } }
    hud.update(0, 425)
    hud.sync(frame)
    assert.equal(bank.active, false)
    frame.seedChooser.choosing = false
    hud.update(0, 625)
    assert.equal(bank.active, false)
    frame.phase = 'gameplay'
    hud.sync(frame)
    assert.equal(bank.active, true)
})

test('1-3 keeps its three-row lawn and plays Ready Set Plant at 6.55s without rolling sod', () => {
    const { intro, sod, bank, ready, sounds, particles } = introFixture(3)
    intro.sync()
    assert.equal(sod.transform.width, 771)
    assert.equal(ready.node.active, false)
    assert.equal(intro.update(6.55), false)
    assert.deepEqual(sounds, ['ready'])
    assert.equal(bank.position.y, 0)
    assert.equal(ready.node.active, true)
    assert.equal(intro.update(1), false)
    assert.equal(ready.time, 1)
    assert.equal(intro.update(0.83), true)
    assert.equal(ready.node.active, false)
    assert.equal(particles.length, 0)
})

test('1-4 reveals the full lawn, places both sod effects correctly and restores its ready animation by intro time', async () => {
    const { intro, sod, bank, ready, sounds, particles } = introFixture(4)
    intro.sync()
    assert.equal(sod.transform.width, 0)
    assert.equal(intro.update(6), false)
    assert.deepEqual(particles.map(value => [value.x + 400, 300 - value.y]), [[32, 150], [32, 511]])
    intro.update(1)
    assert.equal(sod.transform.width, 773 / 2)
    assert.equal(bank.active, false)
    intro.update(1.55)
    assert.deepEqual(sounds, ['sod', 'ready'])
    assert.equal(bank.position.y, 0)
    assert.equal(ready.node.active, true)
    await intro.restore({ ticks: 900, previews: [] })
    assert.equal(ready.time, 0.45)
    assert.deepEqual(sounds, ['sod', 'ready'], 'restoring cannot repeat the start sound')
    assert.equal(intro.update(1.38), true)
    assert.equal(ready.node.active, false)
})

test('street previews include coneheads in wave proportions and exclude flag zombies', () => {
    const { previewTypes } = introFixture(3)
    const types = [...previewTypes({ 'pvz:normal': 16, 'pvz:conehead': 4, 'pvz:flag': 1 }, definitions)]
    assert.equal(types.filter(id => id === 'pvz:normal').length, 8)
    assert.equal(types.filter(id => id === 'pvz:conehead').length, 2)
    assert.equal(types.includes('pvz:flag'), false)
})

test('restoring a street preview keeps its saved zombie type when fresh random positions change the slot order', async () => {
    const { intro } = introFixture(3)
    const tracks = new Map<string, boolean>()
    const clips = definitions.zombies['pvz:conehead'].animations
    const player = { snapshot: () => ({ id: clips.idle.reanimId }), restore() {},
        setTrackPrefixVisible: (track: string, visible: boolean) => tracks.set(track, visible) }
    const node = { isValid: true, setPosition() {}, getChildByName: () => ({ getComponent: () => player }) }
    intro.introZombies.push(node)
    intro.previewTypes.set(node, 'pvz:normal')
    intro.animations.resolve = () => clips
    await intro.restore({ ticks: 100, previews: [{ slot: 0, typeId: 'pvz:conehead', x: 500, y: 200, z: 100,
        hasTongue: false, reanim: { id: clips.idle.reanimId } }] })
    assert.equal(intro.previewTypes.get(node), 'pvz:conehead')
    assert.equal(tracks.get('anim_cone'), true)
    assert.equal(tracks.get('anim_hair'), false)
})

test('Ready Set Plant preserves the original three separate sprite intervals', () => {
    const clip = parseReanim(JSON.parse(readFileSync('tools/generated/pvz-base/reanim/readysetplant.json', 'utf8')))
    for (const [time, expected] of [[0, 'pvz:startready'], [0.6, 'pvz:startset'], [1.2, 'pvz:startplant']] as const) {
        const visible = clip.tracks.map(track => sampleReanimTrack(track, time)).filter(frame => frame?.sprite && frame.alpha > 0)
        assert.deepEqual(visible.map(frame => frame!.sprite), [expected])
    }
})

test('the shovel reward uses its own dimensions while growing and moving to the original collection centre', () => {
    const module = { exports: {} as Record<string, any> }
    const code = transpileModule(readFileSync('assets/scripts/client/level/LevelEndPresenter.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    runInNewContext(code.outputText, { exports: module.exports, require: (id: string) => ({
        '@/client/view/uiNode': { uiNode: () => ({}) }, './LevelGeometry': { levelAwardSize },
        '@/client/view/ClientViewport': { fitViewport() {} },
    }[id] ?? {}) })
    const levels = readGameplaySource('levels')
    let position: number[] = [], scale: number[] = []
    const image = { setScale: (...value: number[]) => { scale = value } }
    const node = { setPosition: (...value: number[]) => { position = value },
        getChildByName: (name: string) => name === 'AwardImage' ? image : null, getComponentsInChildren: () => [] }
    const presenter = new module.exports.LevelEndPresenter({ levels }, {}, {}, {}, () => node, {}, {})
    presenter.ticks = 400
    assert.equal(presenter.syncAward({ entityId: 1, typeId: 'pvz:shovel', x: 100, y: 300,
        scale: 1, alpha: 255, state: 'collecting' }, 'pvz:adventure-1-4'), true)
    assert.deepEqual(position, [400, -200])
    assert.deepEqual(scale, [2, 2, 1])
})

test('the note fades in place over 15 ticks and ends with a 500-tick black fade; seed rewards keep their white fade', () => {
    class Color { constructor(public r: number, public g: number, public b: number, public a: number) {} }
    class Graphics {}
    class UITransform {}
    let opacity = 255, lightFills = 0
    let redraw: () => void = () => {}
    const { LevelEndPresenter } = loadLevelModule('LevelEndPresenter', {
        cc: { Color, Graphics, UITransform }, './LevelGeometry': { levelAwardSize },
        '@/client/view/ClientViewport': { fitViewport(_node: unknown, onResize: () => void) { redraw = onResize } },
        '@/client/view/uiNode': { uiNode: (value: any) => { opacity = value.opacity; return {} } },
    })
    for (const [index, duration, color] of [[9, 500, 0], [8, 600, 255]]) {
        let rectangle: number[] = []
        const graphics = { clear() {}, fillRect(...bounds: number[]) { rectangle = bounds }, fillColor: null as any }
        const contentSize = { width: 800, height: 600 }
        const fade = { active: false, getComponent: (type: unknown) => type === Graphics ? graphics : { contentSize } }
        const node = { setPosition() {}, getChildByName: () => null, getComponentsInChildren: () => [] }
        const levels = readGameplaySource('levels')
        const presenter = new LevelEndPresenter({ levels }, {}, {}, fade, () => node, { lightFill: () => lightFills++ }, {})
        const levelId = `pvz:adventure-1-${index}`
        presenter.sync({ levelId, result: 'won' }, [])
        assert.equal(presenter.update(0.15), false)
        presenter.syncAward({ entityId: 1, typeId: levels.levels[levelId].award.id, x: 100, y: 300,
            scale: 1, alpha: 255, state: 'collecting' }, levelId)
        assert.equal(opacity, index === 9 ? 0 : 255)
        assert.equal(presenter.update((duration - 115) / 100), false)
        assert.equal(graphics.fillColor.r, color)
        assert.ok(Math.abs(graphics.fillColor.a - 127.5) <= 0.5)
        // Resizing while the game clock is frozen must redraw the entire visible region.
        const alpha = graphics.fillColor.a
        for (const width of [800, 600 * 16 / 9, 1400, 600 * 32 / 9]) {
            contentSize.width = width
            redraw()
            assert.deepEqual(rectangle, [-width / 2, -300, width, 600])
            assert.equal(graphics.fillColor.a, alpha)
            assert.equal(graphics.fillColor.r, color)
        }
        assert.equal(presenter.update(1), true)
        assert.equal(graphics.fillColor.a, 255)
    }
    assert.equal(lightFills, 1, 'only a normal reward plays the light-fill sound')
})

test('the 1-9 award composes the original note images and heading without a seed card or description', async () => {
    const calls: any[] = []
    const award = { kind: 'note', id: 'pvz:zombie-note-1', titleKey: 'FOUND_NOTE', nextLevelId: 'pvz:adventure-1-10', showMainMenu: true }
    const exports: Record<string, any> = {}
    const code = transpileModule(readFileSync('assets/scripts/client/screens/AwardScreen.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    runInNewContext(code.outputText, { exports, require: (id: string) => ({
        cc: { Color: class {} }, '@/client/api/MenuApi': { menuApi: { getAward: async () => award } },
        '@/core/SpriteLoader': { SpriteLoader: { load: async (id: string) => ({ id }) } },
    }[id] ?? {}) })
    const parent = { isValid: true }
    const ui = { assets: { presentation: definitions }, text: (key: string) => key,
        image: (_parent: unknown, frame: any, box: unknown) => calls.push({ id: frame.id, box }),
        label: (_parent: unknown, options: any) => calls.push(options) }
    assert.equal(await exports.showAwardScreen(parent, ui), award)
    assert.deepEqual(calls.slice(0, 3).map(call => [call.id, call.box.x, call.box.y]),
        [['background1', -700, -300], ['zombienote', 80, 80], ['zombie_note1', 131, 132]])
    assert.deepEqual([calls[3].text, calls[3].x, calls[3].y], ['FOUND_NOTE', 400, 70])
    assert.equal(calls.length, 4)
})
