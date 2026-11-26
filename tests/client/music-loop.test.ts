import assert from 'node:assert/strict'
import test from 'node:test'
import { loadScript } from '../loadScript'
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
            json: async (kind: string, id: string) => kind === 'music' && id === 'pvz:choose_seeds' ? tune : undefined,
            audio: async (id: string) => ({ nativeUrl: `${id}.mp3` }),
        } },
        '@/client/sound/SoundSystem': { SoundSystem: { getMusicOutputVolume: () => 1, onMusicVolumeChange: () => () => {} } },
        '@/shared/content/music': musicContent,
    }
    const exports = loadScript('assets/scripts/client/music/MusicSystem.ts', (id: string) => modules[id] ?? {}, { console, jsb: { AudioEngine: engine } })
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
            json: async (kind: string, id: string) => kind === 'music' && id === 'pvz:night_moongrains' ? tune : undefined,
            audio: async (id: string) => ({ nativeUrl: `${id}.mp3` }),
        } },
        '@/client/sound/SoundSystem': { SoundSystem: { getMusicOutputVolume: () => 1, onMusicVolumeChange: () => () => {} } },
        '@/shared/content/music': musicContent,
        './MusicPlaybackSnapshot': playback,
    }
    const exports = loadScript('assets/scripts/client/music/MusicSystem.ts', (id: string) => modules[id] ?? {}, { console, jsb: { AudioEngine: engine } })
    const { MusicSystem } = exports
    await MusicSystem.playTune('night_moongrains')
    times.set(1, 9)
    // The night tune keeps the huge wave's burst at 700, not the day tunes' at 400.
    MusicSystem.startBurst(400)
    assert.equal(MusicSystem.capturePlaybackSnapshot().burstState, 'off')
    MusicSystem.startBurst(700)
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

test("a change of time of day blends the tune playing into the next: both play by its weight, and the next is not started again", async () => {
    const times = new Map<number, number>(), volumes = new Map<number, number>(), stopped = new Set<number>()
    let nextId = 0
    const engine = {
        play2d: () => { const id = ++nextId; times.set(id, 0); return id },
        setVolume: (id: number, value: number) => { volumes.set(id, value); return true },
        pause() {}, resume() {}, stop: (id: number) => { stopped.add(id) },
        setCurrentTime: (id: number, value: number) => { times.set(id, value); return true },
        getCurrentTime: (id: number) => times.get(id),
    }
    const tune = (id: string, stem: string) => ({ schemaVersion: 3, id, durationSec: 100, loopStartSec: 0, loopEndSec: 100, stems: { main: stem } })
    const tunes: Record<string, object> = { 'pvz:day_grasswalk': tune('pvz:day_grasswalk', 'pvz:day'), 'pvz:night_moongrains': tune('pvz:night_moongrains', 'pvz:night') }
    const modules: Record<string, unknown> = {
        cc: { sys: { isNative: true } },
        '@/client/content/ModResources': { modResources: {
            json: async (kind: string, id: string) => kind === 'music' ? tunes[id] : undefined,
            audio: async (id: string) => ({ nativeUrl: `${id}.mp3` }),
        } },
        '@/client/sound/SoundSystem': { SoundSystem: { getMusicOutputVolume: () => 1, onMusicVolumeChange: () => () => {} } },
        '@/shared/content/music': musicContent,
        './MusicPlaybackSnapshot': playback,
    }
    const { MusicSystem } = loadScript('assets/scripts/client/music/MusicSystem.ts', (id: string) => modules[id] ?? {}, { console, jsb: { AudioEngine: engine } })
    await MusicSystem.playTune('day_grasswalk')
    times.set(1, 30)
    MusicSystem.keepTune()
    await MusicSystem.playTune('night_moongrains')
    assert.equal(times.get(2), 30, 'it plays from where the old one is')
    MusicSystem.blendTunes(0.25)
    // At equal power: the cosine and the sine of the blend's quarter turn.
    const near = (actual: number | undefined, expected: number) => assert.ok(Math.abs(actual! - expected) < 1e-9, `${actual} is not ${expected}`)
    assert.equal(stopped.size, 0, 'both play')
    near(volumes.get(1), Math.cos(Math.PI / 8))
    near(volumes.get(2), Math.sin(Math.PI / 8))
    MusicSystem.blendTunes(0.5)
    near(volumes.get(1), Math.SQRT1_2)
    near(volumes.get(2), Math.SQRT1_2)
    MusicSystem.update(1, { zombiesOnScreen: 0 })
    near(volumes.get(1), Math.SQRT1_2)
    near(volumes.get(2), Math.SQRT1_2)
    assert.deepEqual([MusicSystem.capturePlaybackSnapshot().tuneId, MusicSystem.capturePlaybackSnapshot().timeSec], ['day_grasswalk', 30],
        "a save keeps the kept one, the board's the level is on")
    // To the end: the kept one stops, and the next plays on alone, not started again as the level goes on at its time.
    MusicSystem.blendTunes(1)
    MusicSystem.dropKeptTune()
    await MusicSystem.playTune('night_moongrains')
    assert.deepEqual([[...stopped], volumes.get(2), nextId, MusicSystem.capturePlaybackSnapshot().tuneId], [[1], 1, 2, 'night_moongrains'])
})

