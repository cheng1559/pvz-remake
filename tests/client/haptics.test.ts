import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

function load(file: string, modules: Record<string, unknown>, globals = {}) {
    const exports: any = {}
    const compiled = transpileModule(readFileSync(`assets/scripts/${file}.ts`, 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    runInNewContext(compiled.outputText, { exports, require: (id: string) => modules[id] ?? {}, ...globals })
    return exports
}

test('haptics uses the iOS bridge only and coalesces requests by real time', () => {
    let now = 0
    const calls: unknown[][] = []
    const timers: { callback: () => void, delay: number }[] = []
    const stored = new Map<string, string>()
    const sys = { isNative: false, os: 'ios', OS: { IOS: 'ios' }, localStorage: {
        getItem: (key: string) => stored.get(key) ?? null,
        setItem: (key: string, value: string) => stored.set(key, value),
    } }
    const { GameDebugSettings } = load('platform/debug/GameDebugSettings', { cc: { sys } })
    assert.equal(GameDebugSettings.hapticsEnabled, true)
    const { Haptics } = load('platform/Haptics', {
        cc: { sys, native: { reflection: { callStaticMethod: (...args: unknown[]) => calls.push(args) } } },
        './debug/GameDebugSettings': { GameDebugSettings },
    }, { performance: { now: () => now }, setTimeout: (callback: () => void, delay: number) => timers.push({ callback, delay }) })
    Haptics.play()
    sys.isNative = true
    sys.os = 'macos'
    Haptics.play()
    assert.equal(calls.length, 0)
    sys.os = 'ios'
    Haptics.play()
    now = 39
    Haptics.play('medium')
    assert.equal(calls.length, 1)
    now = 40
    Haptics.play('heavy')
    now = 41
    Haptics.play('explosion')
    Haptics.play('explosion')
    Haptics.play()
    assert.equal(calls.length, 2, 'explosion feedback must not start immediately')
    assert.equal(timers.length, 1, 'simultaneous explosions share one delayed pulse')
    assert.equal(timers[0].delay, 40)
    now = 81
    timers.shift()!.callback()
    now = 140
    Haptics.play()
    assert.equal(calls.length, 3, 'UI feedback cannot cut short an explosion')
    now = 361
    Haptics.play()
    assert.deepEqual(calls, [
        ['ViewController', 'playHapticFeedback:', 'light'],
        ['ViewController', 'playHapticFeedback:', 'heavy'],
        ['ViewController', 'playHapticFeedback:', 'explosion'],
        ['ViewController', 'playHapticFeedback:', 'light'],
    ])
    GameDebugSettings.setHapticsEnabled(false)
    now = 480
    for (const style of ['light', 'medium', 'heavy', 'explosion']) Haptics.play(style)
    assert.equal(calls.length, 4, 'the toggle suppresses all feedback styles')
    assert.equal(load('platform/debug/GameDebugSettings', { cc: { sys } }).GameDebugSettings.hapticsEnabled, false)
    GameDebugSettings.setHapticsEnabled(true)
    Haptics.play()
    assert.equal(calls.length, 5)
})

test('slider haptics follow distance travelled rather than touch event frequency', () => {
    let now = 0
    const pulses: number[] = []
    const { Haptics } = load('platform/Haptics', {
        cc: { sys: { isNative: true, os: 'ios', OS: { IOS: 'ios' } },
            native: { reflection: { callStaticMethod: () => pulses.push(now) } } },
        './debug/GameDebugSettings': { GameDebugSettings: { hapticsEnabled: true } },
    }, { performance: { now: () => now } })
    const { UISlider } = load('client/ui/UISlider', {
        cc: { Component: class {}, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/platform/Haptics': { Haptics },
    })
    const slider = new UISlider()
    slider.knob = { setPosition() {} }
    const sweep = (start: number, duration: number, samples: number) => {
        slider.value = 0
        pulses.length = 0
        for (let i = 1; i <= samples; i++) {
            now = start + duration * i / samples
            slider.change(0.2 * i / samples)
        }
        assert.equal(slider.value, 0.2, 'feedback does not quantize the actual slider value')
        assert.equal(pulses.length, 4, 'twenty percent of the track crosses four haptic steps')
        return [...pulses]
    }
    const slow = sweep(0, 1600, 100)
    const fast = sweep(2000, 400, 100)
    sweep(3000, 400, 25)
    assert.ok(fast[1] - fast[0] < slow[1] - slow[0], 'moving faster makes the pulses closer together')
    now = 4000
    slider.change(slider.value)
    slider.value = 0.43
    slider.change(0.431)
    slider.value = 1
    slider.change(1.2)
    assert.equal(pulses.length, 4, 'stationary touches, sub-step movements, initialization and clamped endpoints are silent')
})

test('level feedback vibrates only for explosions and bowling impacts', () => {
    const calls: string[] = []
    const shakes: number[][] = []
    const { LevelView } = load('client/level/LevelView', {
        '@/platform/Haptics': { Haptics: { play: (style: string) => calls.push(style) } },
    })
    const view = new LevelView()
    view.shakeBoard = (...args: number[]) => shakes.push(args)
    const play = (...types: string[]) => view.playFeedback(types.map(type => ({ type })))
    play('projectileFired', 'zombieDying')
    play('plantExploded')
    play('itemCollected', 'itemCollected')
    play('plantPlaced', 'itemCollected')
    play('itemCollected', 'levelAwardCollected')
    play('plantPlaced', 'mowerActivated', 'levelWon')
    play('levelLost')
    play('plantPlaced', 'plantExploded', 'levelWon')
    play('bowlingImpact')
    play('plantExploded', 'bowlingImpact')
    play('bowlingImpact', 'plantExploded')
    assert.deepEqual(calls, ['explosion', 'explosion', 'heavy', 'explosion', 'explosion'])
    assert.deepEqual(shakes, [[3, -4], [3, -4], [1, -2], [3, -4], [1, -2], [1, -2], [3, -4]])
})

test('code-triggered board shake uses its supplied duration and follows gameplay ticks', () => {
    const { LevelView } = load('client/level/LevelView', {
        '@/platform/Haptics': { Haptics: { play() {} } },
    }, {
        Math: Object.assign(Object.create(Math), { random: () => 1 }),
    })
    const view = new LevelView()
    let position: number[] = [], moves = 0
    view.shakeTarget = { x: 100, y: 200, node: { isValid: true,
        setPosition(x: number, y: number) { position = [x, y]; moves++ },
    } }
    const check = (start: () => void, x: number, y: number, ticks: number) => {
        view.gameplayTick = 100
        start()
        view.syncShake(100)
        assert.deepEqual(position, [100, 200])
        view.syncShake(100 + ticks / 2)
        assert.deepEqual(position, [100 + x, 200 - y])
        const before = moves
        view.syncShake(100 + ticks / 2)
        assert.equal(moves, before, 'a paused gameplay tick does not advance the shake')
        view.syncShake(100 + ticks)
        assert.deepEqual(position, [100, 200], 'the board returns to its original position')
    }
    check(() => view.playFeedback([{ type: 'plantExploded' }]), 3, -4, 12)
    check(() => view.playFeedback([{ type: 'bowlingImpact' }]), 1, -2, 12)
    check(() => view.shakeBoard(8, -6, 20), 8, -6, 20)
    check(() => view.shakeBoard(4, 2, 6), 4, 2, 6)
})
