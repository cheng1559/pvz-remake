import { exact, finite } from '@/shared/validate'
import { defineResource, type World } from '@/server/state/World'
import { PLANT_ATTACKS, rowGroundY, type GameplayDefinitions } from '@/shared/content/gameplay'
import { BASE_MOD_ID, isModId, isQualifiedId, Registry } from '@/shared/mod'
import { isHostile, plantFacingRect, plantTeam, projectileTeam, type Team, teamDirection, zombieFacingRect, zombieTeam } from '@/shared/content/teams'
import { LevelStateResource, RandomResource } from '../state/resources'
import type { Projectile } from './Projectile'
import { isTargetableZombie } from '../zombies/damage'
import { plantInPlay, plantsInPlay } from '../level/lawn'

/**
 * A projectile setting off, on its side (projectileTeam) where it is, which a motion may adjust, and what its launcher
 * aimed at.
 */
export interface MotionLaunch {
    world: World
    definitions: GameplayDefinitions
    projectile: Projectile
    /** The zombie or plant aimed at, when the launcher aimed at one. */
    target?: number
}

/** One tick of a projectile's flight. */
export interface MotionStep {
    world: World
    definitions: GameplayDefinitions
    projectile: Projectile
    /** A factor on its own speed this tick (Projectile.speedScale): a mower slows as it chews. */
    speedScale: number
}

/**
 * What a projectile may hit where it is: nothing, whatever of the other side it overlaps on its row (`row`), only the
 * zombies or only the plants of those, or only one zombie or plant, by its entity.
 */
export type MotionAim = 'none' | 'row' | 'zombies' | 'plants' | number

/**
 * A way a projectile flies, the original's ProjectileMotion: which one is its launcher's, a plant's attack by its type
 * (PLANT_ATTACKS) or straight for a row's mower set off, and how fast and the like the projectile's own
 * (Projectile.definition).
 */
export interface ProjectileMotionDefinition<State = any> {
    /** The state it sets off with, when the motion keeps any; saved with the projectile. */
    launch?(launch: MotionLaunch): State
    /** Checks a saved state, or that it may have none. */
    parseState?(state: unknown): State
    /**
     * Moves it one tick. `landed`: it has come down on the ground, which ends it, a piercing one too, with its impact
     * there when it hit nothing; `gone`: it has flown its time out and vanishes.
     */
    move(step: MotionStep, state: State): 'landed' | 'gone' | void
    /** What it may hit where it is; `row` when omitted. */
    aim?(step: MotionStep, state: State): MotionAim
    /** A piercing projectile has hit something and flies on (ProjectileDefinition.pierce, Projectile.hits). */
    afterHit?(step: MotionStep, state: State): void
    /**
     * How far above the ground it is, for what it draws on the ground under it: over the ground of its row
     * (heightOverRow) when omitted, for one that stays over the row it set off on.
     */
    height?(state: State): number
    /** How far up it has been thrown from where it set off, when the motion throws it: its shadow shrinks the higher. */
    lift?(state: State): number
    /** The way it points, when the motion turns it: an angle from straight right, clockwise on screen. */
    facing?(state: State): number
    /**
     * It comes down on what it hits from above, where it does not fly into it: over a zombie's shield, so its hit
     * passes the shield (DAMAGE_BYPASSES_SHIELD), and its splat is where it lands, not carried on into the body.
     */
    fromAbove?: true
    /**
     * Projectile::FindCollisionTargetPlant for the zombie's pea: flying along the lawn, it passes over a low plant
     * (PlantDefinition.low), which a plant that fires it does not aim at. One thrown or homing comes down on it.
     */
    overLow?: true
}

export class ProjectileMotionRegistry {
    private readonly motions = new Registry<ProjectileMotionDefinition>('projectile motion')

    register(ownerId: string, kind: string, motion: ProjectileMotionDefinition): void {
        if (!isModId(ownerId) || !isQualifiedId(kind) || typeof motion?.move !== 'function') {
            throw new Error(`Invalid projectile motion: ${kind}`)
        }
        this.motions.register(kind, Object.freeze(motion), ownerId)
    }

    has(kind: string): boolean { return this.motions.has(kind) }

    resolve(kind: string): ProjectileMotionDefinition {
        const motion = this.motions.get(kind)
        if (!motion) throw new Error(`Projectile motion is not installed: ${kind}`)
        return motion
    }

