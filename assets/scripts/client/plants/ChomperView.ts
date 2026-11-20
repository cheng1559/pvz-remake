import type { StageEvent } from '@/client/level/LevelStage'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { nonEmptyString } from '@/shared/validate'
import { PlantView, type ShownPlant } from './PlantView'

/**
 * The chomper (Chomper): it bites, chews and swallows by its phase, which its animation plays on the server
 * (PlantAnimationDefinition.phases). Its own (Chomper.snapshotOwn): `phase`, and `prey: 'plant'` when what it chews is
 * a hostile plant.
 */
export class ChomperView extends PlantView {
    pose(plant: ShownPlant): void {
        super.pose(plant)
        // The chew and swallow clips draw the eaten zombie's arm; a swallowed plant has none.
        this.body.setTracksVisible(this.presentation.parts?.prey ?? [], this.own(plant, 'prey', nonEmptyString) !== 'plant')
    }

    /** Plant::UpdateChomper bites (FOLEY_BIGCHOMP). */
    static readonly bit: StageEvent = () => { void SoundSystem.play(SoundEffect.BigChomp, { foley: true }) }
}
