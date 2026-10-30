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
    class TouchEvent {
        constructor(private eventCode: string) {}
        getEventCode() { return this.eventCode }
    }
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
    return { root, hover, makeButton, dispatch, events, load, Node: FakeNode, cursorHistory, haptics, get cursor() { return cursor }, setMobile(value = true) { mobile = value },
        cleanup() { for (const button of buttons) { button.enabledInHierarchy = false; button.onDisable() } hover.stop() } }
}




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
        pointerOffsetY: () => 0, seedPacketAt: (snapshot: any, index: number) => bank.packetAt(snapshot, index),
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
        assert.deepEqual(flashes, [], 'a cleared recharge alone does not flash; the server decides readiness')
        const seedId = world.seedPackets[1].seedId
        bank.sync(world, [{ type: 'seedPacketFlashRequested', sequence: 0, data: { seedId, slot: 1 } }], true, null)
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



test('ordinary and conveyor packets share mobile drag, tap, switch and cancel interaction', () => {
    for (const conveyor of [false, true]) {
        const ui = setup(), e = ui.events
        ui.setMobile()
        const { LevelSeedBank } = ui.load('assets/scripts/client/level/LevelSeedBank.ts')
        const { LevelInputPresenter } = ui.load('assets/scripts/client/level/LevelInputPresenter.ts')
        const definitions = { seeds: { pea: { plant: 'pvz:peashooter', sunCost: 100 }, sunflower: { plant: 'pvz:sunflower', sunCost: 50 } }, items: {} }
        const bank = new LevelSeedBank({
            level: { seedPackets: ['pea', 'sunflower'], ...(conveyor ? { conveyor: { capacity: 2, seeds: [{ id: 'pea' }] } } : {}) },
            content: { definitions, presentation: presentationFixture }, seedPacketSlot: ui.root, presentation: {},
            ui: { text: (key: string) => key, tooltip: () => ({ show() {}, hide() {} }) },
        })
        if (conveyor) assert.ok(bank.packets.every((packet: any) => packet.seedId === undefined && !packet.view.node.active),
            'conveyor slots start empty and hidden, without borrowing the first configured seed')
        const snapshot: any = { phase: 'gameplay', result: 'playing', paused: false, availableSun: conveyor ? 0 : 100,
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
            board: { origin: { x: 40, y: 80 }, cell: { width: 80, height: 100 }, rows: 5, columns: 9 },
            audio: { seedPacketSelected() {}, plantingCancelled() {} }, resetCursor() {}, setPointer(value: any) { pointer = value },
            pointerOffsetY: () => 0, seedPacketAt: (world: any, index: number) => bank.packetAt(world, index),
            bindSeedPackets: (select: (index: number) => void) => bank.bind(select), bindMenu: () => menu.button,
        })
        input.boardPixel = (event: any) => event.getUILocation()
        const touch = (type: string, x: number, y = 20, id = 1) => { ui.dispatch(ui.root, type, x, 0, id, y); flush() }
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
        phase: 'gameplay', result: 'playing', paused: false, availableSun: 100, extensions: {},
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
            if (command.type === 'collectItemAt') world.items.find(item => item.entityId === command.itemId).state = 'collecting'
        },
    }, view = {
        introComplete: true, canOpenMenu: true, bindTools() { return [] }, level: { award: { kind: 'seed' } }, board: { origin: { x: 40, y: 80 }, cell: { width: 80, height: 100 }, rows: 5, columns: 9 },
        audio: { seedPacketSelected() {}, plantingCancelled() {} }, resetCursor() {}, setPointer(value?: any) { pointer = value },
        pointerOffsetY: () => 0, seedPacketAt: (snapshot: any, index: number) => {
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
