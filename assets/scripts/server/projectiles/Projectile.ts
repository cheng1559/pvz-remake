import { type CommandBuffer, defineResource, type EntityId, type Position, type SystemContext, type World } from '@/server/state/World'
import type { GameplayDefinitions, ProjectileDefinition, ProjectileOverrides } from '@/shared/content/gameplay'
import { isHostile, plantTeam, projectileTeam, type Team } from '@/shared/content/teams'
import { jsonRoundTrip, type JsonObject, type ProjectileSnapshot } from '@/shared/protocol'
import type { Plant } from '../plants/Plant'
import type { Zombie } from '../zombies/Zombie'
import { plantInPlay } from '../level/lawn'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { damagePlant } from '../plants/damage'
import { damageZombie, isTargetableZombie } from '../zombies/damage'
import { heightOverRow, type MotionStep, type ProjectileMotionDefinition, ProjectileMotionsResource } from './motions'

/**
 * What a projectile can meet on a row, with its body span as it faces: a zombie or a plant (`low`: one a projectile
 * that does damage flies over, Projectile::FindCollisionTargetPlant for the zombie pea). Nothing moves during a run.
 */
export type ProjectileTarget = ProjectileBody & { left: number, right: number }
/** A zombie or a plant a projectile may meet. */
export type ProjectileBody = { zombie: Zombie } | { plant: Plant, low: boolean }

/** The zombie or the plant a projectile meets. */
export function bodyOf(target: ProjectileBody): Zombie | Plant {
    return 'zombie' in target ? target.zombie : target.plant
}

/** One projectile's tick: its motion's step, with what its hit needs (ProjectileSystem). */
export interface ProjectileHit extends MotionStep {
    commands: SystemContext['commands']
    motion: ProjectileMotionDefinition
    /** Everything a projectile can meet, by row (ProjectileSystem.rows). */
    rows: readonly ProjectileTarget[][]
}

/** What any projectile is: the fields of every projectile, which its save has; its kind's own go beside them. */
export interface ProjectileFields {
    typeId: string
    /** Projectile::mProjectileAge: the ticks it has flown, counted as each of its updates starts. */
    age: number
    /** What it is as it was set off: its type's definition, with what its launcher has its own way (shooter.overrides). */
    definition: ProjectileDefinition
    /** The side that fired it, when its launcher gave one. */
    team?: Team
    /** The motion it flies by (ProjectileMotionRegistry), its launcher's: a plant's attack (PLANT_ATTACKS), or the level's for its mowers. */
    motion: string
    /** What its motion keeps as it flies (ProjectileMotionDefinition.launch). */
    motionState?: JsonObject
    /** What a piercing one has hit, by entity: it hits each once (ProjectileDefinition.pierce). */
    hits?: number[]
}

/** Every projectile's fields by name, those a projectile may be without last: what else its save has is its kind's own. */
export const PROJECTILE_FIELDS = ['typeId', 'age', 'definition', 'motion', 'team', 'motionState', 'hits'] as const satisfies readonly (keyof ProjectileFields)[]

/** A projectile as its save has it: every projectile's fields, and its kind's own beside them (Projectile.restore). */
export type SavedProjectile = ProjectileFields & { readonly [own: string]: unknown }

/** A type's own definition fields, each taken by the kinds that say so (`config`): a projectile's `damage`. */
export type ProjectileConfig = 'damage'

/** Projectile::FindCollisionTargetPlant: a projectile hits a plant it overlaps by more than 8. */
const PLANT_HIT_OVERLAP = 8

export interface Projectile extends ProjectileFields {
    /** Its entity, and where it is (World.projectiles). */
    id: EntityId
    position: Position
}

/**
 * A projectile in flight, an entity of the world's `projectiles`: its fields are all there is to it, which its save keeps as
 * they are. Its class is its kind (the gameplay definition's `kind`, `projectile` when it names none), as its view's is
 * on the client (the presentation's `view`, the same): how it flies is its motion's (motions.ts); what it does to what
 * it meets is its class's: this one takes its `damage` off what of the other side it hits, and a Mower crushes it.
 */
export class Projectile {
    /** The definition fields its kind takes: a type of it has them all, and none another kind takes. */
    static readonly config: readonly ProjectileConfig[] = ['damage']

