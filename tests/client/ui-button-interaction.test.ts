import { presentationFixture } from './presentationFixture'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import * as plantDefinitions from '@/client/plants/definitions'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

// Exercise the real button/hover code with ordered capture/target events, without rendering Cocos.
function setup() {
    type Listener = { callback: Function, context: unknown, capture: boolean }
    class Vec {
        constructor(public x = 0, public y = 0, public z = 0) {}
        clone() { return new Vec(this.x, this.y, this.z) }
        set(x: number, y: number, z = 0) { this.x = x; this.y = y; this.z = z; return this }
    }
    class MouseEvent { static BUTTON_LEFT = 0; static BUTTON_RIGHT = 2 }
    class TouchEvent {}
    class Color {
        constructor(public r: number, public g: number, public b: number, public a = 255) {}
    }
    const events = Object.fromEntries(['MOUSE_DOWN', 'MOUSE_MOVE', 'MOUSE_UP', 'MOUSE_ENTER', 'MOUSE_LEAVE',
        'TOUCH_START', 'TOUCH_MOVE', 'TOUCH_END', 'TOUCH_CANCEL', 'NODE_DESTROYED'].map(name => [name, name.toLowerCase().replace('_', '-')]))
    class Transform {
        anchorX = 0; anchorY = 1; width = 100; height = 50
        constructor(private node: FakeNode) {}
        hitTest(point: Vec) { return point.x >= this.node.x && point.x <= this.node.x + 100 && point.y >= 0 && point.y <= 50 }
        convertToNodeSpaceAR(point: Vec, out: Vec) { return out.set(point.x - this.node.x, -point.y) }
    }
    class FakeNode {
        static EventType = events
        listeners = new Map<string, Listener[]>()
        children: FakeNode[] = []
        parent: FakeNode | null = null
        active = true; isValid = true; layer = 1
        transform: Transform | null = new Transform(this)
        renderScene = { cameras: [{ visibility: 1, systemWindowId: 0, screenToWorld() {} }] }
        constructor(public x = 0) {}
        setPosition(x: number, _y: number) { this.x = x }
        get activeInHierarchy(): boolean { return this.active && (!this.parent || this.parent.activeInHierarchy) }
        get scene(): FakeNode { return this.parent?.scene ?? this }
        addChild(node: FakeNode) { this.children.push(node); node.parent = this }
        isChildOf(node: FakeNode): boolean { return this.parent === node || !!this.parent?.isChildOf(node) }
        getSiblingIndex() { return this.parent?.children.indexOf(this) ?? 0 }
        setSiblingIndex(index: number) {
            if (!this.parent) return
            const siblings = this.parent.children
            siblings.splice(siblings.indexOf(this), 1)
            siblings.splice(index, 0, this)
        }
        getComponent() { return this.transform }
        addComponent(Type: any) {
            const component = new Type()
            component.node = this
            component.onEnable?.()
            buttons.push(component)
            return component
        }
        on(type: string, callback: Function, context?: unknown, capture = false) {
            assert.ok(this.transform, 'UI pointer listeners require UITransform; Scene cannot be a capture target')
            const listeners = this.listeners.get(type) ?? []
            listeners.push({ callback, context, capture }); this.listeners.set(type, listeners)
        }
        off(type: string, callback: Function, context?: unknown, capture = false) {
            this.listeners.set(type, (this.listeners.get(type) ?? []).filter(item =>
                item.callback !== callback || item.context !== context || item.capture !== capture))
        }
        once(type: string, callback: Function) {
            const listener = (...args: unknown[]) => { this.off(type, listener); callback(...args) }
            this.on(type, listener)
        }
        emit(type: string, ...args: unknown[]) {
            for (const item of [...this.listeners.get(type) ?? []]) if (!item.capture) item.callback.apply(item.context, args)
        }
    }
    let mobile = false, cursor = 'default'
    const cursorHistory: string[] = [], haptics: string[] = []
    const modules: Record<string, any> = {
        cc: {
            Component: class { enabledInHierarchy = true }, _decorator: { ccclass: () => (value: unknown) => value },
            Button: { EventType: { CLICK: 'click' } }, EventMouse: MouseEvent, EventTouch: TouchEvent, Color,
            Node: FakeNode, Vec3: Vec, UITransform: Transform, Input: { EventType: events }, input: new FakeNode(),
        },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: { isMobileMode: () => mobile } },
        '@/platform/Haptics': { Haptics: { play: (style = 'light') => haptics.push(style) } },
        './CursorManager': { CursorManager: { set: (value: string) => { cursor = value; cursorHistory.push(value) } } },
    }
    const load = (file: string) => {
        const module = { exports: {} as Record<string, any> }
        const compiled = transpileModule(readFileSync(file, 'utf8'), {
            compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
        })
        runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {} })
        return module.exports
    }
    const hover = load('assets/scripts/client/input/UIHoverManager.ts').UIHoverManager
    modules['@/client/input/UIHoverManager'] = { UIHoverManager: hover }
    const Button = load('assets/scripts/client/ui/UIButton.ts').UIButton
    modules['@/client/ui/UIButton'] = { UIButton: Button }
    modules['./LevelGeometry'] = load('assets/scripts/client/level/LevelGeometry.ts')
    modules['@/client/plants/definitions'] = plantDefinitions
    modules['@/client/hud/SeedPacketView'] = { SeedPacketView: class {
        node: FakeNode; options: unknown
        replacement?: { seedType: string, cost: number }
        constructor(options: any) { this.node = new FakeNode(options.x); options.parent.addChild(this.node) }
        setSeed(seedType: string, cost: number) { this.replacement = { seedType, cost } }
        sync(options: unknown) { this.options = options }
    } }
    modules['./LevelSeedBank'] = load('assets/scripts/client/level/LevelSeedBank.ts')
    const scene = new FakeNode(), root = new FakeNode()
    scene.transform = null
    scene.addChild(root)
    hover.start(root)
    const buttons: any[] = []
    const makeButton = (x: number, parent = root) => {
        const button = new Button(), node = new FakeNode(x)
        parent.addChild(node); button.node = node
        button.releaseToNormalOnPressOut = true
        let presses = 0, clicks = 0, enters = 0, state = 'normal'
        button.onPress = () => { presses++ }
        button.onHoverEnter = () => { enters++ }
        button.onStateChange = (value: string) => { state = value }
        node.on('click', () => { clicks++ })
        button.onEnable(); buttons.push(button)
        return { button, node, get presses() { return presses }, get clicks() { return clicks },
            get enters() { return enters }, get state() { return state } }
    }
    const dispatch = (target: FakeNode | null, type: string, x: number, key = 0, touchId = 1, y = 20) => {
        const event = Object.assign(type.startsWith('mouse') ? new MouseEvent() : new TouchEvent(), {
            type, windowId: 0, propagationStopped: false, getLocation: () => new Vec(x, y), getUILocation: () => new Vec(x, y), getButton: () => key,
            touch: { getID: () => touchId, getLocation: () => new Vec(x, y) },
        })
        if (!target) { modules.cc.input.emit(type, event); return }
        const path: FakeNode[] = []
        for (let node: FakeNode | null = target; node; node = node.parent) path.unshift(node)
        for (const node of path) for (const item of [...node.listeners.get(type) ?? []]) {
            if (item.capture) item.callback.call(item.context, event)
            if (event.propagationStopped) return
        }
        target.emit(type, event)
    }
    return { root, hover, makeButton, dispatch, events, load, Node: FakeNode, cursorHistory, haptics, get cursor() { return cursor }, setMobile(value = true) { mobile = value },
        cleanup() { for (const button of buttons) { button.enabledInHierarchy = false; button.onDisable() } hover.stop() } }
}

