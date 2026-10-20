import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

test('achievement wheel scrolling accumulates targets, follows the global clock, and cancels on direct movement', () => {
    const module = { exports: {} as Record<string, any> }
    let speed = 1
    const compiled = transpileModule(readFileSync('assets/scripts/client/ui/UIScroll.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    const modules: Record<string, unknown> = {
        cc: { Component: class {}, Color: class {}, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/core/GameClock': { gameClock: { delta: (dt: number) => dt * speed } },
        '@/client/input/ScrollGesture': {
            TouchScrollGesture: class { stopInertia() {} applyInertiaY() {} },
            getWheelScrollSteps: (event: { getScrollY(): number }) => Math.max(-1, Math.min(1, event.getScrollY() / 120)),
        },
    }
    runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {} })
    const scroll = new module.exports.UIScroll()
    scroll.maxScroll = 15342
    scroll.content = { setPosition() {} }
    scroll.draw = () => {}
    const wheel = { getScrollY: () => -120 }
    scroll.onWheel(wheel)
    assert.equal(scroll.offset, 12, 'the existing default wheel remains immediate')
    scroll.offset = 0
    scroll.wheelStep = 435
    scroll.wheelDuration = 0.35
    scroll.onWheel(wheel)
    scroll.update(0.175)
    assert.equal(scroll.offset, 217.5)
    speed = 0
    scroll.update(1)
    assert.equal(scroll.offset, 217.5)
    speed = 2
    scroll.update(0.0875)
    assert.equal(scroll.offset, 435)
    scroll.onWheel(wheel)
    scroll.onWheel(wheel)
    scroll.update(0.175)
    assert.equal(scroll.offset, 1305, 'successive wheels add to the pending target')
    scroll.scrollTo(15342 + 500, 0.25)
    scroll.update(0.125)
    assert.equal(scroll.offset, 15342)
    scroll.scrollTo(0, 0.25)
    scroll.offset = 100
    scroll.update(1)
    assert.equal(scroll.offset, 100, 'keyboard/manual positioning cancels the tween')
})
