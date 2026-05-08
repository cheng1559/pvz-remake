import { PLANT_DEFINITIONS } from '../GameDefinitions'
import { SoundEffect } from '@/core/SoundLoader'
import type { PlantCreateArgs, PlantUpdateContext } from './BasePlant'
import { Plant } from './BasePlant'

const REPEATER_SECOND_SHOT_COUNTER = 25
const REPEATER_SHOOTING_TICKS = 26

export class PeashooterPlant extends Plant {
    constructor(args: PlantCreateArgs) {
        super(args, 'shooter')
        if (this.launchRate > 0) {
            this.launchCounter = Math.floor(Math.random() * (this.launchRate + 1))
            this.attackCounter = this.launchCounter
        }
    }

    protected updateAbilities(context: PlantUpdateContext) {
        this.updateShooter(context)
    }

    protected updateShooting(context: PlantUpdateContext) {
        if (this.shootingCounter === 0) return

        this.shootingCounter--
        if (this.shootingCounter === 1) {
            this.fire(context)
        }
    }

    private updateShooter(context: PlantUpdateContext) {
        if (this.launchRate <= 0) return

        this.launchCounter--
        if (this.launchCounter <= 0) {
            this.launchCounter = this.launchRate - context.randomInt(0, 14)
            this.findTargetAndFire(context)
        }
        if (this.launchCounter === REPEATER_SECOND_SHOT_COUNTER && this.type === 'repeater') {
            this.findTargetAndFire(context)
        }
    }

    private findTargetAndFire(context: PlantUpdateContext) {
        if (!context.hasTargetInRow(this.row, this)) return false

        context.events.push({ type: 'animationRequested', entityId: this.id, animation: 'shoot' })
        this.shootingCounter = this.type === 'repeater'
            ? REPEATER_SHOOTING_TICKS
            : PLANT_DEFINITIONS[this.type].shootingAnimationTicks
        return true
    }

    private fire(context: PlantUpdateContext) {
        const definition = PLANT_DEFINITIONS[this.type]
        context.events.push({ type: 'foleyRequested', sound: SoundEffect.Throw, pitchRange: 10 })
        if (definition.projectileType === 'snowpea') {
            context.events.push({ type: 'foleyRequested', sound: SoundEffect.SnowPeaSparkles, pitchRange: 10 })
        }
        context.events.push({
            type: 'projectileFired',
            entityId: this.id,
            projectileType: definition.projectileType,
            x: this.x + definition.projectileOffsetX,
            y: this.y + definition.projectileOffsetY,
            row: this.row,
        })
    }
}