test('button haptics follow hover entry, including touch drag re-entry, without repeating on press or release', () => {
    const ui = setup(), e = ui.events, { node, button } = ui.makeButton(0)
    try {
        ui.dispatch(node, e.MOUSE_MOVE, 20)
        assert.deepEqual(ui.haptics, ['light'])
        ui.dispatch(node, e.MOUSE_DOWN, 20)
        ui.dispatch(node, e.MOUSE_UP, 20)
        ui.dispatch(node, e.MOUSE_MOVE, 30)
        assert.equal(ui.haptics.length, 1, 'pressing and releasing inside keeps the same hover')
        ui.dispatch(node, e.MOUSE_MOVE, 150)
        ui.dispatch(node, e.MOUSE_MOVE, 20)
        assert.equal(ui.haptics.length, 2)
        ui.setMobile()
        ui.hover.clearHoverStates()
        ui.haptics.length = 0
        ui.dispatch(node, e.TOUCH_START, 20)
        ui.dispatch(node, e.TOUCH_MOVE, 30)
        ui.dispatch(node, e.TOUCH_MOVE, 150)
        ui.dispatch(node, e.TOUCH_MOVE, 30)
        ui.dispatch(node, e.TOUCH_END, 30)
        assert.deepEqual(ui.haptics, ['light', 'light'])
        button.pressOnly = true
        ui.dispatch(node, e.TOUCH_START, 20)
        ui.dispatch(node, e.TOUCH_END, 20)
        assert.equal(ui.haptics.length, 3)
        button.interactable = false
        ui.dispatch(node, e.TOUCH_START, 20)
        ui.dispatch(node, e.TOUCH_END, 20)
        ui.dispatch(node, e.MOUSE_MOVE, 20)
        assert.equal(ui.haptics.length, 3)
        button.hapticsEnabled = false
        button.interactable = true
        ui.dispatch(node, e.TOUCH_START, 20)
        ui.dispatch(node, e.TOUCH_MOVE, 150)
        ui.dispatch(node, e.TOUCH_MOVE, 20)
        ui.dispatch(node, e.TOUCH_END, 20)
        assert.equal(ui.haptics.length, 3, 'game controls can mute hover feedback without changing other buttons')
    } finally { ui.cleanup() }
})

test('board hover shares cursor ownership with UI and never flashes default while moving over a ready seed packet', () => {
    const ui = setup(), e = ui.events
    const packetNode = new ui.Node()
    ui.root.addChild(packetNode)
    const { LevelHudPresenter } = ui.load('assets/scripts/client/level/LevelHudPresenter.ts')
    let packetStarted = false
    const packet = { node: packetNode, rect: () => ({ x: 0, y: 0, width: 50, height: 70 }),
        sync(options: { gameStarted: boolean }) { packetStarted = options.gameStarted } }
    const content = { definitions: { seeds: { pea: { sunCost: 100 } }, items: { sun: { width: 60, height: 60 } } }, presentation: presentationFixture }
    const { LevelSeedBank } = ui.load('assets/scripts/client/level/LevelSeedBank.ts')
    const seedBank = Object.create(LevelSeedBank.prototype)
    const tooltip = { visible: false, warning: '', show() { this.visible = true }, hide() { this.visible = false } }
    seedBank.options = { content, level: {}, presentation: {}, ui: { text: (key: string) => key } }
    seedBank.packets = [{ seedId: 'pea', view: packet, tooltip }]
    const hud = new LevelHudPresenter(content, ui.root, new ui.Node(), ...Array(4), seedBank)
    hud.presentation = { seedGuideSteps: [], lawnGuideSteps: [] }
    hud.level = { seedPackets: ['pea'] }
    hud.tutorialLawnFlash = new ui.Node()
    hud.syncSeedTutorialArrow = () => {}
    let selections = 0
    const [button] = hud.bindSeedPackets(() => { selections++ })
    const world = {
        phase: 'gameplay', result: 'playing', paused: false, availableSun: 100, cursor: { mode: 'none' }, tutorial: { step: 'complete' }, extensions: {},
        seedPackets: [{ seedId: 'pea', ready: true, availability: {} as any }], items: [] as any[],
    }
    button.canInteract = () => world.cursor.mode !== 'seed'
    hud.lastSnapshot = world
    const sync = () => { hud.syncSeedPacket(world, [], true, false); ui.hover.refreshHoverStates() }
    const move = (x: number) => { ui.dispatch(ui.root, e.MOUSE_MOVE, x); hud.setPointer({ x, y: 20 }) }
    try {
        hud.cursorPreview = new ui.Node()
        hud.gridPreview = new ui.Node()
        hud.advice = { restore() {}, snapshot: () => null }
        hud.syncSun = hud.syncProgress = hud.syncPreviews = () => {}
        const menu = ui.makeButton(200)
        hud.menuButton = menu.button
        const saved = hud.snapshot()
        world.paused = true
        for (const introComplete of [false, true]) {
            hud.restore(saved.hud, saved.advice, introComplete)
            assert.equal(menu.node.active, introComplete, 'restoring a completed intro shows Menu behind the continue prompt')
        }
        assert.equal(packetStarted, true, 'the continue prompt draws the restored seed packet as started')
        assert.equal(button.interactable, false, 'restoring visuals does not bypass the pause input gate')
        world.paused = false
        sync()
        move(20)
        assert.equal(ui.cursor, 'pointer')
        assert.equal(tooltip.visible, true)
        assert.equal(tooltip.warning, '')
        ui.cursorHistory.length = 0
        for (let x = 21; x < 45; x++) move(x)
        assert.ok(ui.cursorHistory.length > 0)
        assert.ok(ui.cursorHistory.every(style => style === 'pointer'), 'mouse events and frame refreshes must agree on the cursor')
        for (const unavailable of ['cooldown', 'sun', 'selected', 'paused']) {
            world.seedPackets[0].ready = unavailable !== 'cooldown'
            world.availableSun = unavailable === 'sun' ? 0 : 100
            world.seedPackets[0].availability = unavailable === 'cooldown' ? { reason: 'seed-not-ready', warningKey: 'WAITING_FOR_SEED' } : unavailable === 'sun' ? { reason: 'not-enough-sun', warningKey: 'NOT_ENOUGH_SUN' } : {}
            world.cursor.mode = unavailable === 'selected' ? 'seed' : 'none'
            world.paused = unavailable === 'paused'
            sync()
            assert.equal(ui.cursor, 'default', unavailable)
            assert.equal(tooltip.visible, unavailable === 'cooldown' || unavailable === 'sun', unavailable)
            assert.equal(tooltip.warning, unavailable === 'cooldown' ? 'WAITING_FOR_SEED' : unavailable === 'sun' ? 'NOT_ENOUGH_SUN' : '')
            if (unavailable === 'cooldown') {
                world.availableSun = 0
                sync()
                assert.equal(tooltip.warning, 'WAITING_FOR_SEED', 'recharging takes priority over insufficient sun without moving the pointer')
            }
            if (unavailable === 'sun') {
                ui.dispatch(packetNode, e.MOUSE_DOWN, 20)
                ui.dispatch(packetNode, e.MOUSE_UP, 20)
                assert.equal(selections, 1, 'unavailable packets still reach the gameplay validation/feedback')
            }
        }
        world.paused = false
        sync()
        ui.dispatch(packetNode, e.MOUSE_DOWN, 20, 2)
        ui.dispatch(packetNode, e.MOUSE_UP, 20, 2)
        assert.equal(selections, 1, 'right clicks remain available for cancelling planting')
        world.items = [{ typeId: 'sun', x: 300, y: 0, state: 'idle' }]
        move(310)
        assert.equal(ui.cursor, 'pointer', 'collectible items share the same cursor owner')
        ui.dispatch(menu.node, e.MOUSE_DOWN, 220)
        move(20)
        assert.equal(ui.cursor, 'default', 'a captured UI drag suppresses board hover')
        ui.dispatch(ui.root, e.MOUSE_UP, 20)
        assert.equal(ui.cursor, 'pointer')
        const modal = new ui.Node()
        ui.root.addChild(modal)
        ui.hover.beginModalBlock(modal)
        move(25)
        assert.equal(ui.cursor, 'default')
        assert.equal(tooltip.visible, false)
        ui.hover.endModalBlock(modal)
        assert.equal(ui.cursor, 'pointer')
        assert.equal(tooltip.visible, true)
        move(310)
        assert.equal(tooltip.visible, false)
        hud.resetCursor()
        assert.equal(ui.cursor, 'default')
        move(20)
        packetNode.active = false
        ui.hover.refreshHoverStates()
        assert.equal(ui.cursor, 'default', 'hidden boards cannot claim the cursor')
        packetNode.active = true
        ui.hover.refreshHoverStates()
        assert.equal(ui.cursor, 'pointer')
        ui.setMobile()
        ui.dispatch(packetNode, e.TOUCH_START, 20)
        assert.equal(selections, 2, 'mobile seed selection still happens on touch start')
        ui.dispatch(packetNode, e.TOUCH_END, 20)
        assert.equal(selections, 2)
        ui.setMobile(false)
        button.enabledInHierarchy = false
        button.onDisable()
        packetNode.emit(e.NODE_DESTROYED)
        ui.hover.refreshHoverStates()
        assert.equal(ui.cursor, 'default', 'destroyed HUDs unregister their hover client')
    } finally { packetNode.emit(e.NODE_DESTROYED); ui.cleanup() }
})

