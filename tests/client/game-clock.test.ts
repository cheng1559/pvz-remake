import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { GameClock, gameClock } from '@/core/GameClock'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'

test('nested CLI clock pauses freeze time and tweens while preserving changes to the selected speed', () => {
    const clock = new GameClock()
    const speeds: number[] = []
    clock.onSpeedChange(speed => speeds.push(speed))
    clock.setSpeed(2)
    const release = clock.pause(), releaseInner = clock.pause()
    assert.equal(clock.delta(1), 0)
    clock.setSpeed(3)
    assert.equal(clock.speed, 3)
    releaseInner()
    assert.equal(clock.delta(1), 0)
    release()
    release()
    assert.equal(clock.delta(1), 3)
    assert.equal(speeds.at(-1), 3)
    assert.ok(speeds.slice(1, -1).every(speed => speed === 0))
})

test('adventure pause freezes scene animation, particles and tweens without changing the global clock', () => {
    class Component { enabled = true; isValid = true }
    class ReanimPlayer extends Component {}
    class ParticlePlayer extends Component {}
    class TodParticleSystem extends Component {}
    const reanim = new ReanimPlayer(), disabled = new ReanimPlayer(), particle = new ParticlePlayer(), legacy = new TodParticleSystem(), ui = new Component()
    disabled.enabled = false
    const components = [reanim, disabled, particle, legacy, ui]
    const child = { children: [] }
    const root = { children: [child], getComponentsInChildren: () => components }
    const paused = new Set<object>(), resumed = new Set<object>()
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync('assets/scripts/client/level/LevelView.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    const modules: Record<string, unknown> = {
        cc: { Component, _decorator: { ccclass: () => (value: unknown) => value }, Tween: { pauseAllByTarget: (node: object) => paused.add(node), resumeAllByTarget: (node: object) => resumed.add(node) } },
        '@/client/reanim/ReanimPlayer': { ReanimPlayer }, '@/client/particle/ParticlePlayer': { ParticlePlayer },
        '@/core/Particle': { TodParticleSystem },
    }
    runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {} })
    const view = new module.exports.LevelView(root)
    view.gameOver = { active: false }
    const speed = gameClock.speed
    view.setPaused(true)
    view.setPaused(true)
    assert.deepEqual(components.map(component => component.enabled), [false, false, false, false, true])
    assert.deepEqual(paused, new Set([root, child]))
    assert.equal(gameClock.speed, speed)
    const delayed = [new ReanimPlayer(), new ParticlePlayer(), new TodParticleSystem()]
    components.push(...delayed)
    const delayedNode = { children: [] }
    root.children.push(delayedNode)
    const sceneModule = { exports: {} as Record<string, any> }
    const sceneCode = transpileModule(readFileSync('assets/scripts/client/level/LevelScene.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    runInNewContext(sceneCode.outputText, { exports: sceneModule.exports, require: (id: string) => modules[id] ?? {} })
    const scene = new sceneModule.exports.LevelScene()
    scene.game = { render: () => ({ paused: true }), update() { assert.fail('paused gameplay must not advance') } }
    scene.view = view
    scene.audio = {}
    scene.update(1)
    scene.update(1)
    assert.ok(delayed.every(component => !component.enabled), 'animations and particles loaded after pausing must also freeze')
    assert.ok(paused.has(delayedNode), 'new tween targets must inherit the pause')
    particle.isValid = false
    view.setPaused(false)
    assert.deepEqual(components.map(component => component.enabled), [true, false, false, true, true, true, true, true])
    assert.deepEqual(resumed, new Set([root, child, delayedNode]))
    assert.equal(gameClock.speed, speed)
    view.gameOver.active = true
    view.setPaused(false)
    assert.equal(reanim.enabled, false, 'a finished game cannot resume ordinary scene animation')
    assert.equal(gameClock.speed, speed)
})

