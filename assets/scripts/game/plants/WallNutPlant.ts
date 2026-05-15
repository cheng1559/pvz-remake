import type { PlantCreateArgs } from './BasePlant'
import { Plant } from './BasePlant'

export class WallNutPlant extends Plant {
    constructor(args: PlantCreateArgs) {
        super(args, 'normal')
        this.state = 'ready'
    }

    protected updateDamageState() {
        if (this.health < this.maxHealth / 3) {
            this.state = 'wallnut-cracked2'
        } else if (this.health < this.maxHealth * 2 / 3) {
            this.state = 'wallnut-cracked1'
        } else {
            this.state = 'ready'
        }
    }

    protected canBlink() {
        return super.canBlink() && this.recentlyEatenCounter <= 0
    }
}
