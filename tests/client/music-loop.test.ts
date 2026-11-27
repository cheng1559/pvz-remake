import assert from 'node:assert/strict'
import test from 'node:test'
import { loadScript } from '../loadScript'
import * as playback from '@/client/music/MusicPlaybackSnapshot'
import * as musicContent from '@/shared/content/music'

/** MusicSystem with its tunes, the engine `cc` and the Mod resources given; a module tune plays through `player`. */
function loadMusic(cc: object, resources: object, globals: Record<string, unknown> = {}, player?: object) {
    const common: Record<string, unknown> = {
        '@/client/content/ModResources': { modResources: resources },
        '@/client/sound/SoundSystem': { SoundSystem: { getMusicOutputVolume: () => 1, onMusicVolumeChange: () => () => {} } },
        '@/shared/content/music': musicContent,
        './MusicPlaybackSnapshot': playback,
    }
    const load = (file: string, own: Record<string, unknown>) =>
        loadScript(`assets/scripts/client/music/${file}.ts`, id => own[id] ?? common[id] ?? {}, { console, ...globals })
    const tune = load('Tune', {})
    const fileTune = load('FileTune', { cc, './Tune': tune })
    const moduleTune = load('ModuleTune', { cc, './Tune': tune, './ModulePlayer': { NativeModulePlayer: { create: () => player } } })
    return load('MusicSystem', { './Tune': tune, './FileTune': fileTune, './ModuleTune': moduleTune }).MusicSystem
}

/** A native engine whose streams' times the test sets. */
function nativeEngine() {
    const times = new Map<number, number>(), volumes = new Map<number, number>(), stopped = new Set<number>()
    let nextId = 0
    const engine = {
        play2d: () => { const id = ++nextId; times.set(id, 0); return id },
        setVolume: (id: number, value: number) => { volumes.set(id, value); return true },
        pause() {}, resume() {}, stop: (id: number) => { stopped.add(id) },
        setCurrentTime: (id: number, value: number) => { times.set(id, value); return true },
        getCurrentTime: (id: number) => times.get(id),
    }
    return { engine, times, volumes, stopped, get last() { return nextId } }
}

/**
 * The module player as native/engine/common/music's Player behaves: `move` takes an instance on, and a jump queued on
 * one watching it lands as it enters another order.
 */
function modulePlayer() {
    type Instance = { order: number, row: number, playing: boolean, volume: number, jumps: number, jump?: { watched: number, from: number, orders: number[], volume: number } }
    const instances: Instance[] = []
    const player = {
        instances,
        loadsWhilePlaying: false,
        load: async () => instances.push({ order: 0, row: 0, playing: false, volume: 1, jumps: 0 }) - 1,
        play(instance: number, order: number, row: number) { Object.assign(instances[instance], { order, row, playing: true }) },
        stop(instance: number) { instances[instance].playing = false; delete instances[instance].jump },
        setVolume(instance: number, volume: number) { instances[instance].volume = volume },
        setChannelVolume() {},
        queueJump(target: number, watched: number, orders: number[], volume: number) {
            instances[target].jump = { watched, from: instances[watched].order, orders: [...orders], volume }
        },
        position: (instance: number) => ({ order: instances[instance].order, row: instances[instance].row, rowFraction: 0 }),
        playing: (instance: number) => instances[instance].playing,
        jumps: (instance: number) => instances[instance].jumps,
        channels: () => 30,
        setOutputVolume() {}, setPaused() {}, destroy() {},
        move(instance: number, order: number, row = 0) {
            Object.assign(instances[instance], { order, row })
            for (const target of instances) {
                const jump = target.jump
                if (!jump || jump.watched !== instance || order === jump.from) continue
                Object.assign(target, { order: jump.orders[order % jump.orders.length], row: 0, volume: jump.volume, jumps: target.jumps + 1 })
                delete target.jump
            }
        },
        /** The playing instance at `order`. */
        at: (order: number) => instances.findIndex(entry => entry.playing && entry.order === order),
    }
    return player
}

