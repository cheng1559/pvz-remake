import { AudioClip, AudioSource, director, JsonAsset, Node, sys } from 'cc'
import { AssetLoader } from '@/core/AssetLoader'
import { SoundLoader } from '@/core/SoundLoader'

export type MusicTuneId =
    | 'day_grasswalk'
    | 'choose_seeds'
    | 'title_theme'
    | 'zen_garden'
    | 'puzzle'
    | 'minigame'
    | 'conveyer'
    | 'final_boss'

type MusicStemName = 'main' | 'drums' | 'hihats'
type MusicBurstState = 'off' | 'starting' | 'on' | 'finishing'
type MusicDrumsState = 'off' | 'on-queued' | 'on' | 'off-queued' | 'fading'

interface MusicTuneManifest {
    id: MusicTuneId
    durationSec: number
    loopStartSec: number
    loopEndSec: number
    burstScheme?: 'day'
    burstBoundariesSec?: number[]
    stems: Partial<Record<MusicStemName, string>>
}

interface MusicManifest {
    version: number
    sampleRate: number
    tunes: Partial<Record<MusicTuneId, MusicTuneManifest>>
}

type NativeAudioAsset = {
    url?: string
}

type MusicAudioClip = AudioClip & {
    _nativeAsset?: NativeAudioAsset | null
    nativeUrl?: string
}

type NativeAudioEngine = {
    play2d?: (url: string, loop: boolean, volume: number) => number
    setVolume?: (audioId: number, volume: number) => boolean
    pause?: (audioId: number) => void
    resume?: (audioId: number) => void
    stop?: (audioId: number) => void
    setCurrentTime?: (audioId: number, time: number) => boolean
    getCurrentTime?: (audioId: number) => number
}

type NativeMusicBridge = {
    playMusicWav?: (url: string, loop: boolean, volume: number) => number
    stopMusicWav?: (audioId: number) => void
    pauseMusicWav?: (audioId: number) => void
    resumeMusicWav?: (audioId: number) => void
    setMusicWavVolume?: (audioId: number, volume: number) => void
    setMusicWavCurrentTime?: (audioId: number, time: number) => boolean
    getMusicWavCurrentTime?: (audioId: number) => number
}

type MusicNativePlayer = {
    play: (url: string, loop: boolean, volume: number) => number
    setVolume: (audioId: number, volume: number) => boolean
    pause: (audioId: number) => void
    resume: (audioId: number) => void
    stop: (audioId: number) => void
    setCurrentTime: (audioId: number, time: number) => boolean
    getCurrentTime: (audioId: number) => number
}

type NativeBindings = typeof globalThis & {
    jsb?: {
        AudioEngine?: NativeAudioEngine
        PvzNative?: NativeMusicBridge
    }
}

export interface MusicRuntimeContext {
    zombiesOnScreen: number
}

const MANIFEST_PATH = 'audio/music/music_manifest'
const STEMS: MusicStemName[] = ['main', 'drums', 'hihats']
const START_BURST_ZOMBIES = 10
const FINISH_BURST_ZOMBIES = 4
const BURST_START_TICKS = 400
const BURST_ON_MIN_TICKS = 800
const BURST_FINISH_TICKS = 800
const DRUMS_START_QUEUE_TICKS = 100
const DRUMS_FADE_TICKS = 50
const SYNC_INTERVAL_TICKS = 50
const SYNC_DRIFT_SECONDS = 0.04

function clamp01(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(1, value))
}

function normalizeTicks(ticks: number) {
    if (!Number.isFinite(ticks) || ticks <= 0) return 0
    return ticks
}

export class MusicSystem {
    private static _node: Node | null = null
    private static _sources: Partial<Record<MusicStemName, AudioSource>> = {}
    private static _nativeAudioIds: Partial<Record<MusicStemName, number>> = {}
    private static _manifest: MusicManifest | null = null
    private static _manifestLoading: Promise<MusicManifest | null> | null = null
    private static _clipLoading: Map<string, Promise<AudioClip | null>> = new Map()
    private static _currentTune: MusicTuneManifest | null = null
    private static _currentTuneId: MusicTuneId | null = null
    private static _activeStemNames: MusicStemName[] = []
    private static _playToken = 0
    private static _playing = false
    private static _paused = false
    private static _pauseRequested = false
    private static _pauseTime = 0
    private static _mainVolume = 1
    private static _drumsVolume = 0
    private static _hihatsVolume = 0
    private static _fadeOutCounter = 0
    private static _fadeOutDuration = 0
    private static _syncCounter = 0
    private static _burstState: MusicBurstState = 'off'
    private static _burstCounter = 0
    private static _drumsState: MusicDrumsState = 'off'
    private static _drumsCounter = 0
    private static _queuedDrumsBoundarySec: number | null = null

