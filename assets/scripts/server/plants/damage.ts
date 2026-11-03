import { type EntityRemover, type Plant, PlantComponent, PositionComponent } from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'
import type { ExplosionDefinition, GameplayDefinitions } from '@/shared/content/gameplay'
import type { World } from '@/ecs/index'
import { explode, explosionCenter } from '../combat/explosions'
import { plantTeam } from '@/shared/content/teams'
import { getDebugRules } from '../debug/debugRules'
import { chillPlant } from './chill'

export const RECENTLY_EATEN_TICKS = 50

/** Zombies may chew this plant without hurting it, like a lit cherry bomb or a risen potato mine. */
export function isPlantInedible(plant: Plant): boolean {
    return plant.ability?.state === 'fuse' || plant.ability?.state === 'rising' || plant.ability?.state === 'armed'
}

/**
 * A hostile plant's attack on a plant. The original's plants never face each other, so this follows its zombie pea
 * (Projectile::DoImpact): the damage comes off the plant's health with a 25-tick flash whatever the plant is doing, and
 * a plant left with none is destroyed, as if eaten.
 */
export function damagePlant(
    world: World,
    definitions: GameplayDefinitions,
    entity: number,
    damage: number,
    remover: EntityRemover,
    /** A snow pea's chill (see chill.ts). */
    chillTicks?: number,
): void {
    const plant = world.get(entity, PlantComponent)
    if (!plant || plant.health <= 0 || !world.hasEntity(entity)) return
    if (chillTicks !== undefined) chillPlant(world, entity, plant, chillTicks)
    if (getDebugRules(world).plantInvincible) return
    plant.health = Math.max(0, plant.health - damage)
    emitServerEvent(world.resources.get(EventQueueResource), 'plantHit', { plantId: entity })
    if (plant.health === 0) destroyEatenPlant(world, definitions, entity, remover)
}

/** A plant gone by a bite or a blow; one that explodes when destroyed goes off. */
export function destroyEatenPlant(world: World, definitions: GameplayDefinitions, entity: number, remover: EntityRemover): void {
    const explosion = definitions.plants[world.get(entity, PlantComponent)!.typeId].deathExplosion
    if (explosion) detonatePlant(world, definitions, entity, explosion, remover)
    else remover.destroyEntity(entity)
}

/**
 * Plant::DoSpecial for a plant that blows up (a fuse, a potato mine, an explode-o-nut): the blast, then the plant is
 * gone. A potato mine's blast reaches its `plantReach` further for hostile plants.
 */
export function detonatePlant(world: World, definitions: GameplayDefinitions, entity: number, explosion: ExplosionDefinition, remover: EntityRemover): void {
    const plant = world.get(entity, PlantComponent)!, position = world.get(entity, PositionComponent)!, team = plantTeam(plant)
    // `kills`: what Board::KillAllZombiesInRadius returns, which Plant::DoSpecial checks for achievements.
    const kills = explode(world, definitions, position, explosion, remover, team, definitions.plants[plant.typeId].mine?.targeting.plantReach)
    emitServerEvent(world.resources.get(EventQueueResource), 'plantExploded', {
        entityId: entity, typeId: plant.typeId, row: position.row, kills, ...explosionCenter(position, explosion, team),
        // A plant facing left mirrors its effect's offset too.
        ...(team === 'zombies' ? { team } : {}),
    })
    remover.destroyEntity(entity)
}