test("the tune a change of board blends into takes on the drums the old one had on: they are the level's, not the tune's", async () => {
    const times = new Map<number, number>(), volumes = new Map<number, number>()
    let nextId = 0
    const engine = {
        play2d: () => { const id = ++nextId; times.set(id, 0); return id },
        setVolume: (id: number, value: number) => { volumes.set(id, value); return true },
        pause() {}, resume() {}, stop() {},
        setCurrentTime: (id: number, value: number) => { times.set(id, value); return true },
        getCurrentTime: (id: number) => times.get(id),
    }
    const tunes: Record<string, object> = {
        'pvz:night_moongrains': { schemaVersion: 3, id: 'pvz:night_moongrains', durationSec: 112.008, loopStartSec: 0, loopEndSec: 112,
            burstScheme: 'night', drumsLoopEndSec: 64, burstBoundariesSec: [4, 8, 12, 16], burstDrumsOffsetsSec: [4, 0, 4, 0],
            stems: { main: 'pvz:night', drums: 'pvz:nightdrums' } },
        'pvz:day_grasswalk': { schemaVersion: 3, id: 'pvz:day_grasswalk', durationSec: 100, loopStartSec: 0, loopEndSec: 100,
            burstScheme: 'day', burstBoundariesSec: [4, 8, 12, 16], stems: { main: 'pvz:day', drums: 'pvz:daydrums', hihats: 'pvz:dayhihats' } },
    }
    const modules: Record<string, unknown> = {
        cc: { sys: { isNative: true } },
        '@/client/content/ModResources': { modResources: {
            json: async (kind: string, id: string) => kind === 'music' ? tunes[id] : undefined,
            audio: async (id: string) => ({ nativeUrl: `${id}.mp3` }),
        } },
        '@/client/sound/SoundSystem': { SoundSystem: { getMusicOutputVolume: () => 1, onMusicVolumeChange: () => () => {} } },
        '@/shared/content/music': musicContent,
        './MusicPlaybackSnapshot': playback,
    }
    const { MusicSystem } = loadScript('assets/scripts/client/music/MusicSystem.ts', (id: string) => modules[id] ?? {}, { console, jsb: { AudioEngine: engine } })
    await MusicSystem.playTune('night_moongrains')
    // The night's burst on, its drums in at the order after 9 s.
    times.set(1, 9)
    MusicSystem.startBurst(700)
    MusicSystem.update(1, { zombiesOnScreen: 10 })
    times.set(1, 12.1)
    MusicSystem.update(1, { zombiesOnScreen: 10 })
    MusicSystem.update(400, { zombiesOnScreen: 10 })
    assert.deepEqual([MusicSystem.capturePlaybackSnapshot().burstState, MusicSystem.capturePlaybackSnapshot().drumsState], ['on', 'on'])
    MusicSystem.keepTune()
    await MusicSystem.playTune('day_grasswalk')
    MusicSystem.blendTunes(1)
    MusicSystem.dropKeptTune()
    const taken = MusicSystem.capturePlaybackSnapshot()
    assert.deepEqual([taken.tuneId, taken.burstState, taken.drumsState], ['day_grasswalk', 'on', 'on'], 'the day tune bursts on with them')
    MusicSystem.update(1, { zombiesOnScreen: 10 })
    // The day tune's stems: its melody, its drums and its hi-hats, all in.
    assert.deepEqual([volumes.get(3), volumes.get(4), volumes.get(5)], [1, 1, 1])
})

