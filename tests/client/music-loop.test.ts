import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'
import * as playback from '@/client/music/MusicPlaybackSnapshot'
import * as musicContent from '@/shared/content/music'

test('native music never ends by itself and jumps to its loop point, even when a check comes late', async () => {
    let time = 0, loop: boolean | undefined
    const engine = {
        play2d: (_url: string, looping: boolean) => { loop = looping; return 1 },
        setVolume: () => true, pause() {}, resume() {}, stop() {},
        setCurrentTime: (_id: number, value: number) => { time = value; return true },
        getCurrentTime: () => time,
    }
    const tune = { schemaVersion: 3, id: 'pvz:choose_seeds', durationSec: 21.69, loopStartSec: 3.6, loopEndSec: 21.6, stems: { main: 'pvz:choose' } }
    const modules: Record<string, unknown> = {
        cc: { sys: { isNative: true } },
        '@/client/content/ModResources': { modResources: {
            asset: async (id: string, _type: unknown, _animation: unknown, category?: string) =>
                category === 'music' ? (id === 'pvz:choose_seeds' ? { json: tune } : undefined) : { nativeUrl: `${id}.mp3` },
        } },
        '@/client/sound/SoundSystem': { SoundSystem: { getMusicVolume: () => 1, onMusicVolumeChange: () => () => {} } },
        '@/shared/content/music': musicContent,
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

test('night burst switches on the next order, crossfades the melody, and restores the separate drum phase', async () => {
    const times = new Map<number, number>(), volumes = new Map<number, number>()
    let nextId = 0
    const engine = {
        play2d: () => { const id = ++nextId; times.set(id, 0); return id },
        setVolume: (id: number, value: number) => { volumes.set(id, value); return true },
        pause() {}, resume() {}, stop() {},
        setCurrentTime: (id: number, value: number) => { times.set(id, value); return true },
        getCurrentTime: (id: number) => times.get(id),
    }
    const tune = { schemaVersion: 3, id: 'pvz:night_moongrains', durationSec: 112.008, loopStartSec: 0, loopEndSec: 112,
        burstScheme: 'night', drumsLoopEndSec: 64, burstBoundariesSec: [4, 8, 12, 16],
        burstDrumsOffsetsSec: [4, 0, 4, 0], stems: { main: 'pvz:main', drums: 'pvz:drums' } }
    const modules: Record<string, unknown> = {
        cc: { sys: { isNative: true } },
        '@/client/content/ModResources': { modResources: {
            asset: async (id: string, _type: unknown, _animation: unknown, category?: string) =>
                category === 'music' ? (id === 'pvz:night_moongrains' ? { json: tune } : undefined) : { nativeUrl: `${id}.mp3` },
        } },
        '@/client/sound/SoundSystem': { SoundSystem: { getMusicVolume: () => 1, onMusicVolumeChange: () => () => {} } },
        '@/shared/content/music': musicContent,
        './MusicPlaybackSnapshot': playback,
    }
    const exports: Record<string, any> = {}
    runInNewContext(transpileModule(readFileSync('assets/scripts/client/music/MusicSystem.ts', 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
    }).outputText, { exports, require: (id: string) => modules[id] ?? {}, console, jsb: { AudioEngine: engine } })
    const { MusicSystem } = exports
    await MusicSystem.playTune('night_moongrains')
    times.set(1, 9)
    MusicSystem.startBurst()
    MusicSystem.update(1, { zombiesOnScreen: 10 })
    assert.equal(MusicSystem.capturePlaybackSnapshot().drumsState, 'on-queued')
    assert.equal(volumes.get(2), 0)
    times.set(1, 12.1)
    MusicSystem.update(1, { zombiesOnScreen: 10 })
    assert.ok(Math.abs(times.get(2)! - 4.1) < 1e-6, 'odd order enters drum order 77')
    MusicSystem.update(400, { zombiesOnScreen: 10 })
    assert.equal(volumes.get(1), 0)
    assert.equal(volumes.get(2), 1)
    MusicSystem.pause()
    const saved = MusicSystem.capturePlaybackSnapshot()
    await MusicSystem.restorePlaybackSnapshot(saved)
    const mainId = nextId - 1, drumsId = nextId
    assert.ok(Math.abs(times.get(drumsId)! - 4.1) < 1e-6)
    MusicSystem.resume()
    MusicSystem.update(800, { zombiesOnScreen: 0 })
    MusicSystem.update(400, { zombiesOnScreen: 0 })
    assert.equal(volumes.get(mainId), 0)
    assert.equal(volumes.get(drumsId), 0.5)
    MusicSystem.update(700, { zombiesOnScreen: 0 })
    assert.equal(volumes.get(mainId), 1)
    assert.equal(volumes.get(drumsId), 0)
})

test('each tune is its own music resource, checked when loaded', async () => {
    const { parseMusic, musicResourceId } = await import('@/shared/content/music')
    assert.equal(musicResourceId('night_moongrains'), 'pvz:night_moongrains', 'a Mod replaces a tune by registering this ID')
    const base = { schemaVersion: 3, id: 'pvz:night_moongrains', durationSec: 112, loopStartSec: 0, loopEndSec: 112, stems: { main: 'hd-bgm:night' } }
    assert.deepEqual(parseMusic(base).stems, { main: 'hd-bgm:night' }, 'a complete mix needs only its main stem')
    assert.throws(() => parseMusic({ ...base, burstScheme: 'night', burstBoundariesSec: [4] }), /needs music.stems.drums/)
    assert.throws(() => parseMusic({ ...base, stems: { main: 'audio/music/night' } }), /audio resource ID/)
    assert.throws(() => parseMusic({ ...base, loopEndSec: 120 }), /loop must satisfy/)
})
