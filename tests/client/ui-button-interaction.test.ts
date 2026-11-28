import { presentationFixture } from './presentationFixture'
import assert from 'node:assert/strict'
import test from 'node:test'
import * as plantDefinitions from '@/client/plants/definitions'
import { loadScript } from '../loadScript'
import * as protocol from '@/shared/protocol'
import * as debugCli from '@/shared/debug/DebugCli'

// The protocol's own helpers run as they are: what is loaded asks them whether the level stands still, or whether a
// repick could start.
const shared: Record<string, unknown> = { '@/shared/protocol': protocol, '@/shared/protocol/index': protocol, '@/shared/debug/DebugCli': debugCli }

// Exercise the real button/hover code with ordered capture/target events, without rendering Cocos.
function setup() {
    type Listener = { callback: Function, context: unknown, capture: boolean }
    class Vec {
        constructor(public x = 0, public y = 0, public z = 0) {}
        clone() { return new Vec(this.x, this.y, this.z) }
        set(x: number, y: number, z = 0) { this.x = x; this.y = y; this.z = z; return this }
    }
    class MouseEvent { static BUTTON_LEFT = 0; static BUTTON_RIGHT = 2 }
    class TouchEvent {
        constructor(private eventCode: string) {}
        getEventCode() { return this.eventCode }
    }
    class Color {
        constructor(public r: number, public g: number, public b: number, public a = 255) {}
    }
    const events = Object.fromEntries(['MOUSE_DOWN', 'MOUSE_MOVE', 'MOUSE_UP', 'MOUSE_ENTER', 'MOUSE_LEAVE',
        'TOUCH_START', 'TOUCH_MOVE', 'TOUCH_END', 'TOUCH_CANCEL', 'NODE_DESTROYED', 'KEY_DOWN', 'KEY_PRESSING'].map(name => [name, name.toLowerCase().replace('_', '-')]))
    const keys = { SPACE: 32, ENTER: 13, DIGIT_0: 48, DIGIT_1: 49, KEY_C: 67, KEY_R: 82, KEY_S: 83 }
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
    const settings = { isMobileMode: () => mobile, hotkeysEnabled: false, cheatSeedsEnabled: false }
    const cursorHistory: string[] = [], haptics: string[] = []
    const modules: Record<string, any> = {
        cc: {
            Component: class { enabledInHierarchy = true }, _decorator: { ccclass: () => (value: unknown) => value },
            Button: { EventType: { CLICK: 'click' } }, EventMouse: MouseEvent, EventTouch: TouchEvent, Color,
            Node: FakeNode, Vec3: Vec, UITransform: Transform, Input: { EventType: events }, input: new FakeNode(), KeyCode: keys,
            // No band for UIHoverManager's edge guard (edge-guard.test's): these touches start close to the left.
            screen: { devicePixelRatio: 0, windowSize: { width: Infinity, height: Infinity } },
        },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: settings },
        '@/platform/Haptics': { Haptics: { play: (style = 'light') => haptics.push(style) } },
        './CursorManager': { CursorManager: { set: (value: string) => { cursor = value; cursorHistory.push(value) } } },
    }
    const load = (file: string) => loadScript(file, (id: string) => modules[id] ?? shared[id] ?? {})
    const hover = load('assets/scripts/client/input/UIHoverManager.ts').UIHoverManager
    modules['@/client/input/UIHoverManager'] = { UIHoverManager: hover }
    const Button = load('assets/scripts/client/ui/UIButton.ts').UIButton
    modules['@/client/ui/UIButton'] = { UIButton: Button }
    modules['./LevelGeometry'] = load('assets/scripts/client/level/LevelGeometry.ts')
    // The hit test the server collects by, which the presenter asks where a press goes.
    modules['@/shared/content/gameplay'] = load('assets/scripts/shared/content/levelHelpers.ts')
    modules['@/client/plants/definitions'] = plantDefinitions
    modules['@/client/hud/SeedPacketView'] = { SeedPacketView: class {
        node: FakeNode; options: unknown
        replacement?: { plant: string, cost: number }
        /** The picture loads later than the packet, as SeedPacketView's does. */
        ready: Promise<void> = Promise.resolve()
        constructor(options: any) { this.node = new FakeNode(options.x); options.parent.addChild(this.node) }
        setSeed(plant: string, cost: number) { this.replacement = { plant, cost } }
        setMirrored() {}
        sync(options: unknown) { this.options = options }
    } }
    // The bank's layer for the packets' pictures (SeedPacketViewArgs.iconLayer).
    modules['@/client/view/uiNode'] = { uiNode: (options: any) => { const node = new FakeNode(0); options.parent?.addChild(node); return { node } } }
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
        let clicks = 0, enters = 0, state = 'normal'
        button.onHoverEnter = () => { enters++ }
        button.onStateChange = (value: string) => { state = value }
        node.on('click', () => { clicks++ })
        button.onEnable(); buttons.push(button)
        return { button, node, get clicks() { return clicks },
            get enters() { return enters }, get state() { return state } }
    }
    const dispatch = (target: FakeNode | null, type: string, x: number, key = 0, touchId = 1, y = 20, originalType = type) => {
        const event = Object.assign(type.startsWith('mouse') ? new MouseEvent() : new TouchEvent(originalType), {
            type, target, windowId: 0, propagationStopped: false, getLocation: () => new Vec(x, y), getUILocation: () => new Vec(x, y), getButton: () => key,
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
        if (!type.startsWith('touch')) return
        for (const node of path.slice(0, -1).reverse()) {
            if (event.propagationStopped) break
            node.emit(type, event)
        }
    }
    return { root, hover, makeButton, dispatch, events, keys, settings, input: (modules.cc as any).input, load, Node: FakeNode, cursorHistory, haptics, get cursor() { return cursor }, setMobile(value = true) { mobile = value },
        cleanup() { for (const button of buttons) { button.enabledInHierarchy = false; button.onDisable() } hover.stop() } }
}




test("a mobile tap answers Dave's seed-slot offer before the lawn can advance his dialogue", () => {
    const ui = setup()
    ui.setMobile()
    const { LevelInputPresenter } = ui.load('assets/scripts/client/level/LevelInputPresenter.ts')
    const board = new ui.Node(), dialog = new ui.Node()
    ui.root.addChild(board)
    board.addChild(dialog)
    const yes = ui.makeButton(10, dialog), no = ui.makeButton(140, dialog)
    const answers: boolean[] = [], commands: string[] = []
    yes.button.onClick = () => answers.push(true)
    no.button.onClick = () => answers.push(false)
    const presenter = new LevelInputPresenter(board, { command: (cmd: { type: string }) => commands.push(cmd.type) }, {
        dialogReady: true, bindSeedPackets: () => [], bindTools: () => [], bindMenu: () => ({}), bindSunCounter: () => ({}), resetCursor() {},
    })
    try {
        presenter.start()
        ui.hover.beginModalBlock(dialog)
        for (const target of [yes.node, no.node]) {
            ui.dispatch(target, ui.events.TOUCH_START, target.x + 20)
            ui.dispatch(target, ui.events.TOUCH_END, target.x + 20)
        }
        assert.deepEqual(answers, [true, false])
        assert.deepEqual(commands, [])
        ui.hover.endModalBlock(dialog)
        ui.dispatch(board, ui.events.TOUCH_START, 270)
        assert.deepEqual(commands, ['advanceDialog'])
    } finally { presenter.destroy(); ui.cleanup() }
})

test("with cheat seeds on, R and on mobile a tap on the sun counter start a repick, and in one are its Let's Rock", () => {
    const ui = setup()
    ui.setMobile()
    const { LevelInputPresenter } = ui.load('assets/scripts/client/level/LevelInputPresenter.ts')
    const board = new ui.Node()
    ui.root.addChild(board)
    const sun = ui.makeButton(300, board)
    let repicking = false, letsRock = true, starts = 0, phase = 'gameplay', bank: Record<string, unknown> = { seedPackets: [{}, {}] }
    const commands: string[] = []
    const presenter = new LevelInputPresenter(board, {
        render: () => ({ result: 'playing', phase, cursor: { mode: 'none' }, seedPackets: [], items: [], ...bank,
            ...repicking ? { seedChooser: { repick: true, choosing: true } } : {} }),
        command() {}, debugCommand: (command: string) => commands.push(command), definitions: { items: {} },
    }, {
        introComplete: true, level: {}, bindSeedPackets: () => [], bindTools: () => [], bindMenu: () => ({}), resetCursor() {}, setPointer() {}, seedPacketAt: () => undefined,
        bindSunCounter(press: () => void) { sun.button.onClick = press; return sun.button },
        confirmSeedChooser: () => { starts++; return true },
        canConfirmSeedChooser: () => letsRock,
    })
    presenter.boardPixel = (event: any) => event.getUILocation()
    const press = () => ui.dispatch(sun.node, ui.events.TOUCH_START, sun.node.x + 20)
    const lift = () => ui.dispatch(sun.node, ui.events.TOUCH_END, sun.node.x + 20)
    const tap = () => { press(); lift() }
    const r = () => ui.input.emit(ui.events.KEY_DOWN, { keyCode: ui.keys.KEY_R })
    ui.settings.hotkeysEnabled = true
    try {
        presenter.start()
        tap()
        r()
        assert.deepEqual([commands, starts, ui.haptics.length], [[], 0, 0], 'not with cheat seeds off')
        ui.settings.cheatSeedsEnabled = true
        press()
        assert.deepEqual([commands, ui.haptics.length], [[], 1], 'a press buzzes, as any button does')
        lift()
        r()
        assert.deepEqual(commands, ['/repick', '/repick'], 'it repicks as the touch lifts')
        for (const refused of [{ seedPackets: [] }, { seedPackets: [{}], conveyor: { ticks: 0 } }]) {
            bank = refused
            tap()
            assert.deepEqual([commands.length, ui.haptics.length], [2, 1], 'with no bank to choose again it is no button: no buzz')
        }
        bank = { seedPackets: [{}, {}] }
        phase = 'intro'
        tap()
        assert.deepEqual([commands.length, ui.haptics.length], [2, 1], 'nor before the level is in play')
        phase = 'gameplay'
        repicking = true
        tap()
        r()
        assert.deepEqual([commands.length, starts, ui.haptics.length], [2, 2, 2], "in the repick, its Let's Rock")
        letsRock = false
        tap()
        assert.deepEqual([starts, ui.haptics.length], [2, 2], "nor while Let's Rock cannot be pressed")
        repicking = false
        ui.setMobile(false)
        tap()
        assert.deepEqual(commands, ['/repick', '/repick'], 'the sun counter is a button on mobile alone')
    } finally { presenter.destroy(); ui.cleanup() }
})

test('level seeds keep independent affordability and cooldowns, and placement uses the configured board', () => {
    const ui = setup()
    const { LevelSeedBank } = ui.load('assets/scripts/client/level/LevelSeedBank.ts')
    const { LevelInputPresenter } = ui.load('assets/scripts/client/level/LevelInputPresenter.ts')
    const definitions = { seeds: {
        pea: { kind: 'plant', id: 'pvz:peashooter', sunCost: 100 },
        double: { kind: 'plant', id: 'pvz:repeater', sunCost: 200 },
        ice: { kind: 'plant', id: 'pvz:snowpea', sunCost: 175 },
    } }
    const bank = new LevelSeedBank({
        content: { definitions, presentation: presentationFixture }, level: {}, initialSeeds: ['pea', 'double'], seedPacketSlot: ui.root, presentation: {},
        ui: { text: (key: string) => key, tooltip: () => ({ warning: '', show() {}, hide() {} }) },
    })
    const world = {
        phase: 'gameplay', result: 'playing', paused: false, cursor: { mode: 'none' }, extensions: {},
        seedPackets: ['pea', 'double'].map(seedId => ({ seedId, ready: true, selected: false, cooldownRemaining: 0, cooldownTotal: 750, availability: {} as any })),
    }
    const commands: any[] = []
    const presenter = new LevelInputPresenter(ui.root, {
        definitions, render: () => world, command: (command: unknown) => commands.push(command),
    }, {
        introComplete: true, bindTools() { return [] }, board: { bounds: { left: 0, right: 800 }, origin: { x: 12, y: 40 }, cell: { width: 20, height: 30 }, rows: 3, columns: 4 },
        audio: { seedPacketSelected() {}, plantingCancelled() {} }, resetCursor() {}, setPointer() {},
        pointerOffsetY: () => 0, seedPacketAt: (snapshot: any, index: number) => bank.packetAt(snapshot, index),
        bindSeedPackets: (select: (index: number) => void) => bank.bind(select),
        bindMenu: () => ({ isValid: true }),
        bindSunCounter: () => ({ isValid: true }),
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
        bank.packets[1].button.onClick()
        assert.equal(commands.at(-1).seedId, 'double')
        const flashes: unknown[] = []
        bank.flash = (node: unknown) => flashes.push(node)
        world.seedPackets[1].cooldownRemaining = 1
        bank.sync(world, [], true, null)
        world.seedPackets[1].cooldownRemaining = 0
        world.seedPackets[1].availability = {}
        bank.sync(world, [], true, null)
        assert.deepEqual(flashes, [], 'a cleared recharge alone does not flash; the server decides readiness')
        const seedId = world.seedPackets[1].seedId
        bank.sync(world, [{ type: 'seedPacketFlashRequested', sequence: 0, data: { seedId, slot: 1 } }], true, null)
        assert.deepEqual(flashes, [bank.packets[1].view.node])
        const slot = bank.packets[0], node = slot.view.node, button = slot.button
        world.seedPackets[0].seedId = 'ice'
        bank.sync(world, [], true, null, false)
        assert.equal(slot.view.node, node)
        assert.equal(slot.button, button, 'replacement preserves the input presenter’s button reference')
        assert.deepEqual({ ...slot.view.replacement }, { plant: 'pvz:snowpea', cost: 175 })
        assert.equal(slot.tooltip.text, 'SNOW_PEA')
        slot.button.onClick()
        assert.equal(commands.at(-1).seedId, 'ice')
        world.cursor.mode = 'seed'
        presenter.boardPixel = () => ({ x: 52, y: 115 })
        presenter.onPointer({})
        assert.deepEqual({ ...commands.at(-1) }, { type: 'placePlant', row: 2, column: 2 })
    } finally { presenter.destroy(); ui.cleanup() }
})



test('a belt packet shows once its picture is drawn, in its place on the belt for the picture to snap to there', async () => {
    const ui = setup()
    const { LevelSeedBank } = ui.load('assets/scripts/client/level/LevelSeedBank.ts')
    const definitions = { seeds: { pea: { kind: 'plant', id: 'pvz:peashooter', sunCost: 100 } }, items: {} }
    const bank = new LevelSeedBank({
        level: { conveyor: { capacity: 2, seeds: [{ id: 'pea' }] } }, initialSeeds: [],
        content: { definitions, presentation: presentationFixture }, seedPacketSlot: ui.root, presentation: {},
        ui: { text: (key: string) => key, tooltip: () => ({ show() {}, hide() {} }) },
    })
    try {
        // The picture (another layer) snaps to the packet as it shows (SeedPacketIconFollower.onEnable), and a component
        // shown during update has no lateUpdate until the next frame: shown first, it draws a frame at a bank slot.
        const shownAt: number[] = []
        for (const packet of bank.packets as any[]) {
            const node = packet.view.node
            let active = node.active
            Object.defineProperty(node, 'active', {
                configurable: true, get: () => active,
                set(value: boolean) { if (value && !active) shownAt.push(node.x); active = value },
            })
        }
        const layout = presentationFixture.conveyor
        const at = (x: number) => ({ phase: 'gameplay', result: 'playing', paused: false, sun: 0, cursor: { mode: 'none' }, extensions: {},
            items: [], seedPackets: [], conveyorPackets: [{ id: 5, seedId: 'pea', selected: false, x, availability: {} }] })
        // The picture loads after the frame is drawn: until then the packet would show empty, so it waits.
        bank.sync(at(300), [], true, null, false)
        assert.equal(JSON.stringify(shownAt), '[]')
        await new Promise(resolve => setTimeout(resolve, 0))
        // Drawn, it shows at once, with no sync to wait for: a paused level (a loaded save on its dialog) has none.
        assert.equal(JSON.stringify(shownAt), JSON.stringify([layout.packetX + 300]))
    } finally { bank.destroy?.(); ui.cleanup() }
})

test('a repick leaves the bank slots to the chooser cards', () => {
    const ui = setup()
    const { LevelSeedBank } = ui.load('assets/scripts/client/level/LevelSeedBank.ts')
    const definitions = { seeds: { pea: { kind: 'plant', id: 'pvz:peashooter', sunCost: 100 } }, items: {} }
    const bank = new LevelSeedBank({
        level: {}, initialSeeds: ['pea'], content: { definitions, presentation: presentationFixture }, seedPacketSlot: ui.root, presentation: {},
        ui: { text: (key: string) => key, tooltip: () => ({ show() {}, hide() {} }) },
    })
    try {
        const snapshot = { phase: 'gameplay', result: 'playing', paused: false, sun: 0, cursor: { mode: 'none' }, extensions: {}, items: [],
            seedChooser: { choosing: true, repick: true, slots: 1 },
            seedPackets: [{ seedId: 'pea', ready: true, selected: false, cooldownRemaining: 0, cooldownTotal: 0, availability: {} }] }
        const node = (bank.packets as any[])[0].view.node
        bank.sync(snapshot, [], true, null, false)
        assert.equal(node.active, false)
    } finally { bank.destroy?.(); ui.cleanup() }
})

test('ordinary and conveyor packets share mobile drag, tap, switch and cancel interaction', async () => {
    for (const conveyor of [false, true]) {
        const ui = setup(), e = ui.events
        ui.setMobile()
        const { LevelSeedBank } = ui.load('assets/scripts/client/level/LevelSeedBank.ts')
        const { LevelInputPresenter } = ui.load('assets/scripts/client/level/LevelInputPresenter.ts')
        const definitions = { seeds: { pea: { kind: 'plant', id: 'pvz:peashooter', sunCost: 100 }, sunflower: { kind: 'plant', id: 'pvz:sunflower', sunCost: 50 } }, items: {} }
        const bank = new LevelSeedBank({
            level: conveyor ? { conveyor: { capacity: 2, seeds: [{ id: 'pea' }] } } : {}, initialSeeds: conveyor ? [] : ['pea', 'sunflower'],
            content: { definitions, presentation: presentationFixture }, seedPacketSlot: ui.root, presentation: {},
            ui: { text: (key: string) => key, tooltip: () => ({ show() {}, hide() {} }) },
        })
        if (conveyor) assert.ok(bank.packets.every((packet: any) => packet.seedId === undefined && !packet.view.node.active),
            'conveyor slots start empty and hidden, without borrowing the first configured seed')
        const snapshot: any = { phase: 'gameplay', result: 'playing', paused: false, sun: conveyor ? 0 : 100,
            cursor: { mode: 'none' }, extensions: {}, items: [],
            seedPackets: conveyor ? [] : ['pea', 'sunflower'].map(seedId => ({ seedId, ready: true, selected: false, cooldownRemaining: 0, cooldownTotal: 0, availability: {} })),
            conveyorPackets: conveyor ? [{ id: 17, seedId: 'pea', selected: false, x: 0, availability: {} }, { id: 29, seedId: 'pea', selected: false, x: 120, availability: {} }] : [],
        }
        const commands: any[] = [], pending: any[] = [], menu = ui.makeButton(680)
        let pointer: any
        let selectedPacket: number | undefined
        const flush = () => {
            for (const command of pending.splice(0)) {
                if (command.type === 'selectSeed' || command.type === 'selectConveyorPacket') {
                    snapshot.cursor = { mode: 'seed', seedId: command.seedId ?? 'pea' }
                    selectedPacket = command.packetId
                } else if (command.type === 'clearCursor' || command.type === 'placePlant') {
                    snapshot.cursor = { mode: 'none' }
                    selectedPacket = undefined
                }
            }
            for (const packet of snapshot.seedPackets) packet.selected = packet.seedId === snapshot.cursor.seedId
            for (const packet of snapshot.conveyorPackets) packet.selected = packet.id === selectedPacket
            bank.sync(snapshot, [], true, null, false)
        }
        const input = new LevelInputPresenter(ui.root, { definitions, render: () => snapshot,
            command(command: any) { commands.push(command); pending.push(command) },
        }, {
            introComplete: true, bindTools() { return [] }, level: { award: { kind: 'seed' } },
            board: { bounds: { left: 0, right: 800 }, origin: { x: 40, y: 80 }, cell: { width: 80, height: 100 }, rows: 5, columns: 9 },
            audio: { seedPacketSelected() {}, plantingCancelled() {} }, resetCursor() {}, setPointer(value: any) { pointer = value },
            pointerOffsetY: () => 0, seedPacketAt: (world: any, index: number) => bank.packetAt(world, index),
            bindSeedPackets: (select: (index: number) => void) => bank.bind(select), bindMenu: () => menu.button, bindSunCounter: () => ({}),
        })
        input.boardPixel = (event: any) => event.getUILocation()
        const touch = (type: string, x: number, y = 20, id = 1) => { ui.dispatch(ui.root, type, x, 0, id, y); flush() }
        try {
            input.start()
            bank.sync(snapshot, [], true, null, false)
            if (conveyor) assert.ok(bank.packets.every((packet: any) => packet.view.replacement.plant === 'pvz:peashooter'),
                'each slot initializes its card from the supplied packet')
            // A new card shows once its picture is drawn.
            await new Promise(resolve => setTimeout(resolve, 0))
            bank.sync(snapshot, [], true, null, false)
            touch(e.TOUCH_START, 20)
            assert.equal(commands.at(-1).type, conveyor ? 'selectConveyorPacket' : 'selectSeed')
            if (conveyor) assert.equal(commands.at(-1).packetId, 17)
            touch(e.TOUCH_MOVE, 200, 250)
            assert.deepEqual([pointer.x, pointer.y], [200, 250])
            touch(e.TOUCH_START, 140, 20, 2); touch(e.TOUCH_END, 140, 20, 2)
            assert.equal(commands.length, 1, 'a second finger cannot replace the held packet')
            touch(e.TOUCH_END, 200, 250)
            assert.deepEqual({ ...commands.filter(command => command.type === 'placePlant').at(-1) }, { type: 'placePlant', row: 1, column: 2 })
            touch(e.TOUCH_START, 20); touch(e.TOUCH_END, 20)
            assert.equal(snapshot.cursor.mode, 'seed', 'tap selects without planting')
            const x = conveyor ? 140 : 130, beforeSwitch = commands.length
            touch(e.TOUCH_START, x); touch(e.TOUCH_END, x)
            assert.equal(commands.length, beforeSwitch + 1, 'switching selects the new slot atomically without clearing first')
            assert.equal(snapshot.cursor.mode, 'seed')
            assert.equal(conveyor ? commands.at(-1).packetId : commands.at(-1).seedId, conveyor ? 29 : 'sunflower')
            assert.equal(bank.packets[0].view.options.selected, false)
            assert.equal(bank.packets[1].view.options.selected, true, 'the server selection reaches the newly selected packet view')
            touch(e.TOUCH_START, x); touch(e.TOUCH_MOVE, 200, 250); touch(e.TOUCH_MOVE, x); touch(e.TOUCH_END, x)
            assert.equal(snapshot.cursor.mode, 'none', 'dragging back to the packet cancels')
            if (conveyor) {
                snapshot.conveyorPackets = snapshot.conveyorPackets.slice(1)
                snapshot.conveyorPackets[0].x = 0
                bank.sync(snapshot, [], true, null, false)
                touch(e.TOUCH_START, 20); touch(e.TOUCH_END, 20)
                assert.equal(commands.at(-1).packetId, 29, 'touch selects the surviving card after its slot changes')
            }
        } finally { input.destroy(); ui.cleanup() }
    }
})


test('mobile planting keeps tap selection, aims while held, and resolves only the owning finger on release', () => {
    const ui = setup(), e = ui.events
    ui.setMobile()
    const pea = ui.makeButton(0), sunflower = ui.makeButton(120), menu = ui.makeButton(680), modButton = ui.makeButton(560)
    const { LevelInputPresenter } = ui.load('assets/scripts/client/level/LevelInputPresenter.ts')
    const world = {
        phase: 'gameplay', result: 'playing', paused: false, sun: 100, extensions: {},
        cursor: { mode: 'none', seedId: '' },
        seedPackets: ['pea', 'sunflower'].map(seedId => ({ seedId, ready: true, selected: false, cooldownRemaining: 0, availability: {} })),
        items: [] as any[],
    }
    const commands: any[] = []
    let pointer: any, menus = 0, blocked = false, view: any
    const presenter = new LevelInputPresenter(ui.root, {
        definitions: { seeds: { pea: { sunCost: 100 }, sunflower: { sunCost: 50 } }, items: { sun: { width: 40, height: 40 } } },
        render: () => world,
        command(command: any) {
            commands.push(command)
            if (command.type === 'selectSeed') world.cursor = { mode: 'seed', seedId: command.seedId }
            if (command.type === 'clearCursor' || command.type === 'placePlant' && !blocked) world.cursor = { mode: 'none', seedId: '' }
            for (const packet of world.seedPackets) packet.selected = packet.seedId === world.cursor.seedId
            // The server collects the item at the point (itemAt): the sun here is 40 square.
            if (command.type === 'collectItemAt') world.items.find(item => command.x >= item.x && command.x < item.x + 40 && command.y >= item.y && command.y < item.y + 40).state = 'collecting'
        },
    }, view = {
        introComplete: true, canOpenMenu: true, bindTools() { return [] }, level: { award: { kind: 'seed' } }, board: { bounds: { left: 0, right: 800 }, origin: { x: 40, y: 80 }, cell: { width: 80, height: 100 }, rows: 5, columns: 9 },
        audio: { seedPacketSelected() {}, plantingCancelled() {} }, resetCursor() {}, setPointer(value?: any) { pointer = value },
        pointerOffsetY: () => 0, seedPacketAt: (snapshot: any, index: number) => {
            const packet = snapshot.seedPackets[index]
            return packet && { ...packet, availability: !packet.ready ? { reason: 'seed-not-ready' } : snapshot.sun >= (index === 0 ? 100 : 50) ? {} : { reason: 'not-enough-sun' }, command: { type: 'selectSeed', seedId: packet.seedId } }
        },
        bindSeedPackets(select: (index: number) => void) {
            pea.button.onClick = () => select(0)
            sunflower.button.onClick = () => select(1)
            return [pea.button, sunflower.button]
        },
        bindMenu(open: () => void) { menu.node.on('click', open); return menu.button },
        bindSunCounter: () => ({}),
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
        const issued = commands.length
        ui.dispatch(modButton.node, e.TOUCH_START, 560)
        ui.dispatch(modButton.node, e.TOUCH_END, 560)
        assert.equal(modButton.clicks, 1, 'any other button, such as a Mod\'s, also keeps normal touch interaction')
        assert.equal(commands.length, issued, 'and the tap is not taken as a lawn touch')
        view.canOpenMenu = false
        assert.equal(menu.button.canInteract(), false, 'the menu shown after confirming seeds stays disabled until the intro ends')
    } finally { presenter.destroy(); ui.cleanup() }
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

test('a key can stand in for a press, only while the button could be pressed', () => {
    const ui = setup(), a = ui.makeButton(0)
    try {
        assert.equal(a.button.trigger(), true)
        assert.equal(a.clicks, 1)
        a.button.canInteract = () => false
        assert.equal(a.button.trigger(), false, 'not while it cannot be pressed')
        a.button.canInteract = () => true
        a.button.interactable = false
        assert.equal(a.button.trigger(), false, 'nor while disabled')
        assert.equal(a.clicks, 1)
    } finally { ui.cleanup() }
})
