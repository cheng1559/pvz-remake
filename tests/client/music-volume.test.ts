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
    const nativeSources = new Map<number, { url: string, volume: number }>()
    let nextId = 0
    const engine = {
        play2d(url: string, _loop: boolean, volume: number) { nativeSources.set(++nextId, { url, volume }); return nextId },
        setVolume(id: number, volume: number) { nativeSources.get(id)!.volume = volume; return true },
        stop(id: number) { nativeSources.delete(id) },
        pause() {}, resume() {}, setCurrentTime() { return true }, getCurrentTime() { return 12 },
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
        '@/client/content/LegacyAssetLoader': { AssetLoader: { load: async (path: string) =>
            path.endsWith('music_manifest') ? { json: { tunes: { title_theme: tune('main'), choose_seeds: tune('overlay') } } } : { nativeUrl: path },
        } },
    }, { jsb: { AudioEngine: engine } }).MusicSystem
    const source = (kind: 'main' | 'overlay', stem = 'main') => native
        ? [...nativeSources.values()].find(value => value.url === `${kind}/${stem}`)!
        : sources.get(`${kind === 'main' ? 'Music' : 'MusicOverlay'}_${stem}`)!
    return { SoundLoader, MusicSystem, source, cc, Node, sources }
}

for (const native of [false, true]) {
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
