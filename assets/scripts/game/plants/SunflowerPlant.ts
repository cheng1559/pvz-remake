import type { PlantCreateArgs, PlantUpdateContext } from './BasePlant'
import { Plant } from './BasePlant'

export class SunflowerPlant extends Plant {
    protected sunAmount = 25

    constructor(args: PlantCreateArgs) {
        super(args, 'normal')
        if (this.launchRate > 0) {
            const firstProductionMax = Math.floor(this.launchRate / 2)
            this.launchCounter = 300 + Math.floor(Math.random() * Math.max(1, firstProductionMax - 300 + 1))
            this.attackCounter = this.launchCounter
        }
    }

    protected updateAbilities(context: PlantUpdateContext) {
        this.updateProductionPlant(context)
    }

    private updateProductionPlant(context: PlantUpdateContext) {
        if (this.launchRate <= 0) return

        this.launchCounter--
        if (this.launchCounter > 0) return

        this.launchCounter = context.randomInt(this.launchRate - 150, this.launchRate)
        context.events.push({
            type: 'sunProduced',
            entityId: this.id,
            amount: this.sunAmount,
            x: this.x,
            y: this.y,
        })
    }
}
