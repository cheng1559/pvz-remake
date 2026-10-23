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

test('cached achievements refresh earned flags for the active profile and reset scroll and More state', async () => {
    const module = { exports: {} as Record<string, any> }
    let earned = true, requests = 0
    const compiled = transpileModule(readFileSync('assets/scripts/client/screens/AchievementScreen.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => ({
        cc: { Component: class {}, Color: class { constructor(public r: number, public g: number, public b: number, public a: number) {} },
            _decorator: { ccclass: () => (value: unknown) => value } },
        '@/client/api/MenuApi': { menuApi: { getAchievements: async () => {
            requests++
            return { items: [{ id: 3, earned }, { id: 8, earned: !earned }] }
        } } },
    } as Record<string, unknown>)[id] ?? {} })
    const screen = new module.exports.AchievementScreen()
    screen.node = { isValid: true }
    screen.scroll = { offset: 900 }
    screen.showingTop = true
    const first = { color: {} as any }, second = { color: {} as any }
    screen.icons.set(3, first)
    screen.icons.set(8, second)
    let image = ''
    screen.more = { onStateChange: (state: string) => { image = `${screen.showingTop ? 'top' : 'more'}:${state}` } }
    screen.initialize = () => assert.fail('refresh cannot recreate text or background nodes')
    await screen.refresh()
    assert.deepEqual([first.color.a, second.color.a, screen.scroll.offset, image], [255, 32, 0, 'more:normal'])
    earned = false
    await screen.refresh()
    assert.deepEqual([first.color.a, second.color.a], [32, 255], 'switching profile cannot reuse stale achievement flags')
    assert.equal(requests, 2)
    assert.equal(screen.icons.get(3), first, 'the existing icons are reused')
})
