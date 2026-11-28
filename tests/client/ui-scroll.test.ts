import assert from 'node:assert/strict'
import test from 'node:test'
import { loadScript } from '../loadScript'
import * as animationModule from '@/shared/content/animation'

test('cached achievements refresh earned flags for the active profile and reset scroll and More state', async () => {
    let earned = true, requests = 0
    const { AchievementScreen } = loadScript('assets/scripts/client/screens/AchievementScreen.ts', (id: string) => ({
        cc: { Component: class {}, Color: class { constructor(public r: number, public g: number, public b: number, public a: number) {} },
            _decorator: { ccclass: () => (value: unknown) => value } },
        '@/client/sound/SoundSystem': { SoundEffect: { GraveButton: 'pvz:gravebutton' } },
        '@/client/api/MenuApi': { menuApi: { getAchievements: async () => {
            requests++
            return { items: [{ id: 3, earned }, { id: 8, earned: !earned }] }
        } } },
    } as Record<string, unknown>)[id] ?? {})
    const screen = new AchievementScreen()
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
    assert.deepEqual([first.color.a, second.color.a, screen.scroll.offset, image, screen.more.pressSound], [255, 32, 0, 'more:normal', 'pvz:gravebutton'])
    earned = false
    await screen.refresh()
    assert.deepEqual([first.color.a, second.color.a], [32, 255], 'switching profile cannot reuse stale achievement flags')
    assert.equal(requests, 2)
    assert.equal(screen.icons.get(3), first, 'the existing icons are reused')
})

