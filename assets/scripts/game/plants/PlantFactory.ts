import type { PlantType } from '../GameTypes'
import type { PlantCreateArgs } from './BasePlant'
import { Plant } from './BasePlant'
import { CherryBombPlant } from './CherryBombPlant'
import { ChomperPlant } from './ChomperPlant'
import { PeashooterPlant } from './PeashooterPlant'
import { PotatoMinePlant } from './PotatoMinePlant'
import { SunflowerPlant } from './SunflowerPlant'
import { WallNutPlant } from './WallNutPlant'

class BasicPlant extends Plant {
    constructor(args: PlantCreateArgs) {
        super(args, 'normal')
    }
}

export function createPlant(args: PlantCreateArgs): Plant {
    switch (args.type as PlantType) {
        case 'peashooter':
        case 'snowpea':
        case 'repeater':
            return new PeashooterPlant(args)
        case 'sunflower':
            return new SunflowerPlant(args)
        case 'cherrybomb':
            return new CherryBombPlant(args)
        case 'wallnut':
        case 'explodenut':
            return new WallNutPlant(args)
        case 'potatomine':
            return new PotatoMinePlant(args)
        case 'chomper':
            return new ChomperPlant(args)
        default:
            return new BasicPlant(args)
    }
}

export { Plant }
