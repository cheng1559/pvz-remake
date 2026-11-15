import type { StageEvent } from '@/client/level/LevelStage'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { PlantView, type ShownPlant } from './PlantView'

export class ChomperView extends PlantView {
    show(plant: ShownPlant): void {
        super.show(plant)
        // The chew and swallow clips draw the eaten zombie's arm; a swallowed plant has none.
        this.body.setTracksVisible(this.presentation.parts?.prey ?? [], plant.ability?.prey !== 'plant')
    }

    /** Plant::UpdateChomper bites (FOLEY_BIGCHOMP). */
    static readonly bit: StageEvent = () => { void SoundSystem.playFoley(SoundEffect.BigChomp) }
}
