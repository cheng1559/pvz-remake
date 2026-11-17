import { getBoardBounds } from '../combat/collision'
import { EventQueueResource, emitServerEvent } from '../state/events'
import type { GameSystem, SystemContext } from '@/server/state/World'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { LevelStateResource } from '../state/components'
import { plantInPlay, plantsInPlay } from '../level/lawn'
import { plantFacingRect, plantTeam, projectileTeam, teamDirection, zombieFacingRect, zombieTeam } from '@/shared/content/teams'
import { type MotionAim, ProjectileMotionsResource } from './motions'
import { MowingProjectile } from './MowingProjectile'
import type { Projectile, ProjectileBody, ProjectileHit, ProjectileTarget } from './Projectile'

/** How far above or below the screen a projectile is gone, as one that lost what it homed on. */
const OFF_BOARD_Y = 200

const NONE: ProjectileTarget[] = []

export function createProjectileSystem(definitions: GameplayDefinitions): GameSystem { return new ProjectileSystem(definitions) }

export class ProjectileSystem implements GameSystem {
    readonly id = 'pvz:projectile'
    /** Zombies, then plants, by row, collected once per run; their objects are not replaced during it. */
    private rows: ProjectileTarget[][] = []
    constructor(private readonly definitions: GameplayDefinitions) {}
    run(context: SystemContext): void {
        const { world } = context
        const definitions = this.definitions
        const level = world.resources.get(LevelStateResource)
        if (level.result === 'lost' || level.paused) return
        this.rows = []
        const add = (target: ProjectileBody, body: { x: number, width: number }) => {
            const left = target.position.x + body.x
            ;(this.rows[target.position.row] ??= []).push({ ...target, left, right: left + body.width })
        }
        for (const zombie of world.zombies) {
            add({ entity: zombie.id, position: zombie.position, zombie }, zombieFacingRect(definitions.zombies[zombie.typeId].body, zombieTeam(zombie)))
        }
        for (const plant of plantsInPlay(world)) {
            const definition = definitions.plants[plant.typeId]
            add({ entity: plant.id, position: plant.position, plant, low: definition.low === true }, plantFacingRect(definition.body, plantTeam(plant)))
        }
        // Board::UpdateGameObjects: the projectiles, then the lawn mowers, which run as mowing projectiles once set off.
        const mowers: Projectile[] = []
        for (const projectile of world.projectiles) {
            if (projectile instanceof MowingProjectile) mowers.push(projectile)
            else this.update(context, projectile)
        }
        for (const projectile of mowers) this.update(context, projectile)
    }
    update({ world, commands }: SystemContext, projectile: Projectile): void {
        const definitions = this.definitions
        const { id: entity, position } = projectile
        // Projectile::Update counts its age first.
        projectile.age++
        const definition = projectile.definition
        const team = projectileTeam(projectile)
        // How it flies is its motion's (motions.ts), which also says what it may hit where it is; what it does to what
        // it meets is its kind's (Projectile.canHit, strike).
        const motions = world.resources.get(ProjectileMotionsResource)
        const motion = motions.of(projectile)
        const step: ProjectileHit = { world, definitions, commands, entity, position, projectile, definition, team, motion, rows: this.rows,
            speedScale: projectile.speedScale() }
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
        const met = aim === 'none' ? NONE : this.targets(step, aim)
        // A hit uses it up unless it pierces: then it hits all it meets, each once, and flies on.
        for (const target of definition.pierce ? met : met.slice(0, 1)) {
            projectile.strike(step, target)
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
    private targets(hit: ProjectileHit, aim: Exclude<MotionAim, 'none'>): ProjectileTarget[] {
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
            if (!projectile.canHit(hit, target, overlap) || projectile.hits?.includes(target.entity)) continue
            // An earlier projectile may have finished it during the same run.
            if (!world.hasEntity(target.entity) || 'plant' in target && plantInPlay(world, target.entity) !== target.plant) continue
            if (definition.pierce) (all ??= []).push(target)
            else if (!nearest || nearer(target, nearest) < 0) nearest = target
        }
        return all ? all.sort(nearer) : nearest ? [nearest] : NONE
    }
}
