import { randomAnimationRate } from '@/client/content/ClientAnimationRegistry'
import type { PlantSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import { AnimatedPlantView, plantAnimation } from './AnimatedPlantView'

export class CherryBombView extends AnimatedPlantView {
    private lastSyncedTick = -1

    protected abilityClip() {
        // The explosion runs at the plant's random 10-15 fps on a 30 fps clip.
        return plantAnimation(this.clips.explode, false, randomAnimationRate(this.animations.rates.plantIdle) / 30)
    }

    protected syncVisuals(_plant: PlantSnapshot, world: WorldSnapshot): void {
        if (world.gameplayTick === this.lastSyncedTick) return
        // Plant::Animate jitters a lit cherry bomb by up to a pixel.
        this.body.node.setPosition(-1 + Math.random() * 2, -1 + Math.random() * 2)
        this.lastSyncedTick = world.gameplayTick
    }
}
