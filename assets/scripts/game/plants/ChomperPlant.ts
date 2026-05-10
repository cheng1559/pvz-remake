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
            case 'chomper-swallowing':
            case 'chomper-biting-missed':
                this.returnToIdle(context)
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
        if (context.hasTargetInPlantAttackRect(this)) {
            this.state = 'chomper-biting-got-one'
            this.startDigesting(context)
        } else {
            this.state = 'chomper-biting-missed'
            this.stateCountdown = 35
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
        this.stateCountdown = 115
        context.events.push({ type: 'animationRequested', entityId: this.id, animation: 'chomper-swallow' })
    }

    private returnToIdle(context: PlantUpdateContext) {
        if (this.stateCountdown > 0) return

        this.state = 'ready'
        context.events.push({ type: 'animationRequested', entityId: this.id, animation: 'idle' })
    }
}
