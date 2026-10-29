import { Color } from 'cc'
import type { PlantSnapshot, WorldSnapshot } from '@/shared/protocol'
import type { ClientAnimationClip } from '@/client/content/ClientAnimationRegistry'
import { AnimatedPlantView } from './AnimatedPlantView'
import { plantDefinition } from './definitions'

/** The bowling plant has its own view; only its artwork comes from the wall-nut. */
export class BowlingNutView extends AnimatedPlantView {
    protected get isNut(): boolean { return true }

    renderRow(plant: PlantSnapshot): number {
        // Plant::UpdateBowling changes draw order before incrementing the downward target row.
        return plant.row - (Number(plant.behaviorState?.direction) > 0 ? 1 : 0)
    }

    protected async loadAnimations(): Promise<void> {
        await Promise.all([
            this.body.load(this.clips.body.reanimId, this.content.registry, this.content.loader),
            this.loadExtra('BlinkTwitch', this.clips.blinkTwitch), this.loadExtra('BlinkTwice', this.clips.blinkTwice), this.loadExtra('BlinkThrice', this.clips.blinkThrice),
        ])
    }

    protected startBody(): void {
        this.body.play({ loop: true })
        this.body.pause()
        const tint = plantDefinition(this.animations.definitions, this.context.plant.typeId).visual.tint
        if (tint) this.body.setColorOverride(new Color(...tint))
    }

    protected extraClip(name: string): ClientAnimationClip {
        return name === 'BlinkTwitch' ? this.clips.blinkTwitch : name === 'BlinkTwice' ? this.clips.blinkTwice : this.clips.blinkThrice
    }

    protected blinkPlayer() {
        const slot = this.animations.pickNutBlinkSlot()
        return this.extras.get(slot[0].toUpperCase() + slot.slice(1))
    }

    protected syncVisuals(plant: PlantSnapshot, _world: WorldSnapshot): void {
        const fps = this.clips.body.fps ?? 12
        this.body.seek((Number(plant.behaviorState?.frame ?? 0) % (this.body.lastFrameTimeSeconds * fps)) / fps)
    }
}
