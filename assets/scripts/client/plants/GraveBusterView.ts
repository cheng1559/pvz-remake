import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import type { PlantSnapshot } from '@/shared/protocol/index'
import { AnimatedPlantView, plantAnimation } from './AnimatedPlantView'

/** Plant::UpdateGraveBuster: anim_land once, then it chews and sinks while the grave disappears. */
export class GraveBusterView extends AnimatedPlantView {
    protected get hasShadow(): boolean { return false }

    protected abilityClip(state: string | undefined) {
        // The rate is fitted to the server's landing ticks once the clip has loaded.
        if (state === 'landing') return plantAnimation(this.clips.land, false, 1)
        return plantAnimation(this.clips.body, true, 1, 0.1)
    }

    protected onAbilityPlayed(state: string | undefined): void {
        const ticks = this.context.plant.ability?.ticks
        if (state === 'landing' && ticks) {
            this.body.play({ loop: false, rate: this.body.durationSeconds * 100 / ticks, timeSeconds: 0, hideOnFinish: false })
        }
        // AddAttachedParticle: the chewing particle belongs to the buster and goes away with it.
        if (state === 'eating' && !this.node.children.some(child => child.getComponent(ParticlePlayer)?.id === 'pvz:gravebuster')) {
            ParticlePlayer.spawn({ parent: this.node, id: 'pvz:gravebuster', x: 40, y: -40 })
        }
    }

    protected syncVisuals(plant: PlantSnapshot): void {
        if (plant.ability?.state !== 'eating') return
        // Plant::UpdateReanim sinks the buster 30px over the eating countdown.
        const eatTicks = this.content.definitions.plants[plant.typeId].graveBuster!.eatTicks
        const clip = this.clips.body
        this.body.node.setPosition(clip.x, clip.y - 30 * (1 - plant.ability.ticks / eatTicks))
    }
}
