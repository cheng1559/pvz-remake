import type { EntityId, World } from '@/ecs/index'
import { ZOMBIE_FLAG_LAYER, type ZombieDefinition } from '@/shared/content/gameplay'
import { zombiePartDropped } from './parts'
import { Zombie } from './Zombie'

/**
 * The flag zombie (ZOMBIE_FLAG): it carries a flag, its animation's `flag` layer, which it lets go as it loses its head,
 * as it falls and as it is mowed (Zombie::DropFlag). It leads the flag waves (GameplayDefinitions.flagWave).
 */
export class FlagZombie extends Zombie {
    /** Its flag is its animation's `flag` layer. */
    static validate(definition: ZombieDefinition, id: string): void {
        super.validate(definition, id)
        if (!definition.animation.layers[ZOMBIE_FLAG_LAYER]) throw new Error(`${id} of kind flag needs a ${ZOMBIE_FLAG_LAYER} layer`)
    }

    /** Zombie::DropFlag: its flag falls off, heard and seen by the client as a part (`zombiePartDropped`). */
    dropCarried(world: World, entity: EntityId): void {
        if (!this.animations[ZOMBIE_FLAG_LAYER]) return
        delete this.animations[ZOMBIE_FLAG_LAYER]
        zombiePartDropped(world, entity, 'flag')
    }
}