test('seed input disables its UI button while suspended and cannot submit after destruction', () => {
    const ui = setup()
    const { LevelInputPresenter } = ui.load('assets/scripts/client/level/LevelInputPresenter.ts')
    const button = { isValid: true, enabled: true, hapticsEnabled: true }
    const menuButton = { isValid: true, enabled: true, hapticsEnabled: true }
    let press!: () => void
    let openMenu!: () => void
    let cursor = 'none', menus = 0
    const commands: string[] = []
    const input = new LevelInputPresenter(ui.root, {
        definitions: { seeds: { 'pvz:peashooter': { sunCost: 100 } } },
        render: () => ({ phase: 'gameplay', result: 'playing', cursor: { mode: cursor }, availableSun: 100, extensions: {},
            seedPackets: [{ seedId: 'pvz:peashooter', cooldownRemaining: 0, availability: {} }] }),
        command: (value: { type: string }) => { commands.push(value.type) },
    }, {
        introComplete: true, canOpenMenu: true, bindTools() { return [] }, board: { origin: { x: 40, y: 80 }, cell: { width: 80, height: 100 }, rows: 5, columns: 9 }, audio: { seedPacketSelected() {}, plantingCancelled() {} }, resetCursor() {}, setPointer() {},
        seedPacketAt: (snapshot: any, index: number) => ({ ...snapshot.seedPackets[index], canAfford: true, command: { type: 'selectSeed', seedId: snapshot.seedPackets[index].seedId } }),
        bindSeedPackets(callback: (index: number) => void) { press = () => callback(0); return [button] },
        bindMenu(callback: () => void) { openMenu = callback; return menuButton },
    }, () => { menus++ })
    try {
        input.start()
        assert.equal(button.hapticsEnabled, false, 'selecting a seed has no hover vibration')
        assert.equal(menuButton.hapticsEnabled, true, 'Menu keeps its normal UI feedback')
        press()
        assert.deepEqual(commands, ['selectSeed'])
        input.suspend()
        assert.equal(button.enabled, false)
        assert.equal(menuButton.enabled, false)
        openMenu()
        assert.equal(menus, 0)
        press()
        assert.equal(commands.length, 1)
        input.resume()
        assert.equal(button.enabled, true)
        assert.equal(menuButton.enabled, true)
        press()
        assert.equal(commands.length, 2)
        cursor = 'seed'
        openMenu()
        assert.equal(commands.at(-1), 'clearCursor')
        assert.equal(menus, 0, 'Menu first cancels the held plant')
        cursor = 'none'
        openMenu()
        assert.equal(menus, 1)
        input.destroy()
        assert.equal(button.enabled, false)
        assert.equal(menuButton.enabled, false)
        press()
        assert.equal(commands.length, 3)
    } finally { input.destroy(); ui.cleanup() }
})

