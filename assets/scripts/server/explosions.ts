import { getBoardBounds, circleRectOverlap } from './collision'
import {
    type EntityRemover,
    type Position,
    PositionComponent,
    RandomResource,
    type Zombie,
    ZombieComponent,
} from './components'
import { EventQueueResource, emitServerEvent } from './events'
import type { ExplosionDefinition, GameplayDefinitions } from '@/shared/content/gameplay'
import type { World } from '@/ecs/index'
import { damageZombie, destroyZombie, isTargetableZombie } from './zombies/damage'

const BURNED_TICKS = 300

const CHARRED_RATE_MIN = 0.9

const CHARRED_RATE_MAX = 1.1

/**
 * Board::KillAllZombiesInRadius. Burning explosions also reach dying and vaulting zombies;
 * plain blasts, like the potato mine, only hit zombies on the ground.
 */
export function explode(
    world: World,
    definitions: GameplayDefinitions,
    origin: Position,
    explosion: ExplosionDefinition,
    remover: EntityRemover,
): void {
    const x = origin.x + explosion.offset.x
    const y = origin.y + explosion.offset.y
    for (const entity of world.query(PositionComponent, ZombieComponent)) {
        const position = world.get(entity, PositionComponent)
        const zombie = world.get(entity, ZombieComponent)
        if (!position || !zombie || !world.hasEntity(entity)) continue
        if (Math.abs(position.row - origin.row) > explosion.rowRange || zombie.state === 'burned') continue
        if (!explosion.burn && !isTargetableZombie(zombie)) continue
        const body = definitions.zombies[zombie.typeId].body
        const rect = { x: position.x + body.x, y: position.y + body.y, width: body.width, height: body.height }
        if (rect.x > getBoardBounds(world).right || !circleRectOverlap(x, y, explosion.radius, rect)) continue
        if (explosion.burn && zombie.health < explosion.damage) burnZombie(world, definitions, entity, zombie, position, remover)
        else damageZombie(world, definitions, entity, explosion.damage, { leaveBody: false }, remover)
    }
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
        zombie.hitFlashCounter = 0
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
    })
    destroyZombie(world, definitions, entity, remover)
}
