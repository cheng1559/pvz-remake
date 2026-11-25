import type { SystemContext, World } from '@/server/state/World'
import { type GameplayDefinitions, PLANT_ATTACKS, type PlantDefinition } from '@/shared/content/gameplay'
import { PLANT_WIDTH, plantFacingX, plantTeam, shooterFront, teamDirection, zombieFacingRect, zombieTeam } from '@/shared/content/teams'
import { exact, nonNegativeInteger, positiveInteger } from '@/shared/validate'
import { getBoardBounds } from '../combat/collision'
import { ProjectileMotionsResource } from '../projectiles/motions'
import { launchProjectile } from '../projectiles/Projectile'
import { hostilePlants } from '../combat/targets'
import type { DeterministicRng } from '../state/DeterministicRng'
import { RandomResource } from '../state/resources'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { damageZombie, isTargetableZombie } from '../zombies/damage'
import { firePlantAnimation, plantTrackPoint } from './animation'
import { damagePlant } from './damage'
import { Plant, type PlantConfig } from './Plant'

export interface Shooter {
    /** Plant::mLaunchCounter: the tick its next shot is due. */
    readyAtTick: number
    /** A burst under way (Plant::mShootingCounter): the tick of its next shot and the shots left in it. */
    burst?: { fireAtTick: number, shotsRemaining: number }
}

/**
 * A plant that attacks on a rhythm (the definition's `shooter`): Plant::UpdateShooter. Every `cadenceTicks` it looks for
 * what to attack; with something, it winds up and fires its burst, a projectile (Plant::Fire) or an area attack (the
 * Fume-shroom's DoRowAreaDamage) each shot. It sleeps on a day board if it is a mushroom.
 */
export class Shooter extends Plant {
    static readonly config: readonly PlantConfig[] = ['shooter']

    /** Ready to shoot, until it is put down (start). */
    constructor(typeId: string, definition: PlantDefinition, definitions: GameplayDefinitions) {
        super(typeId, definition, definitions)
        this.readyAtTick = 0
    }

    private get shooter(): NonNullable<Plant['definition']['shooter']> { return this.definition.shooter! }

    protected restoreOwn(fields: Record<string, unknown>, name: string): void {
        const { readyAtTick, burst, ...rest } = fields
        this.readyAtTick = nonNegativeInteger(readyAtTick, `${name}.readyAtTick`)
        if (burst !== undefined) {
            const shots = exact(burst, ['fireAtTick', 'shotsRemaining'], `${name}.burst`)
            this.burst = {
                fireAtTick: nonNegativeInteger(shots.fireAtTick, `${name}.burst.fireAtTick`),
                shotsRemaining: positiveInteger(shots.shotsRemaining, `${name}.burst.shotsRemaining`),
            }
        }
        super.restoreOwn(rest, name)
    }

    /** Its first shot is its `initialDelayTicks` away. */
    start(random: DeterministicRng, tick: number): void {
        super.start(random, tick)
        const delay = this.shooter.initialDelayTicks
        this.readyAtTick = tick + random.integer(delay.min, delay.max)
    }

    /** Its next shot, and the next of its burst, wait the tick out. */
    sitOut(): void {
        this.readyAtTick++
        if (this.burst) this.burst.fireAtTick++
    }

    /** Plant::DoBlink: one about to shoot misses its blink. */
    blinkMisses(): boolean {
        return !!this.burst || super.blinkMisses()
    }