test('level seeds keep independent affordability and cooldowns, and placement uses the configured board', () => {
    const ui = setup()
    const { LevelSeedBank } = ui.load('assets/scripts/client/level/LevelSeedBank.ts')
    const { LevelInputPresenter } = ui.load('assets/scripts/client/level/LevelInputPresenter.ts')
    const definitions = { seeds: {
        pea: { plant: 'pvz:peashooter', sunCost: 100 },
        double: { plant: 'pvz:repeater', sunCost: 200 },
        ice: { plant: 'pvz:snowpea', sunCost: 175 },
    } }
    const bank = new LevelSeedBank({
        content: { definitions, presentation: presentationFixture }, level: { seedPackets: ['pea', 'double'] }, seedPacketSlot: ui.root, presentation: {},
        ui: { text: (key: string) => key, tooltip: () => ({ warning: '', show() {}, hide() {} }) },
    })
    const world = {
        phase: 'gameplay', result: 'playing', paused: false, availableSun: 100, cursor: { mode: 'none' }, extensions: {},
        seedPackets: ['pea', 'double'].map(seedId => ({ seedId, ready: true, selected: false, cooldownRemaining: 0, cooldownTotal: 750, availability: {} as any })),
    }
    const commands: any[] = []
    const presenter = new LevelInputPresenter(ui.root, {
        definitions, render: () => world, command: (command: unknown) => commands.push(command),
    }, {
        introComplete: true, bindTools() { return [] }, board: { origin: { x: 12, y: 40 }, cell: { width: 20, height: 30 }, rows: 3, columns: 4 },
        audio: { seedPacketSelected() {}, plantingCancelled() {} }, resetCursor() {}, setPointer() {},
        seedPacketAt: (snapshot: any, index: number) => bank.packetAt(snapshot, index),
        bindSeedPackets: (select: (index: number) => void) => bank.bind(select),
        bindMenu: () => ({ isValid: true }),
    })
    try {
        presenter.start()
        world.seedPackets[1].availability = { reason: 'not-enough-sun', warningKey: 'NOT_ENOUGH_SUN' }
        bank.sync(world, [], true, null, false)
        assert.equal(bank.packets[0].view.options.canAfford, true)
        assert.equal(bank.packets[1].view.options.canAfford, false)
        ui.setMobile()
        bank.sync(world, [], true, null, false)
        assert.equal(bank.packets[0].view.options.mobile, true)
        ui.setMobile(false)
        bank.packets[1].button.onPress()
        assert.equal(commands.at(-1).seedId, 'double')
        const flashes: unknown[] = []
        bank.flash = (node: unknown) => flashes.push(node)
        world.seedPackets[1].cooldownRemaining = 1
        bank.sync(world, [], true, null)
        world.seedPackets[1].cooldownRemaining = 0
        world.availableSun = 300
        world.seedPackets[1].availability = {}
        bank.sync(world, [], true, null)
        assert.deepEqual(flashes, [bank.packets[1].view.node])
        const slot = bank.packets[0], node = slot.view.node, button = slot.button
        world.seedPackets[0].seedId = 'ice'
        bank.sync(world, [], true, null, false)
        assert.equal(slot.view.node, node)
        assert.equal(slot.button, button, 'replacement preserves the input presenter’s button reference')
        assert.deepEqual({ ...slot.view.replacement }, { seedType: 'snowpea', cost: 175 })
        assert.equal(slot.tooltip.text, 'SNOW_PEA')
        slot.button.onPress()
        assert.equal(commands.at(-1).seedId, 'ice')
        world.cursor.mode = 'seed'
        presenter.boardPixel = () => ({ x: 52, y: 115 })
        presenter.onPointer({})
        assert.deepEqual({ ...commands.at(-1) }, { type: 'placePlant', row: 2, column: 2 })
    } finally { presenter.destroy(); ui.cleanup() }
})

test('chooser banks reserve hidden slots and reuse their buttons for the confirmed seed order', () => {
    const ui = setup()
    const { LevelSeedBank } = ui.load('assets/scripts/client/level/LevelSeedBank.ts')
    const bank = new LevelSeedBank({
        content: { presentation: presentationFixture, definitions: { seeds: {
            pea: { plant: 'pvz:peashooter', sunCost: 100 },
            double: { plant: 'pvz:repeater', sunCost: 200 },
        } } },
        level: { seedPackets: [], seedBankSlots: 2 }, seedPacketSlot: ui.root, presentation: {},
        seedChooser: { availableSeeds: ['pea', 'double'], slots: 2, choosing: true },
        ui: { text: (key: string) => key, tooltip: () => ({ show() {}, hide() {} }) },
    })
    const world: any = { phase: 'intro', result: 'playing', paused: false, cursor: { mode: 'none' },
        seedChooser: { choosing: true }, seedPackets: [],
    }
    try {
        const buttons = bank.bind(() => {})
        const nodes = bank.packets.map((packet: any) => packet.view.node)
        assert.equal(nodes.length, 2)
        assert.ok(nodes.every((node: any) => !node.active))
        bank.sync(world, [], false, null, false)
        world.seedPackets = ['double', 'pea'].map(seedId => ({ seedId, ready: true, selected: false,
            cooldownRemaining: 0, cooldownTotal: 750, availability: {},
        }))
        bank.sync(world, [], false, null, false)
        assert.ok(nodes.every((node: any) => !node.active), 'chooser owns the flying cards until confirmation')
        world.seedChooser.choosing = false
        world.phase = 'gameplay'
        bank.sync(world, [], true, null, false)
        assert.deepEqual(Array.from(bank.packets, (packet: any) => packet.seedId), ['double', 'pea'])
        bank.packets.forEach((packet: any, index: number) => {
            assert.equal(packet.view.node, nodes[index])
            assert.equal(packet.button, buttons[index])
            assert.equal(packet.view.node.active, true)
            assert.equal(packet.button.interactable, true)
            assert.equal(bank.packetAt(world, index).command.seedId, world.seedPackets[index].seedId)
        })
    } finally { ui.cleanup() }
})

