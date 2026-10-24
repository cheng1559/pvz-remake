import { getBoardBounds, rectOverlap } from './collision'
import { EventQueueResource, emitServerEvent } from './events'
import type { GameSystem, SystemContext, World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import {
    LevelStateResource,
    type Position,
    PositionComponent,
    ProjectileComponent,
    ZombieComponent,
} from './components'
import { damageZombie, isTargetableZombie } from './zombies/damage'

export function createProjectileSystem(definitions: GameplayDefinitions): GameSystem { return new ProjectileSystem(definitions) }

export class ProjectileSystem implements GameSystem {
    readonly id = 'pvz:projectile'
    constructor(private readonly definitions: GameplayDefinitions) {}
    run(context: SystemContext): void {
        const level = context.world.resources.get(LevelStateResource)
        if (level.result === 'lost' || level.paused) return
        for (const entity of context.world.query(PositionComponent, ProjectileComponent)) this.update(context, entity)
    }
    update({ world, commands }: SystemContext, entity: number): void {
        const definitions = this.definitions

        const position = world.get(entity, PositionComponent)!
        const projectile = world.get(entity, ProjectileComponent)!
        const definition = definitions.projectiles[projectile.typeId]
        position.x += definition.speedPerTick.x
        position.y += definition.speedPerTick.y
        if (position.x > getBoardBounds(world).right) {
            commands.destroyEntity(entity)
            return
        }

        // ponytail: current pea cannot cross a body in one tick; add swept collision for faster projectiles.
        const target = findProjectileTarget(world, definitions, position, definition.hitbox)
        if (target !== undefined) {
            const zombie = world.get(target, ZombieComponent)!
            // The impact sound depends on the helm worn before this hit.
            const helm = zombie.helmHealth > 0 ? definitions.zombies[zombie.typeId].helm?.type : undefined
            damageZombie(world, definitions, target, definition.damage, { chillTicks: definition.chillTicks }, commands)
            emitServerEvent(world.resources.get(EventQueueResource), 'projectileImpact', {
                projectileId: entity,
                targetId: target,
                targetTypeId: zombie.typeId,
                typeId: projectile.typeId,
                ...(helm === undefined ? {} : { helm }),
                ...(projectile.sourcePlantId === undefined ? {} : { sourcePlantId: projectile.sourcePlantId }),
                x: position.x,
                y: position.y,
            })
            commands.destroyEntity(entity)
            return
        }
    }
}

function findProjectileTarget(
    world: World,
    definitions: GameplayDefinitions,
    projectilePosition: Position,
    hitbox: { x: number, y: number, width: number, height: number },
): number | undefined {
    let target: number | undefined
    let targetX = Infinity
    for (const entity of world.query(PositionComponent, ZombieComponent)) {
        const position = world.get(entity, PositionComponent)!
        const zombie = world.get(entity, ZombieComponent)!
        if (!isTargetableZombie(zombie) || position.row !== projectilePosition.row) continue
        const body = definitions.zombies[zombie.typeId].body
        const overlap = rectOverlap(
            { x: projectilePosition.x + hitbox.x, width: hitbox.width },
            { x: position.x + body.x, width: body.width },
        )
        if (overlap <= 0) continue
        if (position.x < targetX || (position.x === targetX && entity < (target ?? Infinity))) {
            target = entity
            targetX = position.x
        }
    }
    return target
}