const NIGHT = { schemaVersion: 4, id: 'pvz:night_moongrains', burstScheme: 'night', drumsJumpOrders: [76, 77],
    parts: { main: { module: 'pvz:mainmusic', order: 0x30 }, drums: { module: 'pvz:mainmusic', order: 0x5C } } }
const CHOOSE = { schemaVersion: 4, id: 'pvz:choose_seeds', parts: { main: { module: 'pvz:mainmusic', order: 0x7A } } }
const DAY = { schemaVersion: 4, id: 'pvz:day_grasswalk', burstScheme: 'day', parts: {
    main: { module: 'pvz:mainmusic', order: 0, channels: [[0, 23]] }, drums: { module: 'pvz:mainmusic', order: 0, channels: [[24, 26]] },
    hihats: { module: 'pvz:mainmusic_hihats', order: 0, channels: [[27, 27]] } } }

function moduleMusic(tunes: Record<string, object>) {
    const player = modulePlayer()
    const MusicSystem = loadMusic({ sys: { isNative: true } }, {
        json: async (kind: string, id: string) => kind === 'music' ? tunes[id] : undefined,
        tracker: async () => new Uint8Array([1]),
    }, {}, player)
    return { MusicSystem, player }
}

test('a native file tune loops its whole file by itself', async () => {
    const native = nativeEngine()
    let loop: boolean | undefined
    const play2d = native.engine.play2d
    native.engine.play2d = (...args: unknown[]) => { loop = args[1] as boolean; return play2d() }
    const tune = { schemaVersion: 4, id: 'pvz:choose_seeds', audio: 'pvz:choose', durationSec: 21.69 }
    const MusicSystem = loadMusic({ sys: { isNative: true } }, {
        json: async (kind: string, id: string) => kind === 'music' && id === 'pvz:choose_seeds' ? tune : undefined,
        audio: async (id: string) => ({ nativeUrl: `${id}.mp3` }),
    }, { jsb: { AudioEngine: native.engine } })
    const update = () => MusicSystem.update(0, { zombiesOnScreen: 0 })
    const time = () => native.times.get(1)!

    await MusicSystem.playTune('choose_seeds')
    assert.equal(loop, true)
    for (const at of [21.65, 0.2]) {
        native.times.set(1, at)
        update()
        assert.equal(time(), at, 'nothing seeks it')
    }
})

test("a night burst brings the drums in at the melody's next order and swaps the melody out, and a save keeps it", async () => {
    const { MusicSystem, player } = moduleMusic({ 'pvz:night_moongrains': NIGHT, 'pvz:choose_seeds': CHOOSE })
    await MusicSystem.playTune('night_moongrains')
    const main = player.at(0x30), drums = player.at(0x5C)
    assert.deepEqual([player.instances[main].volume, player.instances[drums].volume], [1, 0], 'the melody heard, the drums not')
    // The night tune keeps the huge wave's burst at 700, not the day tunes' at 400.
    MusicSystem.startBurst(400)
    assert.equal(MusicSystem.capturePlaybackSnapshot().burst.state, 'off')
    MusicSystem.startBurst(700)
    MusicSystem.update(1, { zombiesOnScreen: 10 })
    assert.deepEqual([MusicSystem.capturePlaybackSnapshot().burst.drumsState, !!player.instances[drums].jump], ['on-queued', true])
    // The melody enters an odd order: the drums start order 77 there, heard at once.
    player.move(main, 0x31)
    assert.deepEqual([player.instances[drums].order, player.instances[drums].volume], [77, 1])
    MusicSystem.update(1, { zombiesOnScreen: 10 })
    MusicSystem.update(400, { zombiesOnScreen: 10 })
    assert.deepEqual([player.instances[main].volume, player.instances[drums].volume, MusicSystem.capturePlaybackSnapshot().burst.drumsState], [0, 1, 'on'])

    player.move(drums, 77, 9)
    MusicSystem.pause()
    const saved = MusicSystem.capturePlaybackSnapshot()
    assert.deepEqual(saved.parts, { main: [0x31, 0], drums: [77, 9] })
    await MusicSystem.restorePlaybackSnapshot(saved)
    const melody = player.at(0x31), restored = player.at(77)
    assert.deepEqual([melody >= 0, player.instances[restored]?.row], [true, 9], 'restored, each part where it was saved')
    MusicSystem.resume()
    MusicSystem.update(800, { zombiesOnScreen: 0 })
    MusicSystem.update(400, { zombiesOnScreen: 0 })
    assert.deepEqual([player.instances[melody].volume, player.instances[restored].volume], [0, 0.5])
    MusicSystem.update(700, { zombiesOnScreen: 0 })
    assert.deepEqual([player.instances[melody].volume, player.instances[restored].volume], [1, 0])

    // A fade out that runs out stops the chooser's tune, and MusicSystem then stops it again: its one instance goes back
    // once, and the tune played next has one for each part.
    await MusicSystem.playTune('choose_seeds')
    MusicSystem.fadeOut(10)
    MusicSystem.update(10, { zombiesOnScreen: 0 })
    await MusicSystem.playTune('night_moongrains')
    assert.deepEqual(player.instances.filter(entry => entry.playing).map(entry => entry.order).sort((a, b) => a - b), [0x30, 0x5C])
})

