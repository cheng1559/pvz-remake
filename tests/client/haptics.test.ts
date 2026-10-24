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
    }, { performance: { now: () => now } })
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
    now = 100
    Haptics.play()
    assert.equal(calls.length, 3, 'UI feedback cannot cut short an explosion')
    now = 321
    Haptics.play()
    assert.deepEqual(calls, [
        ['ViewController', 'playHapticFeedback:', 'light'],
        ['ViewController', 'playHapticFeedback:', 'heavy'],
        ['ViewController', 'playHapticFeedback:', 'explosion'],
        ['ViewController', 'playHapticFeedback:', 'light'],
    ])
    GameDebugSettings.setHapticsEnabled(false)
    now = 400
    for (const style of ['light', 'medium', 'heavy', 'explosion']) Haptics.play(style)
    assert.equal(calls.length, 4, 'the toggle suppresses all feedback styles')
    assert.equal(load('platform/debug/GameDebugSettings', { cc: { sys } }).GameDebugSettings.hapticsEnabled, false)
    GameDebugSettings.setHapticsEnabled(true)
    Haptics.play()
    assert.equal(calls.length, 5)
})

test('level feedback combines each event batch into the strongest important action', () => {
    const calls: string[] = []
    const { LevelView } = load('client/level/LevelView', {
        '@/platform/Haptics': { Haptics: { play: (style: string) => calls.push(style) } },
    })
    const play = (...types: string[]) => LevelView.prototype.playHaptics(types.map(type => ({ type })))
    play('projectileFired', 'zombieDying')
    play('itemCollected', 'itemCollected')
    play('plantPlaced', 'itemCollected')
    play('itemCollected', 'levelAwardCollected')
    play('plantPlaced', 'mowerActivated', 'levelWon')
    play('plantPlaced', 'plantExploded', 'levelWon')
    assert.deepEqual(calls, ['medium', 'medium', 'heavy', 'explosion'])
})
