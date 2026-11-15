import type { PlantSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import { PlantView } from './PlantView'

export class CherryBombView extends PlantView {
    private shakenTick = -1

    protected onBoard(plant: PlantSnapshot, world: WorldSnapshot): void {
        super.onBoard(plant, world)
        if (world.gameplayTick === this.shakenTick) return
        // Plant::Animate jitters a lit cherry bomb by up to a pixel.
        this.root.setPosition(-1 + Math.random() * 2, -1 + Math.random() * 2)
        this.shakenTick = world.gameplayTick
    }
}
