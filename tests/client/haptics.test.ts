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
