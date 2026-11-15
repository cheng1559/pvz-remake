import type { PlantSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import { PlantView } from './PlantView'

export class WallNutView extends PlantView {
    /** The cracks its face shows; none before the first sync, so a nut found cracked (a save) does not puff. */
    private crackStage = -1

    protected onBoard(plant: PlantSnapshot, world: WorldSnapshot): void {
        super.onBoard(plant, world)
        this.syncCracks(plant)
    }

    /** Plant::AnimateNuts: the face takes a cracked sprite under two thirds of its health and another under a third, with a puff. */
    protected syncCracks(plant: PlantSnapshot): void {
        const stage = plant.health < plant.maxHealth / 3 ? 2 : plant.health < plant.maxHealth * 2 / 3 ? 1 : 0
        if (stage === this.crackStage) return
        const face = this.presentation.parts?.face
        if (!face) throw new Error(`${plant.typeId} needs parts.face for its cracked sprites`)
        this.body.setTrackSpriteOverride(face, stage === 0 ? null : this.context.stage!.assets.wallnutCracked[stage - 1])
        if (this.crackStage >= 0 && stage > this.crackStage) this.particle('pvz:wallnuteatlarge', plant.x + 40, plant.y + 10, this.tint)
        this.crackStage = stage
    }
}
