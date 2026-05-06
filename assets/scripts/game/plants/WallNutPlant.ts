import type { PlantCreateArgs } from './BasePlant'
import { Plant } from './BasePlant'

export class WallNutPlant extends Plant {
    constructor(args: PlantCreateArgs) {
        super(args, 'normal')
    }
}
