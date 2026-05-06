import { SoundEffect } from '@/core/SoundLoader'
import type { PlantCreateArgs, PlantUpdateContext } from './BasePlant'
import { Plant } from './BasePlant'

const ARMING_TICKS = 1500
const RISE_ANIMATION_TICKS = 105
const ARMED_BLINK_COUNTDOWN_MIN = 400
const ARMED_BLINK_COUNTDOWN_MAX = 4399

export class PotatoMinePlant extends Plant {
    constructor(args: PlantCreateArgs) {
        super(args, 'normal')
        this.state = 'not-ready'
        this.stateCountdown = ARMING_TICKS
    }

    protected updateAbilities(context: PlantUpdateContext) {
        if (this.state === 'not-ready') {
            this.updateArming(context)
            return
        }
        if (this.state === 'potato-rising') {
            this.updateRising(context)
            return
        }
        if (this.state === 'potato-armed') {
            this.updateArmed(context)
        }
    }

    protected canBlink() {
        return super.canBlink() && this.state === 'potato-armed'
    }

    private updateArming(context: PlantUpdateContext) {
        if (this.stateCountdown > 0) return

        this.state = 'potato-rising'
        this.stateCountdown = RISE_ANIMATION_TICKS
        context.events.push({ type: 'animationRequested', entityId: this.id, animation: 'potato-rise' })
        context.events.push({ type: 'soundRequested', sound: SoundEffect.DirtRise })
    }

    private updateRising(context: PlantUpdateContext) {
        if (this.stateCountdown > 0) return

        this.state = 'potato-armed'
        this.blinkCountdown = context.randomInt(ARMED_BLINK_COUNTDOWN_MIN, ARMED_BLINK_COUNTDOWN_MAX)
        context.events.push({ type: 'animationRequested', entityId: this.id, animation: 'potato-armed' })
    }

    private updateArmed(context: PlantUpdateContext) {
        if (!context.hasTargetInPlantAttackRect(this)) return

        this.state = 'potato-mashed'
        this.dead = true
        context.events.push({ type: 'soundRequested', sound: SoundEffect.PotatoMine })
    }
}
