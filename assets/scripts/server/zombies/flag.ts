import { zombiePartDropped } from './parts'
import type { World } from '@/ecs/index'
import { ZombieComponent } from '../state/components'
import { ZOMBIE_FLAG_LAYER } from '@/shared/content/gameplay'

/** Zombie::DropFlag: a zombie carrying a flag (its animation's flag layer) lets it go, with its head or as it dies. */
export function dropZombieFlag(world: World, entity: number): void {
    const zombie = world.get(entity, ZombieComponent)!
    if (!zombie.animations[ZOMBIE_FLAG_LAYER]) return
    delete zombie.animations[ZOMBIE_FLAG_LAYER]
    zombiePartDropped(world, entity, 'flag')
}
