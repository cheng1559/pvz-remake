import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

test('native music never ends by itself and jumps to its loop point, even when a check comes late', async () => {
    let time = 0, loop: boolean | undefined
    const engine = {
        play2d: (_url: string, looping: boolean) => { loop = looping; return 1 },
        setVolume: () => true, pause() {}, resume() {}, stop() {},
        setCurrentTime: (_id: number, value: number) => { time = value; return true },
        getCurrentTime: () => time,
    }
    const tune = { id: 'choose_seeds', durationSec: 21.69, loopStartSec: 3.6, loopEndSec: 21.6, stems: { main: 'pvz:choose' } }
    const modules: Record<string, unknown> = {
        cc: { sys: { isNative: true } },
        '@/client/content/ModResources': { modResources: {
            asset: async (id: string) => id.endsWith('music_manifest') ? { json: { tunes: { choose_seeds: tune } } } : { nativeUrl: `${id}.mp3` },
        } },
        '@/client/sound/SoundSystem': { SoundSystem: { getMusicVolume: () => 1, onMusicVolumeChange: () => () => {} } },
    }
    const exports: Record<string, any> = {}
    const code = transpileModule(readFileSync('assets/scripts/client/music/MusicSystem.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    }).outputText
    runInNewContext(code, { exports, require: (id: string) => modules[id] ?? {}, console, jsb: { AudioEngine: engine } })
    const { MusicSystem } = exports
    const update = () => MusicSystem.update(0, { zombiesOnScreen: 0 })

    await MusicSystem.playTune('choose_seeds')
    assert.equal(loop, true, 'a stream that reaches its end stops refilling before a late seek can land')
    time = 21.65
    update()
    assert.ok(Math.abs(time - 3.65) < 1e-6, 'passing the loop end continues from the loop start')
    time = 21.5
    update()
    assert.equal(time, 21.5)
    time = 0.2
    update()
    assert.ok(Math.abs(time - 3.89) < 1e-6, 'a wrapped stream skips the intro and keeps the time it played since the loop end')
})