test("a tune blended into plays from where the old one is, folded back into its own loop past its end", async () => {
    const times = new Map<number, number>()
    let nextId = 0
    const engine = {
        play2d: () => { const id = ++nextId; times.set(id, 0); return id },
        setVolume: () => true, pause() {}, resume() {}, stop() {},
        setCurrentTime: (id: number, value: number) => { times.set(id, value); return true },
        getCurrentTime: (id: number) => times.get(id),
    }
    const tunes: Record<string, object> = {
        'pvz:day_grasswalk': { schemaVersion: 3, id: 'pvz:day_grasswalk', durationSec: 100, loopStartSec: 0, loopEndSec: 100, stems: { main: 'pvz:day' } },
        'pvz:minigame': { schemaVersion: 3, id: 'pvz:minigame', durationSec: 60, loopStartSec: 10, loopEndSec: 50, stems: { main: 'pvz:minigame' } },
    }
    const modules: Record<string, unknown> = {
        cc: { sys: { isNative: true } },
        '@/client/content/ModResources': { modResources: {
            json: async (kind: string, id: string) => kind === 'music' ? tunes[id] : undefined,
            audio: async (id: string) => ({ nativeUrl: `${id}.mp3` }),
        } },
        '@/client/sound/SoundSystem': { SoundSystem: { getMusicOutputVolume: () => 1, onMusicVolumeChange: () => () => {} } },
        '@/shared/content/music': musicContent,
        './MusicPlaybackSnapshot': playback,
    }
    const { MusicSystem } = loadScript('assets/scripts/client/music/MusicSystem.ts', (id: string) => modules[id] ?? {}, { console, jsb: { AudioEngine: engine } })
    await MusicSystem.playTune('day_grasswalk')
    times.set(1, 70)
    MusicSystem.keepTune()
    await MusicSystem.playTune('minigame')
    // 70 s is past its loop (10 to 50 s): 20 s into its second time round.
    assert.equal(times.get(2), 30)
    // Paused, from where the old one was paused.
    MusicSystem.dropKeptTune()
    MusicSystem.pause()
    times.set(2, 44)
    MusicSystem.keepTune()
    await MusicSystem.playTune('day_grasswalk')
    assert.equal(times.get(3), 30, 'where it was paused')
})

test("on the web a seek just after a tune starts holds, blended into or restored: its source is not played again", async () => {
    // Cocos' web AudioSource: what it is told while its clip loads waits for the load, it reads as not playing until
    // then, and play() on one playing starts it over from 0.
    class Source {
        static made: Source[] = []
        clip: unknown = null; loop = false; volume = 0; isValid = true; node = { destroy() {} }
        time = 0; started = false; loaded = false
        private waiting: Array<() => void> = []
        constructor() { Source.made.push(this) }
        get playing() { return this.loaded && this.started }
        get currentTime() { return this.loaded ? this.time : 0 }
        set currentTime(time: number) { this.run(() => { this.time = time }) }
        play() { this.run(() => { if (this.started) this.time = 0; this.started = true }) }
        stop() { this.run(() => { this.started = false; this.time = 0 }) }
        pause() {}
        load() { this.loaded = true; for (const operation of this.waiting.splice(0)) operation() }
        private run(operation: () => void) { if (this.loaded) operation(); else this.waiting.push(operation) }
    }
    class Node {
        isValid = true
        addChild() {}
        addComponent(Type: new () => Source) { return new Type() }
        destroy() {}
    }
    const tune = (id: string) => ({ schemaVersion: 3, id, durationSec: 100, loopStartSec: 0, loopEndSec: 100, stems: { main: id } })
    const tunes: Record<string, object> = { 'pvz:day_grasswalk': tune('pvz:day_grasswalk'), 'pvz:night_moongrains': tune('pvz:night_moongrains') }
    const modules: Record<string, unknown> = {
        cc: { sys: { isNative: false }, AudioSource: Source, Node, director: { getScene: () => null, addPersistRootNode() {} } },
        '@/client/content/ModResources': { modResources: {
            json: async (kind: string, id: string) => kind === 'music' ? tunes[id] : undefined,
            audio: async (id: string) => ({ id }),
        } },
        '@/client/sound/SoundSystem': { SoundSystem: { getMusicOutputVolume: () => 1, onMusicVolumeChange: () => () => {} } },
        '@/shared/content/music': musicContent,
        './MusicPlaybackSnapshot': playback,
    }
    const { MusicSystem } = loadScript('assets/scripts/client/music/MusicSystem.ts', (id: string) => modules[id] ?? {}, { console })
    await MusicSystem.playTune('day_grasswalk')
    const day = Source.made.at(-1)!
    day.load()
    day.time = 30
    MusicSystem.keepTune()
    await MusicSystem.playTune('night_moongrains')
    const night = Source.made.at(-1)!
    night.load()
    assert.deepEqual([night.playing, night.time], [true, 30], 'blended into, it plays from where the old one is')
    // A save meanwhile keeps the kept one, the day tune 30 s in, and puts it back.
    const saved = MusicSystem.capturePlaybackSnapshot()
    assert.equal(saved.timeSec, 30)
    MusicSystem.stop()
    await MusicSystem.restorePlaybackSnapshot(saved)
    const restored = Source.made.at(-1)!
    restored.load()
    assert.deepEqual([restored.playing, restored.time], [true, 30], 'restored, where it was saved')
})
