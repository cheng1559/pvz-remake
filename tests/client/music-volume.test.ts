import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { ModuleKind, ScriptTarget, transpileModule } from 'typescript'

function load(path: string, modules: Record<string, unknown>, globals = {}) {
    const module = { exports: {} as Record<string, any> }
    const compiled = transpileModule(readFileSync(`assets/scripts/${path}.ts`, 'utf8'), {
        compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022, experimentalDecorators: true },
    })
    runInNewContext(compiled.outputText, { exports: module.exports, require: (id: string) => modules[id] ?? {}, ...globals })
    return module.exports
}

function fixture(native: boolean) {
    const sources = new Map<string, { volume: number, currentTime: number }>()
    class Node {
        isValid = true
        constructor(readonly name = '') {}
        addChild() {}
        getComponent() { return null }
        addComponent() {
            const source = { node: this, volume: 0, currentTime: 12, stop() {}, play() {}, pause() {} }
            sources.set(this.name, source)
            return source
        }
        destroy() { this.isValid = false }
    }
    const nativeSources = new Map<number, { url: string, volume: number, currentTime: number }>()
    let nextId = 0
    const engine = {
        play2d(url: string, _loop: boolean, volume: number) { nativeSources.set(++nextId, { url, volume, currentTime: 12 }); return nextId },
        setVolume(id: number, volume: number) { nativeSources.get(id)!.volume = volume; return true },
        stop(id: number) { nativeSources.delete(id) },
        pause() {}, resume() {},
        setCurrentTime(id: number, time: number) { nativeSources.get(id)!.currentTime = time; return true },
        getCurrentTime(id: number) { return nativeSources.get(id)!.currentTime },
    }
    const cc = {
        Node, AudioSource: class {}, Component: class {}, sys: { isNative: native },
        director: { getScene: () => new Node(), addPersistRootNode() {} },
        _decorator: { ccclass: () => (value: unknown) => value },
    }
    const SoundLoader = load('client/sound/LegacySoundSystem', { cc }).SoundLoader
    const tune = (prefix: string) => ({
        durationSec: 100, loopStartSec: 0, loopEndSec: 100,
        stems: { main: `${prefix}/main`, drums: `${prefix}/drums`, hihats: `${prefix}/hihats` },
    })
    const MusicSystem = load('client/music/MusicSystem', {
        cc, '@/client/sound/LegacySoundSystem': { SoundLoader },
        './MusicPlaybackSnapshot': load('client/music/MusicPlaybackSnapshot', {}),
        '@/client/content/LegacyAssetLoader': { AssetLoader: { load: async (path: string) =>
            path.endsWith('music_manifest') ? { json: { tunes: {
                title_theme: tune('main'), choose_seeds: tune('overlay'),
                day_grasswalk: { ...tune('main'), burstScheme: 'day', burstBoundariesSec: [14, 16, 18] },
            } } } : { nativeUrl: path },
        } },
    }, { jsb: { AudioEngine: engine } }).MusicSystem
    const source = (kind: 'main' | 'overlay', stem = 'main') => native
        ? [...nativeSources.values()].find(value => value.url === `${kind}/${stem}`)!
        : sources.get(`${kind === 'main' ? 'Music' : 'MusicOverlay'}_${stem}`)!
    return { SoundLoader, MusicSystem, source, cc, Node, sources }
}

