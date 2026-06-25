import { SoundEffect } from '@/core/SoundLoader'
import type { PlantCreateArgs, PlantUpdateContext } from './BasePlant'
import { Plant } from './BasePlant'

const DO_SPECIAL_COUNTDOWN = 100

export class CherryBombPlant extends Plant {
    constructor(args: PlantCreateArgs) {
        super(args, 'normal')
        this.state = 'doing-special'
        this.specialCounter = DO_SPECIAL_COUNTDOWN
    }

    protected updateAbilities(context: PlantUpdateContext) {
        if (this.specialCounter <= 0) return

        this.specialCounter--
        if (this.specialCounter !== 0) return

        context.events.push({
            type: 'cherryBombDetonated',
            entityId: this.id,
            x: this.x + 40,
            y: this.y + 40,
            row: this.row,
        })
        context.events.push({ type: 'foleyRequested', sound: SoundEffect.CherryBomb })
        context.events.push({ type: 'foleyRequested', sound: SoundEffect.Juicy, pitchRange: 2 })
        this.dead = true
    }
}