test('one clock scales fixed-tick gameplay across frame rates, live speed changes, and freezing', () => {
    const definitions = parseGameplayDefinitions(JSON.parse(readFileSync('tools/content/pvz-base/gameplay/definitions.json', 'utf8')))
    const levels = parseGameplayLevels(JSON.parse(readFileSync('tools/content/pvz-base/gameplay/levels.json', 'utf8')), definitions)
    for (const fps of [30, 60, 144]) {
        const clock = new GameClock()
        const game = new LocalIntegratedGame(definitions, levels, undefined, true)
        game.start({ levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0, firstAdventure: false, mods: [] })
        game.command({ type: 'completeIntro' })
        game.update(0)
        const advanceSecond = () => { for (let frame = 0; frame < fps; frame++) game.update(clock.delta(1 / fps)) }
        advanceSecond()
        assert.equal(game.render().gameplayTick, 100)
        clock.setSpeed(2)
        advanceSecond()
        assert.equal(game.render().gameplayTick, 300)
        clock.setSpeed(0)
        advanceSecond()
        assert.equal(game.render().gameplayTick, 300)
        const frozen = game.render()
        game.command({ type: 'selectSeed', seedId: 'pvz:peashooter' })
        advanceSecond()
        assert.deepEqual(game.render().cursor, { mode: 'seed', seedId: 'pvz:peashooter' })
        assert.equal(game.render().gameplayTick, frozen.gameplayTick)
        assert.deepEqual(game.render().zombies, frozen.zombies)
        game.command({ type: 'clearCursor' })
        advanceSecond()
        assert.deepEqual(game.render().cursor, { mode: 'none' })
        game.command({ type: 'selectSeed', seedId: 'pvz:peashooter' })
        advanceSecond()
        game.command({ type: 'placePlant', row: 2, column: 0 })
        advanceSecond()
        assert.equal(game.render().plants.length, 1, 'planting applies while battle time is frozen')
        assert.equal(game.render().sun, frozen.sun - definitions.seeds['pvz:peashooter'].sunCost)
        assert.deepEqual(game.render().cursor, { mode: 'none' })
        const cooldown = game.render().seedPackets[0].cooldownRemaining
        advanceSecond()
        assert.equal(game.render().seedPackets[0].cooldownRemaining, cooldown)
        game.command({ type: 'selectSeed', seedId: 'pvz:peashooter' })
        advanceSecond()
        assert.equal(game.lastRejection?.code, 'seed-not-ready')
        assert.deepEqual(game.render().cursor, { mode: 'none' })
        assert.equal(game.debugCommand('/removeplant 3 1').ok, true)
        assert.equal(game.render().plants.length, 0)
        assert.equal(game.render().seedPackets[0].cooldownRemaining, cooldown)
        assert.equal(game.render().gameplayTick, frozen.gameplayTick)
        assert.deepEqual(game.render().zombies, frozen.zombies)
        clock.setSpeed(0.5)
        advanceSecond()
        assert.equal(game.render().gameplayTick, 350)
        assert.equal(game.render().plants.length, 0)
        assert.equal(definitions.tickSeconds, 0.01)
        for (const invalid of [-1, NaN, Infinity]) assert.throws(() => clock.setSpeed(invalid))
        assert.equal(clock.speed, 0.5)
    }
})

test('running tweens receive speed changes and unsubscribe on completion or owner destruction', () => {
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync('assets/scripts/core/GameTween.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    })
    runInNewContext(compiled.outputText, {
        exports: module.exports,
        require: (id: string) => id === 'cc' ? { Node: { EventType: { NODE_DESTROYED: 'destroyed' } } } : { gameClock },
    })
    const owners: EventEmitter[] = []
    try {
        for (const end of ['complete', 'destroy']) {
            const owner = new EventEmitter()
            owners.push(owner)
            const speeds: number[] = []
            let complete!: () => void
            const animation = {
                timeScale(speed: number) { speeds.push(speed) },
                call(callback: () => void) { complete = callback; return this },
                start() { return this },
            }
            gameClock.setSpeed(1)
            module.exports.startGameTween(owner, animation)
            gameClock.setSpeed(2)
            gameClock.setSpeed(0)
            gameClock.setSpeed(0.5)
            assert.deepEqual(speeds, [1, 2, 0, 0.5])
            if (end === 'complete') complete()
            else owner.emit('destroyed')
            gameClock.setSpeed(1)
            assert.deepEqual(speeds, [1, 2, 0, 0.5])
            assert.equal(owner.listenerCount('destroyed'), 0)
        }
    } finally {
        for (const owner of owners) owner.emit('destroyed')
        gameClock.setSpeed(1)
    }
})
