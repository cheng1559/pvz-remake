import type { StageEvent } from '@/client/level/LevelStage'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { PlantView } from './PlantView'

/**
 * The potato mine (PotatoMine): it arms, rises and is armed, which its animation plays on the server
 * (PlantAnimationDefinition.states); rising is its event. Its own (PotatoMine.snapshotOwn): `state`.
 */
export class PotatoMineView extends PlantView {
    /** Plant::UpdatePotato adds PARTICLE_POTATO_MINE_RISE at the mine's own draw order, so it draws after it, with the dirt's sound. */
    static readonly rose: StageEvent = (stage, event, world) => {
        void SoundSystem.playFoley(SoundEffect.DirtRise)
        const plant = world.plants.find(candidate => candidate.entityId === event.data.entityId)
        if (plant) stage.particle('pvz:potatominerise', plant.x + 40, plant.y + 40, stage.plantOrder(plant))
    }
}
