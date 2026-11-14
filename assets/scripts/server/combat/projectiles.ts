import { getBoardBounds } from './collision'
import { EventQueueResource, emitServerEvent } from '../state/events'
import type { GameSystem, SystemContext } from '@/ecs/index'
import type { GameplayDefinitions, ProjectileDefinition } from '@/shared/content/gameplay'
import {
    LevelStateResource,
    type Plant,
    PlantComponent,
    type Position,
    PositionComponent,
    type Projectile,
    ProjectileComponent,
    type Zombie,
    ZombieComponent,
} from '../state/components'
import { damageZombie, isTargetableZombie } from '../zombies/damage'
import { isHostile, plantFacingRect, plantTeam, projectileTeam, type Team, teamDirection, zombieFacingRect, zombieTeam } from '@/shared/content/teams'
import { damagePlant } from '../plants/damage'
import { type MotionAim, type MotionStep, type ProjectileMotionDefinition, ProjectileMotionsResource } from './motions'
import { chewSpeedScale, mowPlant, mowZombie, mowsPlants, mowsZombie } from '../level/mower'

/**
 * What a projectile can meet on a row, with its body span as it faces: a zombie or a plant (`low`: one a projectile
 * that does damage flies over, Projectile::FindCollisionTargetPlant for the zombie pea). Nothing moves during a run.
 */
export type ProjectileTarget = Body & { left: number, right: number }
type Body = { entity: number, position: Position } & ({ zombie: Zombie } | { plant: Plant, low: boolean })

/** One projectile's tick: its motion's step, with what its effect needs to hit something. */
interface Hit extends MotionStep {
    commands: SystemContext['commands']
    definition: ProjectileDefinition
    motion: ProjectileMotionDefinition
    /** Everything a projectile can meet, by row (ProjectileSystem.rows). */
    rows: readonly ProjectileTarget[][]
}

/**
 * What a projectile does to what it hits, apart from how it flies (its motion) and whether the hit uses it up
 * (ProjectileDefinition.pierce): which of the things it overlaps it hits, and the hit itself.
 */
interface ProjectileEffect {
    /** A factor on its speed this tick. */
    speedScale?(projectile: Projectile): number
    /** Whether it hits this target, which it overlaps by `overlap`. */
    hits(hit: Hit, target: ProjectileTarget, overlap: number): boolean
    apply(hit: Hit, target: ProjectileTarget): void
}

/** How far above or below the screen a projectile is gone, as one that lost what it homed on. */
const OFF_BOARD_Y = 200

/** Projectile::FindCollisionTargetPlant: a projectile hits a plant it overlaps by more than 8. */
const PLANT_HIT_OVERLAP = 8

const NONE: ProjectileTarget[] = []

/** Takes `damage` off a target as this projectile does: chilling it, and past a zombie's shield for one coming down. */
function strike({ world, definitions, commands, definition, motion }: Hit, target: ProjectileTarget, damage: number): void {
    if ('zombie' in target) {
        damageZombie(world, definitions, target.entity, damage, { chillTicks: definition.chillTicks, ...(motion.fromAbove ? { bypassShield: true } : {}) }, commands)
    } else damagePlant(world, definitions, target.entity, damage, commands, definition.chillTicks)
}

