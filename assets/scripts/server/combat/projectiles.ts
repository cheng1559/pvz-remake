import { getBoardBounds } from './collision'
import { EventQueueResource, emitServerEvent } from '../state/events'
import type { GameSystem, SystemContext, World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import {
    LevelStateResource,
    type Position,
    PositionComponent,
    ProjectileComponent,
    type Zombie,
    ZombieComponent,
} from '../state/components'
import { damageZombie, isTargetableZombie } from '../zombies/damage'

/** A zombie's body span; zombies do not move during a run. */
interface ZombieTarget { entity: number, position: Position, zombie: Zombie, left: number, right: number }

export function createProjectileSystem(definitions: GameplayDefinitions): GameSystem { return new ProjectileSystem(definitions) }

export class ProjectileSystem implements GameSystem {
    readonly id = 'pvz:projectile'
    /** Zombies by row, collected once per run; positions and components are not replaced during it. */
    private zombieRows: ZombieTarget[][] = []
    constructor(private readonly definitions: GameplayDefinitions) {}
    run(context: SystemContext): void {
        const { world } = context
        const level = world.resources.get(LevelStateResource)
        if (level.result === 'lost' || level.paused) return
        this.zombieRows = []
        for (const entity of world.query(PositionComponent, ZombieComponent)) {
            const position = world.get(entity, PositionComponent)!, zombie = world.get(entity, ZombieComponent)!
            const body = this.definitions.zombies[zombie.typeId].body, left = position.x + body.x
            ;(this.zombieRows[position.row] ??= []).push({ entity, position, zombie, left, right: left + body.width })
        }
        for (const entity of world.query(PositionComponent, ProjectileComponent)) this.update(context, entity)
    }
    update({ world, commands }: SystemContext, entity: number): void {
        const definitions = this.definitions

        const position = world.get(entity, PositionComponent)!
        const projectile = world.get(entity, ProjectileComponent)!
        const definition = definitions.projectiles[projectile.typeId]
        position.x += definition.speedPerTick.x
        position.y += definition.speedPerTick.y
        // Projectile::CheckForCollision: a spore reaching its age vanishes before it can hit.
        if (projectile.ticksLeft !== undefined && --projectile.ticksLeft <= 0 || position.x > getBoardBounds(world).right) {
            commands.destroyEntity(entity)
            return
        }

        // ponytail: current pea cannot cross a body in one tick; add swept collision for faster projectiles.
        const target = findProjectileTarget(world, this.zombieRows[position.row] ?? [], position, definition.hitbox)
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
    /** The zombies on the projectile's row. */
    zombies: readonly ZombieTarget[],
    projectilePosition: Position,
    hitbox: { x: number, y: number, width: number, height: number },
): number | undefined {
    let target: number | undefined
    let targetX = Infinity
    const left = projectilePosition.x + hitbox.x, right = left + hitbox.width
    // Runs for every projectile on every tick, so the span overlap test comes before entity lookups.
    for (let i = 0; i < zombies.length; i++) {
        const { entity, position, zombie } = zombies[i]
        if (Math.min(right, zombies[i].right) - Math.max(left, zombies[i].left) <= 0) continue
        if (!isTargetableZombie(zombie) || !world.hasEntity(entity)) continue
        if (position.x < targetX || (position.x === targetX && entity < (target ?? Infinity))) {
            target = entity
            targetX = position.x
        }
    }
    return target
}
