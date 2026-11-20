import type { StageEvent } from '@/client/level/LevelStage'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import type { PlantSnapshot } from '@/shared/protocol/index'
import { nonNegativeInteger } from '@/shared/validate'
import { PlantView } from './PlantView'

/**
 * A plant that produces (Producer, the sunflower): it glows as its next sun comes (EntityFlashes.producer) and throws
 * it with a sound. Its own (Producer.snapshotOwn): `produceTicks`, the ticks to its next sun.
 */
export class ProducerView extends PlantView {
    /** Plant::UpdateProductionPlant: over the last 100 ticks to its sun it glows, unless a bite flashes it brighter. */
    protected flashed(plant: PlantSnapshot, tick: number): number {
        const ticks = this.own(plant, 'produceTicks', nonNegativeInteger), flashes = this.context.stage?.flashes
        return ticks === undefined || !flashes ? super.flashed(plant, tick) : flashes.producer(plant.entityId, tick, ticks)
    }

    /** Plant::UpdateProductionPlant throws its sun (FOLEY_SPAWN_SUN). */
    static readonly produced: StageEvent = () => { void SoundSystem.play(SoundEffect.Throw, { foley: true, pitchRange: 10 }) }
}
