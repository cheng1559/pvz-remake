import { AudioClip, AudioSource, director, Node, sys } from 'cc'
import type { FileMusic } from '@/shared/content/music'
import { parseMusicPlaybackSnapshot, type MusicPlaybackSnapshot, type MusicTuneId } from './MusicPlaybackSnapshot'
import { clamp01, normalizeTicks, Tune, type MusicRuntimeContext } from './Tune'

type NativeAudioEngine = {
    play2d?: (url: string, loop: boolean, volume: number) => number
    setVolume?: (audioId: number, volume: number) => boolean
    pause?: (audioId: number) => void
    resume?: (audioId: number) => void
    stop?: (audioId: number) => void
    setCurrentTime?: (audioId: number, time: number) => boolean
    getCurrentTime?: (audioId: number) => number
}

type NativePlayer = Required<NativeAudioEngine>

function nativePlayer(): NativePlayer | null {
    if (!sys.isNative) return null
    const engine = (globalThis as typeof globalThis & { jsb?: { AudioEngine?: NativeAudioEngine } }).jsb?.AudioEngine
    if (!engine?.play2d || !engine.setVolume || !engine.pause || !engine.resume || !engine.stop || !engine.setCurrentTime || !engine.getCurrentTime) {
        return null
    }
    return engine as NativePlayer
}

let musicRoot: Node | null = null

/** The node the music's sources are on, kept across scenes. */
function musicNode() {
    if (musicRoot?.isValid) return musicRoot
    const node = new Node('MusicSystem')
    director.getScene()?.addChild(node)
    director.addPersistRootNode(node)
    musicRoot = node
    return node
}

/**
 * A tune recorded as an audio file (a Mod's): a native stream or a web source that loops its whole file by itself.
 */
export class FileTune extends Tune {
    private source: AudioSource | null = null
    private nativeId: number | undefined
    private pauseTime = 0

    constructor(tuneId: MusicTuneId, private readonly tune: FileMusic, clip: AudioClip, share: number) {
        super(tuneId, share)
        const native = nativePlayer()
        const url = native ? clip.nativeUrl : ''
        const id = native && url ? native.play2d(url, true, 0) : -1
        if (id >= 0) this.nativeId = id
        else {
            const node = new Node(`Music_${tuneId}`)
            musicNode().addChild(node)
            this.source = node.addComponent(AudioSource)
            this.source.clip = clip
            this.source.loop = true
            this.source.volume = 0
        }
        this.applyVolumes()
    }

    start(snapshot?: MusicPlaybackSnapshot): void {
        this.source?.play()
        if (!snapshot) return
        const time = snapshot.timeSec
        if (time === undefined || time > this.tune.durationSec) throw new TypeError(`music snapshot does not fit the file tune ${this.tuneId}`)
        this.restoreFade(snapshot)
        this.seek(time)
        if (snapshot.paused) {
            this.pause()
            // pause() reads the playback time, which a native stream still loading reports as 0.
            this.pauseTime = time
        } else this.playOnAfterSeek()
        this.applyVolumes()
    }

    capture(pauseRequested: boolean): MusicPlaybackSnapshot {
        return parseMusicPlaybackSnapshot({
            tuneId: this.tuneId,
            paused: this.paused || pauseRequested,
            fadeOutCounter: this.fadeOutCounter,
            fadeOutDuration: this.fadeOutDuration,
            timeSec: this.elapsedSec(),
        })!
    }

    stop() {
        if (this.source) {
            this.source.stop()
            this.source.node.destroy()
            this.source = null
        }
        if (this.nativeId !== undefined) {
            // iOS otherwise waits on the game thread for queued audio to finish playing.
            nativePlayer()?.pause(this.nativeId)
            nativePlayer()?.stop(this.nativeId)
            this.nativeId = undefined
        }
        this.playing = false
        this.paused = false
    }

    pause() {
        if (!this.playing || this.paused) return
        this.pauseTime = this.time()
        this.source?.pause()
        if (this.nativeId !== undefined) nativePlayer()?.pause(this.nativeId)
        this.paused = true
    }

    resume() {
        if (!this.playing || !this.paused) return
        this.seek(this.pauseTime)
        this.source?.play()
        if (this.nativeId !== undefined) nativePlayer()?.resume(this.nativeId)
        this.paused = false
    }

    update(ticks: number, _context: MusicRuntimeContext): boolean {
        if (!this.playing) return false
        if (this.paused) return true
        const elapsed = normalizeTicks(ticks)
        if (elapsed > 0 && !this.updateFadeOut(elapsed)) return false
        this.applyVolumes()
        return true
    }

    applyVolumes() {
        const volume = this.volumeScale()
        if (this.nativeId !== undefined) nativePlayer()?.setVolume(this.nativeId, clamp01(volume))
        else if (this.source) this.source.volume = volume
    }

    /** How far into it it is, in seconds: where it was paused while it is. */
    elapsedSec(): number {
        return this.paused ? this.pauseTime : this.time()
    }

    /** It plays on from `time` into it, a time past its end folded back into it. */
    playFrom(time: number) {
        this.seek(time)
        this.playOnAfterSeek()
    }

    /**
     * A native stream plays on after a seek: one that reached the end of its file stops refilling. A web source loops
     * its whole file and plays on where a seek puts it; one played again would start over from 0 (AudioSource's play()
     * stops a playing one first, and one still loading reads as not playing), dropping the seek.
     */
    private playOnAfterSeek() {
        if (this.playing && !this.paused && this.nativeId !== undefined) nativePlayer()?.resume(this.nativeId)
    }

    private time() {
        if (this.nativeId !== undefined) {
            const time = nativePlayer()?.getCurrentTime(this.nativeId)
            return typeof time === 'number' && Number.isFinite(time) ? time : 0
        }
        return this.source?.currentTime ?? 0
    }

    private seek(time: number) {
        const at = time % this.tune.durationSec
        if (this.nativeId !== undefined) nativePlayer()?.setCurrentTime(this.nativeId, at)
        else if (this.source?.clip) this.source.currentTime = at
    }
}
