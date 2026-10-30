import { modResources } from '@/client/content/ModResources'
import { AudioClip, AudioSource, director, JsonAsset, Node, sys } from 'cc'
import { MUSIC_TUNE_IDS, musicResourceId, parseMusic, type Music, type MusicStemName } from '@/shared/content/music'
import { SoundSystem } from '@/client/sound/SoundSystem'
import {
    parseMusicPlaybackSnapshot,
    type MusicBurstState,
    type MusicDrumsState,
    type MusicPlaybackSnapshot,
    type MusicTuneId,
} from './MusicPlaybackSnapshot'

export type {
    MusicBurstState,
    MusicDrumsState,
    MusicPlaybackSnapshot,
    MusicTuneId,
} from './MusicPlaybackSnapshot'

type MusicTuneManifest = Music

type NativeAudioEngine = {
    play2d?: (url: string, loop: boolean, volume: number) => number
    setVolume?: (audioId: number, volume: number) => boolean
    pause?: (audioId: number) => void
    resume?: (audioId: number) => void
    stop?: (audioId: number) => void
    setCurrentTime?: (audioId: number, time: number) => boolean
    getCurrentTime?: (audioId: number) => number
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
    }
}

export interface MusicRuntimeContext {
    zombiesOnScreen: number
}

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
    private static _overlaySources: Partial<Record<MusicStemName, AudioSource>> = {}
    private static _overlayNativeAudioIds: Partial<Record<MusicStemName, number>> = {}
    private static _overlayActiveStemNames: MusicStemName[] = []
    private static _overlayPlayToken = 0
    /** Each tune is its own music resource, so a Mod replaces a tune by ID like any other asset. */
    private static _tunes: Map<MusicTuneId, Promise<Music | null>> = new Map()
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
    /** How far the night drum stem runs ahead of the main stem, within its own loop. */
    private static _drumsPhaseSec = 0
    /** The main stem's last observed time, to notice the backend wrapping past a missed loop end. */
    private static _lastMainTime = 0
    private static _burstState: MusicBurstState = 'off'
    private static _burstCounter = 0
    private static _drumsState: MusicDrumsState = 'off'
    private static _drumsCounter = 0
    private static _queuedDrumsBoundarySec: number | null = null
    private static _queuedDrumsAtSec = 0
    private static _queuedDrumsBoundaryWrapped = false
    private static _unsubscribeMusicVolume: (() => void) | null = null

    static async playTune(tuneId: MusicTuneId, restart = false) {
        if (!restart && this._playing && this._currentTuneId === tuneId && this._fadeOutCounter <= 0) return

        this.stop()
        const token = ++this._playToken
        const tune = await this._loadTune(tuneId)
        if (token !== this._playToken) return
        if (!tune) {
            console.warn(`[MusicSystem] Missing music tune: ${tuneId}`)
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
        this._lastMainTime = 0
        this._drumsPhaseSec = 0

        this._unsubscribeMusicVolume ??= SoundSystem.onMusicVolumeChange(() => this._applyVolumes())
        for (let i = 0; i < activeStems.length; i++) {
            const stem = activeStems[i]
            if (this._playNativeStem(stem, clips[i]!)) continue

            const source = this._getSource(stem)
            source.stop()
            source.clip = clips[i]
            // The backend always loops the whole file so playback never ends; loop points are jumped to here.
            source.loop = true
            source.volume = 0
        }

        this._applyVolumes()
        for (const stem of activeStems) {
            if (this._nativeAudioIds[stem] !== undefined) continue
            this._sources[stem]?.play()
        }
        if (this._pauseRequested) this.pause()
    }

    static async preloadTune(tuneId: MusicTuneId) {
        const tune = await this._loadTune(tuneId)
        if (!tune) return

        await Promise.all(this._activeStems(tune).map((stem) => this._loadClip(tune.stems[stem]!)))
    }

    static async preloadAllTunes() {
        await Promise.all(MUSIC_TUNE_IDS.map((tuneId) => this.preloadTune(tuneId)))
    }

    static capturePlaybackSnapshot(): MusicPlaybackSnapshot | null {
        if (!this._playing || !this._currentTuneId || !this._currentTune) return null

        return parseMusicPlaybackSnapshot({
            tuneId: this._currentTuneId,
            ...(this._currentTune.burstScheme === 'night' ? { drumsPhaseSec: this._drumsPhaseSec } : {}),
            timeSec: this._paused ? this._pauseTime : this._mainTime(),
            paused: this._paused || this._pauseRequested,
            mainVolume: this._mainVolume,
            drumsVolume: this._drumsVolume,
            hihatsVolume: this._hihatsVolume,
            fadeOutCounter: this._fadeOutCounter,
            fadeOutDuration: this._fadeOutDuration,
            syncCounter: this._syncCounter,
            burstState: this._burstState,
            burstCounter: this._burstCounter,
            drumsState: this._drumsState,
            drumsCounter: this._drumsCounter,
            queuedDrumsBoundarySec: this._queuedDrumsBoundarySec,
            queuedDrumsAtSec: this._queuedDrumsAtSec,
            queuedDrumsBoundaryWrapped: this._queuedDrumsBoundaryWrapped,
        })
    }

    static async restorePlaybackSnapshot(value: unknown) {
        const snapshot = parseMusicPlaybackSnapshot(value)
        if (snapshot === null) return

        const tune = await this._loadTune(snapshot.tuneId)
        if (!tune) throw new TypeError(`music snapshot tune is unavailable: ${snapshot.tuneId}`)
        for (const [name, time] of [
            ['timeSec', snapshot.timeSec],
            ['queuedDrumsAtSec', snapshot.queuedDrumsAtSec],
            ['queuedDrumsBoundarySec', snapshot.queuedDrumsBoundarySec],
        ] as const) {
            if (time !== null && time > tune.durationSec) {
                throw new TypeError(`music snapshot.${name} exceeds tune duration`)
            }
        }

        await this.playTune(snapshot.tuneId, true)
        if (!this._playing || this._currentTuneId !== snapshot.tuneId) return

        this._drumsPhaseSec = snapshot.drumsPhaseSec ?? 0
        this._seekAll(snapshot.timeSec)
        this._mainVolume = snapshot.mainVolume
        this._drumsVolume = snapshot.drumsVolume
        this._hihatsVolume = snapshot.hihatsVolume
        this._fadeOutCounter = snapshot.fadeOutCounter
        this._fadeOutDuration = snapshot.fadeOutDuration
        this._syncCounter = snapshot.syncCounter
        this._burstState = snapshot.burstState
        this._burstCounter = snapshot.burstCounter
        this._drumsState = snapshot.drumsState
        this._drumsCounter = snapshot.drumsCounter
        this._queuedDrumsBoundarySec = snapshot.queuedDrumsBoundarySec
        this._queuedDrumsAtSec = snapshot.queuedDrumsAtSec
        this._queuedDrumsBoundaryWrapped = snapshot.queuedDrumsBoundaryWrapped
        this._applyVolumes()

        if (snapshot.paused) {
            this._pauseTime = snapshot.timeSec
            this.pause()
            return
        }

        this._resumeSourcesAfterSeek()
    }

    static async playOverlayTune(tuneId: MusicTuneId) {
        this.stopOverlayTune()
        const token = ++this._overlayPlayToken
        const tune = await this._loadTune(tuneId)
        if (token !== this._overlayPlayToken) return
        if (!tune) {
            console.warn(`[MusicSystem] Missing overlay music tune: ${tuneId}`)
            return
        }

        const activeStems = this._activeStems(tune)
        const clips = await Promise.all(activeStems.map((stem) => this._loadClip(tune.stems[stem]!)))
        if (token !== this._overlayPlayToken) return
        if (clips.some((clip) => !clip)) {
            console.warn(`[MusicSystem] Missing overlay music clips for tune: ${tuneId}`)
            return
        }

        this._overlayActiveStemNames = activeStems
        this._unsubscribeMusicVolume ??= SoundSystem.onMusicVolumeChange(() => this._applyVolumes())
        for (let i = 0; i < activeStems.length; i++) {
            const stem = activeStems[i]
            if (this._playNativeOverlayStem(stem, clips[i]!, tune)) continue

            const source = this._getOverlaySource(stem)
            source.stop()
            source.clip = clips[i]
            source.loop = this._loopsWholeFile(tune)
            source.volume = this._overlayStemVolume(stem)
            source.play()
        }
    }

    static stopOverlayTune() {
        this._overlayPlayToken++
        for (const source of Object.values(this._overlaySources)) {
            if (!source) continue
            source.stop()
            source.node.destroy()
        }
        this._overlaySources = {}
        this._stopNativeOverlayStems()
        this._overlayActiveStemNames = []
        if (!this._playing) {
            this._unsubscribeMusicVolume?.()
            this._unsubscribeMusicVolume = null
        }
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
        this._queuedDrumsAtSec = 0
        this._queuedDrumsBoundaryWrapped = false
        this._fadeOutCounter = 0
        this._fadeOutDuration = 0
        this._resetBurstState()
        this.stopOverlayTune()
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

    static startBurst() {
        if (!this._playing || this._paused || !this._currentTune) return
        if (!this._currentTune.burstScheme) return
        this._startBurst()
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

    /** The highest-priority `pvz:<tune>` music resource; an invalid one is reported and treated as missing. */
    private static _loadTune(tuneId: MusicTuneId): Promise<Music | null> {
        let loading = this._tunes.get(tuneId)
        if (!loading) {
            loading = modResources.asset(musicResourceId(tuneId), JsonAsset, undefined, 'music')
                .then(asset => asset ? parseMusic(asset.json) : null)
                .catch(error => {
                    console.error(`[MusicSystem] Invalid music tune: ${tuneId}`, error)
                    this._tunes.delete(tuneId)
                    return null
                })
            this._tunes.set(tuneId, loading)
        }
        return loading
    }

    private static _loadClip(path: string) {
        const cached = this._clipLoading.get(path)
        if (cached) return cached

        const loading = modResources.asset(path, AudioClip).then(clip => clip ?? null)
            .catch(error => { this._clipLoading.delete(path); throw error })
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

    private static _getOverlaySource(stem: MusicStemName) {
        const cached = this._overlaySources[stem]
        if (cached?.isValid) return cached

        const node = this._getNode()
        const stemNode = new Node(`MusicOverlay_${stem}`)
        node.addChild(stemNode)
        const source = stemNode.addComponent(AudioSource)
        this._overlaySources[stem] = source
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

    private static _seekAll(time: number, stems: readonly MusicStemName[] = this._activeStemNames) {
        const tune = this._currentTune
        if (!tune) return

        const seekTime = this._wrapTime(time, tune)
        this._lastMainTime = seekTime
        for (const stem of this._activeStemNames) {
            if (!stems.includes(stem)) continue
            const stemTime = this._stemTime(stem, seekTime)
            const audioId = this._nativeAudioIds[stem]
            if (audioId !== undefined) {
                this._nativePlayer()?.setCurrentTime(audioId, stemTime)
                continue
            }

            const source = this._sources[stem]
            if (!source?.clip) continue
            source.currentTime = stemTime
        }
    }

    private static _updateManualLoop() {
        const tune = this._currentTune
        if (!tune) return
        if (this._loopsWholeFile(tune)) return

        const mainTime = this._mainTime()
        // A check that comes too late finds the backend already wrapped to the start of the file.
        const wrapped = mainTime < this._lastMainTime - 1
        this._lastMainTime = mainTime
        if (!wrapped && mainTime < tune.loopEndSec) return

        const overflow = wrapped ? mainTime + tune.durationSec - tune.loopEndSec : mainTime - tune.loopEndSec
        const target = this._wrapTime(tune.loopStartSec + overflow, tune)
        if (tune.burstScheme === 'night') {
            // Keep the drum phase in [0, drum loop) so it survives the snapshot's non-negative check.
            const duration = tune.drumsLoopEndSec!
            this._drumsPhaseSec = ((this._stemTime('drums', tune.loopEndSec) - tune.loopStartSec) % duration + duration) % duration
        }
        this._seekAll(target)
        this._resumeSourcesAfterSeek()
        if (
            this._queuedDrumsBoundarySec !== null &&
            !this._queuedDrumsBoundaryWrapped &&
            this._queuedDrumsBoundarySec < target
        ) {
            this._setQueuedDrumsBoundary(target)
        }
    }

    private static _wrapTime(time: number, tune: MusicTuneManifest) {
        const loopStart = tune.loopStartSec
        const loopEnd = tune.loopEndSec
        const loopLength = loopEnd - loopStart
        if (loopLength <= 0) return Math.max(0, time)
        if (time < loopEnd) return Math.max(0, time)
        return loopStart + ((time - loopStart) % loopLength)
    }

    private static _loopsWholeFile(tune: MusicTuneManifest) {
        return tune.loopStartSec <= 0 && tune.loopEndSec >= tune.durationSec
    }

    private static _updateFadeOut(ticks: number) {
        if (this._fadeOutCounter <= 0) return

        this._fadeOutCounter = Math.max(0, this._fadeOutCounter - ticks)
        if (this._fadeOutCounter <= 0) {
            this.stop()
        }
    }

    private static _updateBurst(ticks: number, zombiesOnScreen: number) {
        if (this._currentTune?.burstScheme === 'night') { this._updateNightBurst(ticks, zombiesOnScreen); return }
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

    /** Music::UpdateMusicBurst scheme 2 replaces the main melody with the night drum stream. */
    private static _updateNightBurst(ticks: number, zombies: number) {
        this._decrementCounters(ticks)
        switch (this._burstState) {
            case 'off':
                this._mainVolume = 1
                if (zombies >= START_BURST_ZOMBIES) this._startBurst()
                break
            case 'starting':
                if (this._drumsState === 'off') this._queueDrumsOn()
                if (this._drumsState === 'on-queued') this._burstCounter = BURST_START_TICKS
                this._mainVolume = clamp01(this._burstCounter / BURST_START_TICKS)
                if (this._burstCounter === 0) { this._burstState = 'on'; this._burstCounter = BURST_ON_MIN_TICKS }
                break
            case 'on':
                this._mainVolume = 0
                if (this._burstCounter === 0 && zombies < FINISH_BURST_ZOMBIES) {
                    this._burstState = 'finishing'; this._burstCounter = 1100
                    this._drumsState = 'fading'; this._drumsCounter = 800
                }
                break
            case 'finishing':
                this._mainVolume = clamp01(1 - this._burstCounter / 400)
                if (this._burstCounter === 0 && this._drumsState === 'off') this._burstState = 'off'
                break
        }
        this._updateDrumsState()
    }

    private static _decrementCounters(ticks: number) {
        if (this._burstCounter > 0) this._burstCounter = Math.max(0, this._burstCounter - ticks)
        if (this._drumsCounter > 0) this._drumsCounter = Math.max(0, this._drumsCounter - ticks)
    }

    private static _startBurst() {
        if (this._burstState !== 'off') return
        this._burstState = 'starting'
        this._burstCounter = BURST_START_TICKS
    }

    private static _queueDrumsOn() {
        this._drumsState = 'on-queued'
        this._setQueuedDrumsBoundary(this._mainTime())
    }

    private static _queueDrumsOff() {
        if (this._drumsState === 'off') return
        this._drumsState = 'off-queued'
        this._setQueuedDrumsBoundary(this._mainTime())
    }

    private static _updateDrumsState() {
        switch (this._drumsState) {
            case 'off':
                this._drumsVolume = 0
                break
            case 'on-queued':
                this._drumsVolume = 0
                if (this._hasReachedQueuedBoundary()) {
                    if (this._currentTune?.burstScheme === 'night') {
                        const boundary = this._queuedDrumsBoundarySec!
                        const index = this._currentTune.burstBoundariesSec!.indexOf(boundary)
                        const offset = this._currentTune.burstDrumsOffsetsSec?.[index] ?? 0
                        const duration = this._currentTune.drumsLoopEndSec!
                        this._drumsPhaseSec = ((offset - boundary) % duration + duration) % duration
                        // Only the drum phase changed; seeking the melody too can click at every burst.
                        this._seekAll(this._mainTime(), ['drums'])
                    }
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
                this._drumsVolume = clamp01(this._drumsCounter / (this._currentTune?.burstScheme === 'night' ? 800 : DRUMS_FADE_TICKS))
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

        const time = this._mainTime()
        if (this._queuedDrumsBoundaryWrapped) {
            return time < this._queuedDrumsAtSec && time >= boundary
        }
        return time >= boundary
    }

    private static _setQueuedDrumsBoundary(time: number) {
        const boundary = this._nextBoundaryAfter(time)
        this._queuedDrumsAtSec = time
        this._queuedDrumsBoundarySec = boundary
        this._queuedDrumsBoundaryWrapped = boundary < time
    }

    private static _nextBoundaryAfter(time: number) {
        const tune = this._currentTune
        const boundaries = tune?.burstBoundariesSec ?? []
        if (!tune || boundaries.length === 0) return time

        const boundary = boundaries.find((value) => value > time + 0.02)
        if (boundary !== undefined) return boundary
        return boundaries[0]
    }

    private static _stemTime(stem: MusicStemName, time: number): number {
        const duration = this._currentTune?.drumsLoopEndSec
        return stem === 'drums' && this._currentTune?.burstScheme === 'night' && duration
            ? ((time + this._drumsPhaseSec) % duration + duration) % duration : time
    }

    private static _resyncStems() {
        const time = this._mainTime()
        for (const stem of ['drums', 'hihats'] as const) {
            if (!this._activeStemNames.includes(stem)) continue
            const target = this._stemTime(stem, time)
            const audioId = this._nativeAudioIds[stem]
            if (audioId !== undefined) {
                const player = this._nativePlayer()
                const currentTime = player?.getCurrentTime(audioId)
                if (typeof currentTime === 'number' && Math.abs(currentTime - target) > SYNC_DRIFT_SECONDS) {
                    player?.setCurrentTime(audioId, target)
                }
                continue
            }

            const source = this._sources[stem]
            if (!source?.clip) continue
            if (Math.abs(source.currentTime - target) > SYNC_DRIFT_SECONDS) {
                source.currentTime = target
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
        const masterVolume = SoundSystem.getMusicVolume()
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
        for (const stem of this._overlayActiveStemNames) {
            const volume = this._overlayStemVolume(stem)
            const audioId = this._overlayNativeAudioIds[stem]
            if (audioId !== undefined) this._nativePlayer()?.setVolume(audioId, volume)
            else if (this._overlaySources[stem]) this._overlaySources[stem]!.volume = volume
        }
    }

    private static _resetBurstState() {
        this._burstState = 'off'
        this._burstCounter = 0
        this._drumsState = 'off'
        this._drumsCounter = 0
        this._queuedDrumsBoundarySec = null
        this._queuedDrumsAtSec = 0
        this._queuedDrumsBoundaryWrapped = false
    }

    private static _activeStems(tune: MusicTuneManifest) {
        return STEMS.filter((stem) => !!tune.stems[stem])
    }

    private static _playNativeStem(stem: MusicStemName, clip: AudioClip) {
        const player = this._nativePlayer()
        if (!player) return false

        const url = clip.nativeUrl
        if (!url) return false
        const audioId = player.play(url, true, this._stemVolume(stem) * SoundSystem.getMusicVolume())
        if (typeof audioId !== 'number' || audioId < 0) return false

        this._nativeAudioIds[stem] = audioId
        return true
    }

    private static _playNativeOverlayStem(stem: MusicStemName, clip: AudioClip, tune: MusicTuneManifest) {
        const player = this._nativePlayer()
        if (!player) return false

        const url = clip.nativeUrl
        if (!url) return false
        const audioId = player.play(url, this._loopsWholeFile(tune), this._overlayStemVolume(stem))
        if (typeof audioId !== 'number' || audioId < 0) return false

        this._overlayNativeAudioIds[stem] = audioId
        return true
    }

    private static _stopNativeStems() {
        const player = this._nativePlayer()
        for (const audioId of Object.values(this._nativeAudioIds)) {
            if (audioId === undefined) continue
            // iOS otherwise waits on the game thread for queued audio to finish playing.
            player?.pause(audioId)
            player?.stop(audioId)
        }
        this._nativeAudioIds = {}
    }

    private static _stopNativeOverlayStems() {
        const player = this._nativePlayer()
        for (const audioId of Object.values(this._overlayNativeAudioIds)) {
            if (audioId === undefined) continue
            player?.pause(audioId)
            player?.stop(audioId)
        }
        this._overlayNativeAudioIds = {}
    }

    private static _stemVolume(stem: MusicStemName) {
        if (stem === 'main') return clamp01(this._mainVolume)
        if (stem === 'drums') return clamp01(this._drumsVolume)
        return clamp01(this._hihatsVolume)
    }

    private static _overlayStemVolume(stem: MusicStemName) {
        return stem === 'main' ? SoundSystem.getMusicVolume() : 0
    }

    private static _nativePlayer(): MusicNativePlayer | null {
        if (!sys.isNative) return null
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