    attack({ world, commands, tick }: SystemContext): void {
        const definitions = this.definitions, definition = this.definition, shooter = this.shooter
        // Mushrooms sleep on day boards.
        if (this.asleep(world)) return
        const position = this.position
        const random = world.resources.get(RandomResource), events = world.resources.get(EventQueueResource)
        if (this.burst) {
            if (tick < this.burst.fireAtTick) return
            if (shooter.area) {
                // Plant::Fire for the Fume-shroom: DoRowAreaDamage instead of a projectile.
                const hits = targets(world, definitions, this)
                for (const zombie of hits.zombies) damageZombie(world, definitions, zombie, shooter.area.damage,
                    { hitsShieldAndBody: shooter.area.hitsShieldAndBody }, commands)
                for (const target of hits.plants) damagePlant(world, definitions, target, shooter.area.damage, commands)
                emitServerEvent(events, 'plantAreaAttack', { plantId: this.id, typeId: this.typeId, hits: hits.zombies.length + hits.plants.length })
                delete this.burst
                return
            }
            // The middle of the projectile's hitbox leaves the mouth, which a plant facing left has mirrored.
            const hitbox = definitions.projectiles[shooter.projectile!].hitbox, team = plantTeam(this)
            // Plant::GetPeaHeadOffset: the mouth is where the part it is on is now.
            const anchor = shooter.anchor ? plantTrackPoint(this, definition, shooter.anchor.layer, shooter.anchor.track) : { x: 0, y: 0 }
            // What it aims at, for a motion that takes a target.
            const target = targets(world, definitions, this).nearest
            // Where it sets off: Plant::Fire's aOriginX and aOriginY, the projectile's corner.
            const origin = {
                x: position.x + plantFacingX(anchor.x + shooter.offset.x, team) - (hitbox.x + hitbox.width / 2),
                y: position.y + anchor.y + shooter.offset.y - (hitbox.y + hitbox.height / 2),
                row: position.row,
            }
            const projectile = launchProjectile(world, definitions, commands, {
                typeId: shooter.projectile!,
                position: { ...origin },
                motion: PLANT_ATTACKS[shooter.type],
                ...(shooter.overrides ? { overrides: shooter.overrides } : {}),
                ...(this.team ? { team: this.team } : {}),
                ...(target === undefined ? {} : { target }),
            })
            // The client puts the plant's muzzle effect where it set off (PlantPresentationDefinition.muzzle).
            emitServerEvent(events, 'projectileFired', {
                plantId: this.id, plantTypeId: this.typeId, projectileId: projectile, typeId: shooter.projectile!, ...origin,
                ...(team === 'zombies' ? { team } : {}),
            })
            if (--this.burst.shotsRemaining > 0) {
                this.burst.fireAtTick = tick + shooter.burstIntervalTicks
                firePlantAnimation(this, definition, random)
                emitServerEvent(events, 'plantFiring', { plantId: this.id })
            } else {
                delete this.burst
            }
            return
        }
        if (tick < this.readyAtTick) return
        this.readyAtTick = tick + random.integer(shooter.cadenceTicks.min, shooter.cadenceTicks.max)
        if (targets(world, definitions, this).nearest === undefined) return
        this.burst = { fireAtTick: tick + shooter.windupTicks - 1, shotsRemaining: shooter.shotsPerBurst }
        firePlantAnimation(this, definition, random)
        emitServerEvent(events, 'plantFiring', { plantId: this.id })
    }
}

/**
 * What the plant attacks, by its type (PlantDefinition.shooter), `nearest` the one it aims at.
 *
 * A `shooter` and a `lobber`: the hostile zombies and plants in the row overlapping the attack rect, which an area
 * attack hits; the rect runs from the body's front edge `range` ahead within the board, mirrored for a plant facing
 * left, and the first of them ahead is the nearest. A `seeker`: the hostile zombies and plants anywhere, the nearest
 * by how far its middle is from the plant's (Plant::FindTargetZombie for the cattail). None attacks a zombie in its
 * vault (Plant::GetDamageRangeFlags).
 */
function targets(
    world: World,
    definitions: GameplayDefinitions,
    plant: Plant,
): { zombies: number[], plants: number[], nearest?: number } {
    const plantPosition = plant.position, { body: plantBody, shooter } = definitions.plants[plant.typeId]
    const team = plantTeam(plant), direction = teamDirection(team), anywhere = shooter?.type === 'seeker'
    const bounds = getBoardBounds(world), reach = shooter?.range ?? Infinity
    const front = plantPosition.x + shooterFront(plantBody, team)
    const ahead = (left: number, width: number) => direction > 0
        ? left < Math.min(bounds.right, front + reach) && left + width >= front
        : left < bounds.right && left + width > Math.max(bounds.left, front - reach) && left <= front
    // How near a body is: along the row for what is ahead, or from the plant's middle.
    const middle = { x: plantPosition.x + PLANT_WIDTH / 2, y: plantPosition.y + PLANT_WIDTH / 2 }
    const distance = (rect: { x: number, y: number, width: number, height: number }) => anywhere
        ? Math.hypot(rect.x + rect.width / 2 - middle.x, rect.y + rect.height / 2 - middle.y) : direction * rect.x
    let nearest: number | undefined, least = Infinity
    const near = (entity: number, rect: { x: number, y: number, width: number, height: number }) => {
        const far = distance(rect)
        if (far < least) { least = far; nearest = entity }
    }
    const zombies: number[] = []
    for (const zombie of world.zombies) {
        const { id: entity, position } = zombie
        if (!isTargetableZombie(zombie, team) || !anywhere && position.row !== plantPosition.row) continue
        const body = zombieFacingRect(definitions.zombies[zombie.typeId].body, zombieTeam(zombie))
        const rect = { x: position.x + body.x, y: position.y + body.y, width: body.width, height: body.height }
        if (!anywhere && !ahead(rect.x, rect.width)) continue
        zombies.push(entity)
        near(entity, rect)
    }
    // What it fires along the lawn would fly over a low plant, so it does not aim at one; an area attack reaches it.
    const overLow = shooter && !shooter.area && world.resources.get(ProjectileMotionsResource).resolve(PLANT_ATTACKS[shooter.type]).overLow
    const plants = hostilePlants(world, definitions, team, anywhere ? undefined : plantPosition.row)
        .filter(target => !(overLow && definitions.plants[target.plant.typeId].low) && (anywhere || ahead(target.rect.x, target.rect.width)))
    for (const target of plants) near(target.plant.id, target.rect)
    return { zombies, plants: plants.map(target => target.plant.id), nearest }
}
