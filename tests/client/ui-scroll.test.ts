import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

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

test('achievement arrow keys use the GOTY speed: reset to 30 per press, minus 1 every 10ms', () => {
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync('assets/scripts/client/screens/AchievementScreen.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => ({
        cc: { Component: class {}, KeyCode: { ARROW_UP: 1, ARROW_DOWN: 2 }, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/client/input/UIHoverManager': { UIHoverManager: { activeModalRoot: null, isInputBlocked: false } },
        '@/core/GameClock': { gameClock: { delta: (dt: number) => dt } },
    } as Record<string, unknown>)[id] ?? {} })
    const screen = new module.exports.AchievementScreen()
    screen.node = { isValid: true }
    screen.scroll = { offset: 0 }
    const press = (keyCode: number) => screen.onKeyDown({ keyCode })
    const run = (ticks: number) => { for (let i = 0; i < ticks; i++) screen.update(0.01) }
    press(2); run(40)
    assert.equal(screen.scroll.offset, 435, 'one press scrolls 29 + 28 + ... + 1')
    press(2); run(1); press(2); run(1)
    assert.equal(screen.scroll.offset, 435 + 29 + 29, 'a repeat resets the speed instead of adding to it')
    run(40); press(1); run(40)
    assert.equal(screen.scroll.offset, 435 + 29 + 29 + 406 - 435)
})
