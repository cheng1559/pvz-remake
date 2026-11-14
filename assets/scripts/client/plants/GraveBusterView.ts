import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import type { PlantSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import { PlantView, type PlantParticle } from './PlantView'

/** Plant::UpdateGraveBuster: it lands, then chews and sinks while the grave disappears. */
export class GraveBusterView extends PlantView {
    sync(plant: PlantSnapshot, world: WorldSnapshot, particle: PlantParticle, upgradeTarget: boolean, flash: number): void {
        super.sync(plant, world, particle, upgradeTarget, flash)
        if (plant.ability?.state !== 'eating') return
        const { node, content } = this.context
        // AddAttachedParticle: the chewing particle belongs to the buster and goes away with it.
        if (!node.children.some(child => child.getComponent(ParticlePlayer)?.id === 'pvz:gravebuster')) {
            ParticlePlayer.spawn({ parent: node, id: 'pvz:gravebuster', x: 40, y: -40 })
        }
        // Plant::UpdateReanim sinks the buster 30px over the eating countdown.
        this.root.setPosition(0, -30 * (1 - plant.ability.ticks / content.definitions.plants[plant.typeId].graveBuster!.eatTicks))
    }
}