for (const native of [false, true]) {
    test(`${native ? 'native' : 'web'} drums follow zombie thresholds, musical boundaries, pause and restored burst state`, async () => {
        const { SoundLoader, MusicSystem, source } = fixture(native)
        SoundLoader.setMusicVolume(1)
        await MusicSystem.playTune('day_grasswalk')
        const snapshot = () => MusicSystem.capturePlaybackSnapshot()
        const update = (ticks: number, zombiesOnScreen = 10) => MusicSystem.update(ticks, { zombiesOnScreen })
        update(1, 9)
        assert.equal(snapshot().burstState, 'off')
        update(1)
        update(200)
        assert.equal(source('main', 'hihats').volume, 0.5)
        MusicSystem.startBurst()
        assert.equal(snapshot().burstCounter, 200, 'flag-wave requests cannot restart an active burst')
        MusicSystem.pause()
        update(1000, 0)
        assert.equal(snapshot().burstCounter, 200)
        MusicSystem.resume()
        update(100)
        assert.equal(snapshot().drumsState, 'on-queued')
        assert.equal(source('main', 'drums').volume, 0)
        source('main').currentTime = 14
        update(1)
        assert.equal(source('main', 'drums').volume, 1, 'drums enter on the next musical boundary')
        update(99)
        assert.equal(snapshot().burstState, 'on')
        MusicSystem.startBurst()
        assert.equal(snapshot().burstState, 'on')
        update(799, 3)
        assert.equal(snapshot().burstState, 'on', 'the burst stays on for at least 800 ticks')
        update(1, 4)
        assert.equal(snapshot().burstState, 'on', 'four zombies keep the burst active')
        update(1, 3)
        assert.equal(snapshot().drumsState, 'off-queued')
        source('main').currentTime = 16
        update(1, 3)
        assert.equal(snapshot().drumsState, 'fading')
        update(25, 3)
        SoundLoader.setMusicVolume(0.4)
        assert.equal(source('main', 'drums').volume, 0.2)
        MusicSystem.pause()
        const saved = snapshot()
        await MusicSystem.restorePlaybackSnapshot(saved)
        update(1000, 0)
        assert.equal(snapshot().drumsCounter, 25, 'restoring a paused game preserves the drum fade')
        MusicSystem.resume()
        update(25, 3)
        assert.equal(source('main', 'drums').volume, 0)
        update(800, 3)
        assert.equal(snapshot().burstState, 'off')
        assert.equal(source('main', 'hihats').volume, 0)
        MusicSystem.startBurst()
        assert.equal(snapshot().burstState, 'starting', 'flag waves start a burst even below the zombie threshold')
        MusicSystem.stop()
    })

    test(`${native ? 'native' : 'web'} music volume changes immediately without ticks, including paused music and overlays`, async () => {
        const { SoundLoader, MusicSystem, source } = fixture(native)
        await MusicSystem.playTune('title_theme')
        await MusicSystem.playOverlayTune('choose_seeds')
        SoundLoader.setMusicVolume(0.2)
        assert.equal(source('main').volume, 0.2)
        assert.equal(source('overlay').volume, 0.2)
        assert.equal(source('main', 'drums').volume, 0)
        SoundLoader.setSfxVolume(0)
        assert.equal(source('main').volume, 0.2, 'SFX volume must not change music')
        MusicSystem.pause()
        SoundLoader.setMusicVolume(0)
        assert.equal(source('main').volume, 0)
        assert.equal(source('overlay').volume, 0)
        SoundLoader.setMusicVolume(0.6)
        assert.equal(source('main').volume, 0.6)
        MusicSystem.resume()
        MusicSystem.fadeOut(100)
        MusicSystem.update(50, { zombiesOnScreen: 0 })
        SoundLoader.setMusicVolume(0.4)
        assert.equal(source('main').volume, 0.2, 'master volume preserves the fade envelope')
        assert.equal(source('overlay').volume, 0.4)
        const stopped = source('main')
        MusicSystem.stop()
        SoundLoader.setMusicVolume(0.9)
        assert.equal(stopped.volume, 0.2, 'stopped players unsubscribe')
        await MusicSystem.playOverlayTune('choose_seeds')
        SoundLoader.setMusicVolume(0.1)
        assert.equal(source('overlay').volume, 0.1, 'overlay-only playback also subscribes')
        MusicSystem.stopOverlayTune()
    })
}

test('MusicPlayer applies master volume live and cleans up its subscription when disabled', async () => {
    const { SoundLoader, cc, Node, sources } = fixture(false)
    const { MusicPlayer } = load('client/music/MusicPlayer', {
        cc, '@/client/sound/LegacySoundSystem': { SoundLoader },
        '@/client/content/ClientContentLoader': {
            ClientContentLoader: class {},
            MusicRepository: class { async load() { return { definition: { id: 'pvz:test', durationSeconds: 100 }, clip: {} } } },
        },
    })
    const player = new MusicPlayer()
    player.node = new Node('player')
    player.onEnable()
    await player.load('pvz:test', {})
    player.play(0.5)
    SoundLoader.setMusicVolume(0.4)
    assert.equal(sources.get('player')!.volume, 0.2)
    player.onDisable()
    SoundLoader.setMusicVolume(0.8)
    assert.equal(sources.get('player')!.volume, 0.2)
    player.onEnable()
    assert.equal(sources.get('player')!.volume, 0.4)
    player.onDisable()
})
