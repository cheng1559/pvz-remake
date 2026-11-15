import { modResources } from '@/client/content/ModResources'
import type { SpriteFrame } from 'cc'
import type { PlantSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import { PlantView } from './PlantView'

export class WallNutView extends PlantView {
    /** The cracks its face shows; none before the first sync, so a nut found cracked (a save) does not puff. */
    private crackStage = -1
    private cracks?: readonly SpriteFrame[]

    async initialize(): Promise<void> {
        await super.initialize()
        const faces = this.presentation.crackedFaces
        if (faces) this.cracks = await Promise.all(faces.map(id => modResources.sprite(id)))
    }

    protected onBoard(plant: PlantSnapshot, world: WorldSnapshot): void {
        super.onBoard(plant, world)
        this.syncCracks(plant)
    }

    /** Plant::AnimateNuts: the face takes a cracked sprite under two thirds of its health and another under a third, with a puff. */
    protected syncCracks(plant: PlantSnapshot): void {
        const stage = plant.health < plant.maxHealth / 3 ? 2 : plant.health < plant.maxHealth * 2 / 3 ? 1 : 0
        if (stage === this.crackStage) return
        const face = this.presentation.parts?.face
        if (!face || !this.cracks) throw new Error(`${plant.typeId} needs parts.face and crackedFaces for its cracks`)
        this.body.setTrackSpriteOverride(face, stage === 0 ? null : this.cracks[stage - 1])
        if (this.crackStage >= 0 && stage > this.crackStage) this.particle('pvz:wallnuteatlarge', plant.x + 40, plant.y + 10, this.tint)
        this.crackStage = stage
    }
}
