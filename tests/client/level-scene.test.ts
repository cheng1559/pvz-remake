import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import { gameClock } from '@/core/GameClock'

test('a level scene runs an injected intro and level through clock scaling, pause, save and completion', async () => {
    const module = { exports: {} as Record<string, any> }
    const code = transpileModule(readFileSync('assets/scripts/client/level/LevelScene.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    let suspended = false
    runInNewContext(code.outputText, {
        exports: module.exports,
        require: (id: string) => ({
            cc: { Component: class {}, _decorator: { ccclass: () => (value: unknown) => value } },
            '@/core/GameClock': { gameClock },
            '@/platform/debug/GameDebugSettings': { GameDebugSettings: { perfLogicEnabled: true } },
            './LevelInputPresenter': { LevelInputPresenter: class {
                start() {} destroy() {} suspend() { suspended = true } resume() { suspended = false }
            } },
        }[id] ?? {}),
    })
    const scene = new module.exports.LevelScene()
    let destroyed = false, complete = 0, introTicks = 0, choosing = 0, gameplay = 0
    let presentationPaused = false, musicPaused = false
    const commands: string[] = [], deltas: number[] = []
    const world = { levelId: 'example:second-level', phase: 'intro', result: 'playing', paused: false }
    const start = { levelId: world.levelId, randomSeed: 5, mods: [], initialMoney: 0 }
    const audio = {
        startChoosing() { choosing++ }, startGameplay() { gameplay++ }, syncResult() {}, stop() {},
        pause() { musicPaused = true }, resume() { musicPaused = false },
    }
    scene.node = { isValid: true, destroy() { destroyed = true } }
    scene.configure({
        start(options: unknown) { assert.equal(options, start) },
        render: () => world,
        command(command: { type: string }) {
            commands.push(command.type)
            if (command.type === 'completeIntro') world.phase = 'gameplay'
            if (command.type === 'pause') world.paused = true
            if (command.type === 'resume') world.paused = false
        },
        update(dt: number) { deltas.push(dt) }, drainEvents: () => [], drainChanges: () => ({}),
        snapshotPresentation: (snapshot: unknown) => snapshot,
    }, {
        audio, sync() {}, bindSeedChooser() {}, setPaused(value: boolean) { presentationPaused = value },
        updateIntro(dt: number) { introTicks += dt; return introTicks >= 1 },
        updateLevelComplete: () => world.result === 'won',
        snapshot: async (flow: unknown) => ({ flow }),
    }, start, { onComplete() { complete++ } })
    try {
        gameClock.setSpeed(2)
        scene.update(0.5)
        assert.equal(choosing, 1)
        assert.equal(gameplay, 1)
        assert.equal(deltas[0], 1)
        scene.pause()
        scene.update(1)
        assert.equal(presentationPaused, true)
        assert.equal(musicPaused, true)
        assert.equal(suspended, true)
        assert.equal(deltas.length, 2, 'paused frames cannot advance the world')
        scene.resume()
        const snapshot = await scene.snapshotPresentation()
        assert.equal(snapshot.flow.introCompletionSent, true)
        assert.equal(snapshot.flow.completionStarted, false)
        assert.equal(suspended, false)
        scene.update(0.25)
        assert.equal(commands.filter(command => command === 'completeIntro').length, 1)
        world.result = 'won'
        scene.update(0.25)
        scene.update(0.25)
        await Promise.resolve()
        assert.equal(complete, 1)
        assert.equal(destroyed, true)
    } finally { gameClock.setSpeed(1); scene.onDestroy() }
})