test('achievement arrow keys use the GOTY speed: reset to 30 per press, minus 1 every 10ms', () => {
    const { AchievementScreen } = loadScript('assets/scripts/client/screens/AchievementScreen.ts', (id: string) => ({
        cc: { Component: class {}, KeyCode: { ARROW_UP: 1, ARROW_DOWN: 2 }, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/client/input/UIHoverManager': { UIHoverManager: { activeModalRoot: null, isInputBlocked: false } },
        '@/core/GameClock': { gameClock: { delta: (dt: number) => dt } },
    } as Record<string, unknown>)[id] ?? {})
    const screen = new AchievementScreen()
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

test('the More rock scrolls as the arrow keys do, from a speed of 22: 231px down, then back up', () => {
    const { AchievementScreen } = loadScript('assets/scripts/client/screens/AchievementScreen.ts', (id: string) => ({
        cc: { Component: class {}, KeyCode: { ARROW_UP: 1, ARROW_DOWN: 2 }, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/client/input/UIHoverManager': { UIHoverManager: { activeModalRoot: null, isInputBlocked: false } },
        '@/client/sound/SoundSystem': { SoundEffect: { GraveButton: 'pvz:gravebutton' } },
        '@/core/GameClock': { gameClock: { delta: (dt: number) => dt } },
    } as Record<string, unknown>)[id] ?? {})
    const screen = new AchievementScreen()
    screen.node = { isValid: true }
    screen.scroll = { offset: 0 }
    screen.more = { isHovering: false, onStateChange() {} }
    const run = (ticks: number) => { for (let i = 0; i < ticks; i++) screen.update(0.01) }
    screen.pressMore(); run(1)
    assert.equal(screen.scroll.offset, 21, 'at its fastest from the first tick')
    assert.equal(screen.more.pressSound, null, 'scrolling back up plays no sound')
    run(40)
    assert.equal(screen.scroll.offset, 231, '21 + 20 + ... + 1')
    screen.pressMore(); run(40)
    assert.equal(screen.scroll.offset, 0, 'in its Top state, back up')
    assert.equal(screen.more.pressSound, 'pvz:gravebutton')
    screen.pressMore(); run(5)
    screen.onKeyDown({ keyCode: 1 }); run(40)
    assert.equal(screen.scroll.offset, 21 + 20 + 19 + 18 + 17 - 435, 'an arrow press takes the scroll over')
})

/** UIScroll with stand-in nodes; `graphics` is the scrollbar's, `began` the touches its gesture began with. */
function loadUIScroll(isMobileMode: () => boolean = () => false) {
    const state: { graphics?: { calls: unknown[][], fillColor: unknown, clear(): void, fillRect(...values: number[]): void }, began: unknown[] } = { began: [] }
    const uiNode = (options: { graphics?: boolean }) => {
        const transform = {
            width: 0, height: 0,
            setContentSize(width: number, height: number) { this.width = width; this.height = height },
            convertToNodeSpaceAR: (point: { y: number }) => ({ y: point.y }),
        }
        const node = { active: true, isValid: true, on() {}, off() {}, setPosition() {}, getComponent: () => transform }
        if (options.graphics) state.graphics = {
            calls: [], fillColor: null,
            clear() { this.calls.length = 0 },
            fillRect(...values: number[]) { this.calls.push([this.fillColor, ...values]) },
        }
        return { node, transform, graphics: state.graphics }
    }
    const module = loadScript('assets/scripts/client/ui/UIScroll.ts', (id: string) => ({
        cc: {
            _decorator: { ccclass: () => (value: unknown) => value }, Component: class {},
            Color: class { constructor(public r: number, public g: number, public b: number, public a = 255) {} },
            input: { on() {}, off() {} }, Input: { EventType: {} }, Mask: { Type: {} }, Node: { EventType: {} },
            UITransform: class {}, Vec3: class { constructor(public x: number, public y: number) {} },
        },
        '@/client/input/ScrollGesture': {
            TouchScrollGesture: class {
                stopInertia() {} cancel() {} applyInertiaY() {}
                beginTouch(event: unknown) { state.began.push(event) }
            },
            getWheelScrollSteps: (event: { steps: number }) => event.steps,
        },
        '@/shared/content/animation': animationModule,
        '@/client/view/uiNode': { uiNode },
        '@/core/GameClock': { gameClock: { delta: (dt: number) => dt } },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: { isMobileMode } },
    } as Record<string, unknown>)[id] ?? {})
    return { module, state }
}

test('a scroll area built before /mobile is switched on takes touch drags once it is', () => {
    let mobile = false
    const { module: { UIScroll }, state } = loadUIScroll(() => mobile)
    const scroll = new UIScroll()
    scroll.node = {}
    scroll.initialize({ width: 258, height: 100, contentHeight: 400 })
    scroll.beginTouch('desktop')
    mobile = true
    scroll.beginTouch('mobile')
    assert.deepEqual(state.began, ['mobile'])
})

test('the wheel glides: each event moves where the list goes, and each frame closes the same share of the way', () => {
    const { module: { UIScroll } } = loadUIScroll()
    const make = (wheelDuration?: number) => {
        const scroll = new UIScroll()
        scroll.node = {}
        scroll.initialize({ width: 258, height: 100, contentHeight: 1000, wheelStep: 80, wheelDuration })
        return scroll
    }
    const wheel = (scroll: any, steps: number) => scroll.onWheel({ steps, propagationStopped: false })
    const scroll = make()
    wheel(scroll, -1)
    assert.equal(scroll.offset, 0, 'a notch does not jump')
    scroll.update(0.05)
    assert.equal(scroll.offset.toFixed(2), (80 * (1 - Math.exp(-1))).toFixed(2), 'in 0.05 s all but a third of the way')
    // A touchpad's events can come two in a frame, and slowing, as whole points (here 0.1 of a notch each): they add up
    // to where the list goes, and it gets there in ever smaller steps, never back.
    wheel(scroll, -0.1)
    wheel(scroll, -0.1)
    const moves: number[] = []
    for (let frame = 0; frame < 60 && scroll.wheelTarget !== null; frame++) {
        const before = scroll.offset
        scroll.update(1 / 60)
        moves.push(scroll.offset - before)
    }
    assert.equal(scroll.offset, 96)
    assert.ok(moves.every((move, i) => move > 0 && (i === 0 || move <= moves[i - 1] + 0.5)), moves.join(', '))
    wheel(scroll, -1)
    scroll.offset = 10
    scroll.update(0.05)
    assert.equal(scroll.offset, 10, 'setting the offset stops the glide')

    // A wheelDuration eases each step in and out instead.
    const eased = make(0.2)
    wheel(eased, -1)
    eased.update(0.1)
    assert.equal(eased.offset, 80 * animationModule.easeInOutCurve(0.5))
})

test('scrollbar follows the Steam GOTY ScrollbarWidget: thumb size, held track paging and layered thumb', () => {
    const { module: { UIScroll, scrollbarThumb, ZOMBIE_SCROLLBAR_COLORS }, state } = loadUIScroll()
    const graphics = () => state.graphics

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
    assert.equal(color(graphics()!.calls[1][0]), 1, 'the held lower track uses the paging color')
    ticks(1)
    assert.equal(scroll.paging, 0, 'paging stops once the thumb reaches the pointer')
    scroll.releaseBar(event(90))
    assert.deepEqual(graphics()!.calls.map(([value, ...rect]) => [color(value), ...rect.map(Number)]), [
        [0, 0, -87, 8, 87], [0, 0, -100, 8, 13],
        [2, 0, -100, 8, 25],
        [5, 1, -77, 6, 1], [5, 1, -99, 1, 23],
        [3, 0, -100, 8, 1], [3, 7, -100, 1, 25],
        [4, 1, -99, 6, 1], [4, 6, -99, 1, 23],
    ])
})