    /** What else its kind needs of a type's definition, checked as the content loads. */
    static validate(_definition: ProjectileDefinition, _id: string): void {}

    /** One of `typeId`, as `definition` has it (its launcher's), to fly by `motion`, before it sets off (launch). */
    constructor(typeId: string, definition: ProjectileDefinition, motion: string) {
        this.typeId = typeId
        this.age = 0
        this.definition = definition
        this.motion = motion
    }

    /** Its fields from its save: every projectile's, then its kind's own (restoreOwn), each kind taking those it has. */
    restore(saved: SavedProjectile, name: string): void {
        const fields: readonly string[] = PROJECTILE_FIELDS, own: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) continue
            if (fields.includes(key)) Object.assign(this, { [key]: jsonRoundTrip(value as JsonObject) })
            else own[key] = value
        }
        this.restoreOwn(own, name)
    }

    /** Its kind's own fields from its save: a kind takes its own and leaves the rest to the kind it extends. */
    protected restoreOwn(fields: Record<string, unknown>, name: string): void {
        const [unknown] = Object.keys(fields)
        if (unknown !== undefined) throw new TypeError(`${name}.${unknown} is not supported`)
    }

    /**
     * It sets off where it is, which its motion may adjust, for `team` (the plants' when its launcher gives none),
     * aimed at `target`: its motion starts what it keeps (ProjectileMotionDefinition.launch).
     */
    launch(world: World, definitions: GameplayDefinitions, team?: Team, target?: number): void {
        if (team) this.team = team
        const state = world.resources.get(ProjectileMotionsResource).resolve(this.motion).launch?.({ world, definitions, projectile: this, target })
        if (state === undefined) delete this.motionState
        else this.motionState = state
    }

    /** A factor on its own speed this tick, which its motion goes by. */
    speedScale(): number {
        return 1
    }

    /** Whether it hits `target`, which it overlaps by `overlap`: a standing zombie of the other side, or a plant it does not fly over. */
    canHit({ motion }: ProjectileHit, target: ProjectileTarget, overlap: number): boolean {
        const team = projectileTeam(this)
        // Plant::GetDamageRangeFlags: no projectile reaches a zombie in its vault, a thrown one no more than the others.
        if ('zombie' in target) return overlap > 0 && isTargetableZombie(target.zombie, team)
        return !(motion.overLow && target.low) && overlap > PLANT_HIT_OVERLAP && isHostile(plantTeam(target.plant), team) && target.plant.health > 0
    }

    /** Projectile::DoImpact: it hits `target`, taking its damage off it, and off what else its splash reaches. */
    strike(hit: ProjectileHit, target: ProjectileTarget): void {
        const { world, definitions, motion } = hit, { position, definition } = this, team = projectileTeam(this)
        const impact = {
            projectileId: this.id,
            targetId: bodyOf(target).id,
            typeId: this.typeId,
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
            damageTarget(hit, target, definition.damage!)
            emitServerEvent(world.resources.get(EventQueueResource), 'projectileImpact', {
                ...impact, targetTypeId: zombie.typeId, ...(helm === undefined ? {} : { helm }), ...(shield === undefined ? {} : { shield }),
            })
        } else {
            damageTarget(hit, target, definition.damage!)
            emitServerEvent(world.resources.get(EventQueueResource), 'projectileImpact', { ...impact, targetTypeId: target.plant.typeId, target: 'plant' })
        }
        if (!definition.splash) return
        // Projectile::DoSplashDamage: what else it would hit there (MotionStep.collisionX), on its row and the rows next to it.
        const left = hit.collisionX + definition.hitbox.x, right = left + definition.hitbox.width
        const splashed = [position.row - 1, position.row, position.row + 1].flatMap(row => hit.rows[row] ?? []).filter(other =>
            bodyOf(other) !== bodyOf(target) && this.canHit(hit, other, Math.min(right, other.right) - Math.max(left, other.left)) &&
            world.hasEntity(bodyOf(other).id) && !('plant' in other && plantInPlay(world, other.plant.id) !== other.plant))
        // A third of its damage each, or less: all of it comes to no more than seven times its damage.
        const damage = definition.damage!, third = Math.trunc(damage / 3), most = damage * 7
        const each = third * splashed.length > most ? Math.max(1, Math.trunc(damage * most / (third * splashed.length * 3))) : third
        for (const other of splashed) damageTarget(hit, other, each)
    }

    /** What the client is shown of it: where it is, and how high, how far thrown and which way it points, by its motion; with what only its kind shows (snapshotOwn). */
    snapshot(world: World): ProjectileSnapshot {
        const { id: entity, position } = this
        const motion = world.resources.get(ProjectileMotionsResource).of(this)
        const height = motion.height?.(this.motionState) ?? heightOverRow(world, this), facing = motion.facing?.(this.motionState)
        const lift = motion.lift?.(this.motionState) ?? 0, own = this.snapshotOwn()
        // Made for every projectile every tick: built field by field, without spreads.
        const snapshot: ProjectileSnapshot = { entityId: entity, typeId: this.typeId, x: position.x, y: position.y, row: position.row, age: this.age }
        if (this.team === 'zombies') snapshot.team = 'zombies'
        if (height > 0) snapshot.height = height
        if (lift > 0) snapshot.lift = lift
        if (facing !== undefined) snapshot.facing = facing
        if (own) snapshot.own = own
        return snapshot
    }

    /** Whether the level can run it as it was saved, where it was. */
    validSaved(_world: World): boolean {
        return true
    }

    /** What only its kind shows the client (ProjectileSnapshot.own), which its view reads; nothing for the base's. */
    protected snapshotOwn(): JsonObject | undefined {
        return undefined
    }
}

