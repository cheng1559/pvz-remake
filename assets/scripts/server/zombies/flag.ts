import { EventQueueResource, emitServerEvent } from '../events'
import type { World } from '@/ecs/index'
import { ZombieComponent } from '../components'

export function dropZombieFlag(world: World, entity: number): void {
    const zombie = world.get(entity, ZombieComponent)!
    if (zombie.typeId !== 'pvz:flag' || !zombie.hasHead ||
        zombie.state === 'dying' || zombie.state === 'mowered') return
    emitServerEvent(world.resources.get(EventQueueResource), 'zombiePartDropped', { entityId: entity, part: 'flag' })
}
