import { _decorator, AudioSource, Component } from 'cc'
import { ClientContentLoader, MusicRepository } from '@/client/content/ClientContentLoader'
import { ContentRegistry } from '@/client/content/ContentRegistry'
import { SoundLoader } from '@/client/sound/LegacySoundSystem'
import type { MusicV2 } from '@/shared/content/music'

export interface MusicPlaybackSnapshotV2 {
    id: string
    timeSeconds: number
    playing: boolean
    paused: boolean
    volume: number
}

const { ccclass } = _decorator

@ccclass('MusicPlayer')
export class MusicPlayer extends Component {
    private definition: MusicV2 | null = null
    private source: AudioSource | null = null
    private playing = false
    private paused = false
    private pausedTimeSeconds = 0
    private volume = 1

    async load(id: string, registry: ContentRegistry, loader = new ClientContentLoader()): Promise<void> {
        const { definition, clip } = await new MusicRepository(registry, loader).load(id)
        if (!this.node.isValid) throw new Error('music player was destroyed while loading')

        const source = this.node.getComponent(AudioSource) ?? this.node.addComponent(AudioSource)
        source.stop()
        source.clip = clip
        source.loop = true
        this.definition = definition
        this.source = source
        this.playing = false
        this.paused = false
        this.pausedTimeSeconds = 0
        this.volume = 1
        this.applyVolume()
    }

    play(volume = 1): void {
        this.volume = unitInterval(volume, 'music volume')
        const source = this.requireSource()
        source.stop()
        source.currentTime = 0
        source.loop = true
        this.applyVolume()
        source.play()
        this.playing = true
        this.paused = false
        this.pausedTimeSeconds = 0
    }

    pause(): void {
        if (!this.playing || this.paused) return
        const source = this.requireSource()
        this.pausedTimeSeconds = this.currentTimeSeconds()
        source.pause()
        this.paused = true
    }

    resume(): void {
        if (!this.playing || !this.paused) return
        const source = this.requireSource()
        source.currentTime = this.pausedTimeSeconds
        this.applyVolume()
        source.play()
        this.paused = false
    }

    stop(): void {
        this.requireSource().stop()
        this.playing = false
        this.paused = false
        this.pausedTimeSeconds = 0
    }

    snapshot(): MusicPlaybackSnapshotV2 {
        return {
            id: this.requireDefinition().id,
            timeSeconds: this.playing ? this.currentTimeSeconds() : 0,
            playing: this.playing,
            paused: this.paused,
            volume: this.volume,
        }
    }

    restore(snapshot: MusicPlaybackSnapshotV2): void {
        const definition = this.requireDefinition()
        validateSnapshot(snapshot, definition)
        const source = this.requireSource()
        source.stop()
        source.loop = true
        source.currentTime = snapshot.timeSeconds
        this.playing = snapshot.playing
        this.paused = snapshot.paused
        this.pausedTimeSeconds = snapshot.timeSeconds
        this.volume = snapshot.volume
        this.applyVolume()
        if (snapshot.playing && !snapshot.paused) source.play()
    }

    private currentTimeSeconds(): number {
        if (this.paused) return this.pausedTimeSeconds
        return Math.min(this.requireSource().currentTime, this.requireDefinition().durationSeconds)
    }

    private applyVolume(): void {
        this.requireSource().volume = this.volume * SoundLoader.getMusicVolume()
    }

    private requireDefinition(): MusicV2 {
        if (!this.definition) throw new Error('music player is not loaded')
        return this.definition
    }

    private requireSource(): AudioSource {
        if (!this.source) throw new Error('music player is not loaded')
        return this.source
    }
}

function validateSnapshot(snapshot: MusicPlaybackSnapshotV2, definition: MusicV2): void {
    if (typeof snapshot !== 'object' || snapshot === null || Array.isArray(snapshot)) {
        throw new Error('music snapshot must be an object')
    }
    const keys = ['id', 'timeSeconds', 'playing', 'paused', 'volume']
    if (Object.keys(snapshot).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(snapshot, key))) {
        throw new Error('music snapshot fields are invalid')
    }
    if (snapshot.id !== definition.id) throw new Error(`cannot restore ${snapshot.id} into ${definition.id}`)
    if (!Number.isFinite(snapshot.timeSeconds)
        || snapshot.timeSeconds < 0
        || snapshot.timeSeconds > definition.durationSeconds) {
        throw new Error('music snapshot.timeSeconds is outside the track')
    }
    if (typeof snapshot.playing !== 'boolean' || typeof snapshot.paused !== 'boolean') {
        throw new Error('music snapshot playback flags must be boolean')
    }
    if ((!snapshot.playing && (snapshot.paused || snapshot.timeSeconds !== 0))) {
        throw new Error('stopped music snapshot must not be paused or retain time')
    }
    unitInterval(snapshot.volume, 'music snapshot.volume')
}

function unitInterval(value: number, name: string): number {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error(`${name} must be within 0..1`)
    return value
}
