import { Color } from 'cc'
import { randomAnimationRate, type ClientAnimationClip } from '@/client/content/ClientAnimationRegistry'
import type { PlantSnapshot, WorldSnapshot } from '@/shared/protocol/index'
import type { PlantParticle } from './PlantView'
import { AnimatedPlantView } from './AnimatedPlantView'
import { plantDefinition } from './definitions'

export class WallNutView extends AnimatedPlantView {
    private crackStage = 0
    protected get isNut(): boolean { return true }
    private get tint(): Color | undefined {
        const tint = plantDefinition(this.animations.definitions, this.context.plant.typeId).visual.tint
        return tint ? new Color(...tint) : undefined
    }

    protected async loadAnimations(): Promise<void> {
        const nut = this.clips
        await Promise.all([
            this.body.load(nut.body.reanimId, this.content.registry, this.content.loader),
            this.loadExtra('BlinkTwitch', nut.blinkTwitch), this.loadExtra('BlinkTwice', nut.blinkTwice), this.loadExtra('BlinkThrice', nut.blinkThrice),
        ])
    }

    protected startBody(): void {
        this.body.play({ loop: true, rate: randomAnimationRate(this.animations.rates.plantIdle) / 12 })
        const tint = this.tint
        if (tint) for (const player of [this.body, ...this.extras.values()]) player.setColorOverride(tint)
    }

    protected extraClip(name: string): ClientAnimationClip {
        const nut = this.clips
        return name === 'BlinkTwitch' ? nut.blinkTwitch : name === 'BlinkTwice' ? nut.blinkTwice : nut.blinkThrice
    }

    protected blinkPlayer() {
        const slot = this.animations.pickNutBlinkSlot()
        return this.extras.get(slot[0].toUpperCase() + slot.slice(1))
    }

    protected afterRestore(): void { this.crackStage = -1 }

    protected syncVisuals(plant: PlantSnapshot, _world: WorldSnapshot, particle: PlantParticle): void {
        const stage = plant.health < plant.maxHealth / 3 ? 2 : plant.health < plant.maxHealth * 2 / 3 ? 1 : 0
        if (stage !== this.crackStage) {
            this.body.setTrackSpriteOverride('anim_face', stage === 0 ? null : this.assets.wallnutCracked[stage - 1])
            if (this.crackStage >= 0 && stage > this.crackStage) {
                particle('wallnuteatlarge', plant.x + 40, plant.y + 10, this.tint)
            }
            this.crackStage = stage
        }
        // Every bite renews the 50-tick countdown, so a chewed nut holds still until zombies stop.
        const chewed = (plant.recentlyEatenCounter ?? 0) > 0
        if (chewed !== (this.body.snapshot().rate < 1 / 12)) {
            this.body.play({ loop: true, rate: chewed ? 0.1 / 12 : randomAnimationRate(this.animations.rates.plantIdle) / 12, hideOnFinish: false })
        }
    }
}
