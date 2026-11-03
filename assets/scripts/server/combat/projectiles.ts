import { getBoardBounds } from './collision'
import { EventQueueResource, emitServerEvent } from '../state/events'
import type { GameSystem, SystemContext, World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import {
    LevelStateResource,
    type Plant,
    PlantComponent,
    type Position,
    PositionComponent,
    ProjectileComponent,
    type Zombie,
    ZombieComponent,
} from '../state/components'
import { damageZombie, isTargetableZombie } from '../zombies/damage'
import { isHostile, plantFacingRect, plantTeam, projectileTeam, type Team, teamDirection, zombieFacingRect, zombieTeam } from '@/shared/content/teams'
import { damagePlant } from '../plants/damage'

/**
 * What a projectile can hit on a row, with its body span as it faces: a zombie or a plant (not a low one, which
 * projectiles fly over: Projectile::FindCollisionTargetPlant for the zombie pea). Nothing moves during a run.
 */
type Target = { entity: number, position: Position, left: number, right: number } &
    ({ zombie: Zombie, plant?: undefined } | { plant: Plant, zombie?: undefined })

/** Projectile::FindCollisionTargetPlant: a projectile hits a plant it overlaps by more than 8. */
const PLANT_HIT_OVERLAP = 8

export function createProjectileSystem(definitions: GameplayDefinitions): GameSystem { return new ProjectileSystem(definitions) }

export class ProjectileSystem implements GameSystem {
    readonly id = 'pvz:projectile'
    /** Zombies, then plants, by row, collected once per run; positions and components are not replaced during it. */
    private rows: Target[][] = []
    constructor(private readonly definitions: GameplayDefinitions) {}
    run(context: SystemContext): void {
        const { world } = context
        const definitions = this.definitions
        const level = world.resources.get(LevelStateResource)
        if (level.result === 'lost' || level.paused) return
        this.rows = []
        const add = (target: Omit<Target, 'left' | 'right'>, body: { x: number, width: number }) => {
            const left = target.position.x + body.x
            ;(this.rows[target.position.row] ??= []).push({ ...target, left, right: left + body.width } as Target)
        }
        for (const entity of world.query(PositionComponent, ZombieComponent)) {
            const position = world.get(entity, PositionComponent)!, zombie = world.get(entity, ZombieComponent)!
            add({ entity, position, zombie }, zombieFacingRect(definitions.zombies[zombie.typeId].body, zombieTeam(zombie)))
        }
        for (const entity of world.query(PositionComponent, PlantComponent)) {
            const position = world.get(entity, PositionComponent)!, plant = world.get(entity, PlantComponent)!
            if (!definitions.plants[plant.typeId].low) add({ entity, position, plant }, plantFacingRect(definitions.plants[plant.typeId].body, plantTeam(plant)))
        }
        for (const entity of world.query(PositionComponent, ProjectileComponent)) this.update(context, entity)
    }
    update({ world, commands }: SystemContext, entity: number): void {
        const definitions = this.definitions

        const position = world.get(entity, PositionComponent)!
        const projectile = world.get(entity, ProjectileComponent)!
        const definition = definitions.projectiles[projectile.typeId]
        const team = projectileTeam(projectile)
        // A projectile of a plant facing left flies left.
        position.x += teamDirection(team) * definition.speedPerTick.x
        position.y += definition.speedPerTick.y
        const bounds = getBoardBounds(world)
        // Projectile::CheckForCollision: a spore reaching its age vanishes before it can hit.
        if (projectile.ticksLeft !== undefined && --projectile.ticksLeft <= 0 || position.x > bounds.right ||
            position.x + definition.hitbox.x + definition.hitbox.width < bounds.left) {
            commands.destroyEntity(entity)
            return
        }

        // ponytail: current pea cannot cross a body in one tick; add swept collision for faster projectiles.
        const target = findProjectileTarget(world, this.rows[position.row] ?? [], position, definition.hitbox, team)
        if (!target) return
        const impact = {
            projectileId: entity,
            targetId: target.entity,
            typeId: projectile.typeId,
            ...(team === 'zombies' ? { team } : {}),
            ...(projectile.sourcePlantId === undefined ? {} : { sourcePlantId: projectile.sourcePlantId }),
            x: position.x,
            y: position.y,
        }
        if (target.zombie) {
            const zombie = target.zombie
            // The impact sound depends on the armor worn before this hit: the shield takes it first.
            const helm = zombie.helmHealth > 0 ? definitions.zombies[zombie.typeId].helm?.type : undefined
            const shield = zombie.shieldHealth > 0 ? definitions.zombies[zombie.typeId].shield?.type : undefined
            damageZombie(world, definitions, target.entity, definition.damage, { chillTicks: definition.chillTicks }, commands)
            emitServerEvent(world.resources.get(EventQueueResource), 'projectileImpact', {
                ...impact, targetTypeId: zombie.typeId, ...(helm === undefined ? {} : { helm }), ...(shield === undefined ? {} : { shield }),
            })
        } else {
            damagePlant(world, definitions, target.entity, definition.damage, commands, definition.chillTicks)
            emitServerEvent(world.resources.get(EventQueueResource), 'projectileImpact', { ...impact, targetTypeId: target.plant.typeId, target: 'plant' })
        }
        commands.destroyEntity(entity)
    }
}

/**
 * The nearest hostile target the hitbox overlaps: the leftmost for a projectile flying right, the rightmost for one
 * flying left; on a tie a zombie, then the lower entity.
 */
function findProjectileTarget(
    world: World,
    /** The zombies, then the plants, on the projectile's row. */
    targets: readonly Target[],
    projectilePosition: Position,
    hitbox: { x: number, y: number, width: number, height: number },
    team: Team,
): Target | undefined {
    let best: Target | undefined
    let bestX = Infinity
    const direction = teamDirection(team)
    const left = projectilePosition.x + hitbox.x, right = left + hitbox.width
    // Runs for every projectile on every tick, so the span overlap test comes before entity lookups.
    for (let i = 0; i < targets.length; i++) {
        const target = targets[i]
        const overlap = Math.min(right, target.right) - Math.max(left, target.left)
        // An earlier projectile may have finished a plant during the same run.
        if (target.zombie ? overlap <= 0 || !isTargetableZombie(target.zombie, team)
            : overlap <= PLANT_HIT_OVERLAP || !isHostile(plantTeam(target.plant), team) || target.plant.health <= 0) continue
        if (!world.hasEntity(target.entity)) continue
        const x = direction * target.position.x
        // Zombies come first in the list, so a plant only wins a tie against another plant.
        if (x < bestX || x === bestX && !!best!.zombie === !!target.zombie && target.entity < best!.entity) {
            best = target
            bestX = x
        }
    }
    return best
}
