import assert from 'node:assert/strict'
import test from 'node:test'
import { loadScript } from '../loadScript'

// The real UIHoverManager, with touches played as the engine plays them: for one on a node under the app's root, the
// root's capturing listeners in order, then (unless stopped) the node's own, then the root's bubbling ones; for one no
// node takes, the input's own listeners. The screen is 2556 pixels wide at 3 to a point.
function setup(mobile = true) {
    const EventType = {
        TOUCH_START: 'touch-start', TOUCH_MOVE: 'touch-move', TOUCH_END: 'touch-end', TOUCH_CANCEL: 'touch-cancel',
        MOUSE_DOWN: 'mouse-down', MOUSE_MOVE: 'mouse-move', MOUSE_UP: 'mouse-up',
    }
    type Listener = { type: string, callback: Function, target: unknown, capture: boolean }
    const listeners = (list: Listener[]) => ({
        on(type: string, callback: Function, target: unknown, capture = false) { list.push({ type, callback, target, capture }) },
        off(type: string, callback: Function, _target: unknown, capture = false) {
            const index = list.findIndex(entry => entry.type === type && entry.callback === callback && entry.capture === capture)
            if (index >= 0) list.splice(index, 1)
        },
    })
    const rootListeners: Listener[] = [], inputListeners: Listener[] = []
    const root = listeners(rootListeners), input = listeners(inputListeners)
    const modules: Record<string, unknown> = {
        cc: { input, Input: { EventType }, Node: class {}, screen: { devicePixelRatio: 3, windowSize: { width: 2556, height: 1179 } } },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: { isMobileMode: () => mobile } },
        './CursorManager': { CursorManager: { set() {} } },
    }
    const { UIHoverManager } = loadScript('assets/scripts/client/input/UIHoverManager.ts', id => modules[id] ?? {})
    const seen: string[] = []
    UIHoverManager.registerClient({
        clearHover() {}, refreshHover: () => false,
        handleTouch: (event: any) => { seen.push(`hover ${event.type} ${event.touch.getID()}`) },
    })
    UIHoverManager.start(root)
    const vec = (x: number, y: number): any => ({ x, y, clone: () => vec(x, y) })
    const event = (type: string, id: number, x: number) => ({
        type, windowId: 0, propagationStopped: false, propagationImmediateStopped: false, getUILocation: () => vec(x, 500),
        touch: { getID: () => id, getLocationX: () => x, getLocation: () => vec(x, 500) },
    })
    const onNode = (type: string, id: number, x: number) => {
        const touch = event(type, id, x)
        for (const entry of rootListeners.filter(entry => entry.capture && entry.type === type)) {
            entry.callback.call(entry.target, touch)
            if (touch.propagationImmediateStopped) break
        }
        if (touch.propagationStopped) return
        seen.push(`node ${type} ${id}`)
        for (const entry of rootListeners.filter(entry => !entry.capture && entry.type === type)) entry.callback.call(entry.target, touch)
    }
    const unclaimed = (type: string, id: number, x: number) => {
        const touch = event(type, id, x)
        for (const entry of inputListeners.filter(entry => entry.type === type)) entry.callback.call(entry.target, touch)
    }
    return { seen, onNode, unclaimed }
}

test('on mobile a touch that starts within 24 points of a side edge reaches nothing, though it moves in; one from further in may move to the edge', () => {
    const { seen, onNode } = setup()
    // 24 points are 72 of the screen's pixels.
    onNode('touch-start', 1, 71)
    onNode('touch-move', 1, 600)
    onNode('touch-end', 1, 600)
    onNode('touch-start', 2, 2556 - 71)
    onNode('touch-cancel', 2, 2556 - 71)
    assert.deepEqual(seen, [], 'the hand holding the device, at either edge')
    onNode('touch-start', 1, 72)
    onNode('touch-move', 1, 10)
    onNode('touch-end', 1, 10)
    assert.deepEqual(seen, [
        'node touch-start 1', 'hover touch-start 1', 'hover touch-move 1', 'node touch-move 1', 'hover touch-end 1', 'node touch-end 1',
    ], 'a finger, with the ID the hand had')
})

test('a touch no node takes is turned away at the edges too, and a new touch may take the ID of one whose end never came', () => {
    const { seen, unclaimed, onNode } = setup()
    unclaimed('touch-start', 3, 0)
    unclaimed('touch-move', 3, 900)
    unclaimed('touch-end', 3, 900)
    unclaimed('touch-start', 4, 900)
    unclaimed('touch-end', 4, 900)
    assert.deepEqual(seen.splice(0), ['hover touch-start 4', 'hover touch-end 4'])
    onNode('touch-start', 5, 20)
    onNode('touch-start', 5, 900)
    onNode('touch-move', 5, 950)
    assert.deepEqual(seen, ['node touch-start 5', 'hover touch-start 5', 'hover touch-move 5', 'node touch-move 5'])
})

test('with the mouse\'s controls (not mobile mode) a touch at the edge goes through', () => {
    const { seen, onNode } = setup(false)
    onNode('touch-start', 6, 0)
    assert.deepEqual(seen, ['node touch-start 6'])
})
