import { getBoardBounds } from '../combat/collision'
import { EventQueueResource, emitServerEvent } from '../state/events'
import type { GameSystem, SystemContext } from '@/server/state/World'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { LevelStateResource } from '../state/resources'
import { plantInPlay, plantsInPlay } from '../level/lawn'
import { plantFacingRect, plantTeam, projectileTeam, teamDirection, zombieFacingRect, zombieTeam } from '@/shared/content/teams'
import { type MotionAim, ProjectileMotionsResource } from './motions'
import { MowingProjectile } from './MowingProjectile'
import { bodyOf, Projectile, type ProjectileHit, type ProjectileTarget } from './Projectile'

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
        // Made for every zombie and plant every tick, and read by every projectile of the row: each written out whole.
        // One put together from another with a spread is many times as slow to make and to read on the native builds.
        const rows = this.rows
        for (const zombie of world.zombies) {
            const body = zombieFacingRect(definitions.zombies[zombie.typeId].body, zombieTeam(zombie)), left = zombie.position.x + body.x
            ;(rows[zombie.position.row] ??= []).push({ zombie, left, right: left + body.width })
        }
        for (const plant of plantsInPlay(world)) {
            const definition = definitions.plants[plant.typeId]
            const body = plantFacingRect(definition.body, plantTeam(plant)), left = plant.position.x + body.x
            ;(rows[plant.position.row] ??= []).push({ plant, low: definition.low === true, left, right: left + body.width })
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
        const step: ProjectileHit = { world, definitions, commands, projectile, motion, rows: this.rows, speedScale: projectile.speedScale() }
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
            ;(projectile.hits ??= []).push(bodyOf(target).id)
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
        const { world, projectile } = hit, { position, definition } = projectile
        const left = position.x + definition.hitbox.x, right = left + definition.hitbox.width
        const candidates = typeof aim === 'number' ? this.rows.flat().filter(target => bodyOf(target).id === aim) : this.rows[position.row] ?? NONE
        const direction = teamDirection(projectileTeam(projectile))
        const nearer = (a: ProjectileTarget, b: ProjectileTarget) => {
            const first = bodyOf(a), second = bodyOf(b)
            return direction * (first.position.x - second.position.x) || Number('zombie' in b) - Number('zombie' in a) || first.id - second.id
        }
        let nearest: ProjectileTarget | undefined, all: ProjectileTarget[] | undefined
        // The base kinds' canHit hits nothing they do not overlap: one of them passes over a target clear of it before
        // anything else. A kind with a canHit of its own is asked of every target.
        const overlapping = projectile.canHit === Projectile.prototype.canHit || projectile.canHit === MowingProjectile.prototype.canHit
        // Runs for every projectile on every tick: the span overlap test comes before entity lookups, and a miss makes nothing.
        for (let i = 0; i < candidates.length; i++) {
            const target = candidates[i]
            if (overlapping && (right <= target.left || target.right <= left)) continue
            const overlap = Math.min(right, target.right) - Math.max(left, target.left)
            if (aim === ('zombie' in target ? 'plants' : 'zombies')) continue
            const body = bodyOf(target)
            if (!projectile.canHit(hit, target, overlap) || projectile.hits?.includes(body.id)) continue
            // An earlier projectile may have finished it during the same run.
            if (!world.hasEntity(body.id) || 'plant' in target && plantInPlay(world, body.id) !== target.plant) continue
            if (definition.pierce) (all ??= []).push(target)
            else if (!nearest || nearer(target, nearest) < 0) nearest = target
        }
        return all ? all.sort(nearer) : nearest ? [nearest] : NONE
    }
}
