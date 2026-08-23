import { Node, tween } from 'cc'
import { MusicSystem } from '@/client/music/MusicSystem'
import { SoundEffect, SoundLoader } from '@/client/sound/LegacySoundSystem'
import type { ServerEvent, WorldSnapshot } from '@/shared/protocol/index'
import type { Adventure11AudioSnapshotV2 } from './Adventure11PresentationSnapshotV2'

export class Adventure11AudioPresenter {
    private ownsMusic = false
    private gameplayStarted = false
    private firstWavePlayed = false

    snapshot(): Adventure11AudioSnapshotV2 {
        return {
            music: this.ownsMusic ? MusicSystem.capturePlaybackSnapshot() : null,
            ownsMusic: this.ownsMusic,
            gameplayStarted: this.gameplayStarted,
            firstWavePlayed: this.firstWavePlayed,
        }
    }

    async restore(snapshot: Adventure11AudioSnapshotV2): Promise<void> {
        this.ownsMusic = snapshot.ownsMusic
        this.gameplayStarted = snapshot.gameplayStarted
        this.firstWavePlayed = snapshot.firstWavePlayed
        if (snapshot.music) await MusicSystem.restorePlaybackSnapshot(snapshot.music)
        else if (snapshot.ownsMusic) {
            await MusicSystem.playTune(snapshot.gameplayStarted ? 'day_grasswalk' : 'choose_seeds', true)
        } else MusicSystem.stop()
    }

    startChoosing(): void {
        this.ownsMusic = true
        void MusicSystem.playTune('choose_seeds', true)
    }

    startGameplay(): void {
        if (this.gameplayStarted) return
        this.gameplayStarted = true
        this.ownsMusic = true
        void MusicSystem.playTune('day_grasswalk', true)
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

    projectileImpact(): void {
        void SoundLoader.playFoley(SoundEffect.Splat, 10)
    }

    zombiePartDropped(): void {
        void SoundLoader.playFoley(SoundEffect.LimbsPop, 10)
    }

    finalWave(node: Node): void {
        tween(node).delay(0.6).call(() => void SoundLoader.play(SoundEffect.FinalWave)).start()
    }

    play(event: ServerEvent): void {
        switch (event.type) {
            case 'plantPlaced': void SoundLoader.playFoley(SoundEffect.Plant); break
            case 'projectileFired': void SoundLoader.playFoley(SoundEffect.Throw, 10); break
            case 'itemCollected': void SoundLoader.playFoley(SoundEffect.Points, 10); break
            case 'sunFlash': void SoundLoader.play(SoundEffect.Buzzer); break
            case 'mowerActivated': void SoundLoader.playFoley(SoundEffect.Lawnmower); break
            case 'zombieMowered': void SoundLoader.playFoley(SoundEffect.Splat); break
            case 'zombieChewedPlant': void SoundLoader.playFoley(SoundEffect.Chomp); break
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