/** `damage`: taken off a standing zombie, or a plant it does not fly over. */
const damaging: ProjectileEffect = {
    hits({ team, motion }, target, overlap) {
        // Plant::GetDamageRangeFlags: no projectile reaches a zombie in its vault, a thrown one no more than the others.
        if ('zombie' in target) return overlap > 0 && isTargetableZombie(target.zombie, team)
        return !(motion.overLow && target.low) && overlap > PLANT_HIT_OVERLAP && isHostile(plantTeam(target.plant), team) && target.plant.health > 0
    },
    apply(hit, target) {
        const { world, definitions, entity, position, projectile, definition, team, motion } = hit
        const impact = {
            projectileId: entity,
            targetId: target.entity,
            typeId: projectile.typeId,
            ...(team === 'zombies' ? { team } : {}),
            x: position.x,
            y: position.y,
            row: position.row,
            // It came down on its target, where it did not fly into it: the client splats it where it landed.
            ...(motion.fromAbove ? { above: true as const } : {}),
            // A piercing one flies on through what it hit: the client keeps drawing it, and it only splats on the ground.
            ...(definition.pierce ? { through: true as const } : {}),
        }
        if ('zombie' in target) {
            const zombie = target.zombie
            // The impact sound depends on the armor worn before this hit: the shield takes it first, unless the motion
            // brings it past the shield.
            const helm = zombie.helmHealth > 0 ? definitions.zombies[zombie.typeId].helm?.type : undefined
            const shield = zombie.shieldHealth > 0 && !motion.fromAbove ? definitions.zombies[zombie.typeId].shield?.type : undefined
            strike(hit, target, definition.damage!)
            emitServerEvent(world.resources.get(EventQueueResource), 'projectileImpact', {
                ...impact, targetTypeId: zombie.typeId, ...(helm === undefined ? {} : { helm }), ...(shield === undefined ? {} : { shield }),
            })
        } else {
            strike(hit, target, definition.damage!)
            emitServerEvent(world.resources.get(EventQueueResource), 'projectileImpact', { ...impact, targetTypeId: target.plant.typeId, target: 'plant' })
        }
        if (!definition.splash) return
        // Projectile::DoSplashDamage: what else it would hit there, on its row and the rows next to it.
        const left = position.x + definition.hitbox.x, right = left + definition.hitbox.width
        const splashed = [position.row - 1, position.row, position.row + 1].flatMap(row => hit.rows[row] ?? NONE).filter(other =>
            other.entity !== target.entity && this.hits(hit, other, Math.min(right, other.right) - Math.max(left, other.left)) &&
            world.hasEntity(other.entity) && !('plant' in other && world.get(other.entity, PlantComponent) !== other.plant))
        // A third of its damage each, or less: all of it comes to no more than seven times its damage.
        const damage = definition.damage!, third = Math.trunc(damage / 3), most = damage * 7
        const each = third * splashed.length > most ? Math.max(1, Math.trunc(damage * most / (third * splashed.length * 3))) : third
        for (const other of splashed) strike(hit, other, each)
    },
}

/** `mow`: a lawn mower's, which crushes whatever of the other side it meets and slows as it chews (mower.ts). */
const mowing: ProjectileEffect = {
    speedScale: chewSpeedScale,
    hits({ world, team }, target, overlap) {
        return overlap > 0 && ('zombie' in target ? mowsZombie(target.zombie, team) : mowsPlants(world) && isHostile(plantTeam(target.plant), team))
    },
    apply({ world, definitions, entity, projectile, team }, target) {
        if ('zombie' in target) mowZombie(world, definitions, entity, projectile, target)
        else mowPlant(world, entity, projectile, target, team)
    },
}

export function createProjectileSystem(definitions: GameplayDefinitions): GameSystem { return new ProjectileSystem(definitions) }

