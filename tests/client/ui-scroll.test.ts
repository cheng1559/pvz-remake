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
        '@/client/sound/SoundSystem': { SoundEffect: { GraveButton: 'gravebutton' } },
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
    assert.deepEqual([first.color.a, second.color.a, screen.scroll.offset, image, screen.more.pressSound], [255, 32, 0, 'more:normal', 'gravebutton'])
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

test('scrollbar follows the Steam GOTY ScrollbarWidget: thumb size, held track paging and layered thumb', () => {
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync('assets/scripts/client/ui/UIScroll.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    let graphics: { calls: unknown[][], fillColor: unknown, clear(): void, fillRect(...values: number[]): void } | undefined
    const uiNode = (options: { graphics?: boolean }) => {
        const transform = {
            width: 0, height: 0,
            setContentSize(width: number, height: number) { this.width = width; this.height = height },
            convertToNodeSpaceAR: (point: { y: number }) => ({ y: point.y }),
        }
        const node = { active: true, isValid: true, on() {}, off() {}, setPosition() {}, getComponent: () => transform }
        if (options.graphics) graphics = {
            calls: [], fillColor: null,
            clear() { this.calls.length = 0 },
            fillRect(...values: number[]) { this.calls.push([this.fillColor, ...values]) },
        }
        return { node, transform, graphics }
    }
    runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => ({
        cc: {
            _decorator: { ccclass: () => (value: unknown) => value }, Component: class {},
            Color: class { constructor(public r: number, public g: number, public b: number, public a = 255) {} },
            input: { on() {}, off() {} }, Input: { EventType: {} }, Mask: { Type: {} }, Node: { EventType: {} },
            UITransform: class {}, Vec3: class { constructor(public x: number, public y: number) {} },
        },
        '@/client/input/ScrollGesture': { TouchScrollGesture: class { stopInertia() {} cancel() {} applyInertiaY() {} } },
        '@/client/view/uiNode': { uiNode },
        '@/core/GameClock': { gameClock: { delta: (dt: number) => dt } },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: { isMobileMode: () => false } },
    } as Record<string, unknown>)[id] ?? {} })
    const { UIScroll, scrollbarThumb, ZOMBIE_SCROLLBAR_COLORS } = module.exports

    // Almanac box 170px high with a page of 85%: a 2px overflow still leaves 27px of thumb travel.
    const { size, position } = scrollbarThumb(170, 172, 144.5, 27.5)
    assert.deepEqual([size, position], [143, 27])
    assert.equal(scrollbarThumb(170, 340, 144.5, 0).size, 72)
    assert.equal(scrollbarThumb(100, 5000, 100, 0).size, 8)
    // Zomboni: 12 lines (186px) at the full width, 13 (203px) when drawn 7px narrower in a 126px box.
    const zomboni = new UIScroll()
    zomboni.node = {}
    zomboni.initialize({ width: 257, height: 126, contentHeight: 186, pageHeight: 126 * 0.85 })
    const end = (drawnHeight: number) => {
        zomboni.setContentHeight(186, drawnHeight)
        zomboni.offset = 1000
        return [Number(zomboni.offset.toFixed(1)), zomboni.thumb.size, zomboni.thumb.position]
    }
    assert.deepEqual(end(203), [78.9, 73, 53], 'the 1096 range already shows the last narrowed line')
    assert.deepEqual(end(220), [94, 73, 53], 'a hidden last line extends the range but not the thumb')

    const scroll = new UIScroll()
    scroll.node = {}
    scroll.initialize({ width: 258, height: 100, contentHeight: 400 })
    assert.equal(scroll.contentWidth, 251, 'the text is 7px narrower while the bar is shown')
    const event = (y: number) => ({ getUILocation: () => ({ x: 0, y: -y }), propagationStopped: false })
    const ticks = (count: number) => { for (let i = 0; i < count; i++) scroll.update(0.01) }
    scroll.pressBar(event(90))
    assert.equal(scroll.offset, 100, 'a track click pages at once')
    ticks(24)
    assert.equal(scroll.offset, 100)
    ticks(1)
    assert.equal(scroll.offset, 200, 'holding pages again after 25 updates')
    ticks(4)
    assert.equal(scroll.offset, 200)
    ticks(1)
    assert.equal(scroll.offset, 300, 'then every 5 updates')
    const color = (value: unknown) => ZOMBIE_SCROLLBAR_COLORS.indexOf(value)
    assert.equal(color(graphics!.calls[1][0]), 1, 'the held lower track uses the paging color')
    ticks(1)
    assert.equal(scroll.paging, 0, 'paging stops once the thumb reaches the pointer')
    scroll.releaseBar(event(90))
    assert.deepEqual(graphics!.calls.map(([value, ...rect]) => [color(value), ...rect.map(Number)]), [
        [0, 0, -87, 8, 87], [0, 0, -100, 8, 13],
        [2, 0, -100, 8, 25],
        [5, 1, -77, 6, 1], [5, 1, -99, 1, 23],
        [3, 0, -100, 8, 1], [3, 7, -100, 1, 25],
        [4, 1, -99, 6, 1], [4, 6, -99, 1, 23],
    ])
})
