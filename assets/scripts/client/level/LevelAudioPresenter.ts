import type { PresentationDefinitions, PresentationSound } from '@/shared/content/presentation'
import { Node, tween } from 'cc'
import { startGameTween } from '@/core/GameTween'
import { MusicSystem } from '@/client/music/MusicSystem'
import { SoundEffect, SoundLoader } from '@/client/sound/LegacySoundSystem'
import type { ServerEvent, WorldSnapshot } from '@/shared/protocol/index'
import type { BoardPresentation } from './boards/DayBoard'
import type { LevelAudioSnapshot } from './LevelPresentationSnapshot'

export class LevelAudioPresenter {
    private ownsMusic = false
    private gameplayStarted = false
    private firstWavePlayed = false

    constructor(private readonly music: BoardPresentation['music'], private readonly definitions: PresentationDefinitions) {}

    snapshot(): LevelAudioSnapshot {
        return {
            music: this.ownsMusic ? MusicSystem.capturePlaybackSnapshot() : null,
            ownsMusic: this.ownsMusic,
            gameplayStarted: this.gameplayStarted,
            firstWavePlayed: this.firstWavePlayed,
        }
    }

    async restore(snapshot: LevelAudioSnapshot): Promise<void> {
        this.ownsMusic = snapshot.ownsMusic
        this.gameplayStarted = snapshot.gameplayStarted
        this.firstWavePlayed = snapshot.firstWavePlayed
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
        if (this.ownsMusic) MusicSystem.resume()
    }

    syncResult(result: WorldSnapshot['result']): void {
        if (result !== 'playing') this.stop()
    }

    stop(): void {
        if (!this.ownsMusic) return
        MusicSystem.stop()
        this.ownsMusic = false
    }

    seedPacketSelected(cooldownRemaining: number, canAfford: boolean): void {
        if (cooldownRemaining > 0) void SoundLoader.play(SoundEffect.Buzzer)
        else if (canAfford) void SoundLoader.play(SoundEffect.SeedLift)
    }

    plantingCancelled(): void {
        void SoundLoader.play(SoundEffect.Drop)
    }

    sodRollStarted(): void {
        void SoundLoader.play(SoundEffect.DiggerZombie)
    }

    lightFill(): void {
        void SoundLoader.play(SoundEffect.LightFill)
    }

    sounds(sounds: readonly PresentationSound[] | undefined): void {
        for (const sound of sounds ?? []) {
            if (sound.foley) void SoundLoader.playFoley(sound.id as SoundEffect, sound.pitchRange)
            else void SoundLoader.play(sound.id as SoundEffect)
        }
    }

    chew(soft: boolean): void {
        void SoundLoader.playFoley(soft ? SoundEffect.ChompSoft : SoundEffect.Chomp)
    }

    finalWave(node: Node): void {
        startGameTween(node, tween(node).delay(0.6).call(() => void SoundLoader.play(SoundEffect.FinalWave)))
    }

    play(event: ServerEvent): void {
        switch (event.type) {
            case 'plantPlaced':
                void SoundLoader.playFoley(SoundEffect.Plant)
                this.sounds(this.definitions.plants[String(event.data.typeId)]?.plantedSounds)
                break
            case 'musicBurst': MusicSystem.startBurst(); break
            case 'sunProduced': void SoundLoader.playFoley(SoundEffect.Throw, 10); break
            case 'hugeWaveSound': void SoundLoader.play(SoundEffect.HugeWave); break
            case 'projectileFired':
                this.sounds(this.definitions.projectiles[String(event.data.typeId)]?.fireSounds)
                break
            case 'plantExploded':
                this.sounds(this.definitions.plants[String(event.data.typeId)]?.explosionSounds)
                break
            case 'mineRising': void SoundLoader.playFoley(SoundEffect.DirtRise); break
            case 'chomperBit': void SoundLoader.playFoley(SoundEffect.BigChomp); break
            case 'zombieChilled': void SoundLoader.playFoley(SoundEffect.Frozen); break
            case 'zombieVaultSound':
                void SoundLoader.playFoley(event.data.sound === 'polevault' ? SoundEffect.PoleVault : SoundEffect.Grassstep)
                break
            case 'itemCollected': void SoundLoader.playFoley(SoundEffect.Points, 10); break
            case 'sunFlash': void SoundLoader.play(SoundEffect.Buzzer); break
            case 'mowerActivated': void SoundLoader.playFoley(SoundEffect.Lawnmower); break
            case 'zombieMowered': void SoundLoader.playFoley(SoundEffect.Splat); break
            case 'plantEaten': void SoundLoader.play(SoundEffect.Gulp); break
            case 'zombieDying': void SoundLoader.playFoley(SoundEffect.ZombieFalling1, 10); break
            case 'zombieGroaned': void SoundLoader.playFoley(SoundEffect.Groan); break
            case 'levelAwardDropped': void SoundLoader.playFoley(SoundEffect.Throw, 10); break
            case 'levelAwardCollected':
                void SoundLoader.play(SoundEffect.SeedLift)
                void SoundLoader.play(SoundEffect.Drop)
                break
            case 'levelWon': void SoundLoader.playMusicVolumeSfx(SoundEffect.WinMusic); break
            case 'zombieSpawned':
                if (!this.firstWavePlayed && event.data.wave === 0) {
                    this.firstWavePlayed = true
                    void SoundLoader.play(SoundEffect.Awooga)
                }
                break
        }
    }
}
