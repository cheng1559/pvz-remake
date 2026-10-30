import { type EntityRemover, type Plant, PlantComponent, PositionComponent } from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import type { World } from '@/ecs/index'
import { explode } from '../combat/explosions'

export const RECENTLY_EATEN_TICKS = 50

/** Zombies may chew this plant without hurting it, like a lit cherry bomb or a risen potato mine. */
export function isPlantInedible(plant: Plant): boolean {
    return plant.ability?.state === 'fuse' || plant.ability?.state === 'rising' || plant.ability?.state === 'armed'
}

export function destroyEatenPlant(world: World, definitions: GameplayDefinitions, entity: number, remover: EntityRemover): void {
    const explosion = definitions.plants[world.get(entity, PlantComponent)!.typeId].deathExplosion
    const position = world.get(entity, PositionComponent)!
    if (explosion) {
        explode(world, definitions, position, explosion, remover)
        emitServerEvent(world.resources.get(EventQueueResource), 'plantExploded', {
            entityId: entity, typeId: world.get(entity, PlantComponent)!.typeId, row: position.row,
            x: position.x + explosion.offset.x, y: position.y + explosion.offset.y,
        })
    }
    remover.destroyEntity(entity)
}
