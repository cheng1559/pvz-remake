import { EventQueueResource, emitServerEvent } from '../state/events'
import type { World } from '@/ecs/index'
import { ZombieComponent } from '../state/components'
import type { GameplayDefinitions } from '@/shared/content/gameplay'

export function dropZombieFlag(world: World, definitions: GameplayDefinitions, entity: number): void {
    const zombie = world.get(entity, ZombieComponent)!
    if (!definitions.zombies[zombie.typeId].dropsFlag || !zombie.hasHead ||
        zombie.state === 'dying' || zombie.state === 'mowered') return
    emitServerEvent(world.resources.get(EventQueueResource), 'zombiePartDropped', { entityId: entity, part: 'flag' })
}
