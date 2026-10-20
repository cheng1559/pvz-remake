import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

// Exercise the real button/hover code with ordered capture/target events, without rendering Cocos.
function setup() {
    type Listener = { callback: Function, context: unknown, capture: boolean }
    class Vec {
        constructor(public x = 0, public y = 0, public z = 0) {}
        clone() { return new Vec(this.x, this.y, this.z) }
        set(x: number, y: number, z = 0) { this.x = x; this.y = y; this.z = z; return this }
    }
    const events = Object.fromEntries(['MOUSE_DOWN', 'MOUSE_MOVE', 'MOUSE_UP', 'MOUSE_ENTER', 'MOUSE_LEAVE',
        'TOUCH_START', 'TOUCH_MOVE', 'TOUCH_END', 'TOUCH_CANCEL'].map(name => [name, name.toLowerCase().replace('_', '-')]))
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
        get activeInHierarchy(): boolean { return this.active && (!this.parent || this.parent.activeInHierarchy) }
        get scene(): FakeNode { return this.parent?.scene ?? this }
        addChild(node: FakeNode) { this.children.push(node); node.parent = this }
        isChildOf(node: FakeNode): boolean { return this.parent === node || !!this.parent?.isChildOf(node) }
        getSiblingIndex() { return this.parent?.children.indexOf(this) ?? 0 }
        getComponent() { return this.transform }
        on(type: string, callback: Function, context?: unknown, capture = false) {
            assert.ok(this.transform, 'UI pointer listeners require UITransform; Scene cannot be a capture target')
            const listeners = this.listeners.get(type) ?? []
            listeners.push({ callback, context, capture }); this.listeners.set(type, listeners)
        }
        off(type: string, callback: Function, context?: unknown, capture = false) {
            this.listeners.set(type, (this.listeners.get(type) ?? []).filter(item =>
                item.callback !== callback || item.context !== context || item.capture !== capture))
        }
        emit(type: string, ...args: unknown[]) {
            for (const item of [...this.listeners.get(type) ?? []]) if (!item.capture) item.callback.apply(item.context, args)
        }
    }
    let mobile = false, cursor = 'default'
    const modules: Record<string, any> = {
        cc: {
            Component: class { enabledInHierarchy = true }, _decorator: { ccclass: () => (value: unknown) => value },
            Button: { EventType: { CLICK: 'click' } }, EventMouse: { BUTTON_LEFT: 0, BUTTON_RIGHT: 2 },
            Node: FakeNode, Vec3: Vec, UITransform: Transform, Input: { EventType: events }, input: new FakeNode(),
        },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: { isMobileMode: () => mobile } },
        './CursorManager': { CursorManager: { set: (value: string) => { cursor = value } } },
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
    const dispatch = (target: FakeNode | null, type: string, x: number, key = 0, touchId = 1) => {
        const event = {
            type, windowId: 0, propagationStopped: false, getLocation: () => new Vec(x, 20), getButton: () => key,
            touch: { getID: () => touchId, getLocation: () => new Vec(x, 20) },
        }
        if (!target) { modules.cc.input.emit(type, event); return }
        const path: FakeNode[] = []
        for (let node: FakeNode | null = target; node; node = node.parent) path.unshift(node)
        for (const node of path) for (const item of [...node.listeners.get(type) ?? []]) {
            if (item.capture) item.callback.call(item.context, event)
            if (event.propagationStopped) return
        }
        target.emit(type, event)
    }
    return { root, hover, makeButton, dispatch, events, load, get cursor() { return cursor }, setMobile() { mobile = true },
        cleanup() { for (const button of buttons) { button.enabledInHierarchy = false; button.onDisable() } hover.stop() } }
}

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