test('ordinary and conveyor packets share mobile drag, tap, switch and cancel interaction', () => {
    for (const conveyor of [false, true]) {
        const ui = setup(), e = ui.events
        ui.setMobile()
        const { LevelSeedBank } = ui.load('assets/scripts/client/level/LevelSeedBank.ts')
        const { LevelInputPresenter } = ui.load('assets/scripts/client/level/LevelInputPresenter.ts')
        const definitions = { seeds: { pea: { plant: 'pvz:peashooter', sunCost: 100 } }, items: {} }
        const bank = new LevelSeedBank({
            level: { seedPackets: ['pea'], ...(conveyor ? { conveyor: { capacity: 2, seeds: [{ id: 'pea' }] } } : {}) },
            content: { definitions, presentation: presentationFixture }, seedPacketSlot: ui.root, presentation: {},
            ui: { text: (key: string) => key, tooltip: () => ({ show() {}, hide() {} }) },
        })
        if (conveyor) assert.ok(bank.packets.every((packet: any) => packet.seedId === undefined && !packet.view.node.active),
            'conveyor slots start empty and hidden, without borrowing the first configured seed')
        const snapshot: any = { phase: 'gameplay', result: 'playing', paused: false, availableSun: conveyor ? 0 : 100,
            cursor: { mode: 'none' }, extensions: {}, items: [],
            seedPackets: conveyor ? [] : [{ seedId: 'pea', ready: true, selected: false, cooldownRemaining: 0, cooldownTotal: 0, availability: {} }],
            conveyorPackets: conveyor ? [{ id: 17, seedId: 'pea', selected: false, x: 0, availability: {} }, { id: 29, seedId: 'pea', selected: false, x: 120, availability: {} }] : [],
        }
        const commands: any[] = [], menu = ui.makeButton(680)
        let pointer: any
        const input = new LevelInputPresenter(ui.root, { definitions, render: () => snapshot, command(command: any) {
            commands.push(command)
            if (command.type === 'selectSeed' || command.type === 'selectConveyorPacket') snapshot.cursor = { mode: 'seed', seedId: 'pea' }
            else if (command.type === 'clearCursor' || command.type === 'placePlant') snapshot.cursor = { mode: 'none' }
            for (const packet of snapshot.seedPackets) packet.selected = snapshot.cursor.mode === 'seed'
            for (const packet of snapshot.conveyorPackets) packet.selected = command.type === 'selectConveyorPacket' && packet.id === command.packetId
        } }, {
            introComplete: true, bindTools() { return [] }, level: { award: { kind: 'seed' } },
            board: { origin: { x: 40, y: 80 }, cell: { width: 80, height: 100 }, rows: 5, columns: 9 },
            audio: { seedPacketSelected() {}, plantingCancelled() {} }, resetCursor() {}, setPointer(value: any) { pointer = value },
            seedPacketAt: (world: any, index: number) => bank.packetAt(world, index),
            bindSeedPackets: (select: (index: number) => void) => bank.bind(select), bindMenu: () => menu.button,
        })
        input.boardPixel = (event: any) => event.getUILocation()
        const touch = (type: string, x: number, y = 20, id = 1) => ui.dispatch(ui.root, type, x, 0, id, y)
        try {
            input.start()
            bank.sync(snapshot, [], true, null, false)
            if (conveyor) assert.ok(bank.packets.every((packet: any) => packet.view.replacement.seedType === 'peashooter'),
                'each slot initializes its card from the supplied packet')
            touch(e.TOUCH_START, 20)
            assert.equal(commands.at(-1).type, conveyor ? 'selectConveyorPacket' : 'selectSeed')
            if (conveyor) assert.equal(commands.at(-1).packetId, 17)
            touch(e.TOUCH_MOVE, 200, 250)
            assert.deepEqual([pointer.x, pointer.y], [200, 250])
            touch(e.TOUCH_START, 140, 20, 2); touch(e.TOUCH_END, 140, 20, 2)
            assert.equal(commands.length, 1, 'a second finger cannot replace the held packet')
            touch(e.TOUCH_END, 200, 250)
            assert.deepEqual({ ...commands.at(-1) }, { type: 'placePlant', row: 1, column: 2 })
            touch(e.TOUCH_START, 20); touch(e.TOUCH_END, 20)
            assert.equal(snapshot.cursor.mode, 'seed', 'tap selects without planting')
            if (conveyor) {
                touch(e.TOUCH_START, 140); touch(e.TOUCH_END, 140)
                assert.equal(commands.at(-1).packetId, 29, 'duplicate seed types still select distinct conveyor packets')
            }
            const x = conveyor ? 140 : 20
            touch(e.TOUCH_START, x); touch(e.TOUCH_MOVE, 200, 250); touch(e.TOUCH_MOVE, x); touch(e.TOUCH_END, x)
            assert.equal(snapshot.cursor.mode, 'none', 'dragging back to the packet cancels')
        } finally { input.destroy(); ui.cleanup() }
    }
})

test('mobile shovel shares drag, tap, finger ownership and drag-back cancellation during the tutorial', () => {
    const ui = setup(), e = ui.events
    ui.setMobile()
    const shovel = ui.makeButton(609), menu = ui.makeButton(700)
    const { LevelInputPresenter } = ui.load('assets/scripts/client/level/LevelInputPresenter.ts')
    const world: any = { phase: 'intro', result: 'playing', paused: false, cursor: { mode: 'none' }, items: [], extensions: {} }
    const commands: any[] = []
    let pendingTool: string | undefined
    let pointer: any
    const input = new LevelInputPresenter(ui.root, { definitions: { items: {} }, render: () => world, command(command: any) {
        commands.push(command)
        if (command.type === 'selectTool') pendingTool = command.toolId
        else world.cursor = { mode: 'none' }
    }, update(dt: number) {
        assert.equal(dt, 0, 'selection processes input without advancing simulation time')
        if (pendingTool) world.cursor = { mode: 'tool', toolId: pendingTool }
        pendingTool = undefined
    } }, {
        introComplete: false, dialogReady: false, level: { award: { kind: 'seed' } },
        board: { origin: { x: 40, y: 80 }, cell: { width: 80, height: 100 }, rows: 5, columns: 9 },
        audio: { plantingCancelled() {} }, resetCursor() {}, setPointer(value?: any) { pointer = value }, seedPacketAt() {},
        bindSeedPackets: () => [], bindTools(select: (id: string) => void) {
            shovel.button.onPress = () => select('pvz:shovel')
            return [{ toolId: 'pvz:shovel', button: shovel.button }]
        }, bindMenu: () => menu.button,
    })
    input.boardPixel = (event: any) => event.getUILocation()
    const touch = (type: string, x: number, y = 20, id = 1) => ui.dispatch(ui.root, type, x, 0, id, y)
    try {
        input.start()
        assert.equal(shovel.button.hapticsEnabled, false, 'shovel selection has no hover vibration')
        assert.equal(menu.button.hapticsEnabled, true)
        touch(e.TOUCH_START, 625)
        assert.equal(commands.at(-1).type, 'selectTool')
        assert.equal(world.cursor.mode, 'tool', 'confirm the queued server selection before the next touch move')
        assert.equal(pointer, undefined)
        touch(e.TOUCH_MOVE, 280, 350)
        assert.deepEqual([(pointer as any).x, (pointer as any).y], [280, 350])
        touch(e.TOUCH_START, 200, 250, 2); touch(e.TOUCH_END, 200, 250, 2)
        assert.equal(commands.length, 1)
        touch(e.TOUCH_END, 0, 0)
        assert.deepEqual({ ...commands.at(-1) }, { type: 'useToolAt', row: 2, column: 3 })
        touch(e.TOUCH_START, 625); touch(e.TOUCH_END, 625)
        assert.equal(world.cursor.mode, 'tool', 'tap keeps the shovel selected')
        touch(e.TOUCH_START, 200, 250)
        assert.equal(commands.at(-1).type, 'selectTool', 'touch-down only aims')
        touch(e.TOUCH_END, 200, 250)
        assert.equal(commands.at(-1).type, 'useToolAt')
        touch(e.TOUCH_START, 625); touch(e.TOUCH_MOVE, 200, 250); touch(e.TOUCH_MOVE, 625); touch(e.TOUCH_END, 625)
        assert.equal(commands.at(-1).type, 'clearCursor')
        touch(e.TOUCH_START, 625); world.paused = true; touch(e.TOUCH_MOVE, 280, 350); touch(e.TOUCH_END, 280, 350)
        assert.equal(commands.at(-1).type, 'selectTool', 'pausing cancels the gesture without digging')
    } finally { input.destroy(); ui.cleanup() }
})