    static async playTune(tuneId: MusicTuneId, restart = false) {
        if (!restart && this._playing && this._currentTuneId === tuneId && this._fadeOutCounter <= 0) return

        this.stop()
        const token = ++this._playToken
        const manifest = await this._loadManifest()
        if (token !== this._playToken || !manifest) return

        const tune = manifest.tunes[tuneId] ?? null
        if (!tune) {
            console.warn(`[MusicSystem] Missing music tune in manifest: ${tuneId}`)
            return
        }

        const activeStems = this._activeStems(tune)
        const clips = await Promise.all(activeStems.map((stem) => this._loadClip(tune.stems[stem]!)))
        if (token !== this._playToken) return
        if (clips.some((clip) => !clip)) {
            console.warn(`[MusicSystem] Missing music clips for tune: ${tuneId}`)
            return
        }

        this._currentTune = tune
        this._currentTuneId = tuneId
        this._activeStemNames = activeStems
        this._playing = true
        this._paused = false
        this._resetBurstState()
        this._mainVolume = 1
        this._drumsVolume = 0
        this._hihatsVolume = 0
        this._fadeOutCounter = 0
        this._fadeOutDuration = 0
        this._syncCounter = 0

        for (let i = 0; i < activeStems.length; i++) {
            const stem = activeStems[i]
            if (this._playNativeStem(stem, clips[i]!)) continue

            const source = this._getSource(stem)
            source.stop()
            source.clip = clips[i]
            source.loop = this._usesBackendLoop(tune)
            source.volume = 0
        }

        this._applyVolumes()
        for (const stem of activeStems) {
            if (this._nativeAudioIds[stem] !== undefined) continue
            this._sources[stem]?.play()
        }
        if (tune.loopStartSec > 0) this._seekAll(tune.loopStartSec)
        if (this._pauseRequested) this.pause()
    }

    static stop() {
        this._playToken++
        for (const source of Object.values(this._sources)) {
            if (!source) continue
            source.stop()
            source.node.destroy()
        }
        this._sources = {}
        this._stopNativeStems()
        this._playing = false
        this._paused = false
        this._pauseRequested = false
        this._currentTune = null
        this._currentTuneId = null
        this._activeStemNames = []
        this._queuedDrumsBoundarySec = null
        this._fadeOutCounter = 0
        this._fadeOutDuration = 0
        this._resetBurstState()
    }

    static fadeOut(durationTicks: number) {
        if (!this._playing) return
        const duration = normalizeTicks(durationTicks)
        if (duration <= 0) {
            this.stop()
            return
        }
        this._fadeOutDuration = duration
        this._fadeOutCounter = duration
    }

    static pause() {
        this._pauseRequested = true
        if (!this._playing || this._paused) return
        this._pauseTime = this._mainTime()
        for (const source of Object.values(this._sources)) {
            source?.pause()
        }
        for (const audioId of Object.values(this._nativeAudioIds)) {
            if (audioId !== undefined) this._nativePlayer()?.pause(audioId)
        }
        this._paused = true
    }

    static resume() {
        this._pauseRequested = false
        if (!this._playing || !this._paused || !this._currentTune) return
        this._seekAll(this._pauseTime)
        for (const stem of this._activeStemNames) {
            const source = this._sources[stem]
            source?.play()
            const audioId = this._nativeAudioIds[stem]
            if (audioId !== undefined) this._nativePlayer()?.resume(audioId)
        }
        this._paused = false
    }

    static update(ticks: number, context: MusicRuntimeContext) {
        if (!this._playing || this._paused || !this._currentTune) return

        const elapsedTicks = normalizeTicks(ticks)
        this._updateManualLoop()
        if (elapsedTicks > 0) {
            this._updateFadeOut(elapsedTicks)
            if (!this._playing) return
            this._updateBurst(elapsedTicks, context.zombiesOnScreen)
            this._syncCounter += elapsedTicks
            if (this._syncCounter >= SYNC_INTERVAL_TICKS) {
                this._syncCounter = 0
                this._resyncStems()
            }
        }
        this._applyVolumes()
    }

