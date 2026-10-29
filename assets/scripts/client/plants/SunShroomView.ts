import { randomAnimationRate } from '@/client/content/ClientAnimationRegistry'
import { AnimatedPlantView, plantAnimation } from './AnimatedPlantView'

/** Plant::UpdateSunShroom: small, anim_grow, then the big sun-shroom; it sleeps, small, by day. */
export class SunShroomView extends AnimatedPlantView {
    private readonly asleep = this.context.plant.asleep === true
    private readonly idleRate = randomAnimationRate(this.animations.rates.plantIdle) / 12

    protected async loadAnimations(): Promise<void> {
        await this.loadExtra('Blink', this.clips.blink)
    }
    protected extraClip() { return this.clips.blink }
    protected blinkPlayer() { return this.asleep ? undefined : this.extras.get('Blink') }

    protected abilityClip(state: string | undefined) {
        const clips = this.clips
        if (this.asleep) return plantAnimation(state === 'small' ? clips.sleep : clips.bigSleep, true, this.idleRate)
        // PlayBodyReanim blends over 10 ticks: anim_grow at 12 fps, then anim_bigidle at 12-15 fps.
        if (state === 'growing') return plantAnimation(clips.grow, false, 1, 0.1)
        if (state === 'big') return plantAnimation(clips.body, true, (12 + Math.random() * 3) / 12, 0.1)
        return plantAnimation(clips.small, true, this.idleRate)
    }
}
