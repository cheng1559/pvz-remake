import { getBoardBounds, circleRectOverlap } from './collision'
import {
    type EntityRemover,
    type Position,
    PositionComponent,
    RandomResource,
    type Zombie,
    ZombieComponent,
} from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'
import type { ExplosionDefinition, GameplayDefinitions } from '@/shared/content/gameplay'
import type { World } from '@/ecs/index'
import { damageZombie, destroyZombie, isTargetableZombie } from '../zombies/damage'
import { isHostile, plantFacingX, type Team, teamDirection, zombieFacingRect, zombieTeam } from '@/shared/content/teams'
import { hostilePlants } from './targets'
import { damagePlant } from '../plants/damage'

const BURNED_TICKS = 300

const CHARRED_RATE_MIN = 0.9

const CHARRED_RATE_MAX = 1.1

/** The blast's center, its offset mirrored across a plant facing left. */
export function explosionCenter(origin: { x: number, y: number }, explosion: ExplosionDefinition, team: Team): { x: number, y: number } {
    return { x: origin.x + plantFacingX(explosion.offset.x, team), y: origin.y + explosion.offset.y }
}

/**
 * Board::KillAllZombiesInRadius. Burning explosions also reach dying and vaulting zombies;
 * plain blasts, like the potato mine, only hit zombies on the ground. Returns the zombies it took out: every one it
 * burned, and every one left dead or dying (so a burning blast counts dying zombies again, as the original does).
 */
export function explode(
    world: World,
    definitions: GameplayDefinitions,
    origin: Position,
    explosion: ExplosionDefinition,
    remover: EntityRemover,
    /** The side that set it off; it spares its own (Zombie::EffectedByDamage). */
    team: Team = 'plants',
    /** How much further forward the blast sits against hostile plants (PlantTargeting.plantReach). */
    plantReach = 0,
): number {
    let kills = 0
    const { x, y } = explosionCenter(origin, explosion, team)
    for (const entity of world.query(PositionComponent, ZombieComponent)) {
        const position = world.get(entity, PositionComponent)
        const zombie = world.get(entity, ZombieComponent)
        if (!position || !zombie || !world.hasEntity(entity)) continue
        if (Math.abs(position.row - origin.row) > explosion.rowRange || zombie.state === 'burned' || !isHostile(zombieTeam(zombie), team)) continue
        if (!explosion.burn && !isTargetableZombie(zombie, team)) continue
        const body = zombieFacingRect(definitions.zombies[zombie.typeId].body, zombieTeam(zombie))
        const rect = { x: position.x + body.x, y: position.y + body.y, width: body.width, height: body.height }
        if (rect.x > getBoardBounds(world).right || !circleRectOverlap(x, y, explosion.radius, rect)) continue
        // Zombie::ApplyBurn chars a zombie whose body has less health than the blast; a tougher one only takes the damage.
        const burned = explosion.burn && zombie.health < explosion.damage
        if (burned) burnZombie(world, definitions, entity, zombie, position, remover)
        else damageZombie(world, definitions, entity, explosion.damage, { leaveBody: false }, remover)
        if (burned || zombie.health === 0 || zombie.state === 'dying' || zombie.state === 'mowered') kills++
    }
    // Hostile plants take the blast's damage; `kills` stays the zombies'.
    const plantX = x + teamDirection(team) * plantReach
    for (const { entity, position, rect } of hostilePlants(world, definitions, team)) {
        if (Math.abs(position.row - origin.row) > explosion.rowRange) continue
        if (rect.x > getBoardBounds(world).right || !circleRectOverlap(plantX, y, explosion.radius, rect)) continue
        damagePlant(world, definitions, entity, explosion.damage, remover)
    }
    return kills
}

function burnZombie(world: World, definitions: GameplayDefinitions, entity: number, zombie: Zombie, position: Position, remover: EntityRemover): void {
    const events = world.resources.get(EventQueueResource)
    // Zombie::ApplyBurn removes bodies that are already falling or in the air.
    if (zombie.state === 'dying' || zombie.state === 'mowered' || zombie.state === 'vaulting') {
        destroyZombie(world, definitions, entity, remover)
        return
    }
    if (!zombie.hasHead) {
        zombie.state = 'burned'
        zombie.deathTicksRemaining = BURNED_TICKS
        zombie.biteTicks = 0
        emitServerEvent(events, 'zombieBurned', { entityId: entity })
        return
    }
    const random = world.resources.get(RandomResource)
    emitServerEvent(events, 'zombieCharred', {
        entityId: entity,
        typeId: zombie.typeId,
        row: position.row,
        x: position.x + 22,
        y: position.y - 10,
        rate: CHARRED_RATE_MIN + random.nextFloat() * (CHARRED_RATE_MAX - CHARRED_RATE_MIN),
        // A zombie facing right crumbles facing right; the client mirrors it.
        ...(zombie.team === 'plants' ? { team: 'plants' } : {}),
    })
    destroyZombie(world, definitions, entity, remover)
}