export class ProjectileSystem implements GameSystem {
    readonly id = 'pvz:projectile'
    /** Zombies, then plants, by row, collected once per run; positions and components are not replaced during it. */
    private rows: ProjectileTarget[][] = []
    constructor(private readonly definitions: GameplayDefinitions) {}
    run(context: SystemContext): void {
        const { world } = context
        const definitions = this.definitions
        const level = world.resources.get(LevelStateResource)
        if (level.result === 'lost' || level.paused) return
        this.rows = []
        const add = (target: Body, body: { x: number, width: number }) => {
            const left = target.position.x + body.x
            ;(this.rows[target.position.row] ??= []).push({ ...target, left, right: left + body.width })
        }
        for (const entity of world.query(PositionComponent, ZombieComponent)) {
            const position = world.get(entity, PositionComponent)!, zombie = world.get(entity, ZombieComponent)!
            add({ entity, position, zombie }, zombieFacingRect(definitions.zombies[zombie.typeId].body, zombieTeam(zombie)))
        }
        for (const entity of world.query(PositionComponent, PlantComponent)) {
            const position = world.get(entity, PositionComponent)!, plant = world.get(entity, PlantComponent)!
            const definition = definitions.plants[plant.typeId]
            add({ entity, position, plant, low: definition.low === true }, plantFacingRect(definition.body, plantTeam(plant)))
        }
        for (const entity of world.query(PositionComponent, ProjectileComponent)) this.update(context, entity)
    }
    update({ world, commands }: SystemContext, entity: number): void {
        const definitions = this.definitions

        const position = world.get(entity, PositionComponent)!
        const projectile = world.get(entity, ProjectileComponent)!
        const definition = projectile.definition
        const team = projectileTeam(projectile)
        const effect = definition.mow ? mowing : damaging
        // How it flies is its motion's (motions.ts), which also says what it may hit where it is.
        const motions = world.resources.get(ProjectileMotionsResource)
        const motion = motions.of(projectile)
        const step: Hit = { world, definitions, commands, entity, position, projectile, definition, team, motion, rows: this.rows,
            speedScale: effect.speedScale?.(projectile) ?? 1 }
        const moved = motion.move(step, projectile.motionState), landed = moved === 'landed'
        const bounds = getBoardBounds(world)
        // Projectile::CheckForCollision: a spore reaching its age vanishes before it can hit.
        if (moved === 'gone' || position.x > bounds.right ||
            position.x + definition.hitbox.x + definition.hitbox.width < bounds.left || position.y < -OFF_BOARD_Y || position.y > 600 + OFF_BOARD_Y) {
            commands.destroyEntity(entity)
            return
        }

        // ponytail: current pea cannot cross a body in one tick; add swept collision for faster projectiles.
        const aim = motion.aim?.(step, projectile.motionState) ?? 'row'
        const met = aim === 'none' ? NONE : this.targets(step, effect, aim)
        // A hit uses it up unless it pierces: then it hits all it meets, each once, and flies on.
        for (const target of definition.pierce ? met : met.slice(0, 1)) {
            effect.apply(step, target)
            if (!definition.pierce) continue
            ;(projectile.hits ??= []).push(target.entity)
            motion.afterHit?.(step, projectile.motionState)
        }
        if (met.length && !definition.pierce) {
            commands.destroyEntity(entity)
            return
        }
        if (!landed) return
        // It came down on the ground, which ends it whatever it is: its impact without a target.
        emitServerEvent(world.resources.get(EventQueueResource), 'projectileImpact', {
            projectileId: entity, typeId: projectile.typeId, ...(team === 'zombies' ? { team } : {}), x: position.x, y: position.y, row: position.row,
        })
        commands.destroyEntity(entity)
    }

    /**
     * What the projectile hits where it is, the nearest first (the leftmost for one flying right; on a tie a zombie,
     * then the lower entity): on its row, the zombies or the plants of it, or only the one its motion aims at. Not
     * what a piercing one has hit already.
     */
    private targets(hit: Hit, effect: ProjectileEffect, aim: Exclude<MotionAim, 'none'>): ProjectileTarget[] {
        const { world, position, projectile, definition, team } = hit
        const left = position.x + definition.hitbox.x, right = left + definition.hitbox.width
        const candidates = typeof aim === 'number' ? this.rows.flat().filter(target => target?.entity === aim) : this.rows[position.row] ?? NONE
        const direction = teamDirection(team)
        const nearer = (a: ProjectileTarget, b: ProjectileTarget) =>
            direction * (a.position.x - b.position.x) || Number('zombie' in b) - Number('zombie' in a) || a.entity - b.entity
        let nearest: ProjectileTarget | undefined, all: ProjectileTarget[] | undefined
        // Runs for every projectile on every tick: the span overlap test comes before entity lookups, and a miss makes nothing.
        for (let i = 0; i < candidates.length; i++) {
            const target = candidates[i]
            const overlap = Math.min(right, target.right) - Math.max(left, target.left)
            if (aim === ('zombie' in target ? 'plants' : 'zombies')) continue
            if (!effect.hits(hit, target, overlap) || projectile.hits?.includes(target.entity)) continue
            // An earlier projectile may have finished it during the same run.
            if (!world.hasEntity(target.entity) || 'plant' in target && world.get(target.entity, PlantComponent) !== target.plant) continue
            if (definition.pierce) (all ??= []).push(target)
            else if (!nearest || nearer(target, nearest) < 0) nearest = target
        }
        return all ? all.sort(nearer) : nearest ? [nearest] : NONE
    }
}
