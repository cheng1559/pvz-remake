import type { PlantSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import { PlantView, type PlantParticle } from './PlantView'

export class CherryBombView extends PlantView {
    private shakenTick = -1

    sync(plant: PlantSnapshot, world: WorldSnapshot, particle: PlantParticle, flash: number): void {
        super.sync(plant, world, particle, flash)
        if (world.gameplayTick === this.shakenTick) return
        // Plant::Animate jitters a lit cherry bomb by up to a pixel.
        this.root.setPosition(-1 + Math.random() * 2, -1 + Math.random() * 2)
        this.shakenTick = world.gameplayTick
    }
}