test('mobile planting keeps tap selection, aims while held, and resolves only the owning finger on release', () => {
    const ui = setup(), e = ui.events
    ui.setMobile()
    const pea = ui.makeButton(0), sunflower = ui.makeButton(120), menu = ui.makeButton(680)
    const { LevelInputPresenter } = ui.load('assets/scripts/client/level/LevelInputPresenter.ts')
    const world = {
        phase: 'gameplay', result: 'playing', paused: false, availableSun: 100, extensions: {},
        cursor: { mode: 'none', seedId: '' },
        seedPackets: ['pea', 'sunflower'].map(seedId => ({ seedId, ready: true, selected: false, cooldownRemaining: 0, availability: {} })),
        items: [] as any[],
    }
    const commands: any[] = []
    let pointer: any, menus = 0, blocked = false
    const presenter = new LevelInputPresenter(ui.root, {
        definitions: { seeds: { pea: { sunCost: 100 }, sunflower: { sunCost: 50 } }, items: { sun: { width: 40, height: 40 } } },
        render: () => world,
        command(command: any) {
            commands.push(command)
            if (command.type === 'selectSeed') world.cursor = { mode: 'seed', seedId: command.seedId }
            if (command.type === 'clearCursor' || command.type === 'placePlant' && !blocked) world.cursor = { mode: 'none', seedId: '' }
            for (const packet of world.seedPackets) packet.selected = packet.seedId === world.cursor.seedId
            if (command.type === 'collectItemAt') world.items.find(item => item.entityId === command.itemId).state = 'collecting'
        },
    }, {
        introComplete: true, canOpenMenu: true, bindTools() { return [] }, level: { award: { kind: 'seed' } }, board: { origin: { x: 40, y: 80 }, cell: { width: 80, height: 100 }, rows: 5, columns: 9 },
        audio: { seedPacketSelected() {}, plantingCancelled() {} }, resetCursor() {}, setPointer(value?: any) { pointer = value },
        seedPacketAt: (snapshot: any, index: number) => {
            const packet = snapshot.seedPackets[index]
            return packet && { ...packet, availability: !packet.ready ? { reason: 'seed-not-ready' } : snapshot.availableSun >= (index === 0 ? 100 : 50) ? {} : { reason: 'not-enough-sun' }, command: { type: 'selectSeed', seedId: packet.seedId } }
        },
        bindSeedPackets(select: (index: number) => void) {
            pea.button.onPress = () => select(0)
            sunflower.button.onPress = () => select(1)
            return [pea.button, sunflower.button]
        },
        bindMenu(open: () => void) { menu.node.on('click', open); return menu.button },
    }, () => { menus++ })
    presenter.boardPixel = (event: any) => event.getUILocation()
    const touch = (type: string, x: number, y = 20, id = 1) => ui.dispatch(ui.root, type, x, 0, id, y)
    const places = () => commands.filter(command => command.type === 'placePlant')
    const tap = (x: number, y = 20) => { touch(e.TOUCH_START, x, y); touch(e.TOUCH_END, x, y) }
    try {
        presenter.start()
        tap(20)
        assert.equal(world.cursor.seedId, 'pea')
        assert.equal(pointer, undefined, 'tapping a packet keeps the selection without a floating plant')
        assert.equal(places().length, 0)
        touch(e.TOUCH_START, 200, 250)
        assert.deepEqual([(pointer as any).x, (pointer as any).y], [200, 250])
        assert.equal(places().length, 0, 'touch-down must only aim')
        touch(e.TOUCH_MOVE, 280, 350)
        touch(e.TOUCH_START, 140, 20, 2)
        touch(e.TOUCH_END, 140, 20, 2)
        assert.equal(world.cursor.seedId, 'pea', 'another finger must not switch or place the held plant')
        touch(e.TOUCH_END, 0, 0)
        assert.deepEqual({ ...places().at(-1) }, { type: 'placePlant', row: 2, column: 3 }, 'release uses the last tracked position')
        assert.equal(pointer, undefined)

        tap(20)
        touch(e.TOUCH_START, 20)
        assert.equal(world.cursor.seedId, 'pea', 'pressing the selected packet waits for release before cancelling')
        touch(e.TOUCH_END, 20)
        assert.equal(world.cursor.mode, 'none')
        touch(e.TOUCH_START, 20)
        touch(e.TOUCH_MOVE, 200, 250)
        touch(e.TOUCH_MOVE, 20)
        touch(e.TOUCH_END, 20)
        assert.equal(world.cursor.mode, 'none', 'dragging back into the source packet cancels')

        tap(20)
        tap(140)
        assert.equal(world.cursor.seedId, 'sunflower', 'a ready packet replaces the selected plant')
        world.seedPackets[0].ready = false
        touch(e.TOUCH_START, 20)
        assert.equal(world.cursor.seedId, 'sunflower')
        touch(e.TOUCH_END, 20)
        assert.equal(world.cursor.mode, 'none', 'releasing on an unavailable packet cancels the held plant')
        world.seedPackets[0].ready = true

        blocked = true
        touch(e.TOUCH_START, 20)
        touch(e.TOUCH_MOVE, 200, 250)
        touch(e.TOUCH_CANCEL, 0, 0)
        assert.equal(world.cursor.mode, 'none', 'cancelled native touches resolve at their last point and clear rejected placement')
        assert.deepEqual({ ...places().at(-1) }, { type: 'placePlant', row: 1, column: 2 })
        blocked = false
        touch(e.TOUCH_START, 20)
        touch(e.TOUCH_MOVE, 200, 250)
        const beforePause = places().length
        presenter.suspend()
        touch(e.TOUCH_END, 200, 250)
        presenter.resume()
        touch(e.TOUCH_END, 200, 250)
        assert.equal(places().length, beforePause, 'pause discards the active gesture')

        world.cursor = { mode: 'none', seedId: '' }
        world.items = [{ entityId: 1, typeId: 'sun', state: 'falling', x: 200, y: 250 }]
        touch(e.TOUCH_START, 100, 270)
        touch(e.TOUCH_MOVE, 340, 270)
        touch(e.TOUCH_END, 340, 270)
        assert.equal(commands.filter(command => command.type === 'collectItemAt').length, 1, 'swiping collects items between sparse touch samples')
        ui.dispatch(menu.node, e.TOUCH_START, 700)
        ui.dispatch(menu.node, e.TOUCH_END, 700)
        assert.equal(menus, 1, 'Menu retains normal button interaction')
    } finally { presenter.destroy(); ui.cleanup() }
})

