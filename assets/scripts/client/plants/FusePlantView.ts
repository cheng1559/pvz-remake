import type { StageEvent } from '@/client/level/LevelStage'
import { SoundSystem } from '@/client/sound/SoundSystem'
import { renderOrder } from '@/shared/content/renderOrder'
import type { PlantSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import { PlantView } from './PlantView'

/** Plant::DoSpecial's aPosX and aPosY: the middle of the plant's 80 by 80 (mWidth, mHeight). */
const PLANT_MIDDLE = { x: 40, y: 40 }

/**
 * A plant whose fuse burns down to what it does (FusePlant: the cherry bomb, the ice-shroom, the doom-shroom): as it
 * burns, it is drawn moved (PlantPresentationDefinition.jitter) or its tracks are shaken (`shake`); an ice-shroom's
 * freeze is its event. Its own (FusePlant.snapshotOwn): nothing.
 */
export class FusePlantView extends PlantView {
    /** The tick it was last moved on (`jitter`). */
    private jitteredTick?: number
    /** The tick its tracks were last shaken on (`shake`); none while they are not. */
    private tracksShakenTick?: number

    protected onBoard(plant: PlantSnapshot, world: WorldSnapshot): void {
        super.onBoard(plant, world)
        this.jitter(plant, world)
        this.shakeTracks(plant, world)
    }

    /** Plant::Animate jitters a lit cherry bomb by up to a pixel each way, as it updates: not while it is frozen. */
    private jitter(plant: PlantSnapshot, world: WorldSnapshot): void {
        const amount = this.presentation.jitter
        if (!amount || plant.frozen || world.gameplayTick === this.jitteredTick) return
        this.root.setPosition((Math.random() * 2 - 1) * amount, (Math.random() * 2 - 1) * amount)
        this.jitteredTick = world.gameplayTick
    }

    /**
     * Reanimation::SetShakeOverride: while its body plays the presentation's `shake.clip`, its shaken tracks are drawn
     * moved anew each tick, held while it is frozen (the original's Reanimation stops updating), and put back after.
     */
    private shakeTracks(plant: PlantSnapshot, world: WorldSnapshot): void {
        const shake = this.presentation.shake, body = this.body
        if (!shake || !body.loadedId) return
        const tracks = Object.entries(shake.tracks).filter(([track]) => body.trackIds.includes(track))
        if (plant.animations?.[Object.keys(this.animation.layers)[0]]?.clip !== shake.clip) {
            if (this.tracksShakenTick === undefined) return
            for (const [track] of tracks) body.setTrackOffset(track, null)
            this.tracksShakenTick = undefined
            return
        }
        if (plant.frozen || world.gameplayTick === this.tracksShakenTick) return
        this.tracksShakenTick = world.gameplayTick
        for (const [track, amount] of tracks) body.setTrackOffset(track, { x: (Math.random() * 2 - 1) * amount, y: (Math.random() * 2 - 1) * amount })
    }

    /**
     * Plant::DoSpecial for a plant that freezes (the ice-shroom): its presentation's sounds, and its `freeze` effect from
     * the plant's middle (PARTICLE_ICE_TRAP over everything). The plant is gone by then.
     */
    static readonly froze: StageEvent = (stage, event) => {
        const presentation = typeof event.data.typeId === 'string' ? stage.content.presentation.plants[event.data.typeId] : undefined
        SoundSystem.playSounds(presentation?.freezeSounds)
        const { x, y, row } = event.data, freeze = presentation?.freeze
        if (!freeze || typeof x !== 'number' || typeof y !== 'number' || typeof row !== 'number') return
        stage.particle(freeze.effect, x + PLANT_MIDDLE.x, y + PLANT_MIDDLE.y, renderOrder(freeze.layer, row))
    }
}
