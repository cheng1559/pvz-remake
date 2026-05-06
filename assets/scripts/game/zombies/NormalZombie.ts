import type { ZombieCreateArgs } from './BaseZombie'
import { Zombie } from './BaseZombie'

export class NormalZombie extends Zombie {
    constructor(args: ZombieCreateArgs) {
        super(args, 'normal')
    }
}
