import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import type { PlantSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import { nonEmptyString, nonNegativeInteger } from '@/shared/validate'
import type { StageEvent } from '@/client/level/LevelStage'
import { PlantView } from './PlantView'

/**
 * Plant::UpdateGraveBuster (GraveBuster): it lands, then chews and sinks while the grave disappears (GraveView asks it
 * how far, `eating`). Its own (GraveBuster.snapshotOwn): `phase` (landing, eating) and `ticks`, what is left of it.
 */
export class GraveBusterView extends PlantView {
    /** The ticks it has left to eat its grave, while it eats; none before. */
    eating(plant: PlantSnapshot): number | undefined {
        return this.own(plant, 'phase', nonEmptyString) === 'eating' ? this.own(plant, 'ticks', nonNegativeInteger) : undefined
    }

    protected onBoard(plant: PlantSnapshot, world: WorldSnapshot): void {
        super.onBoard(plant, world)
        const ticks = this.eating(plant)
        if (ticks === undefined) return
        const { node, content } = this.context
        // AddAttachedParticle: the chewing particle belongs to the buster and goes away with it.
        if (!node.children.some(child => child.getComponent(ParticlePlayer)?.id === 'pvz:gravebuster')) {
            ParticlePlayer.spawn({ parent: node, id: 'pvz:gravebuster', x: 40, y: -40 })
        }
        // Plant::UpdateReanim sinks the buster 30px over the eating countdown.
        this.root.setPosition(0, -30 * (1 - ticks / content.definitions.plants[plant.typeId].graveBuster!.eatTicks))
    }

    /**
     * Plant::UpdateGraveBuster in 1.0.0.1051 spawns PARTICLE_GRAVE_BUSTER_DIE at (mX + 40, mY + 80), 4 above itself; a
     * buster of the zombies' side faces left, so its dirt does too, about the same middle. The buster is gone by then:
     * the event says where it stood.
     */
    static readonly busted: StageEvent = (stage, event) => {
        const x = Number(event.data.x), order = stage.plantOrder({ typeId: String(event.data.typeId), row: Number(event.data.row), x })
        stage.particle('pvz:gravebusterdie', x + 40, Number(event.data.y) + 80, order + 4, undefined, event.data.team === 'zombies')
    }
}
