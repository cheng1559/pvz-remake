import { randomAnimationRate } from '@/client/content/ClientAnimationRegistry'
import { AnimatedPlantView, plantAnimation } from './AnimatedPlantView'

export class ChomperView extends AnimatedPlantView {
    protected abilityClip(state: string | undefined, previous: string | undefined) {
        const chomper = this.clips
        if (state === 'biting' || state === 'got-one' || state === 'missed') return plantAnimation(chomper.bite, false, 24 / 12, 0.2)
        if (state === 'digesting') return plantAnimation(chomper.chew, true, 15 / 12)
        if (state === 'swallowing') return plantAnimation(chomper.swallow, false, 1, 0.2)
        if (state === 'ready') return plantAnimation(chomper.idle, true, previous === undefined ? randomAnimationRate(this.animations.rates.plantIdle) / 12 : 1, 0.2)
        return undefined
    }
}