test('a preload makes the instances a tune needs where a module loads while music plays, counting those playing', async () => {
    for (const loadsWhilePlaying of [true, false]) {
        const { MusicSystem, player } = moduleMusic({ 'pvz:choose_seeds': CHOOSE, 'pvz:day_grasswalk': DAY })
        player.loadsWhilePlaying = loadsWhilePlaying
        await MusicSystem.playTune('choose_seeds')
        await MusicSystem.preloadTune('day_grasswalk')
        // The day tune's melody and drums are both mainmusic, of which the chooser plays one: one more, and the hi-hats.
        assert.equal(player.instances.length, loadsWhilePlaying ? 3 : 1, 'the worklet would read them on the audio thread')
        await MusicSystem.playTune('day_grasswalk')
        assert.deepEqual([player.instances.length, player.instances.filter(entry => entry.playing).length], [3, 3], 'it plays on them')
    }
})

test('each tune is its own music resource, checked when loaded', async () => {
    const { parseMusic, musicResourceId } = await import('@/shared/content/music')
    assert.equal(musicResourceId('night_moongrains'), 'pvz:night_moongrains', 'a Mod replaces a tune by registering this ID')
    const file = { schemaVersion: 4, id: 'pvz:night_moongrains', audio: 'hd-bgm:night', durationSec: 112 }
    assert.deepEqual(parseMusic(file), file)
    assert.throws(() => parseMusic({ ...file, schemaVersion: 3 }), /schemaVersion must be 4/)
    assert.throws(() => parseMusic({ ...file, audio: 'audio/music/night' }), /audio resource ID/)
    assert.throws(() => parseMusic({ ...file, loopStartSec: 3 }), /loopStartSec is not supported/, 'a recording loops whole')
    assert.throws(() => parseMusic({ ...file, parts: NIGHT.parts }), /either parts or audio/)
    assert.throws(() => parseMusic({ schemaVersion: 4, id: file.id, durationSec: 112 }), /either parts or audio/)
    assert.deepEqual((parseMusic(NIGHT) as musicContent.ModuleMusic).parts.drums, { module: 'pvz:mainmusic', order: 0x5C, row: 0 })
    assert.throws(() => parseMusic({ ...NIGHT, parts: { main: NIGHT.parts.main } }), /needs music.parts.drums/)
    assert.throws(() => parseMusic({ ...DAY, drumsJumpOrders: [76, 77] }), /only for a night burst/)
    assert.throws(() => parseMusic({ ...DAY, parts: { main: { ...DAY.parts.main, channels: [[23, 0]] } } }), /range/)
})

