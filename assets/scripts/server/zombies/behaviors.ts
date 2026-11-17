import { defineResource } from '@/server/state/World'
import type { ZombieDefinition } from '@/shared/content/gameplay'
import type { JsonObject } from '@/shared/protocol'
import { EntityBehaviorRegistry, type EntityBehavior } from '../registry/EntityBehaviorRegistry'
import type { Zombie } from '../state/components'

export type ZombieBehavior<State extends JsonObject = JsonObject> = EntityBehavior<'zombie', Zombie, ZombieDefinition, State>

export class ZombieBehaviorRegistry extends EntityBehaviorRegistry<'zombie', Zombie, ZombieDefinition> {
    constructor() {
        super('zombie', world => world.zombies, definitions => definitions.zombies, zombie => zombie.health > 0 &&
            zombie.hasHead && (zombie.state === 'walking' || zombie.state === 'eating' || zombie.state === 'airborne'))
    }
}

/** All spawning paths initialize state through the registry installed in this world. */
export const ZombieBehaviorsResource = defineResource<ZombieBehaviorRegistry>('pvz:zombie-behaviors')