test('mobile planting previews use the original row/column guide', () => {
    const ui = setup()
    const { LevelHudPresenter } = ui.load('assets/scripts/client/level/LevelHudPresenter.ts')
    const hud = Object.create(LevelHudPresenter.prototype)
    const board = { origin: { x: 40, y: 80 }, cell: { width: 80, height: 100 }, rows: 5, columns: 9 }
    hud.content = { definitions: { boards: { day: board }, seeds: { pea: { plant: 'pvz:peashooter' } } }, loadedMods: {} }
    hud.level = { board: 'day', activeRows: [2] }
    hud.cursorPreview = { active: false, setPosition() {} }
    hud.gridPreview = { active: false, setPosition() {} }
    hud.cursorPlant = hud.gridPlant = { setPlant() {} }
    const rects: number[][] = []
    const graphics = { fillColor: undefined as any, clear() { rects.length = 0 }, fillRect(...values: number[]) { rects.push(values) } }
    hud.mobileGridGuide = { active: false, getComponent: () => graphics }
    const world = { result: 'playing', cursor: { mode: 'seed', seedId: 'pea' }, plants: [] }
    try {
        ui.setMobile()
        hud.syncPreviews(world)
        assert.equal(hud.cursorPreview.active, false)
        hud.setPointer({ x: 140, y: 320 })
        hud.syncPreviews(world)
        assert.equal(hud.cursorPreview.active, true)
        assert.equal(hud.gridPreview.active, false)
        assert.equal(hud.mobileGridGuide.active, true)
        assert.equal(graphics.fillColor.a, 72)
        assert.deepEqual(rects, [[40, -380, 720, 100], [120, -580, 80, 500]])
        hud.setPointer({ x: 140, y: 220 })
        hud.syncPreviews(world)
        assert.equal(hud.mobileGridGuide.active, false, 'inactive rows do not get a guide')
        ui.setMobile(false)
        hud.setPointer({ x: 140, y: 320 })
        hud.syncPreviews(world)
        assert.equal(hud.gridPreview.active, true)
        assert.equal(hud.mobileGridGuide.active, false)
    } finally { ui.cleanup() }
})

test('HUD input gates suppress held plants and finished levels without changing button visuals', () => {
    const ui = setup(), seed = ui.makeButton(0), menu = ui.makeButton(200), e = ui.events
    const { LevelInputPresenter } = ui.load('assets/scripts/client/level/LevelInputPresenter.ts')
    let cursor = 'none', result = 'playing', menus = 0, cancels = 0
    let point = { x: 720, y: 20 }
    const pointerUpdates: unknown[] = []
    const commands: string[] = []
    const presenter = new LevelInputPresenter(ui.root, {
        definitions: { seeds: { 'pvz:peashooter': { sunCost: 100 } } },
        render: () => ({ phase: 'gameplay', result, cursor: { mode: cursor }, availableSun: 100, extensions: {},
            seedPackets: [{ seedId: 'pvz:peashooter', cooldownRemaining: 0, availability: {} }] }),
        command: (command: { type: string }) => {
            commands.push(command.type)
            if (command.type === 'selectSeed') cursor = 'seed'
            if (command.type === 'clearCursor') cursor = 'none'
        },
    }, {
        introComplete: true, canOpenMenu: true, bindTools() { return [] }, board: { origin: { x: 40, y: 80 }, cell: { width: 80, height: 100 }, rows: 5, columns: 9 }, audio: { seedPacketSelected() {}, plantingCancelled() { cancels++ } },
        resetCursor() {}, setPointer(value?: unknown) { pointerUpdates.push(value) },
        seedPacketAt: (snapshot: any, index: number) => ({ ...snapshot.seedPackets[index], canAfford: true, command: { type: 'selectSeed', seedId: snapshot.seedPackets[index].seedId } }),
        bindSeedPackets(callback: (index: number) => void) { seed.button.onPress = () => callback(0); return [seed.button] },
        bindMenu(callback: () => void) { menu.node.on('click', callback); return menu.button },
    }, () => { menus++ })
    presenter.boardPixel = () => point
    try {
        presenter.start()
        ui.dispatch(seed.node, e.MOUSE_DOWN, 20)
        assert.equal(cursor, 'seed')
        assert.equal(seed.button.isPressed, false, 'selection cancels the seed button capture immediately')
        ui.dispatch(ui.root, e.MOUSE_LEAVE, 220)
        assert.equal(pointerUpdates.length, 0, 'switching hover to a button must not hide the held plant')
        point = { x: -1, y: 20 }
        ui.dispatch(ui.root, e.MOUSE_LEAVE, -1)
        assert.deepEqual(pointerUpdates, [undefined], 'leaving the board still clears the plant preview')
        point = { x: 720, y: 20 }
        for (const target of [seed, menu]) for (const key of [0, 2]) {
            const x = target === seed ? 20 : 220
            ui.dispatch(target.node, e.MOUSE_MOVE, x)
            assert.equal(target.state, 'normal')
            assert.equal(ui.cursor, 'default')
            ui.dispatch(target.node, e.MOUSE_DOWN, x, key)
            ui.dispatch(target.node, e.MOUSE_UP, x, key)
            assert.equal(target.clicks, 0)
        }
        assert.equal(menu.presses, 0, 'blocked buttons cannot play their press sound')
        assert.deepEqual(commands, ['selectSeed'])
        ui.dispatch(ui.root, e.MOUSE_DOWN, 220)
        ui.dispatch(menu.node, e.MOUSE_UP, 220)
        assert.equal(cancels, 1)
        assert.equal(menus, 0, 'the cancel click cannot also activate Menu on release')
        ui.dispatch(menu.node, e.MOUSE_DOWN, 220)
        ui.dispatch(menu.node, e.MOUSE_UP, 220)
        assert.equal(menus, 1)
        const presses = menu.presses
        result = 'won'
        ui.dispatch(menu.node, e.MOUSE_MOVE, 220)
        ui.dispatch(menu.node, e.MOUSE_DOWN, 220)
        ui.dispatch(menu.node, e.MOUSE_UP, 220)
        assert.equal(menu.state, 'normal')
        assert.equal(menu.presses, presses)
        assert.equal(menus, 1, 'reward pickup preserves the button appearance while blocking interaction')
    } finally { presenter.destroy(); ui.cleanup() }
})

