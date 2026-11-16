import { Node, tween } from 'cc'
import { startGameTween } from '@/core/GameTween'
import { MusicSystem } from '@/client/music/MusicSystem'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import type { SeedAvailability, ServerEvent, WorldSnapshot } from '@/shared/protocol/index'
import type { BoardPresentation } from '@/shared/content/presentation'
import type { LevelAudioSnapshot } from './LevelPresentationSnapshot'

export class LevelAudioPresenter {
    private ownsMusic = false
    private gameplayStarted = false

    /**
     * The level's own sounds and its music. What is heard of something on the board (a plant, a zombie, a projectile, an
     * item) is its view's (ClientViews.events).
     */
    constructor(private readonly music: BoardPresentation['music']) {}

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

    startChoosing(): void {
        this.ownsMusic = true
        void MusicSystem.playTune(this.music.choosing, true)
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

    stop(): void {
        if (!this.ownsMusic) return
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

    sodRollStarted(): void {
        void SoundSystem.play(SoundEffect.DiggerZombie)
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
            case 'toolSelected': void SoundSystem.playFoley(SoundEffect.Shovel); break
            case 'plantShoveled': void SoundSystem.play(SoundEffect.Plant2); break
            case 'toolMissed': void SoundSystem.play(SoundEffect.Drop); break
            case 'musicBurst': MusicSystem.startBurst(); break
            case 'hugeWaveSound': void SoundSystem.play(SoundEffect.HugeWave); break
            // ReportAchievement::GiveAchievement plays it with the message, even when the message waits its turn.
            case 'achievementEarned': if (event.data.announce === true) void SoundSystem.play(SoundEffect.Achievement); break
            // Board::UpdateLevelEndSequence raises the pitch by one step for each mower already scored.
            case 'mowerScored': void SoundSystem.playWithPitch(SoundEffect.Points, Math.max(0, Math.min(6, 6 - Number(event.data.remaining)))); break
            // Not enough sun, and an enemy producer taking sun away: the sun counter flashes with the buzzer.
            case 'sunFlash': case 'sunDrained': void SoundSystem.play(SoundEffect.Buzzer); break
            // Board::MouseDownWithPlant: FOLEY_DROP for a seed dropped where it cannot be planted.
            case 'seedDropped': void SoundSystem.play(SoundEffect.Drop); break
            case 'levelWon': void SoundSystem.playMusicVolumeSfx(SoundEffect.WinMusic); break
            // Board::NextWaveComing: the awooga before the first wave, else the siren where the server says (a flag wave).
            case 'nextWaveComing':
                if (event.data.first === true) void SoundSystem.play(SoundEffect.Awooga)
                else if (event.data.siren === true) void SoundSystem.play(SoundEffect.Siren)
                break
        }
    }
}