    /** A projectile's motion, the one its launcher gave it. */
    of(projectile: Projectile): ProjectileMotionDefinition { return this.resolve(projectile.motion) }

    checkpoint(): () => void { return this.motions.checkpoint() }

    freeze(): void { this.motions.freeze() }
}

/** The installed motions, for whatever launches or moves a projectile in this world. */
export const ProjectileMotionsResource = defineResource<ProjectileMotionRegistry>('pvz:projectile-motions')

/** How far over the ground of its row a projectile is: as far as its shadow lies under it (Projectile::mShadowY). */
export function heightOverRow(world: World, { definition, position }: Pick<Projectile, 'definition' | 'position'>): number {
    return rowGroundY(world.resources.get(LevelStateResource).board, position.row) - (position.y + definition.hitbox.y + definition.hitbox.height)
}

/** Straight along the row: how a level's mower runs. */
export const STRAIGHT = PLANT_ATTACKS.shooter

function numbers<Key extends string>(state: unknown, keys: readonly Key[], name: string): Record<Key, number> {
    const source = exact(state, keys, `${name} state`)
    for (const key of keys) finite(source[key], `${name} state.${key}`)
    return source as Record<Key, number>
}

/** A zombie's or a plant's body as it faces (`x` its middle), with the side it is on and how fast it walks on. */
function targetBody(world: World, definitions: GameplayDefinitions, entity: number):
    { x: number, left: number, width: number, top: number, height: number, team: Team, walk: number } | undefined {
    const zombie = world.zombies.get(entity), plant = zombie ? undefined : plantInPlay(world, entity)
    const position = (zombie ?? plant)?.position
    if (!position) return undefined
    if (zombie) {
        const team = zombieTeam(zombie), body = zombieFacingRect(definitions.zombies[zombie.typeId].body, team)
        // Zombie::ZombieTargetLeadX: an eating or frozen zombie stands still (ZombieNotWalking), a chilled one walks at half speed.
        const still = zombie.state === 'eating' || zombie.frozenTicks !== undefined
        const walk = still ? 0 : teamDirection(team) * zombie.speedPerTick * (zombie.chilledTicks > 0 ? 0.5 : 1)
        const left = Math.trunc(position.x) + body.x
        return { x: left + body.width / 2, left, width: body.width, top: Math.trunc(position.y) + body.y, height: body.height, team, walk }
    }
    if (!plant) return undefined
    const team = plantTeam(plant), body = plantFacingRect(definitions.plants[plant.typeId].body, team)
    const left = position.x + body.x
    return { x: left + body.width / 2, left, width: body.width, top: position.y + body.y, height: body.height, team, walk: 0 }
}

/** Projectile::UpdateNormalMotion: every projectile flying along its row goes this far a tick, as a mower runs. */
const STRAIGHT_SPEED = 3.33

/**
 * MOTION_STRAIGHT: along its row at its `speed`, the way its side faces. With `lifetimeTicks` it vanishes after as
 * many ticks, before it can hit then, like the puff-shroom's spore (Projectile::CheckForCollision).
 */
const straight: ProjectileMotionDefinition<{ ticksLeft: number } | undefined> = {
    overLow: true,
    launch: ({ projectile: { definition: { lifetimeTicks } } }) => lifetimeTicks === undefined ? undefined : { ticksLeft: lifetimeTicks },
    parseState: state => state === undefined ? undefined : numbers(state, ['ticksLeft'], 'straight'),
    move({ projectile, speedScale }, state) {
        projectile.position.x += teamDirection(projectileTeam(projectile)) * (projectile.definition.speed ?? STRAIGHT_SPEED) * speedScale
        if (state && --state.ticksLeft <= 0) return 'gone'
    },
}

interface LobState {
    age: number, baseY: number, z: number, velocityX: number, velocityZ: number, ground: number, rotation: number, rotationSpeed: number
}
const LOB_STATE = ['age', 'baseY', 'z', 'velocityX', 'velocityZ', 'ground', 'rotation', 'rotationSpeed'] as const
/**
 * Plant::Fire and Projectile::UpdateLobMotion: thrown up at `rise` to come down `flightTicks` later under `gravity`,
 * `targetOffset` short of its target `leadTicks` ahead of where it walks, at least `minRange` away, or at `noTargetX`
 * of the board with nothing to aim at; its height counts for a hit after `collisionDelayTicks`. `flightTicks`,
 * `landingOffset`, `rotation` and `spin` are the projectile's own when it gives them (ProjectileDefinition), and
 * `rise` goes with its `flightTicks`: the gravity is the same for all. One that does not give them is thrown as a
 * cabbage.
 */