    private static async _loadManifest() {
        if (this._manifest) return this._manifest
        if (this._manifestLoading) return this._manifestLoading

        this._manifestLoading = AssetLoader.load<JsonAsset>(MANIFEST_PATH, JsonAsset, 'music manifest')
            .then((asset) => {
                this._manifestLoading = null
                this._manifest = (asset?.json as MusicManifest | undefined) ?? null
                return this._manifest
            })
        return this._manifestLoading
    }

    private static _loadClip(path: string) {
        const cached = this._clipLoading.get(path)
        if (cached) return cached

        const loading = AssetLoader.load<AudioClip>(path, AudioClip, `music: ${path}`)
        this._clipLoading.set(path, loading)
        return loading
    }

    private static _getSource(stem: MusicStemName) {
        const cached = this._sources[stem]
        if (cached?.isValid) return cached

        const node = this._getNode()
        const stemNode = new Node(`Music_${stem}`)
        node.addChild(stemNode)
        const source = stemNode.addComponent(AudioSource)
        this._sources[stem] = source
        return source
    }

    private static _getNode() {
        if (this._node?.isValid) return this._node

        const node = new Node('MusicSystem')
        const scene = director.getScene()
        if (scene) scene.addChild(node)
        director.addPersistRootNode(node)
        this._node = node
        return node
    }

    private static _mainSource() {
        return this._sources.main ?? null
    }

    private static _mainTime() {
        const mainId = this._nativeAudioIds.main
        if (mainId !== undefined) {
            const time = this._nativePlayer()?.getCurrentTime(mainId)
            return typeof time === 'number' && Number.isFinite(time) ? time : 0
        }

        return this._mainSource()?.currentTime ?? 0
    }

    private static _seekAll(time: number) {
        const tune = this._currentTune
        if (!tune) return

        const seekTime = this._wrapTime(time, tune)
        for (const stem of this._activeStemNames) {
            const audioId = this._nativeAudioIds[stem]
            if (audioId !== undefined) {
                this._nativePlayer()?.setCurrentTime(audioId, seekTime)
                continue
            }

            const source = this._sources[stem]
            if (!source?.clip) continue
            source.currentTime = seekTime
        }
    }

    private static _updateManualLoop() {
        const tune = this._currentTune
        if (!tune) return
        if (this._usesBackendLoop(tune)) return

        const mainTime = this._mainTime()
        if (mainTime < tune.loopEndSec) return

        const overflow = mainTime - tune.loopEndSec
        const target = this._wrapTime(tune.loopStartSec + overflow, tune)
        this._seekAll(target)
        this._resumeSourcesAfterSeek()
        if (this._queuedDrumsBoundarySec !== null && this._queuedDrumsBoundarySec < target) {
            this._queuedDrumsBoundarySec = this._nextBoundaryAfter(target)
        }
    }

    private static _wrapTime(time: number, tune: MusicTuneManifest) {
        const loopStart = tune.loopStartSec
        const loopEnd = tune.loopEndSec
        const loopLength = loopEnd - loopStart
        if (loopLength <= 0) return Math.max(0, time)
        if (time < loopEnd) return Math.max(loopStart, time)
        return loopStart + ((time - loopStart) % loopLength)
    }

    private static _usesBackendLoop(tune?: MusicTuneManifest | null) {
        const target = tune ?? this._currentTune
        return !!target && target.loopStartSec <= 0 && target.loopEndSec > 0
    }

    private static _updateFadeOut(ticks: number) {
        if (this._fadeOutCounter <= 0) return

        this._fadeOutCounter = Math.max(0, this._fadeOutCounter - ticks)
        if (this._fadeOutCounter <= 0) {
            this.stop()
        }
    }