test("a change of time of day blends the tune playing into the next: both play by its weight, and the next is not started again", async () => {
    const native = nativeEngine()
    const tune = (id: string, audio: string) => ({ schemaVersion: 4, id, audio, durationSec: 100 })
    const tunes: Record<string, object> = { 'pvz:day_grasswalk': tune('pvz:day_grasswalk', 'pvz:day'), 'pvz:night_moongrains': tune('pvz:night_moongrains', 'pvz:night') }
    const MusicSystem = loadMusic({ sys: { isNative: true } }, {
        json: async (kind: string, id: string) => kind === 'music' ? tunes[id] : undefined,
        audio: async (id: string) => ({ nativeUrl: `${id}.mp3` }),
    }, { jsb: { AudioEngine: native.engine } })
    const { times, volumes, stopped } = native
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
    assert.deepEqual([[...stopped], volumes.get(2), native.last, MusicSystem.capturePlaybackSnapshot().tuneId], [[1], 1, 2, 'night_moongrains'])
})

test("the tune a change of board blends into takes on the drums the old one had on: they are the level's, not the tune's", async () => {
    const { MusicSystem, player } = moduleMusic({ 'pvz:night_moongrains': NIGHT, 'pvz:day_grasswalk': DAY })
    await MusicSystem.playTune('night_moongrains')
    // The night's burst on, its drums in at the order after.
    MusicSystem.startBurst(700)
    MusicSystem.update(1, { zombiesOnScreen: 10 })
    player.move(player.at(0x30), 0x31)
    MusicSystem.update(1, { zombiesOnScreen: 10 })
    MusicSystem.update(400, { zombiesOnScreen: 10 })
    MusicSystem.keepTune()
    await MusicSystem.playTune('day_grasswalk')
    MusicSystem.blendTunes(1)
    MusicSystem.dropKeptTune()
    const taken = MusicSystem.capturePlaybackSnapshot()
    assert.deepEqual([taken.tuneId, taken.burst.state, taken.burst.drumsState], ['day_grasswalk', 'on', 'on'], 'the day tune bursts on with them')
    MusicSystem.update(1, { zombiesOnScreen: 10 })
    // The day tune's parts, all from its order 0: its melody, its drums and its hi-hats, all in.
    const day = player.instances.filter(entry => entry.playing)
    assert.deepEqual([day.length, day.map(entry => entry.order), day.map(entry => entry.volume)], [3, [0, 0, 0], [1, 1, 1]])
})

test("a tune blended into plays from where the old one is, folded back into it past its end", async () => {
    const native = nativeEngine()
    const tunes: Record<string, object> = {
        'pvz:day_grasswalk': { schemaVersion: 4, id: 'pvz:day_grasswalk', audio: 'pvz:day', durationSec: 100 },
        'pvz:minigame': { schemaVersion: 4, id: 'pvz:minigame', audio: 'pvz:minigame', durationSec: 60 },
    }
    const MusicSystem = loadMusic({ sys: { isNative: true } }, {
        json: async (kind: string, id: string) => kind === 'music' ? tunes[id] : undefined,
        audio: async (id: string) => ({ nativeUrl: `${id}.mp3` }),
    }, { jsb: { AudioEngine: native.engine } })
    const { times } = native
    await MusicSystem.playTune('day_grasswalk')
    times.set(1, 70)
    MusicSystem.keepTune()
    await MusicSystem.playTune('minigame')
    // 70 s is past its 60: 10 s into its second time round.
    assert.equal(times.get(2), 10)
    // Paused, from where the old one was paused.
    MusicSystem.dropKeptTune()
    MusicSystem.pause()
    times.set(2, 44)
    MusicSystem.keepTune()
    await MusicSystem.playTune('day_grasswalk')
    assert.equal(times.get(3), 10, 'where it was paused')
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
    const tune = (id: string) => ({ schemaVersion: 4, id, audio: id, durationSec: 100 })
    const tunes: Record<string, object> = { 'pvz:day_grasswalk': tune('pvz:day_grasswalk'), 'pvz:night_moongrains': tune('pvz:night_moongrains') }
    const MusicSystem = loadMusic({ sys: { isNative: false }, AudioSource: Source, Node, director: { getScene: () => null, addPersistRootNode() {} } }, {
        json: async (kind: string, id: string) => kind === 'music' ? tunes[id] : undefined,
        audio: async (id: string) => ({ id }),
    })
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
