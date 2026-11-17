import type { StageEvent } from '@/client/level/LevelStage'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { PlantView } from './PlantView'

/**
 * A bowled nut (BowlingNut): it rolls on the server, its layer on its presentation's (`projectile`); a hit is its event.
 * Its own (BowlingNut.snapshotOwn): nothing.
 */
export class BowlingNutView extends PlantView {
    /**
     * Plant::UpdateBowling: a rolling nut hits a zombie. Zombie::TakeShieldDamage rings a screen door; UpdateBowling a
     * helm without a shield. The board shakes with it.
     */
    static readonly bowled: StageEvent = (stage, event) => {
        stage.shake(1, -2, 'heavy')
        void SoundSystem.playFoley(SoundEffect.BowlingImpact, -3)
        const zombie = stage.content.presentation.zombies[String(event.data.typeId)]
        if (event.data.shield) SoundSystem.playSounds(zombie?.shield?.bowlingImpactSounds)
        else if (event.data.helm) SoundSystem.playSounds(zombie?.helm?.bowlingImpactSounds)
    }
}
