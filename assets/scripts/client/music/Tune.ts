import { SoundSystem } from '@/client/sound/SoundSystem'
import type { MusicPlaybackSnapshot, MusicTuneId } from './MusicPlaybackSnapshot'

export interface MusicRuntimeContext {
    zombiesOnScreen: number
}

export function clamp01(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(1, value))
}

export function normalizeTicks(ticks: number) {
    if (!Number.isFinite(ticks) || ticks <= 0) return 0
    return ticks
}

/**
 * A tune playing (MusicSystem): a module tune (ModuleTune) or a file tune (FileTune). Both fade out, take a share of
 * the music volume while a change of time of day blends one into another, and say where they are for a save.
 */
export abstract class Tune {
    playing = true
    paused = false
    fadeOutCounter = 0
    protected fadeOutDuration = 0

    constructor(readonly tuneId: MusicTuneId, public share: number) {}

    /** Sets it going, from where `snapshot`, a save of it, had got to (paused or going as that says) or its start. */
    abstract start(snapshot?: MusicPlaybackSnapshot): void
    abstract capture(pauseRequested: boolean): MusicPlaybackSnapshot
    abstract stop(): void
    abstract pause(): void
    abstract resume(): void
    abstract applyVolumes(): void
    /** It plays on by `ticks`; false once its fade out has stopped it. */
    abstract update(ticks: number, context: MusicRuntimeContext): boolean

    fadeOut(duration: number) {
        this.fadeOutDuration = duration
        this.fadeOutCounter = duration
    }

    /** Board::UpdateZombieSpawning's huge wave countdown; a tune without a burst takes none. */
    startBurst(_countdown: number) {}

    /** A blend into it from `from` (MusicSystem.keepTune) carries the burst on between tunes that have one. */
    takeBurst(_from: Tune) {}

    protected restoreFade(snapshot: MusicPlaybackSnapshot) {
        this.fadeOutCounter = snapshot.fadeOutCounter
        this.fadeOutDuration = snapshot.fadeOutDuration
    }

    /** The volume every part of it is scaled by: the music volume, its fade out and its share of a blend. */
    protected volumeScale() {
        const fade = this.fadeOutDuration > 0 && this.fadeOutCounter > 0 ? this.fadeOutCounter / this.fadeOutDuration : 1
        return SoundSystem.getMusicOutputVolume() * fade * this.share
    }

    /** Its fade out goes on by `ticks`; false once that has run out and stopped it. */
    protected updateFadeOut(ticks: number): boolean {
        if (this.fadeOutCounter <= 0) return true
        this.fadeOutCounter = Math.max(0, this.fadeOutCounter - ticks)
        if (this.fadeOutCounter > 0) return true
        this.stop()
        return false
    }
}
