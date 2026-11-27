import { Node, tween } from 'cc'
import { startGameTween } from '@/core/GameTween'
import { MusicSystem } from '@/client/music/MusicSystem'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import type { SeedAvailability, ServerEvent, WorldSnapshot } from '@/shared/protocol/index'
import type { BoardTimePresentation } from '@/shared/content/presentation'
import type { TimeBlend } from './TimeBlends'
import type { LevelAudioSnapshot } from './LevelPresentationSnapshot'
import { Haptics } from '@/platform/Haptics'

export class LevelAudioPresenter {
    private ownsMusic = false
    private gameplayStarted = false

    /**
     * The level's own sounds and its music. What is heard of something on the board (a plant, a zombie, a projectile, an
     * item) is its view's (ClientViews.events).
     */
    constructor(private music: BoardTimePresentation['music']) {}

    snapshot(): LevelAudioSnapshot {
        return {
            music: this.ownsMusic ? MusicSystem.capturePlaybackSnapshot() : null,
            ownsMusic: this.ownsMusic,
            gameplayStarted: this.gameplayStarted,
        }
    }

    async restore(snapshot: LevelAudioSnapshot): Promise<void> {
        this.ownsMusic = snapshot.ownsMusic
        this.gameplayStarted = snapshot.gameplayStarted
        if (snapshot.music) await MusicSystem.restorePlaybackSnapshot(snapshot.music)
        else if (snapshot.ownsMusic) {
            await MusicSystem.playTune(snapshot.gameplayStarted ? this.music.gameplay : this.music.choosing, true)
        } else MusicSystem.stop()
    }

    /**
     * `/time`'s change of time of day as its music is heard (TimeBlends; `musicOf`, the level's music at a time): in
     * play, the gameplay tune of the time it blends into plays beside the one playing (MusicSystem.keepTune), coming in
     * as that one goes; a time of the same tune (the level's own music) plays on as it is. Once over, the level's music
     * is that time's: in play its tune plays, unless the blend has it playing already (held or paused, it starts so).
     */
    timeBlend(musicOf: (time: string) => BoardTimePresentation['music']): TimeBlend {
        let next: BoardTimePresentation['music'] | undefined
        return {
            begin: () => {},
            show: time => {
                next = musicOf(time)
                if (!this.gameplayStarted || !this.ownsMusic || next.gameplay === this.music.gameplay) return
                MusicSystem.keepTune()
                return MusicSystem.playTune(next.gameplay)
            },
            blend: weight => MusicSystem.blendTunes(weight),
            end: () => {
                MusicSystem.dropKeptTune()
                if (!next) return
                const before = this.music
                this.music = next
                next = undefined
                if (this.gameplayStarted && this.ownsMusic && this.music.gameplay !== before.gameplay) void MusicSystem.playTune(this.music.gameplay)
            },
        }
    }

    startChoosing(): void {
        this.ownsMusic = true
        void MusicSystem.playTune(this.music.choosing, true)
        // Ready while the seeds are chosen (ModuleTune.preload), for the gameplay tune to start as soon as it is played.
        void MusicSystem.preloadTune(this.music.gameplay)
    }

    startGameplay(): void {
        if (this.gameplayStarted) return
        this.gameplayStarted = true
        this.ownsMusic = true
        void MusicSystem.playTune(this.music.gameplay, true)
    }

    pause(): void {
        if (this.ownsMusic) MusicSystem.pause()
    }

    /** The game pauses or goes on: the sounds that pause with it (pauseWithGame) do, whatever the music does. */
    pauseSounds(paused: boolean): void {
        SoundSystem.pauseGameSounds(paused)
    }

    resume(): void {
        if (this.ownsMusic && !this.musicHeld) MusicSystem.resume()
    }

    private musicHeld = false
    /**
     * A repick stands the level still and its music with it. The pause menu's resume leaves it paused meanwhile, and a
     * tune started meanwhile (a restored level's) starts paused, as MusicSystem keeps the pause asked for.
     */
    holdMusic(held: boolean): void {
        if (held === this.musicHeld) return
        if (held) this.pause()
        this.musicHeld = held
        if (!held) this.resume()
    }

    syncResult(result: WorldSnapshot['result']): void {
        if (result !== 'playing') this.stop()
    }

    stop(keepMusic = false): void {
        // Board::StopAllZombieSounds as the level ends.
        SoundSystem.stopGameSounds()
        if (keepMusic || !this.ownsMusic) return
        MusicSystem.stop()
        this.ownsMusic = false
    }

    seedPacketSelected(availability: SeedAvailability): void {
        if (!availability.reason) void SoundSystem.play(SoundEffect.SeedLift)
        else if (availability.reason !== 'not-enough-sun') void SoundSystem.play(SoundEffect.Buzzer)
    }

    plantingCancelled(): void {
        void SoundSystem.play(SoundEffect.Drop)
    }

    setSodRolling(rolling: boolean): void {
        if (rolling) void SoundSystem.play(SoundEffect.DiggerZombie, { channel: 'sodRoll', loop: true, pauseWithGame: true })
        else SoundSystem.stopChannel('sodRoll')
    }

    readySetPlant(): void {
        void SoundSystem.play(SoundEffect.ReadySetPlant)
        MusicSystem.fadeOut(150)
    }

    lightFill(): void {
        void SoundSystem.play(SoundEffect.LightFill)
    }

    finalWave(node: Node): void {
        startGameTween(node, tween(node).delay(0.6).call(() => void SoundSystem.play(SoundEffect.FinalWave)))
    }

    play(event: ServerEvent): void {
        switch (event.type) {
            case 'toolSelected': void SoundSystem.play(SoundEffect.Shovel, { foley: true }); break
            // Felt as it is heard, like a plant put down (StageEventRegistry).
            case 'plantShoveled': void SoundSystem.play(SoundEffect.Plant2); Haptics.play(); break
            case 'toolMissed': void SoundSystem.play(SoundEffect.Drop); break
            case 'musicBurst': MusicSystem.startBurst(Number(event.data.countdown)); break
            case 'hugeWaveSound': void SoundSystem.play(SoundEffect.HugeWave); break
            // ReportAchievement::GiveAchievement plays it with the message, even when the message waits its turn.
            case 'achievementEarned': if (event.data.announce === true) void SoundSystem.play(SoundEffect.Achievement); break
            // Board::UpdateLevelEndSequence raises the pitch by one step for each mower already scored.
            case 'mowerScored': void SoundSystem.play(SoundEffect.Points, { pitch: Math.max(0, Math.min(6, 6 - Number(event.data.remaining))) }); break
            // Not enough sun, and an enemy producer taking sun away: the sun counter flashes with the buzzer.
            case 'sunFlash': case 'sunDrained': void SoundSystem.play(SoundEffect.Buzzer); break
            // Board::MouseDownWithPlant: FOLEY_DROP for a seed dropped where it cannot be planted.
            case 'seedDropped': void SoundSystem.play(SoundEffect.Drop); break
            case 'levelWon': void SoundSystem.play(SoundEffect.WinMusic, { volumeGroup: 'music' }); break
            // Board::NextWaveComing: the awooga before the first wave, else the siren where the server says (a flag wave).
            case 'nextWaveComing':
                if (event.data.first === true) void SoundSystem.play(SoundEffect.Awooga)
                else if (event.data.siren === true) void SoundSystem.play(SoundEffect.Siren)
                break
        }
    }
}
