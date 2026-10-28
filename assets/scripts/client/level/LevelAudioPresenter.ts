import type { PresentationDefinitions, PresentationSound } from '@/shared/content/presentation'
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

    sounds(sounds: readonly PresentationSound[] | undefined): void {
        for (const sound of sounds ?? []) {
            if (sound.foley) void SoundSystem.playFoley(sound.id as SoundEffect, sound.pitchRange)
            else void SoundSystem.play(sound.id as SoundEffect)
        }
    }

    chew(soft: boolean): void {
        void SoundSystem.playFoley(soft ? SoundEffect.ChompSoft : SoundEffect.Chomp)
    }

    finalWave(node: Node): void {
        startGameTween(node, tween(node).delay(0.6).call(() => void SoundSystem.play(SoundEffect.FinalWave)))
    }

    play(event: ServerEvent): void {
        switch (event.type) {
            case 'toolSelected': void SoundSystem.playFoley(SoundEffect.Shovel); break
            case 'plantShoveled': void SoundSystem.play(SoundEffect.Plant2); break
            case 'toolMissed': void SoundSystem.play(SoundEffect.Drop); break
            case 'bowlingImpact':
                void SoundSystem.playFoley(SoundEffect.BowlingImpact, -3)
                if (event.data.helm) this.sounds(this.definitions.zombies[String(event.data.typeId)]?.helm?.bowlingImpactSounds)
                break
            case 'plantPlaced':
                void SoundSystem.playFoley(SoundEffect.Plant)
                if (event.data.bowling) void SoundSystem.play(SoundEffect.Bowling)
                this.sounds(this.definitions.plants[String(event.data.typeId)]?.plantedSounds)
                break
            case 'musicBurst': MusicSystem.startBurst(); break
            case 'sunProduced': void SoundSystem.playFoley(SoundEffect.Throw, 10); break
            case 'hugeWaveSound': void SoundSystem.play(SoundEffect.HugeWave); break
            case 'projectileFired':
                this.sounds(this.definitions.projectiles[String(event.data.typeId)]?.fireSounds)
                break
            case 'plantExploded':
                this.sounds(this.definitions.plants[String(event.data.typeId)]?.explosionSounds)
                break
            case 'mineRising': void SoundSystem.playFoley(SoundEffect.DirtRise); break
            case 'chomperBit': void SoundSystem.playFoley(SoundEffect.BigChomp); break
            case 'zombieChilled': void SoundSystem.playFoley(SoundEffect.Frozen); break
            case 'zombieVaultSound':
                void SoundSystem.playFoley(event.data.sound === 'polevault' ? SoundEffect.PoleVault : SoundEffect.Grassstep)
                break
            case 'itemCollected': void SoundSystem.playFoley(SoundEffect.Points, 10); break
            case 'sunFlash': void SoundSystem.play(SoundEffect.Buzzer); break
            case 'mowerActivated': void SoundSystem.playFoley(SoundEffect.Lawnmower); break
            case 'zombieMowered': void SoundSystem.playFoley(SoundEffect.Splat); break
            case 'plantEaten': void SoundSystem.play(SoundEffect.Gulp); break
            case 'zombieDying': void SoundSystem.playFoley(SoundEffect.ZombieFalling1, 10); break
            case 'zombieGroaned': void SoundSystem.playFoley(SoundEffect.Groan); break
            case 'levelAwardDropped': void SoundSystem.playFoley(SoundEffect.Throw, 10); break
            case 'levelAwardCollected':
                void SoundSystem.play(SoundEffect.SeedLift)
                void SoundSystem.play(SoundEffect.Drop)
                break
            case 'levelWon': void SoundSystem.playMusicVolumeSfx(SoundEffect.WinMusic); break
            case 'zombieSpawned':
                if (!this.firstWavePlayed && event.data.wave === 0) {
                    this.firstWavePlayed = true
                    void SoundSystem.play(SoundEffect.Awooga)
                }
                break
        }
    }
}
