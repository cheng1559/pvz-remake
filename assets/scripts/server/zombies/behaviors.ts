import { defineResource } from '@/ecs/index'
import type { ZombieDefinition } from '@/shared/content/gameplay'
import type { JsonObject } from '@/shared/protocol'
import { EntityBehaviorRegistry, type EntityBehavior, type EntityBehaviorContext } from '../EntityBehaviorRegistry'
import { ZombieComponent, type Zombie } from '../components'

export type ZombieBehavior<State extends JsonObject = JsonObject> = EntityBehavior<'zombie', Zombie, ZombieDefinition, State>
export type ZombieBehaviorContext<State extends JsonObject = JsonObject> = EntityBehaviorContext<'zombie', Zombie, ZombieDefinition, State>

export class ZombieBehaviorRegistry extends EntityBehaviorRegistry<'zombie', Zombie, ZombieDefinition> {
    constructor() {
        super('zombie', ZombieComponent, definitions => definitions.zombies, zombie => zombie.health > 0 &&
            zombie.hasHead && (zombie.state === 'walking' || zombie.state === 'eating' || zombie.state === 'vaulting'))
    }
}

/** All spawning paths initialize state through the registry installed in this world. */
export const ZombieBehaviorsResource = defineResource<ZombieBehaviorRegistry>('pvz:zombie-behaviors')
