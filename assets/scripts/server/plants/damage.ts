import { type EntityRemover, PlantComponent, PositionComponent } from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'
import type { ExplosionDefinition, GameplayDefinitions } from '@/shared/content/gameplay'
import type { World } from '@/server/state/World'
import { explode, explosionCenter } from '../combat/explosions'
import { plantTeam } from '@/shared/content/teams'
import { getDebugRules } from '../debug/debugRules'
import { chillPlant } from './chill'
import { breakIce } from '../combat/ice'

export const RECENTLY_EATEN_TICKS = 50

/**
 * Damage to a plant: a hostile plant's attack, which follows the original's zombie pea (Projectile::DoImpact; its plants
 * never face each other), the damage coming off the plant's health with a 25-tick flash whatever the plant is doing;
 * or a zombie's bite (Zombie::EatPlant), whose chew flashed it already. A plant left with none is destroyed, as if eaten.
 */
export function damagePlant(
    world: World,
    definitions: GameplayDefinitions,
    entity: number,
    damage: number,
    remover: EntityRemover,
    /** A snow pea's chill (see chill.ts). */
    chillTicks?: number,
    /** The zombie biting it, which has eaten it when it is gone (`plantEaten`). */
    eater?: number,
): void {
    const plant = world.get(entity, PlantComponent)
    if (!plant || plant.health <= 0 || !world.hasEntity(entity)) return
    if (chillTicks !== undefined) chillPlant(world, definitions, entity, plant, chillTicks)
    if (getDebugRules(world).plantInvincible) return
    const events = world.resources.get(EventQueueResource)
    if (eater !== undefined) plant.recentlyEatenCounter = RECENTLY_EATEN_TICKS
    plant.health = Math.max(0, plant.health - damage)
    if (eater === undefined) emitServerEvent(events, 'plantHit', { plantId: entity })
    if (plant.health > 0) return
    if (eater !== undefined) emitServerEvent(events, 'plantEaten', { zombieId: eater, plantId: entity })
    destroyEatenPlant(world, definitions, entity, remover)
}

/** A plant gone by a bite or a blow; one that explodes when destroyed goes off. */
export function destroyEatenPlant(world: World, definitions: GameplayDefinitions, entity: number, remover: EntityRemover): void {
    const plant = world.get(entity, PlantComponent)!
    // The ice it is in breaks off, as off a zombie that dies in it.
    breakIce(world, entity, plant)
    const explosion = definitions.plants[plant.typeId].deathExplosion
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