test('left/right drags retain the pressed button, transfer hover only after release, and restore on re-entry', () => {
    for (const key of [0, 2]) {
        const ui = setup(), a = ui.makeButton(0), b = ui.makeButton(200), e = ui.events
        try {
            ui.dispatch(a.node, e.MOUSE_MOVE, 20)
            assert.equal(a.state, 'hover'); assert.equal(a.enters, 1); assert.equal(ui.cursor, 'pointer')
            ui.dispatch(a.node, e.TOUCH_START, 20) // Desktop mouse-to-touch simulation must not activate twice.
            ui.dispatch(a.node, e.MOUSE_DOWN, 20, key)
            assert.equal(a.presses, 1); assert.equal(a.state, 'pressed')
            ui.dispatch(b.node, e.MOUSE_MOVE, 220, key)
            assert.equal(a.state, 'normal'); assert.equal(b.state, 'normal'); assert.equal(ui.cursor, 'default')
            ui.dispatch(a.node, e.MOUSE_MOVE, 20, key)
            assert.equal(a.state, 'pressed'); assert.equal(a.enters, 2); assert.equal(ui.cursor, 'pointer')
            ui.dispatch(b.node, e.MOUSE_MOVE, 220, key)
            ui.dispatch(b.node, e.MOUSE_UP, 220, key)
            assert.equal(a.clicks, 0); assert.equal(b.clicks, 0)
            assert.equal(b.state, 'hover'); assert.equal(b.enters, 1); assert.equal(ui.cursor, 'pointer')
            ui.dispatch(b.node, e.MOUSE_DOWN, 220, key)
            ui.dispatch(b.node, e.MOUSE_UP, 220, key)
            assert.equal(b.clicks, 1); assert.equal(b.state, 'hover')
            ui.dispatch(a.node, e.MOUSE_DOWN, 20, key)
            ui.dispatch(null, e.MOUSE_MOVE, 500, key)
            ui.dispatch(null, e.MOUSE_UP, 500, key)
            assert.equal(a.clicks, 0); assert.equal(a.button.isPressed, false); assert.equal(ui.cursor, 'default')
            a.button.pressOnly = b.button.pressOnly = true
            ui.dispatch(a.node, e.MOUSE_MOVE, 20)
            const presses = a.presses
            ui.dispatch(a.node, e.MOUSE_DOWN, 20, key)
            assert.equal(a.presses, presses + 1)
            assert.equal(a.button.isPressed, false, 'almanac selection does not capture a drag')
            ui.dispatch(b.node, e.MOUSE_MOVE, 220, key)
            assert.equal(b.state, 'hover', 'almanac hover follows the pointer while held')
            ui.dispatch(b.node, e.MOUSE_UP, 220, key)
            assert.equal(b.clicks, 1, 'press-only selection does not emit a release click')
            ui.setMobile()
            ui.dispatch(a.node, e.TOUCH_START, 20)
            assert.equal(a.presses, presses + 2)
            ui.dispatch(a.node, e.TOUCH_END, 20)
            assert.equal(a.clicks, 0)
        } finally { ui.cleanup() }
    }
})

test('right-button presets, disabled capture, polygon boundaries, and modal cursor restoration match their rules', () => {
    const ui = setup(), a = ui.makeButton(0), b = ui.makeButton(200), e = ui.events
    let tooltipVisible = false
    a.button.onHoverChange = (hovering: boolean) => { tooltipVisible = hovering }
    try {
        a.button.rightClickPressesVisual = false
        ui.dispatch(a.node, e.MOUSE_DOWN, 20, 2)
        assert.equal(a.state, 'hover'); assert.equal(a.presses, 1); assert.equal(a.enters, 0)
        ui.dispatch(a.node, e.MOUSE_UP, 20, 0)
        assert.equal(a.button.isPressed, true, 'another mouse button cannot release the capture')
        ui.dispatch(a.node, e.MOUSE_UP, 20, 2)
        assert.equal(a.clicks, 1)
        a.button.rightClickTriggers = false
        ui.dispatch(a.node, e.MOUSE_DOWN, 20, 2); ui.dispatch(a.node, e.MOUSE_UP, 20, 2)
        assert.equal(a.clicks, 1); assert.equal(a.presses, 1)
        a.button.releaseToNormalOnPressOut = false
        ui.dispatch(a.node, e.MOUSE_DOWN, 20)
        assert.equal(tooltipVisible, true)
        ui.dispatch(b.node, e.MOUSE_MOVE, 220)
        assert.equal(a.state, 'hover'); assert.equal(a.button.isHovering, false); assert.equal(ui.cursor, 'default')
        assert.equal(tooltipVisible, false, 'a retained hover visual must not keep the tooltip visible outside the button')
        a.button.interactable = false
        assert.equal(a.button.isPressed, false)
        assert.equal(b.state, 'hover'); assert.equal(ui.cursor, 'pointer')
        ui.hover.beginModalBlock(a.node)
        assert.equal(b.state, 'normal'); assert.equal(ui.cursor, 'default')
        ui.hover.endModalBlock(a.node)
        assert.equal(b.state, 'hover'); assert.equal(ui.cursor, 'pointer')
        b.button.polygon = [[0, 0], [100, 0], [0, 50]]
        ui.dispatch(b.node, e.MOUSE_MOVE, 280)
        assert.equal(b.state, 'normal'); assert.equal(ui.cursor, 'default')
        ui.dispatch(b.node, e.MOUSE_MOVE, 210)
        assert.equal(b.state, 'hover')
        b.button.changeCursor = false
        ui.hover.refreshHoverStates()
        assert.equal(ui.cursor, 'default')
    } finally { ui.cleanup() }
})

test('tooltips stay below buttons where possible, flip above at the bottom, and clamp to screen edges', () => {
    const ui = setup()
    try {
        const { tooltipPosition } = ui.load('assets/scripts/client/ui/UITooltip.ts')
        const bounds = { left: 2, right: 798, top: 598, bottom: 2 }
        const button = { left: 566, right: 626, top: 600, bottom: 540 } // Actual 60×60 garden button.
        const below = tooltipPosition(button, 110, 16, bounds, 4)
        assert.equal(below.x, 541)
        assert.equal(below.y, 536)
        const garden = tooltipPosition(button, 110, 16, bounds, 4, [3, -12])
        assert.equal(garden.x + 55, 599)
        assert.equal(600 - garden.y, 52)
        const above = tooltipPosition({ left: 100, right: 140, top: 40, bottom: 0 }, 110, 16, bounds, 4)
        assert.equal(above.y, 60)
        for (const x of [-100, 0, 400, 800, 900]) for (const y of [-100, 0, 300, 600, 700]) {
            for (const offset of [[0, 0], [3, -12]]) {
                const position = tooltipPosition({ left: x, right: x + 40, top: y + 40, bottom: y }, 110, 16, bounds, 4, offset)
                assert.ok(position.x >= bounds.left && position.x + 110 <= bounds.right)
                assert.ok(position.y <= bounds.top && position.y - 16 >= bounds.bottom)
            }
        }
    } finally { ui.cleanup() }
})

test('touch dragging cancels outside, clicks only its captured touch, and leaves no hover after release', () => {
    const ui = setup(), a = ui.makeButton(0), e = ui.events
    ui.setMobile()
    try {
        ui.dispatch(a.node, e.TOUCH_START, 20)
        ui.dispatch(a.node, e.TOUCH_MOVE, 220)
        assert.equal(a.state, 'normal')
        ui.dispatch(a.node, e.TOUCH_END, 220)
        assert.equal(a.clicks, 0)
        ui.dispatch(a.node, e.TOUCH_START, 20)
        ui.dispatch(a.node, e.TOUCH_END, 20, 0, 2)
        assert.equal(a.button.isPressed, true)
        ui.dispatch(a.node, e.TOUCH_END, 20)
        assert.equal(a.clicks, 1); assert.equal(a.state, 'normal'); assert.equal(ui.cursor, 'default')
    } finally { ui.cleanup() }
})
