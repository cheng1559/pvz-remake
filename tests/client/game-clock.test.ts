import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { GameClock, gameClock } from '@/core/GameClock'
import { parseGameplayDefinitionsV2, parseGameplayLevelsV2 } from '@/shared/content/gameplay'

test('one clock scales fixed-tick gameplay across frame rates, live speed changes, and freezing', () => {
    const definitions = parseGameplayDefinitionsV2(JSON.parse(readFileSync('tools/content/pvz-base/gameplay/definitions.json', 'utf8')))
    const levels = parseGameplayLevelsV2(JSON.parse(readFileSync('tools/content/pvz-base/gameplay/levels.json', 'utf8')), definitions)
    for (const fps of [30, 60, 144]) {
        const clock = new GameClock()
        const game = new LocalIntegratedGame(definitions, levels)
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
        clock.setSpeed(0.5)
        advanceSecond()
        assert.equal(game.render().gameplayTick, 350)
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
