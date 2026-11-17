import type { StageEvent } from '@/client/level/LevelStage'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import type { PlantSnapshot } from '@/shared/protocol/index'
import { integer } from '@/shared/validate'
import { PlantView } from './PlantView'

/**
 * A bowled nut (BowlingNut): it rolls on the server, its layer on its presentation's (`projectile`); a hit is its event.
 * Its own (BowlingNut.snapshotOwn): the way it slants, `direction`, while it does.
 */
export class BowlingNutView extends PlantView {
    /** Plant::UpdateBowling sets its draw order before it moves the row on: a nut rolling down is drawn with the row above. */
    drawnRow(plant: PlantSnapshot): number {
        return plant.row - (this.own(plant, 'direction', integer) === 1 ? 1 : 0)
    }

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
