import type { World } from '@/ecs/index'
import { startLayer } from '@/shared/content/animation'
import { type GameplayDefinitions, type ProjectileDefinition, ZOMBIE_CLIPS } from '@/shared/content/gameplay'
import { isHostile, plantTeam, type Team, zombieTeam } from '@/shared/content/teams'
import { MOWERED_ANIMATION } from '@/shared/content/zombieAnimation'
import { nonNegativeInteger } from '@/shared/validate'
import { getDebugRules } from '../debug/debugRules'
import { dropZombieLoot } from '../level/loot'
import { MowedPlantComponent, type Plant, PlantComponent, type Position, RandomResource, type Zombie } from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { destroyZombie, dropZombieHelm, dropZombieShield, flattenZombie, isFlattenableZombie } from '../zombies/damage'
import { zombiePartDropped } from '../zombies/parts'
import { Projectile, type ProjectileConfig, type ProjectileHit, type ProjectileTarget } from './Projectile'

/** LawnMower::mChompCounter: a mower a zombie sets off chews on it for less than on the ones it runs into after. */
const CHOMP_READY_TICKS = 25
const CHOMP_ACTIVE_TICKS = 50
/** The original's mower slows from its 3.33 a tick to 1 as it chews: this much of its speed. */
const CHOMP_SPEED_SCALE = 1 / 3.33

/** A zombie a mowing projectile meets. */
export type MowTarget = { entity: number, position: Position, zombie: Zombie }

export interface MowingProjectile {
    /** LawnMower::mChompCounter: the ticks left chewing, slowed. */
    chompCounter: number
}

/**
 * A lawn mower running (the definition's kind `mowing`): a projectile that crushes whatever of the other side it meets,
 * a zombie mowed down (Zombie::MowDown) and a plant squashed, slowing as it chews (LawnMower::UpdatePlaying). A row's
 * mower (Mower) sets off as one; a plant may fire one too.
 */
export class MowingProjectile extends Projectile {
    static readonly config: readonly ProjectileConfig[] = []

    /** One ready to chew. */
    constructor(typeId: string, definition: ProjectileDefinition, motion: string) {
        super(typeId, definition, motion)
        this.chompCounter = 0
    }

    protected restoreOwn(fields: Record<string, unknown>, name: string): void {
        const { chompCounter, ...rest } = fields
        this.chompCounter = nonNegativeInteger(chompCounter, `${name}.chompCounter`)
        super.restoreOwn(rest, name)
    }

    /** LawnMower::UpdatePlaying: it slows toward a third of its speed and back as it chews. */
    speedScale(): number {
        return this.chompCounter > 0 ? bounceSlowMiddle(CHOMP_ACTIVE_TICKS, 0, --this.chompCounter, 1, CHOMP_SPEED_SCALE) : 1
    }

    /** It takes the other side's zombies (mowsZombie), and their plants unless /plantinvincible keeps them. */
    canHit({ world, team }: ProjectileHit, target: ProjectileTarget, overlap: number): boolean {
        return overlap > 0 && ('zombie' in target ? mowsZombie(target.zombie, team) : !getDebugRules(world).plantInvincible && isHostile(plantTeam(target.plant), team))
    }

    strike({ world, definitions, entity, team }: ProjectileHit, target: ProjectileTarget): void {
        if ('zombie' in target) this.mowZombie(world, definitions, entity, target)
        else this.mowPlant(world, entity, target, team)
    }

    /** LawnMower::StartMower: as `entity` sets off, it crushes the zombie that set it off, chewing on it for less. */
    mowTrigger(world: World, definitions: GameplayDefinitions, entity: number, trigger: MowTarget): void {
        this.mowZombie(world, definitions, entity, trigger)
        this.chompCounter = CHOMP_READY_TICKS
    }

    /**
     * Zombie::MowDown, and it chews on it: DropShield(0U) and DropHelm(0U), then the flag; it drops loot like any other
     * death. One that cannot be flattened as it stands (dying, burned, in its vault, rising from a grave) goes in a
     * puff instead: its head, arm and armor drop, and it is gone at once (DieWithLoot).
     */
    private mowZombie(world: World, definitions: GameplayDefinitions, mowerId: number, { entity, position, zombie }: MowTarget): void {
        this.chompCounter = CHOMP_ACTIVE_TICKS
        const events = world.resources.get(EventQueueResource)
        if (!isFlattenableZombie(zombie)) {
            emitServerEvent(events, 'zombiePuffed', { mowerId, zombieId: entity, x: position.x, y: position.y, row: position.row })
            for (const part of ['head', 'arm'] as const) {
                const has = part === 'head' ? 'hasHead' : 'hasArm'
                if (!zombie[has]) continue
                zombie[has] = false
                zombiePartDropped(world, entity, part)
            }
            dropZombieHelm(world, definitions, entity, zombie)
            dropZombieShield(world, definitions, entity, zombie)
            destroyZombie(world, definitions, entity, world)
            return
        }
        dropZombieShield(world, definitions, entity, zombie)
        dropZombieHelm(world, definitions, entity, zombie)
        zombie.dropCarried(world, entity)
        flattenZombie(world, definitions, zombie)
        dropZombieLoot(world, definitions, entity, world)
        emitServerEvent(events, 'zombieMowered', { mowerId, zombieId: entity })
    }

    /**
     * It crushes a plant past its own end (an explode-o-nut does not go off): it stops being a plant at once and stays
     * as a mowed one for its squashing, as a mowed zombie does, tipped the way it runs (`team`).
     */
    private mowPlant(world: World, mowerId: number, target: { entity: number, plant: Plant }, team: Team): void {
        this.chompCounter = CHOMP_ACTIVE_TICKS
        world.remove(target.entity, PlantComponent)
        // Its ice goes with it, breaking nothing off, as a mowed zombie's (Zombie::MowDown).
        delete target.plant.frozenTicks
        const squash = startLayer(MOWERED_ANIMATION, {}, ZOMBIE_CLIPS.mowered, world.resources.get(RandomResource))
        world.add(target.entity, MowedPlantComponent, { plant: target.plant, squash, ...(team === 'zombies' ? { left: true as const } : {}) })
        emitServerEvent(world.resources.get(EventQueueResource), 'plantMowered', { mowerId, plantId: target.entity })
    }
}

/** LawnMower::UpdatePlaying (EffectedByDamage(127)): a mower takes the other side's zombies, dying ones too, once. */
export function mowsZombie(zombie: Zombie, team: Team): boolean {
    return zombie.state !== 'mowered' && isHostile(zombieTeam(zombie), team)
}

function bounceSlowMiddle(timeStart: number, timeEnd: number, age: number, start: number, end: number): number {
    const warpedAge = (age - timeStart) / (timeEnd - timeStart)
    if (warpedAge <= 0 || warpedAge >= 1) return start
    const bounce = 1 - Math.abs(2 * warpedAge - 1)
    const invQuad = 2 * bounce - bounce * bounce
    return (end - start) * invQuad + start
}
