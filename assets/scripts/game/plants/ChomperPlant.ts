import { SoundEffect } from '@/core/SoundLoader'
import type { PlantCreateArgs, PlantUpdateContext } from './BasePlant'
import { Plant } from './BasePlant'

const BITE_TICKS = 70
const DIGEST_TICKS = 4000

export class ChomperPlant extends Plant {
    constructor(args: PlantCreateArgs) {
        super(args, 'normal')
        this.state = 'ready'
    }

    protected updateAbilities(context: PlantUpdateContext) {
        switch (this.state) {
            case 'ready':
                this.updateReady(context)
                break
            case 'chomper-biting':
                this.updateBiting(context)
                break
            case 'chomper-digesting':
                this.updateDigesting(context)
                break
        }
    }

    private updateReady(context: PlantUpdateContext) {
        if (!context.hasTargetInPlantAttackRect(this)) return

        this.state = 'chomper-biting'
        this.stateCountdown = BITE_TICKS
        context.events.push({ type: 'animationRequested', entityId: this.id, animation: 'chomper-bite' })
    }

    private updateBiting(context: PlantUpdateContext) {
        if (this.stateCountdown > 0) return

        context.events.push({ type: 'foleyRequested', sound: SoundEffect.BigChomp, pitchRange: -2 })
        const biteResult = context.biteChomperTarget(this)
        if (biteResult === 'ate') {
            this.state = 'chomper-biting-got-one'
        } else if (biteResult === 'bit') {
            this.state = 'chomper-biting-missed'
        } else {
            this.state = 'chomper-biting-missed'
        }
    }

    private startDigesting(context: PlantUpdateContext) {
        this.state = 'chomper-digesting'
        this.stateCountdown = DIGEST_TICKS
        context.events.push({ type: 'animationRequested', entityId: this.id, animation: 'chomper-chew' })
    }

    private updateDigesting(context: PlantUpdateContext) {
        if (this.stateCountdown > 0) return

        this.state = 'chomper-swallowing'
        context.events.push({ type: 'animationRequested', entityId: this.id, animation: 'chomper-swallow' })
    }

    handleAnimationFinished(animation: string, context: PlantUpdateContext) {
        if (animation !== 'chomper-swallow' && animation !== 'chomper-bite') return
        if (animation === 'chomper-swallow' && this.state !== 'chomper-swallowing') return
        if (animation === 'chomper-bite' && this.state === 'chomper-biting-got-one') {
            this.startDigesting(context)
            return
        }
        if (animation === 'chomper-bite' && this.state !== 'chomper-biting-missed') return

        this.state = 'ready'
        context.events.push({ type: 'animationRequested', entityId: this.id, animation: 'idle' })
    }
}