const LOB = {
    flightTicks: 120, gravity: 0.115, rise: 7, minRange: 40, targetOffset: 30, leadTicks: 50, noTargetX: 700, collisionDelayTicks: 20,
    rotation: 0.88, spin: [0.02, 0.08] as [number, number],
    // How low over the ground one thrown comes before it hits (aMinCollisionZ, from where the original throws it): a
    // zombie as a cabbage from its pult, and a plant, which stands lower, as a basketball from the catapult's arm. A
    // projectile's `landingOffset` raises both.
    zombieLandingHeight: 105, plantLandingHeight: 77,
}

/**
 * MOTION_LOBBED: thrown up to come down on its target (LOB), tumbling as it flies. `z` is its height from where it set
 * off, down as the original's. It lands when the bottom of its hitbox reaches the ground of its row (`ground`, as far
 * down from where it set off), whatever its size.
 */
const lob: ProjectileMotionDefinition<LobState> = {
    launch({ world, definitions, projectile, target }) {
        const { definition, position } = projectile
        const { hitbox, flightTicks = LOB.flightTicks, rotation = LOB.rotation, spin: [slowest, fastest] = LOB.spin } = definition
        const direction = teamDirection(projectileTeam(projectile)), body = target === undefined ? undefined : targetBody(world, definitions, target)
        const board = world.resources.get(LevelStateResource).board, { left, right } = board.bounds
        // Thrown left, it is the mirror image of one thrown right that comes down there: its hitbox, which does not
        // start at its corner, as far the other side of where it aims.
        const mirror = direction < 0 ? 2 * hitbox.x + hitbox.width : 0
        const rangeX = mirror + (body ? direction * (body.x + body.walk * LOB.leadTicks - position.x) - LOB.targetOffset
            // Mirrored across the board for one thrown left.
            : direction * ((direction > 0 ? LOB.noTargetX : left + right - LOB.noTargetX) - position.x))
        const rangeY = body ? body.top - position.y : 0
        const spin = slowest + world.resources.get(RandomResource).nextFloat() * (fastest - slowest)
        return {
            age: 0, baseY: position.y, z: 0, ground: rowGroundY(board, position.row) - (position.y + hitbox.y + hitbox.height),
            velocityX: direction * Math.max(LOB.minRange, rangeX) / flightTicks,
            // Up as hard as the one gravity brings back down in its flight: the original's 7 for its 120 ticks.
            velocityZ: rangeY / flightTicks - LOB.rise * flightTicks / LOB.flightTicks,
            // Thrown left, its angle and its tumbling are mirrored.
            rotation: direction > 0 ? rotation : Math.PI - rotation, rotationSpeed: direction * spin,
        }
    },
    parseState: state => numbers(state, LOB_STATE, 'lob'),
    move({ projectile: { position } }, state) {
        state.age++
        state.rotation += state.rotationSpeed
        state.velocityZ += LOB.gravity
        position.x += state.velocityX
        state.z = Math.min(state.z + state.velocityZ, state.ground)
        position.y = state.baseY + state.z
        if (state.z === state.ground) return 'landed'
    },
    aim({ world, projectile }, state) {
        // Projectile::UpdateLobMotion checks its height only after the first ticks: then it must be coming down, and
        // low enough over the ground, wherever it was thrown from: lower for a plant than for a zombie.
        if (state.age <= LOB.collisionDelayTicks) return 'row'
        if (state.velocityZ < 0) return 'none'
        const height = heightOverRow(world, projectile) - (projectile.definition.landingOffset ?? 0)
        const zombies = height < LOB.zombieLandingHeight, plants = height < LOB.plantLandingHeight
        return zombies && plants ? 'row' : zombies ? 'zombies' : plants ? 'plants' : 'none'
    },
    lift: state => -state.z,
    facing: state => state.rotation,
    // Projectile::GetDamageFlags: a lobbed projectile comes down over a screen door or a newspaper.
    fromAbove: true,
}

/**
 * The body of what a projectile of `team` homes on, for as long as it can still hit it (Zombie::EffectedByDamage): not
 * a zombie that is dying, a plant that is done for, nor one of its own side now.
 */