    private static _updateBurst(ticks: number, zombiesOnScreen: number) {
        if (this._currentTune?.burstScheme !== 'day') return

        this._decrementCounters(ticks)
        switch (this._burstState) {
            case 'off':
                this._mainVolume = 1
                this._hihatsVolume = 0
                if (zombiesOnScreen >= START_BURST_ZOMBIES) this._startBurst()
                break
            case 'starting':
                this._hihatsVolume = clamp01(1 - this._burstCounter / BURST_START_TICKS)
                if (this._drumsState === 'off' && this._burstCounter <= DRUMS_START_QUEUE_TICKS) {
                    this._queueDrumsOn()
                }
                if (this._burstCounter <= 0) {
                    this._burstState = 'on'
                    this._burstCounter = BURST_ON_MIN_TICKS
                    this._hihatsVolume = 1
                }
                break
            case 'on':
                this._hihatsVolume = 1
                if (this._burstCounter <= 0 && zombiesOnScreen < FINISH_BURST_ZOMBIES) {
                    this._burstState = 'finishing'
                    this._burstCounter = BURST_FINISH_TICKS
                    this._queueDrumsOff()
                }
                break
            case 'finishing':
                this._hihatsVolume = clamp01(this._burstCounter / BURST_FINISH_TICKS)
                if (this._burstCounter <= 0 && this._drumsState === 'off') {
                    this._burstState = 'off'
                    this._hihatsVolume = 0
                }
                break
        }

        this._updateDrumsState()
    }

    private static _decrementCounters(ticks: number) {
        if (this._burstCounter > 0) this._burstCounter = Math.max(0, this._burstCounter - ticks)
        if (this._drumsCounter > 0) this._drumsCounter = Math.max(0, this._drumsCounter - ticks)
    }

    private static _startBurst() {
        this._burstState = 'starting'
        this._burstCounter = BURST_START_TICKS
    }

    private static _queueDrumsOn() {
        this._drumsState = 'on-queued'
        this._queuedDrumsBoundarySec = this._nextBoundaryAfter(this._mainTime())
    }

    private static _queueDrumsOff() {
        if (this._drumsState === 'off') return
        this._drumsState = 'off-queued'
        this._queuedDrumsBoundarySec = this._nextBoundaryAfter(this._mainTime())
    }

    private static _updateDrumsState() {
        switch (this._drumsState) {
            case 'off':
                this._drumsVolume = 0
                break
            case 'on-queued':
                this._drumsVolume = 0
                if (this._hasReachedQueuedBoundary()) {
                    this._drumsState = 'on'
                    this._drumsVolume = 1
                    this._queuedDrumsBoundarySec = null
                }
                break
            case 'on':
                this._drumsVolume = 1
                break
            case 'off-queued':
                this._drumsVolume = 1
                if (this._hasReachedQueuedBoundary()) {
                    this._drumsState = 'fading'
                    this._drumsCounter = DRUMS_FADE_TICKS
                    this._queuedDrumsBoundarySec = null
                }
                break
            case 'fading':
                this._drumsVolume = clamp01(this._drumsCounter / DRUMS_FADE_TICKS)
                if (this._drumsCounter <= 0) {
                    this._drumsState = 'off'
                    this._drumsVolume = 0
                }
                break
        }
    }

    private static _hasReachedQueuedBoundary() {
        const boundary = this._queuedDrumsBoundarySec
        if (boundary === null) return true
        return this._mainTime() >= boundary
    }

    private static _nextBoundaryAfter(time: number) {
        const tune = this._currentTune
        const boundaries = tune?.burstBoundariesSec ?? []
        if (!tune || boundaries.length === 0) return time

        const boundary = boundaries.find((value) => value > time + 0.02)
        if (boundary !== undefined) return boundary
        return boundaries[0]
    }

    private static _resyncStems() {
        const time = this._mainTime()
        for (const stem of ['drums', 'hihats'] as const) {
            if (!this._activeStemNames.includes(stem)) continue
            const audioId = this._nativeAudioIds[stem]
            if (audioId !== undefined) {
                const player = this._nativePlayer()
                const currentTime = player?.getCurrentTime(audioId)
                if (typeof currentTime === 'number' && Math.abs(currentTime - time) > SYNC_DRIFT_SECONDS) {
                    player?.setCurrentTime(audioId, time)
                }
                continue
            }

            const source = this._sources[stem]
            if (!source?.clip) continue
            if (Math.abs(source.currentTime - time) > SYNC_DRIFT_SECONDS) {
                source.currentTime = time
            }
        }
    }

