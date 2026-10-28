import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

test('viewport expands from 4:3 to 21:9, then letterboxes outside the range without extending input into the bars', () => {
    const crop = {}, letterbox = {}, originalPolicy = {}
    let policy = originalPolicy
    let design = { width: 800, height: 600 }
    const screen = { windowSize: { width: 1600, height: 900 } }
    const sys = { isNative: false, os: 'mac', OS: { OSX: 'mac', WINDOWS: 'windows', IOS: 'ios' } }
    const constraints: number[][] = []
    const scale = () => (policy === crop ? Math.max : Math.min)(
        screen.windowSize.width / design.width, screen.windowSize.height / design.height)
    const view = Object.assign(new EventEmitter(), {
        getDesignResolutionSize: () => ({ ...design, clone: () => ({ ...design }) }),
        getResolutionPolicy: () => policy,
        getVisibleSize: () => ({ ...design }),
        getScaleX: scale, getScaleY: scale,
        setDesignResolutionSize(width: number, height: number, next: object) {
            design = { width, height }
            policy = next
            view.emit('design-resolution-changed')
        },
    })
    class Node extends EventEmitter {
        static EventType = { NODE_DESTROYED: 'destroyed' }
        isValid = true
        width = 0
        height = 0
        getComponent() { return { setContentSize: (size: any) => Object.assign(this, size) } }
    }
    const exports: any = {}
    const code = transpileModule(readFileSync('assets/scripts/client/view/ClientViewport.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    runInNewContext(code.outputText, { exports,
        jsb: { setWindowAspectRatio: (...args: number[]) => { constraints.push(args); return true } },
        require: () => ({ Node, view, screen, sys, ResolutionPolicy: { NO_BORDER: crop, SHOW_ALL: letterbox } }),
    })
    exports.constrainNativeWindow(4 / 3, 21 / 9)
    assert.equal(constraints.length, 0, 'web preview does not constrain its host window')
    sys.isNative = true
    for (const os of [sys.OS.OSX, sys.OS.WINDOWS, sys.OS.IOS]) {
        sys.os = os
        exports.constrainNativeWindow(4 / 3, 21 / 9)
    }
    assert.deepEqual(constraints, [[4 / 3, 21 / 9], [4 / 3, 21 / 9]], 'only native desktop windows are constrained')
    sys.os = sys.OS.OSX
    constraints.length = 0
    exports.initializeViewport()
    const menu = new Node(), level = new Node(), dialog = new Node()
    for (const node of [menu, level, dialog]) exports.fitViewport(node)
    exports.expandViewport({ minAspect: 4 / 3, maxAspect: 21 / 9 })
    exports.expandViewport()
    exports.initializeViewport()
    assert.deepEqual(constraints, [[4 / 3, 4 / 3], [4 / 3, 21 / 9]], 'desktop window aspect is limited to 21:9')
    assert.equal(view.listenerCount('canvas-resize'), 1)
    for (const node of [menu, level, dialog]) assert.ok(Math.abs(node.width - 600 * 1600 / 900) < 1e-8)
    // Hiding/destroying a menu does not restore the old letterboxed viewport.
    menu.emit('destroyed')
    assert.equal(policy, crop)
    for (const [width, height, stageWidth, visibleWidth, expectedPolicy] of [
        [1200, 900, 800, 800, crop],
        [1600, 900, 600 * 1600 / 900, 600 * 1600 / 900, crop],
        [2100, 900, 1400, 1400, crop],
        [2200, 900, 1400, 1400, letterbox],
        [3200, 900, 1400, 1400, letterbox],
        [4000, 900, 1400, 1400, letterbox],
        [6400, 900, 1400, 1400, letterbox],
        [900, 900, 800, 800, letterbox],
        [900, 1600, 800, 800, letterbox],
    ] as const) {
        screen.windowSize = { width, height }
        view.emit('canvas-resize')
        assert.ok(Math.abs(design.width - stageWidth) < 1e-8)
        assert.equal(design.height, 600)
        assert.equal(policy, expectedPolicy)
        for (const node of [level, dialog]) {
            assert.ok(Math.abs(node.width - visibleWidth) < 1e-8)
            assert.ok(Math.abs(node.height - 600) < 1e-8, 'the full logical content height is preserved')
        }
        const contentWidth = Math.min(width, height * stageWidth / 600)
        const contentHeight = Math.min(height, width * 600 / stageWidth)
        assert.ok(Math.abs(visibleWidth * scale() - contentWidth) < 1e-8)
        assert.ok(Math.abs(600 * scale() - contentHeight) < 1e-8)
        if (width / height < 4 / 3) assert.ok((height - contentHeight) / 2 > 0, 'narrow windows have top and bottom bars')
        if (width / height > 21 / 9) assert.ok((width - contentWidth) / 2 > 0, 'wide windows have side bars')
    }
    exports.resetViewport()
    assert.equal(constraints.length, 2, 'teardown must not constrain the native window back to 4:3')
    assert.equal(policy, originalPolicy)
    assert.equal(level.width, 800)
    assert.equal(level.height, 600)
    exports.expandViewport({ minAspect: 4 / 3, maxAspect: 21 / 9 })
    exports.initializeViewport()
    assert.deepEqual(constraints.slice(2), [[4 / 3, 21 / 9]], 'restart restores the window aspect limit')
    exports.resetViewport()
    exports.expandViewport({ minAspect: 4 / 3, maxAspect: 16 / 9 })
    assert.deepEqual(constraints.at(-1), [4 / 3, 16 / 9], 'other Mods retain the existing window limit by default')
    exports.resetViewport()
    exports.initializeViewport()
    assert.deepEqual(constraints.at(-1), [4 / 3, 4 / 3], 'startup without the Mod restores the fixed window ratio')
    for (const node of [level, dialog]) node.emit('destroyed')
    assert.deepEqual(view.eventNames(), [])
})