function prey(world: World, definitions: GameplayDefinitions, entity: number, team: Team): ReturnType<typeof targetBody> {
    const body = targetBody(world, definitions, entity)
    if (!body || !isHostile(body.team, team)) return undefined
    const zombie = world.zombies.get(entity)
    return (zombie ? isTargetableZombie(zombie, team) : plantInPlay(world, entity)!.health > 0) ? body : undefined
}

interface HomingState { age: number, velocityX: number, velocityY: number, target: number, height: number }
const HOMING_STATE = ['age', 'velocityX', 'velocityY', 'target', 'height'] as const

/** Projectile::UpdateNormalMotion for MOTION_HOMING: the cattail spike's speed, and how much more it turns for each tick it has flown. */
const HOMING = { speed: 2, turn: 0.001 }

/**
 * MOTION_HOMING (the cattail's spike): at its `homingSpeed`, it turns toward its target more sharply the longer it
 * flies (`turn` a tick of age), across the rows, and hits only that target; with its target gone it flies on as it was
 * going. A piercing one turns to the nearest thing it has not hit yet after each hit. It flies across the lawn as high
 * as it set off, its shadow going with it (mShadowY += mVelY).
 */
const homing: ProjectileMotionDefinition<HomingState> = {
    launch({ world, projectile, target }) {
        return { age: 0, velocityX: teamDirection(projectileTeam(projectile)) * (projectile.definition.homingSpeed ?? HOMING.speed), velocityY: 0,
            target: target ?? 0, height: heightOverRow(world, projectile) }
    },
    parseState: state => numbers(state, HOMING_STATE, 'homing'),
    move({ world, definitions, projectile }, state) {
        const { position } = projectile, team = projectileTeam(projectile)
        state.age++
        const { hitbox, homingSpeed: speed = HOMING.speed, turn = HOMING.turn } = projectile.definition
        // Projectile::UpdateNormalMotion: with nothing left to home on it flies on as it was going.
        const body = prey(world, definitions, state.target, team)
        if (body) {
            const dx = body.x - (position.x + hitbox.x + hitbox.width / 2), dy = body.top + body.height / 2 - (position.y + hitbox.y + hitbox.height / 2)
            const distance = Math.hypot(dx, dy) || 1
            const x = state.velocityX + dx / distance * turn * state.age, y = state.velocityY + dy / distance * turn * state.age
            const length = Math.hypot(x, y) || 1
            state.velocityX = x / length * speed
            state.velocityY = y / length * speed
        }
        position.x += state.velocityX
        position.y += state.velocityY
        // Board::PixelToGridYKeepOnBoard, by its middle: a mower as tall as a row stays on the row it is over.
        const board = world.resources.get(LevelStateResource).board
        position.row = Math.max(0, Math.min(board.rows - 1, Math.floor((position.y + hitbox.y + hitbox.height / 2 - board.origin.y) / board.cell.height)))
    },
    afterHit({ world, definitions, projectile }, state) {
        const { position } = projectile, team = projectileTeam(projectile)
        let nearest = Infinity
        state.target = 0
        for (const entity of [...world.zombies, ...plantsInPlay(world)].map(target => target.id)) {
            const body = prey(world, definitions, entity, team)
            if (!body || projectile.hits?.includes(entity)) continue
            const distance = Math.hypot(body.x - position.x, body.top + body.height / 2 - position.y)
            if (distance < nearest) { nearest = distance; state.target = entity }
        }
    },
    aim({ world, definitions, projectile }, state) {
        const { position } = projectile, body = prey(world, definitions, state.target, projectileTeam(projectile))
        if (!body) return 'none'
        // Projectile::CheckForCollision: over the target's body, in height as well.
        const hitbox = projectile.definition.hitbox, left = position.x + hitbox.x, top = position.y + hitbox.y
        return Math.min(top + hitbox.height, body.top + body.height) > Math.max(top, body.top) &&
            Math.min(left + hitbox.width, body.left + body.width) >= Math.max(left, body.left) ? state.target : 'none'
    },
    height: state => state.height,
    // Projectile::UpdateNormalMotion: mRotation follows its velocity.
    facing: state => Math.atan2(state.velocityY, state.velocityX),
}

export function installBuiltinProjectileMotions(registry: ProjectileMotionRegistry): void {
    for (const [kind, motion] of Object.entries({ 'pvz:straight': straight, 'pvz:lob': lob, 'pvz:homing': homing })) {
        if (!registry.has(kind)) registry.register(BASE_MOD_ID, kind, motion)
    }
}