    private static _resumeSourcesAfterSeek() {
        if (!this._playing || this._paused) return

        for (const stem of this._activeStemNames) {
            const audioId = this._nativeAudioIds[stem]
            if (audioId !== undefined) {
                this._nativePlayer()?.resume(audioId)
                continue
            }

            const source = this._sources[stem]
            const playing = (source as (AudioSource & { playing?: boolean }) | undefined)?.playing
            if (!source?.clip || playing) continue
            source.play()
        }
    }

    private static _applyVolumes() {
        const masterVolume = SoundLoader.getMusicVolume()
        const fadeVolume = this._fadeOutDuration > 0 && this._fadeOutCounter > 0
            ? this._fadeOutCounter / this._fadeOutDuration
            : 1
        for (const stem of STEMS) {
            const volume = this._stemVolume(stem) * masterVolume * fadeVolume
            const audioId = this._nativeAudioIds[stem]
            if (audioId !== undefined) {
                this._nativePlayer()?.setVolume(audioId, clamp01(volume))
                continue
            }

            const source = this._sources[stem]
            if (!source) continue
            source.volume = volume
        }
    }

    private static _resetBurstState() {
        this._burstState = 'off'
        this._burstCounter = 0
        this._drumsState = 'off'
        this._drumsCounter = 0
        this._queuedDrumsBoundarySec = null
    }

    private static _activeStems(tune: MusicTuneManifest) {
        return STEMS.filter((stem) => !!tune.stems[stem])
    }

    private static _playNativeStem(stem: MusicStemName, clip: AudioClip) {
        const player = this._nativePlayer()
        if (!player) return false

        const nativeClip = clip as MusicAudioClip
        const url = nativeClip._nativeAsset?.url ?? nativeClip.nativeUrl
        if (!url) return false

        const audioId = player.play(url, this._usesBackendLoop(), this._stemVolume(stem) * SoundLoader.getMusicVolume())
        if (typeof audioId !== 'number' || audioId < 0) return false

        this._nativeAudioIds[stem] = audioId
        return true
    }

    private static _stopNativeStems() {
        const player = this._nativePlayer()
        for (const audioId of Object.values(this._nativeAudioIds)) {
            if (audioId !== undefined) player?.stop(audioId)
        }
        this._nativeAudioIds = {}
    }

    private static _stemVolume(stem: MusicStemName) {
        if (stem === 'main') return clamp01(this._mainVolume)
        if (stem === 'drums') return clamp01(this._drumsVolume)
        return clamp01(this._hihatsVolume)
    }

    private static _nativePlayer(): MusicNativePlayer | null {
        if (!sys.isNative) return null
        const bridge = (globalThis as NativeBindings).jsb?.PvzNative
        if (
            bridge?.playMusicWav &&
            bridge.stopMusicWav &&
            bridge.pauseMusicWav &&
            bridge.resumeMusicWav &&
            bridge.setMusicWavVolume &&
            bridge.setMusicWavCurrentTime &&
            bridge.getMusicWavCurrentTime
        ) {
            return {
                play: bridge.playMusicWav.bind(bridge),
                stop: bridge.stopMusicWav.bind(bridge),
                pause: bridge.pauseMusicWav.bind(bridge),
                resume: bridge.resumeMusicWav.bind(bridge),
                setVolume: (audioId, volume) => {
                    bridge.setMusicWavVolume!(audioId, volume)
                    return true
                },
                setCurrentTime: bridge.setMusicWavCurrentTime.bind(bridge),
                getCurrentTime: bridge.getMusicWavCurrentTime.bind(bridge),
            }
        }

        const engine = (globalThis as NativeBindings).jsb?.AudioEngine
        if (
            !engine?.play2d ||
            !engine.setVolume ||
            !engine.pause ||
            !engine.resume ||
            !engine.stop ||
            !engine.setCurrentTime ||
            !engine.getCurrentTime
        ) {
            return null
        }
        return {
            play: engine.play2d.bind(engine),
            stop: engine.stop.bind(engine),
            pause: engine.pause.bind(engine),
            resume: engine.resume.bind(engine),
            setVolume: engine.setVolume.bind(engine),
            setCurrentTime: engine.setCurrentTime.bind(engine),
            getCurrentTime: engine.getCurrentTime.bind(engine),
        }
    }
}
