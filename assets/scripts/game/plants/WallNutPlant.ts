import type { PlantCreateArgs, PlantUpdateContext } from './BasePlant'
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

    protected onDamageStateChanged(context: PlantUpdateContext) {
        if (this.state !== 'wallnut-cracked1' && this.state !== 'wallnut-cracked2') return

        context.events.push({
            type: 'particleAtRequested',
            effect: 'wallnuteatlarge',
            x: this.x + 40,
            y: this.y + 10,
            tint: this.type === 'explodenut' ? { r: 255, g: 64, b: 64 } : undefined,
        })
    }

}
