import type { StageEvent } from '@/client/level/LevelStage'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { renderOrder } from '@/shared/content/renderOrder'
import { mirrorX, plantFacingX, plantTeam } from '@/shared/content/teams'
import type { PlantSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import { PlantView } from './PlantView'

/**
 * A plant that shoots (Shooter): a particle that follows its shot (PlantPresentationDefinition.fireParticle, the
 * Fume-shroom's cloud), the effect at its mouth as each shot leaves (`muzzle`), and the fume's sounds. When it shoots is
 * the server's events'; its own (Shooter.snapshotOwn) is nothing.
 */
export class ShooterView extends PlantView {
    /** Tick the current shot started, for a particle that follows it; null until the next sync reports it. */
    private shotTick?: number | null

    /** A particle the presentation has follow a shot (the Fume-shroom's cloud, partway into it). */
    fire(): void {
        if (this.presentation.fireParticle) this.shotTick = null
    }

    protected onBoard(plant: PlantSnapshot, world: WorldSnapshot): void {
        super.onBoard(plant, world)
        const cue = this.presentation.fireParticle
        if (!cue || this.shotTick === undefined) return
        this.shotTick ??= world.gameplayTick
        if (world.gameplayTick - this.shotTick < cue.delayTicks) return
        // A plant facing left puffs from its mirrored mouth, the cloud blowing left; Plant::UpdateShooting puts the fume
        // cloud on its row's particle layer.
        const team = plantTeam(plant)
        this.particle(cue.id, plant.x + plantFacingX(cue.x, team), plant.y + cue.y, renderOrder('particle', plant.row), undefined, team === 'zombies')
        this.shotTick = undefined
    }

    /** Plant::Fire: the plant starts what follows its shot. */
    static readonly fired: StageEvent = (stage, event) => {
        if (typeof event.data.plantId === 'number') stage.view(event.data.plantId, ShooterView)?.fire()
    }

    /**
     * Plant::Fire: the plant's muzzle effect where its shot sets off (PlantPresentationDefinition.muzzle), at
     * RENDER_LAYER_LAWN_MOWER and 1 in its row. A shot of the zombies' side flies left, so the effect is mirrored across
     * the projectile's hitbox, as its splat is.
     */
    static readonly shot: StageEvent = (stage, event) => {
        const { plantTypeId, typeId, x, y, row } = event.data
        const muzzle = typeof plantTypeId === 'string' ? stage.content.presentation.plants[plantTypeId]?.muzzle : undefined
        const hitbox = typeof typeId === 'string' ? stage.content.definitions.projectiles[typeId]?.hitbox : undefined
        if (!muzzle || !hitbox || typeof x !== 'number' || typeof y !== 'number' || typeof row !== 'number') return
        const mirrored = event.data.team === 'zombies'
        stage.particle(muzzle.effect, x + mirrorX(muzzle.x, 2 * hitbox.x + hitbox.width, mirrored), y + muzzle.y,
            renderOrder('lawnMower', row, 1), undefined, mirrored)
    }

    /** Plant::Fire for the Fume-shroom plays the fume, and DoRowAreaDamage a splat for the zombies it hits. */
    static readonly areaAttack: StageEvent = (stage, event) => {
        SoundSystem.playSounds(stage.content.presentation.plants[String(event.data.typeId)]?.fireSounds)
        if (Number(event.data.hits) > 0) void SoundSystem.playFoley(SoundEffect.Splat)
    }
}
