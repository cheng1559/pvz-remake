import type { World } from '@/server/state/World'
import { plantTeam, zombieTeam } from '@/shared/content/teams'
import { PlantComponent, PositionComponent } from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'

/** A plant or a zombie that may be frozen (see freeze.ts). */
interface Freezable { frozenTicks?: number }

/**
 * Zombie::RemoveIceTrap with PARTICLE_ICE_TRAP_RELEASE: the ice it is in breaks off, as it does when it runs out, when
 * the zombie dies in it (Zombie::PlayDeathAnim) or when the plant in it is destroyed. A zombie mowed or burned loses
 * its ice without (Zombie::MowDown, ApplyBurn), which only clears `frozenTicks`. The event says where the entity
 * stands, for one gone by the time it is heard of.
 */
export function breakIce(world: World, entity: number, frozen: Freezable): void {
    if (frozen.frozenTicks === undefined) return
    delete frozen.frozenTicks
    // A zombie or a plant (step 4 makes both typed lists).
    const zombie = world.zombies.get(entity), plant = zombie ? undefined : world.get(entity, PlantComponent)
    const position = zombie ? zombie.position : world.get(entity, PositionComponent)
    if (!position) return
    // One turned round has its ice turned with it.
    const mirrored = zombie ? zombieTeam(zombie) === 'plants' : !!plant && plantTeam(plant) === 'zombies'
    emitServerEvent(world.resources.get(EventQueueResource), 'iceReleased', {
        entityId: entity, kind: zombie ? 'zombie' : 'plant', typeId: (zombie ?? plant)?.typeId ?? '', x: position.x, y: position.y, row: position.row,
        ...(mirrored ? { mirrored } : {}),
    })
}

/** Zombie::UpdatePlaying: a tick of the ice, which breaks off as it runs out. */
export function meltIce(world: World, entity: number, frozen: Freezable): void {
    if (frozen.frozenTicks !== undefined && --frozen.frozenTicks <= 0) breakIce(world, entity, frozen)
}
