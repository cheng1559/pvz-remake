import type { World } from '@/server/state/World'
import { EventQueueResource, emitServerEvent } from '../state/events'

/**
 * Zombie::DropHead, DropArm and DropFlag: a part falls off a zombie, which the client flies off from where it is on the
 * body, as the zombie's type draws it. `more`: how it fell (`mowered`).
 */
export function zombiePartDropped(world: World, entity: number, part: 'head' | 'arm' | 'flag', more: { mowered?: true } = {}): void {
    const { typeId } = world.zombies.get(entity)!
    emitServerEvent(world.resources.get(EventQueueResource), 'zombiePartDropped', { entityId: entity, typeId, part, ...more })
}
