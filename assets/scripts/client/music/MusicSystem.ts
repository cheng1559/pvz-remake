import { modResources } from '@/client/content/ModResources'
import { AudioClip, AudioSource, director, Node, sys } from 'cc'
import { musicResourceId, parseMusic, type Music, type MusicStemName } from '@/shared/content/music'
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

function nativePlayer(): MusicNativePlayer | null {
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

let musicRoot: Node | null = null

/** The node the music's sources are on, kept across scenes. */
function musicNode() {
    if (musicRoot?.isValid) return musicRoot

    const node = new Node('MusicSystem')
    const scene = director.getScene()
    if (scene) scene.addChild(node)
    director.addPersistRootNode(node)
    musicRoot = node
    return node
}

/**
 * A tune playing (MusicSystem): its stems' sources or native streams, its loop, its bursts, its fade out and its
 * volumes, and where it is for a save (capture, restore). MusicSystem plays one, and two while a change of time of day
 * blends one into the other; `share`, its part of that blend.
 */
class TunePlayback {
    playing = true
    paused = false
    pauseTime = 0
    share: number
    private sources: Partial<Record<MusicStemName, AudioSource>> = {}
    private nativeAudioIds: Partial<Record<MusicStemName, number>> = {}
    private mainVolume = 1
    private drumsVolume = 0
    private hihatsVolume = 0
    fadeOutCounter = 0
    private fadeOutDuration = 0
    private syncCounter = 0
    /** How far the night drum stem runs ahead of the main stem, within its own loop. */
    private drumsPhaseSec = 0
    /** The main stem's last observed time, to notice the backend wrapping past a missed loop end. */
    private lastMainTime = 0
    private burstState: MusicBurstState = 'off'
    private burstCounter = 0
    private drumsState: MusicDrumsState = 'off'
    private drumsCounter = 0
    private queuedDrumsBoundarySec: number | null = null
    private queuedDrumsAtSec = 0
    private queuedDrumsBoundaryWrapped = false

    constructor(readonly tuneId: MusicTuneId, private readonly tune: MusicTuneManifest, private readonly stems: MusicStemName[], clips: (AudioClip | null)[], share: number) {
        this.share = share
        for (let i = 0; i < stems.length; i++) {
            const stem = stems[i]
            if (this.playNativeStem(stem, clips[i]!)) continue

            const source = this.getSource(stem)
            source.stop()
            source.clip = clips[i]
            // The backend always loops the whole file so playback never ends; loop points are jumped to here.
            source.loop = true
            source.volume = 0
        }

        this.applyVolumes()
        for (const stem of stems) {
            if (this.nativeAudioIds[stem] !== undefined) continue
            this.sources[stem]?.play()
        }
    }

    capture(pauseRequested: boolean): MusicPlaybackSnapshot | null {
        return parseMusicPlaybackSnapshot({
            tuneId: this.tuneId,
            ...(this.tune.burstScheme === 'night' ? { drumsPhaseSec: this.drumsPhaseSec } : {}),
            timeSec: this.paused ? this.pauseTime : this.mainTime(),
            paused: this.paused || pauseRequested,
            mainVolume: this.mainVolume,
            drumsVolume: this.drumsVolume,
            hihatsVolume: this.hihatsVolume,
            fadeOutCounter: this.fadeOutCounter,
            fadeOutDuration: this.fadeOutDuration,
            syncCounter: this.syncCounter,
            burstState: this.burstState,
            burstCounter: this.burstCounter,
            drumsState: this.drumsState,
            drumsCounter: this.drumsCounter,
            queuedDrumsBoundarySec: this.queuedDrumsBoundarySec,
            queuedDrumsAtSec: this.queuedDrumsAtSec,
            queuedDrumsBoundaryWrapped: this.queuedDrumsBoundaryWrapped,
        })
    }

    /** Where a save of it had got to (capture), its sources seeked there but not yet set going (resumeSourcesAfterSeek). */
    restore(snapshot: MusicPlaybackSnapshot): void {
        this.drumsPhaseSec = snapshot.drumsPhaseSec ?? 0
        this.seekAll(snapshot.timeSec)
        this.mainVolume = snapshot.mainVolume
        this.drumsVolume = snapshot.drumsVolume
        this.hihatsVolume = snapshot.hihatsVolume
        this.fadeOutCounter = snapshot.fadeOutCounter
        this.fadeOutDuration = snapshot.fadeOutDuration
        this.syncCounter = snapshot.syncCounter
        this.burstState = snapshot.burstState
        this.burstCounter = snapshot.burstCounter
        this.drumsState = snapshot.drumsState
        this.drumsCounter = snapshot.drumsCounter
        this.queuedDrumsBoundarySec = snapshot.queuedDrumsBoundarySec
        this.queuedDrumsAtSec = snapshot.queuedDrumsAtSec
        this.queuedDrumsBoundaryWrapped = snapshot.queuedDrumsBoundaryWrapped
        this.applyVolumes()
    }

    stop() {
        for (const source of Object.values(this.sources)) {
            if (!source) continue
            source.stop()
            source.node.destroy()
        }
        this.sources = {}
        this.stopNativeStems()
        this.playing = false
        this.paused = false
    }

    fadeOut(duration: number) {
        this.fadeOutDuration = duration
        this.fadeOutCounter = duration
    }

    /** Board::UpdateZombieSpawning: the huge wave countdown bursts a night tune with 700 ticks left and a day one with 400. */
    startBurst(countdown: number) {
        if (this.paused || !this.tune.burstScheme) return
        if (countdown !== (this.tune.burstScheme === 'night' ? 700 : 400)) return
        this.beginBurst()
    }

    /** Where it is in its tune, in seconds: where it was paused while it is. */
    get position(): number {
        return this.paused ? this.pauseTime : this.mainTime()
    }

    /**
     * It plays on from `time` of its tune, its loop folding a time past its end back into it. Its drums go with its
     * melody as from its start (Music::PlayMusic's drums offset 0, the same offset into both).
     */
    playFrom(time: number) {
        this.seekAll(time)
        this.resumeSourcesAfterSeek()
    }

    /**
     * It takes on the burst of the tune `from`, which a change of time of day blends into it: the burst is the level's
     * (its zombies on screen, its huge wave), not the tune's. Its drums go with its melody (playFrom), so drums that were
     * on are on at once; drums waiting for an order wait for one of its own after `at`, where it plays from (a source
     * still loading reads as at 0). Its volumes follow at its next update. A tune without bursts takes none, nor gives one.
     */
    takeBurst(from: TunePlayback, at: number) {
        if (!this.tune.burstScheme || !from.tune.burstScheme) return
        this.burstState = from.burstState
        this.burstCounter = from.burstCounter
        this.drumsCounter = from.drumsCounter
        if (from.drumsState === 'on-queued') this.queueDrumsOn(at)
        else if (from.drumsState === 'off-queued') {
            this.drumsState = 'on'
            this.queueDrumsOff(at)
        } else this.drumsState = from.drumsState
    }

    pause() {
        if (!this.playing || this.paused) return
        this.pauseTime = this.mainTime()
        for (const source of Object.values(this.sources)) {
            source?.pause()
        }
        for (const audioId of Object.values(this.nativeAudioIds)) {
            if (audioId !== undefined) nativePlayer()?.pause(audioId)
        }
        this.paused = true
    }

    resume() {
        if (!this.playing || !this.paused) return
        this.seekAll(this.pauseTime)
        for (const stem of this.stems) {
            const source = this.sources[stem]
            source?.play()
            const audioId = this.nativeAudioIds[stem]
            if (audioId !== undefined) nativePlayer()?.resume(audioId)
        }
        this.paused = false
    }

    /** It plays on by `ticks`; false once its fade out has stopped it. */
    update(ticks: number, context: MusicRuntimeContext): boolean {
        if (!this.playing) return false
        if (this.paused) return true

        const elapsedTicks = normalizeTicks(ticks)
        this.updateManualLoop()
        if (elapsedTicks > 0) {
            if (!this.updateFadeOut(elapsedTicks)) return false
            this.updateBurst(elapsedTicks, context.zombiesOnScreen)
            this.syncCounter += elapsedTicks
            if (this.syncCounter >= SYNC_INTERVAL_TICKS) {
                this.syncCounter = 0
                this.resyncStems()
            }
        }
        this.applyVolumes()
        return true
    }

    /**
     * Its native streams play on after a seek: one that reached the end of its file stops refilling. Its web sources
     * loop their whole file and play on where a seek puts them; one played again would start over from 0 (AudioSource's
     * play() stops a playing one first, and one still loading reads as not playing), dropping the seek.
     */
    resumeSourcesAfterSeek() {
        if (!this.playing || this.paused) return

        for (const stem of this.stems) {
            const audioId = this.nativeAudioIds[stem]
            if (audioId !== undefined) nativePlayer()?.resume(audioId)
        }
    }

    applyVolumes() {
        const fadeVolume = this.fadeOutDuration > 0 && this.fadeOutCounter > 0
            ? this.fadeOutCounter / this.fadeOutDuration
            : 1
        const scale = SoundSystem.getMusicOutputVolume() * fadeVolume * this.share
        for (const stem of STEMS) {
            const volume = this.stemVolume(stem) * scale
            const audioId = this.nativeAudioIds[stem]
            if (audioId !== undefined) {
                nativePlayer()?.setVolume(audioId, clamp01(volume))
                continue
            }

            const source = this.sources[stem]
            if (!source) continue
            source.volume = volume
        }
    }

    private getSource(stem: MusicStemName) {
        const cached = this.sources[stem]
        if (cached?.isValid) return cached

        const stemNode = new Node(`Music_${stem}`)
        musicNode().addChild(stemNode)
        const source = stemNode.addComponent(AudioSource)
        this.sources[stem] = source
        return source
    }

    private mainSource() {
        return this.sources.main ?? null
    }

    private mainTime() {
        const mainId = this.nativeAudioIds.main
        if (mainId !== undefined) {
            const time = nativePlayer()?.getCurrentTime(mainId)
            return typeof time === 'number' && Number.isFinite(time) ? time : 0
        }

        return this.mainSource()?.currentTime ?? 0
    }

    private seekAll(time: number, stems: readonly MusicStemName[] = this.stems) {
        const seekTime = this.wrapTime(time)
        this.lastMainTime = seekTime
        for (const stem of this.stems) {
            if (!stems.includes(stem)) continue
            const stemTime = this.stemTime(stem, seekTime)
            const audioId = this.nativeAudioIds[stem]
            if (audioId !== undefined) {
                nativePlayer()?.setCurrentTime(audioId, stemTime)
                continue
            }

            const source = this.sources[stem]
            if (!source?.clip) continue
            source.currentTime = stemTime
        }
    }

    private updateManualLoop() {
        const tune = this.tune
        if (this.loopsWholeFile()) return

        const mainTime = this.mainTime()
        // A check that comes too late finds the backend already wrapped to the start of the file.
        const wrapped = mainTime < this.lastMainTime - 1
        this.lastMainTime = mainTime
        if (!wrapped && mainTime < tune.loopEndSec) return

        const overflow = wrapped ? mainTime + tune.durationSec - tune.loopEndSec : mainTime - tune.loopEndSec
        const target = this.wrapTime(tune.loopStartSec + overflow)
        if (tune.burstScheme === 'night') {
            // Keep the drum phase in [0, drum loop) so it survives the snapshot's non-negative check.
            const duration = tune.drumsLoopEndSec!
            this.drumsPhaseSec = ((this.stemTime('drums', tune.loopEndSec) - tune.loopStartSec) % duration + duration) % duration
        }
        this.seekAll(target)
        this.resumeSourcesAfterSeek()
        if (
            this.queuedDrumsBoundarySec !== null &&
            !this.queuedDrumsBoundaryWrapped &&
            this.queuedDrumsBoundarySec < target
        ) {
            this.setQueuedDrumsBoundary(target)
        }
    }

    private wrapTime(time: number) {
        const loopStart = this.tune.loopStartSec
        const loopEnd = this.tune.loopEndSec
        const loopLength = loopEnd - loopStart
        if (loopLength <= 0) return Math.max(0, time)
        if (time < loopEnd) return Math.max(0, time)
        return loopStart + ((time - loopStart) % loopLength)
    }

    private loopsWholeFile() {
        return this.tune.loopStartSec <= 0 && this.tune.loopEndSec >= this.tune.durationSec
    }

    /** Its fade out goes on by `ticks`; false once that has run out and stopped it. */
    private updateFadeOut(ticks: number): boolean {
        if (this.fadeOutCounter <= 0) return true

        this.fadeOutCounter = Math.max(0, this.fadeOutCounter - ticks)
        if (this.fadeOutCounter > 0) return true
        this.stop()
        return false
    }

    private updateBurst(ticks: number, zombiesOnScreen: number) {
        if (this.tune.burstScheme === 'night') { this.updateNightBurst(ticks, zombiesOnScreen); return }
        if (this.tune.burstScheme !== 'day') return

        this.decrementCounters(ticks)
        switch (this.burstState) {
            case 'off':
                this.mainVolume = 1
                this.hihatsVolume = 0
                if (zombiesOnScreen >= START_BURST_ZOMBIES) this.beginBurst()
                break
            case 'starting':
                this.hihatsVolume = clamp01(1 - this.burstCounter / BURST_START_TICKS)
                if (this.drumsState === 'off' && this.burstCounter <= DRUMS_START_QUEUE_TICKS) {
                    this.queueDrumsOn()
                }
                if (this.burstCounter <= 0) {
                    this.burstState = 'on'
                    this.burstCounter = BURST_ON_MIN_TICKS
                    this.hihatsVolume = 1
                }
                break
            case 'on':
                this.hihatsVolume = 1
                if (this.burstCounter <= 0 && zombiesOnScreen < FINISH_BURST_ZOMBIES) {
                    this.burstState = 'finishing'
                    this.burstCounter = BURST_FINISH_TICKS
                    this.queueDrumsOff()
                }
                break
            case 'finishing':
                this.hihatsVolume = clamp01(this.burstCounter / BURST_FINISH_TICKS)
                if (this.burstCounter <= 0 && this.drumsState === 'off') {
                    this.burstState = 'off'
                    this.hihatsVolume = 0
                }
                break
        }

        this.updateDrumsState()
    }

    /** Music::UpdateMusicBurst scheme 2 replaces the main melody with the night drum stream. */
    private updateNightBurst(ticks: number, zombies: number) {
        this.decrementCounters(ticks)
        switch (this.burstState) {
            case 'off':
                this.mainVolume = 1
                if (zombies >= START_BURST_ZOMBIES) this.beginBurst()
                break
            case 'starting':
                if (this.drumsState === 'off') this.queueDrumsOn()
                if (this.drumsState === 'on-queued') this.burstCounter = BURST_START_TICKS
                this.mainVolume = clamp01(this.burstCounter / BURST_START_TICKS)
                if (this.burstCounter === 0) { this.burstState = 'on'; this.burstCounter = BURST_ON_MIN_TICKS }
                break
            case 'on':
                this.mainVolume = 0
                if (this.burstCounter === 0 && zombies < FINISH_BURST_ZOMBIES) {
                    this.burstState = 'finishing'; this.burstCounter = 1100
                    this.drumsState = 'fading'; this.drumsCounter = 800
                }
                break
            case 'finishing':
                this.mainVolume = clamp01(1 - this.burstCounter / 400)
                if (this.burstCounter === 0 && this.drumsState === 'off') this.burstState = 'off'
                break
        }
        this.updateDrumsState()
    }

    private decrementCounters(ticks: number) {
        if (this.burstCounter > 0) this.burstCounter = Math.max(0, this.burstCounter - ticks)
        if (this.drumsCounter > 0) this.drumsCounter = Math.max(0, this.drumsCounter - ticks)
    }

    private beginBurst() {
        if (this.burstState !== 'off') return
        this.burstState = 'starting'
        this.burstCounter = BURST_START_TICKS
    }

    private queueDrumsOn(time = this.mainTime()) {
        this.drumsState = 'on-queued'
        this.setQueuedDrumsBoundary(time)
    }

    private queueDrumsOff(time = this.mainTime()) {
        if (this.drumsState === 'off') return
        this.drumsState = 'off-queued'
        this.setQueuedDrumsBoundary(time)
    }

    private updateDrumsState() {
        switch (this.drumsState) {
            case 'off':
                this.drumsVolume = 0
                break
            case 'on-queued':
                this.drumsVolume = 0
                if (this.hasReachedQueuedBoundary()) {
                    if (this.tune.burstScheme === 'night') {
                        const boundary = this.queuedDrumsBoundarySec!
                        const index = this.tune.burstBoundariesSec!.indexOf(boundary)
                        const offset = this.tune.burstDrumsOffsetsSec?.[index] ?? 0
                        const duration = this.tune.drumsLoopEndSec!
                        this.drumsPhaseSec = ((offset - boundary) % duration + duration) % duration
                        // Only the drum phase changed; seeking the melody too can click at every burst.
                        this.seekAll(this.mainTime(), ['drums'])
                    }
                    this.drumsState = 'on'
                    this.drumsVolume = 1
                    this.queuedDrumsBoundarySec = null
                }
                break
            case 'on':
                this.drumsVolume = 1
                break
            case 'off-queued':
                this.drumsVolume = 1
                if (this.hasReachedQueuedBoundary()) {
                    this.drumsState = 'fading'
                    this.drumsCounter = DRUMS_FADE_TICKS
                    this.queuedDrumsBoundarySec = null
                }
                break
            case 'fading':
                this.drumsVolume = clamp01(this.drumsCounter / (this.tune.burstScheme === 'night' ? 800 : DRUMS_FADE_TICKS))
                if (this.drumsCounter <= 0) {
                    this.drumsState = 'off'
                    this.drumsVolume = 0
                }
                break
        }
    }

    private hasReachedQueuedBoundary() {
        const boundary = this.queuedDrumsBoundarySec
        if (boundary === null) return true

        const time = this.mainTime()
        if (this.queuedDrumsBoundaryWrapped) {
            return time < this.queuedDrumsAtSec && time >= boundary
        }
        return time >= boundary
    }

    private setQueuedDrumsBoundary(time: number) {
        const boundary = this.nextBoundaryAfter(time)
        this.queuedDrumsAtSec = time
        this.queuedDrumsBoundarySec = boundary
        this.queuedDrumsBoundaryWrapped = boundary < time
    }

    private nextBoundaryAfter(time: number) {
        const boundaries = this.tune.burstBoundariesSec ?? []
        if (boundaries.length === 0) return time

        const boundary = boundaries.find((value) => value > time + 0.02)
        if (boundary !== undefined) return boundary
        return boundaries[0]
    }

    private stemTime(stem: MusicStemName, time: number): number {
        const duration = this.tune.drumsLoopEndSec
        return stem === 'drums' && this.tune.burstScheme === 'night' && duration
            ? ((time + this.drumsPhaseSec) % duration + duration) % duration : time
    }

    private resyncStems() {
        const time = this.mainTime()
        for (const stem of ['drums', 'hihats'] as const) {
            if (!this.stems.includes(stem)) continue
            const target = this.stemTime(stem, time)
            const audioId = this.nativeAudioIds[stem]
            if (audioId !== undefined) {
                const player = nativePlayer()
                const currentTime = player?.getCurrentTime(audioId)
                if (typeof currentTime === 'number' && Math.abs(currentTime - target) > SYNC_DRIFT_SECONDS) {
                    player?.setCurrentTime(audioId, target)
                }
                continue
            }

            const source = this.sources[stem]
            if (!source?.clip) continue
            if (Math.abs(source.currentTime - target) > SYNC_DRIFT_SECONDS) {
                source.currentTime = target
            }
        }
    }

    private playNativeStem(stem: MusicStemName, clip: AudioClip) {
        const player = nativePlayer()
        if (!player) return false

        const url = clip.nativeUrl
        if (!url) return false
        const audioId = player.play(url, true, this.stemVolume(stem) * SoundSystem.getMusicOutputVolume() * this.share)
        if (typeof audioId !== 'number' || audioId < 0) return false

        this.nativeAudioIds[stem] = audioId
        return true
    }

    private stopNativeStems() {
        const player = nativePlayer()
        for (const audioId of Object.values(this.nativeAudioIds)) {
            if (audioId === undefined) continue
            // iOS otherwise waits on the game thread for queued audio to finish playing.
            player?.pause(audioId)
            player?.stop(audioId)
        }
        this.nativeAudioIds = {}
    }

    private stemVolume(stem: MusicStemName) {
        if (stem === 'main') return clamp01(this.mainVolume)
        if (stem === 'drums') return clamp01(this.drumsVolume)
        return clamp01(this.hihatsVolume)
    }
}

export class MusicSystem {
    /** Each tune is its own music resource, so a Mod replaces a tune by ID like any other asset. */
    private static _tunes: Map<MusicTuneId, Promise<Music | null>> = new Map()
    private static _clipLoading: Map<string, Promise<AudioClip | null>> = new Map()
    /** The tune playing. */
    private static _current: TunePlayback | null = null
    /** The tune a change of time of day blends from, playing on beside the current one (keepTune); none otherwise. */
    private static _kept: TunePlayback | null = null
    /** How far that blend has gone (blendTunes), 0 to 1. */
    private static _weight = 0
    private static _playToken = 0
    private static _pauseRequested = false
    private static _unsubscribeMusicVolume: (() => void) | null = null

    static async playTune(tuneId: MusicTuneId, restart = false) {
        const current = this._current
        if (!restart && current?.playing && current.tuneId === tuneId && current.fadeOutCounter <= 0) return

        // The tune kept for a blend plays on beside the next one.
        if (this._kept) this._stopCurrent()
        else this.stop()
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

        this._unsubscribeMusicVolume ??= SoundSystem.onMusicVolumeChange(() => this._applyVolumes())
        const started = this._current = new TunePlayback(tuneId, tune, activeStems, clips, this._share(false))
        // Blended into from the kept one: where that one is, and with its burst.
        if (this._kept) {
            const at = this._kept.position
            started.playFrom(at)
            started.takeBurst(this._kept, at)
        }
        if (this._pauseRequested) this.pause()
    }

    static async preloadTune(tuneId: MusicTuneId) {
        const tune = await this._loadTune(tuneId)
        if (!tune) return

        await Promise.all(this._activeStems(tune).map((stem) => this._loadClip(tune.stems[stem]!)))
    }

    /** Where the music is, for a save: while a change of time of day blends it, the tune kept, the time's the level is at. */
    static capturePlaybackSnapshot(): MusicPlaybackSnapshot | null {
        const playback = this._kept ?? this._current
        if (!playback?.playing) return null

        return playback.capture(this._pauseRequested)
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
        const current = this._current
        if (!current?.playing || current.tuneId !== snapshot.tuneId) return

        current.restore(snapshot)
        if (snapshot.paused) {
            this.pause()
            // pause() reads the playback time, which a native stream still loading reports as 0.
            current.pauseTime = snapshot.timeSec
            return
        }

        current.resumeSourcesAfterSeek()
    }

    static stop() {
        this._stopCurrent()
        this._kept?.stop()
        this._kept = null
        this._pauseRequested = false
        this._unsubscribeMusicVolume?.()
        this._unsubscribeMusicVolume = null
    }

    static fadeOut(durationTicks: number) {
        if (!this._current?.playing && !this._kept) return
        const duration = normalizeTicks(durationTicks)
        if (duration <= 0) {
            this.stop()
            return
        }
        this._current?.fadeOut(duration)
        this._kept?.fadeOut(duration)
    }

    /**
     * Board::UpdateZombieSpawning: the huge wave countdown bursts a night tune with 700 ticks left and a day one with 400;
     * while a change of time of day blends two, both, so either goes on with it.
     */
    static startBurst(countdown: number) {
        for (const playback of [this._current, this._kept]) if (playback?.playing) playback.startBurst(countdown)
    }

    static pause() {
        this._pauseRequested = true
        this._current?.pause()
        this._kept?.pause()
    }

    static resume() {
        this._pauseRequested = false
        this._current?.resume()
        this._kept?.resume()
    }

    static update(ticks: number, context: MusicRuntimeContext) {
        // A fade out that ran out stops the music, as stop() does.
        if (this._current && !this._current.update(ticks, context)) {
            this.stop()
            return
        }
        if (this._kept && !this._kept.update(ticks, context)) this._kept = null
    }

    /**
     * `/time`'s change of time of day begins to blend the tune playing into another (LevelAudioPresenter.timeBlend): it
     * plays on, its own way, as the old one beside the tune playTune starts next, which plays from where it is
     * (playFrom) and takes on its burst (takeBurst), until dropKeptTune.
     */
    static keepTune() {
        const current = this._current
        if (this._kept || !current?.playing) return
        this._kept = current
        this._current = null
        this._weight = 0
    }

    /**
     * The blend has gone `weight` of its way (0 to 1): the tune started beside the kept one comes in as that one goes, at
     * equal power (the sine and the cosine of the weight's quarter turn), so both are heard well through the middle,
     * where a linear blend would have each at half.
     */
    static blendTunes(weight: number) {
        this._weight = clamp01(weight)
        this._applyVolumes()
    }

    /** The blend is over: the kept tune stops, and the one beside it plays on alone. */
    static dropKeptTune() {
        this._kept?.stop()
        this._kept = null
        this._applyVolumes()
    }

    private static _stopCurrent() {
        this._playToken++
        this._current?.stop()
        this._current = null
    }

    /** A tune's part of its volume as a blend goes (blendTunes): the kept one's, or the current one's; all of it with none. */
    private static _share(kept: boolean) {
        if (!this._kept) return 1
        const turn = this._weight * Math.PI / 2
        return kept ? Math.cos(turn) : Math.sin(turn)
    }

    private static _applyVolumes() {
        if (this._current) {
            this._current.share = this._share(false)
            this._current.applyVolumes()
        }
        if (this._kept) {
            this._kept.share = this._share(true)
            this._kept.applyVolumes()
        }
    }

    /** The highest-priority `pvz:<tune>` music resource; an invalid one is reported and treated as missing. */
    private static _loadTune(tuneId: MusicTuneId): Promise<Music | null> {
        let loading = this._tunes.get(tuneId)
        if (!loading) {
            loading = modResources.json('music', musicResourceId(tuneId))
                .then(json => json === undefined ? null : parseMusic(json))
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

        const loading = modResources.audio(path).then(clip => clip ?? null)
            .catch(error => { this._clipLoading.delete(path); throw error })
        this._clipLoading.set(path, loading)
        return loading
    }

    private static _activeStems(tune: MusicTuneManifest) {
        return STEMS.filter((stem) => !!tune.stems[stem])
    }
}