/** Takes `damage` off a target as a projectile does: chilling it, and past a zombie's shield for one coming down. */
function damageTarget({ world, definitions, commands, projectile: { definition }, motion }: ProjectileHit, target: ProjectileTarget, damage: number): void {
    if ('zombie' in target) {
        damageZombie(world, definitions, target.zombie.id, damage, { chillTicks: definition.chillTicks, ...(motion.fromAbove ? { bypassShield: true } : {}) }, commands)
    } else damagePlant(world, definitions, target.plant.id, damage, commands, definition.chillTicks)
}

/** How a level's world makes its projectiles, each of its type's kind (ProjectileRegistry). */
export class ProjectileFactory {
    constructor(private readonly make: (typeId: string, definition: ProjectileDefinition, motion: string) => Projectile) {}

    /** A projectile of `typeId`, as `definition` has it, to fly by `motion`, before it sets off (Projectile.launch). */
    create(typeId: string, definition: ProjectileDefinition, motion: string): Projectile {
        return this.make(typeId, definition, motion)
    }

    /** A projectile as it was saved, of its kind (`name` names it in errors). */
    restore(saved: SavedProjectile, name: string): Projectile {
        const projectile = this.make(saved.typeId, saved.definition, saved.motion)
        projectile.restore(saved, name)
        return projectile
    }
}

export const ProjectileFactoryResource = defineResource<ProjectileFactory>('pvz:projectile-factory')

/** What a projectile sets off as: its type, where, by which motion, and its launcher's side, aim and `overrides`. */
export interface ProjectileLaunch { typeId: string, position: Position, motion: string, overrides?: ProjectileOverrides, team?: Team, target?: number }

/**
 * A new projectile sets off at `position`, flying by its launcher's `motion` (a registered kind): of its type's kind,
 * its type's definition with the launcher's `overrides`, with the state its motion starts with (Projectile.launch).
 */
export function launchProjectile(world: World, definitions: GameplayDefinitions, creator: Pick<CommandBuffer, 'createEntity' | 'insert'>,
    launch: ProjectileLaunch): number {
    const entity = creator.createEntity()
    const definition = launch.overrides ? { ...definitions.projectiles[launch.typeId], ...launch.overrides } : definitions.projectiles[launch.typeId]
    const projectile = world.resources.get(ProjectileFactoryResource).create(launch.typeId, definition, launch.motion)
    projectile.id = entity
    projectile.position = { ...launch.position }
    projectile.launch(world, definitions, launch.team, launch.target)
    creator.insert(world.projectiles, projectile)
    return entity
}
