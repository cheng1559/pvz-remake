import type { ZombieCreateArgs } from './BaseZombie'
import { Zombie } from './BaseZombie'
import { NormalZombie } from './NormalZombie'

export function createZombie(args: ZombieCreateArgs): Zombie {
    return new NormalZombie(args)
}

export { Zombie }
