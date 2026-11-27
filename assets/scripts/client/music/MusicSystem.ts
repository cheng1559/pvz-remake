import type { AudioClip } from 'cc'
import { modResources } from '@/client/content/ModResources'
import { SoundSystem } from '@/client/sound/SoundSystem'
import { musicResourceId, parseMusic, type Music } from '@/shared/content/music'
import { FileTune } from './FileTune'
import { ModuleTune } from './ModuleTune'
import { parseMusicPlaybackSnapshot, type MusicPlaybackSnapshot, type MusicTuneId } from './MusicPlaybackSnapshot'
import { clamp01, normalizeTicks, type MusicRuntimeContext, type Tune } from './Tune'

export type {
    MusicBurstState,
    MusicDrumsState,
    MusicPlaybackSnapshot,
    MusicTuneId,
} from './MusicPlaybackSnapshot'
export type { MusicRuntimeContext } from './Tune'

export class MusicSystem {
    /** Each tune is its own music resource, so a Mod replaces a tune by ID like any other asset. */
    private static _tunes: Map<MusicTuneId, Promise<Music | null>> = new Map()
    private static _clipLoading: Map<string, Promise<AudioClip | null>> = new Map()
    /** The tune playing. */
    private static _current: Tune | null = null
    /** The tune a change of time of day blends from, playing on beside the current one (keepTune); none otherwise. */
    private static _kept: Tune | null = null
    /** How far that blend has gone (blendTunes), 0 to 1. */
    private static _weight = 0
    private static _playToken = 0
    private static _pauseRequested = false
    private static _unsubscribeMusicVolume: (() => void) | null = null

    static async playTune(tuneId: MusicTuneId, restart = false) {
        await this._play(tuneId, restart)
    }

    static async preloadTune(tuneId: MusicTuneId) {
        const tune = await this._loadTune(tuneId)
        if (!tune) return
        if ('parts' in tune) await ModuleTune.preload(tune)
        else await this._loadClip(tune.audio)
    }

    /** Where the music is, for a save: while a change of time of day blends it, the tune kept, the time's the level is at. */
    static capturePlaybackSnapshot(): MusicPlaybackSnapshot | null {
        const tune = this._kept ?? this._current
        if (!tune?.playing) return null
        return tune.capture(this._pauseRequested)
    }

    static async restorePlaybackSnapshot(value: unknown) {
        const snapshot = parseMusicPlaybackSnapshot(value)
        if (snapshot === null) return
        if (!await this._loadTune(snapshot.tuneId)) throw new TypeError(`music snapshot tune is unavailable: ${snapshot.tuneId}`)
        await this._play(snapshot.tuneId, true, snapshot)
        if (snapshot.paused && this._current?.tuneId === snapshot.tuneId) this.pause()
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
        for (const tune of [this._current, this._kept]) if (tune?.playing) tune.startBurst(countdown)
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
     * plays on, its own way, as the old one beside the tune playTune starts next, which takes on its burst (takeBurst)
     * and, between two file tunes, plays from where it is, until dropKeptTune.
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

    private static async _play(tuneId: MusicTuneId, restart: boolean, snapshot?: MusicPlaybackSnapshot) {
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
        const started = await this._create(tuneId, tune, token)
        if (token !== this._playToken) {
            started?.stop()
            return
        }
        if (!started) {
            console.warn(`[MusicSystem] Missing music for tune: ${tuneId}`)
            return
        }

        this._unsubscribeMusicVolume ??= SoundSystem.onMusicVolumeChange(() => this._applyVolumes())
        this._current = started
        started.start(snapshot)
        // Blended into from the kept one: with its burst, and between file tunes from where it is.
        const kept = this._kept
        if (kept && !snapshot) {
            if (kept instanceof FileTune && started instanceof FileTune) started.playFrom(kept.elapsedSec())
            started.takeBurst(kept)
        }
        if (this._pauseRequested) this.pause()
    }

    /** The tune ready to start, or null when its music is missing; a file tune is made only while `token` is current. */
    private static async _create(tuneId: MusicTuneId, tune: Music, token: number): Promise<Tune | null> {
        if ('parts' in tune) return ModuleTune.create(tuneId, tune, this._share(false))
        const clip = await this._loadClip(tune.audio)
        if (!clip || token !== this._playToken) return null
        return new FileTune(tuneId, tune, clip, this._share(false))
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
}
