import type { StageEvent } from '@/client/level/LevelStage'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { nonEmptyString } from '@/shared/validate'
import { ProducerView } from './ProducerView'
import type { ShownPlant } from './PlantView'

/**
 * The sun-shroom (SunShroom): a producer that grows, its shadow with it, and sounds as it does. Its own
 * (SunShroom.snapshotOwn): a producer's, and `state` (small, growing, big).
 */
export class SunShroomView extends ProducerView {
    /**
     * Plant::DrawShadow: its shadow at what the presentation's `shadow.states` has for its state; `[from, to]` goes from
     * one to the other as its first layer's clip plays (growing: 0.5 + 0.5 * its body's anim_grow time).
     */
    protected shadowScale(plant: ShownPlant): number {
        const state = this.own(plant, 'state', nonEmptyString), sized = state === undefined ? undefined : this.presentation.shadow?.states?.[state]
        if (typeof sized === 'number') return sized
        if (!sized) return super.shadowScale(plant)
        const layer = plant.animations?.[Object.keys(this.animation.layers)[0]], frames = layer && this.animation.clips[layer.clip]?.frames
        return sized[0] + (sized[1] - sized[0]) * (layer && frames ? Math.min(1, layer.time / frames) : 0)
    }

    /** It grows (FOLEY_PLANTGROW). */
    static readonly grew: StageEvent = () => { void SoundSystem.playFoley(SoundEffect.PlantGrow) }
}
