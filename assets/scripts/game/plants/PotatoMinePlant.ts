import { SoundEffect } from '@/core/SoundLoader'
import type { PlantCreateArgs, PlantUpdateContext } from './BasePlant'
import { Plant } from './BasePlant'

const ARMING_TICKS = 1500
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
        context.events.push({ type: 'animationRequested', entityId: this.id, animation: 'potato-rise' })
        context.events.push({
            type: 'particleAtRequested',
            effect: 'potatominerise',
            x: this.x + 50,
            y: this.y + 50,
        })
        context.events.push({ type: 'foleyRequested', sound: SoundEffect.DirtRise, pitchRange: 5 })
    }

    handleAnimationFinished(animation: string, context: PlantUpdateContext) {
        if (animation !== 'potato-rise' || this.state !== 'potato-rising') return
        this.state = 'potato-armed'
        this.blinkCountdown = context.randomInt(ARMED_BLINK_COUNTDOWN_MIN, ARMED_BLINK_COUNTDOWN_MAX)
        context.events.push({ type: 'animationRequested', entityId: this.id, animation: 'potato-armed' })
    }

    private updateArmed(context: PlantUpdateContext) {
        if (!context.hasTargetInPlantAttackRect(this)) return

        this.state = 'potato-mashed'
        this.dead = true
        context.events.push({
            type: 'potatoMineDetonated',
            entityId: this.id,
            x: this.x + 20,
            y: this.y + 40,
            row: this.row,
        })
    }
}
