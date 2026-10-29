import { randomAnimationRate } from '@/client/content/ClientAnimationRegistry'
import type { PlantSnapshot, WorldSnapshot } from '@/shared/protocol'
import { AnimatedPlantView } from './AnimatedPlantView'
import type { PlantParticle, PlantViewSnapshot } from './PlantView'
import { plantDefinition } from './definitions'

interface FireParticle { id: string; x: number; y: number; delayTicks: number }

/** Puff- and Fume-shrooms animate the entire body when firing, rather than an attached pea-shooter head. */
export class PuffShroomView extends AnimatedPlantView {
    private asleep = this.context.plant.asleep === true
    private idleRate = randomAnimationRate(this.animations.rates.plantIdle) / 12
    /** Tick the current shot started; null until the next sync reports it. */
    private shotTick?: number | null
    /** Plant::UpdateShooting adds the Fume-shroom's cloud partway into the shot. */
    private get fireParticle(): FireParticle | undefined {
        return plantDefinition(this.animations.definitions, this.context.plant.typeId).viewConfig?.fireParticle as unknown as FireParticle | undefined
    }

    protected async loadAnimations(): Promise<void> {
        await Promise.all([
            this.playBody(this.asleep ? this.clips.sleep : this.clips.body, true, this.idleRate, 0),
            this.loadExtra('Blink', this.clips.blink),
        ])
    }
    protected extraClip() { return this.clips.blink }
    protected blinkPlayer() { return !this.asleep && this.body.loadedId === this.clips.body.reanimId ? this.extras.get('Blink') : undefined }

    async fire(): Promise<void> {
        if (this.asleep) return
        if (this.fireParticle) this.shotTick = null
        this.extras.get('Blink')?.hide()
        await this.playBody(this.clips.shoot, false, 35 / 12, 0.2)
        if (this.node.isValid && this.body.loadedId === this.clips.shoot.reanimId) this.bindShootFinish()
    }
    private bindShootFinish(): void {
        this.body.setOnFinish(() => { void this.playBody(this.clips.body, true, this.idleRate, 0.2) })
    }
    protected syncVisuals(plant: PlantSnapshot, world: WorldSnapshot, particle: PlantParticle): void {
        const cue = this.fireParticle
        if (cue && this.shotTick !== undefined) {
            this.shotTick ??= world.gameplayTick
            if (world.gameplayTick - this.shotTick >= cue.delayTicks) {
                particle(cue.id, plant.x + cue.x, plant.y + cue.y)
                this.shotTick = undefined
            }
        }
        if (this.asleep === (plant.asleep === true)) return
        this.asleep = plant.asleep === true
        this.extras.get('Blink')?.hide()
        void this.playBody(this.asleep ? this.clips.sleep : this.clips.body, true, this.idleRate, 0.2)
    }
    snapshot(entityId: number): PlantViewSnapshot { return { ...super.snapshot(entityId), idleRate: this.idleRate } }
    async restore(snapshot: PlantViewSnapshot): Promise<void> {
        if (snapshot.idleRate !== undefined) this.idleRate = snapshot.idleRate
        await super.restore(snapshot)
        if (this.body.loadedId === this.clips.shoot.reanimId) this.bindShootFinish()
    }
}
