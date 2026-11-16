import { TICKS_PER_SECOND, playZombie, zombiePace } from './animation'
import { type EntityRemover, LevelStateResource, RandomResource, type Zombie, ZombieComponent } from '../state/components'
import { TutorialResource } from '../state/levelState'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { damageIndex, type GameplayDefinitions, ZOMBIE_CLIPS } from '@/shared/content/gameplay'
import type { World } from '@/ecs/index'
import { dropZombieFlag } from './flag'
import { zombiePartDropped } from './parts'
import { dropZombieLoot } from '../level/loot'
import { isHostile, type Team, zombieTeam } from '@/shared/content/teams'
import { isDeadOrDying, isZombieOnScreen } from '@/shared/content/zombieStates'

const ZOMBIE_DEATH_HOLD_TICKS = 100

export interface ZombieHit {
    /** Boundary cleanup damages the zombie without a hit flash. */
    flash?: boolean
    /** Slows the zombie, as DAMAGE_FREEZE does. */
    chillTicks?: number
    /** Potato mine kills leave no body, as DAMAGE_DOESNT_LEAVE_BODY does. */
    leaveBody?: boolean
    /** Fume damage passes a shield (the newspaper) and still hits the body in full, as DAMAGE_HITS_SHIELD_AND_BODY does. */
    hitsShieldAndBody?: boolean
    /** Only the helm takes it, as Zombie::TakeHelmDamage does for the Whack-a-Zombie mallet and a bowled nut. */
    helmOnly?: boolean
    /** Only the shield takes it, the rest lost, as Zombie::TakeShieldDamage does for a bowled nut. */
    shieldOnly?: boolean
    /** A zombie's bite on another passes its shield (DAMAGE_BYPASSES_SHIELD, Zombie::EatZombie). */
    bypassShield?: boolean
}

/** Shield first, then helm, then body, following Zombie::TakeDamage. */
export function damageZombie(
    world: World,
    definitions: GameplayDefinitions,
    entity: number,
    damage: number,
    hit: ZombieHit = {},
    remover: EntityRemover = world,
): void {
    const zombie = world.get(entity, ZombieComponent)
    if (!zombie || isDeadOrDying(zombie) || damage <= 0) return
    const definition = definitions.zombies[zombie.typeId]
    const shield = !hit.helmOnly && !hit.bypassShield && zombie.shieldHealth > 0
    const events = world.resources.get(EventQueueResource)
    // The client flashes the zombie. While worn, the hit timer belongs to the shield; an exact break leaves no body hit
    // to flash and stops the flash (`flash: false`). A hit that also reaches the body (`through`) flashes both, and one
    // that comes past a worn shield (`past`) only the body, as TakeBodyDamage alone runs for DAMAGE_BYPASSES_SHIELD.
    if (hit.flash !== false) emitServerEvent(events, 'zombieHit', {
        entityId: entity,
        ...(shield && (hit.shieldOnly ? damage >= zombie.shieldHealth : damage === zombie.shieldHealth) && !hit.hitsShieldAndBody
            ? { flash: false } : {}),
        ...(shield && hit.hitsShieldAndBody ? { through: true } : {}),
        ...(hit.bypassShield && zombie.shieldHealth > 0 ? { past: true } : {}),
    })
    // A shield absorbs hits without chill, even when they exactly break it. Zombie::CanBeChilled leaves out
    // mind-controlled zombies only because the original's chills are all the plants'; a chill reaches whatever a
    // hostile attack hits, so an enemy snow pea chills a zombie on the plants' side.
    if (hit.chillTicks !== undefined && (!shield || damage > zombie.shieldHealth)) chillZombie(world, entity, zombie, hit.chillTicks)
    let remaining = damage
    if (shield) {
        const absorbed = Math.min(zombie.shieldHealth, remaining)
        zombie.shieldHealth -= absorbed
        remaining -= absorbed
        if (zombie.shieldHealth === 0) {
            // Zombie::UpdateZombieNewspaper: losing the paper enrages the zombie.
            const enrage = definition.enrage
            if (enrage) {
                zombie.enrageTicks = enrage.pauseTicks
                zombie.state = 'walking'
                playZombie(zombie, definition.animation, ZOMBIE_CLIPS.gasp, world.resources.get(RandomResource))
                zombie.biteTicks = 0
            }
            emitServerEvent(events, 'zombieShieldDropped', {
                entityId: entity, shield: definition.shield!.type, ...(hit.leaveBody === false ? { silent: true } : {}),
            })
        }
        if (hit.hitsShieldAndBody) remaining = damage
        if (hit.shieldOnly) return
    }
    if (remaining > 0 && zombie.helmHealth > 0) {
        const absorbed = Math.min(zombie.helmHealth, remaining)
        zombie.helmHealth -= absorbed
        remaining -= absorbed
        if (zombie.helmHealth === 0) {
            emitServerEvent(events, 'zombieHelmDropped', {
                entityId: entity, helm: definition.helm!.type, ...(hit.leaveBody === false ? { silent: true } : {}),
            })
        }
    }
    if (remaining <= 0 || hit.helmOnly) return
    zombie.health = Math.max(0, zombie.health - remaining)
    if (zombie.health === 0 && hit.leaveBody === false) {
        destroyZombie(world, definitions, entity, remover)
        return
    }
    // Zombie::UpdateDamageStates: the arm goes below two thirds, the head below a third.
    const index = damageIndex(zombie.health, zombie.maxHealth)
    if (zombie.hasArm && zombie.shieldHealth === 0 && zombie.health > 0 && index > 0) {
        zombie.hasArm = false
        zombiePartDropped(world, entity, 'arm')
    }
    if (zombie.hasHead && index === 2) {
        dropZombieFlag(world, entity)
        zombie.hasHead = false
        zombiePartDropped(world, entity, 'head')
        // Zombie::UpdateDamageStates: losing the head is when the zombie drops its loot.
        dropZombieLoot(world, definitions, entity, remover)
    }
    // The award drop may already have removed this zombie.
    if (zombie.health === 0 && world.hasEntity(entity)) startZombieDeath(world, definitions, entity, zombie)
}

/** Instant kills still drop loot at the zombie's position, before removing its components (Zombie::DieWithLoot). */
export function destroyZombie(world: World, definitions: GameplayDefinitions, entity: number, remover: EntityRemover): void {
    dropZombieLoot(world, definitions, entity, remover)
    remover.destroyEntity(entity)
}

/** Zombie::MowDown: flattened where it stands, it plays its mowered clip and is gone once that is through (squashed). */
export function flattenZombie(world: World, definitions: GameplayDefinitions, zombie: Zombie): void {
    if (zombie.state === 'dying' || zombie.state === 'mowered') return
    zombie.health = 0
    zombie.state = 'mowered'
    playZombie(zombie, definitions.zombies[zombie.typeId].animation, ZOMBIE_CLIPS.mowered, world.resources.get(RandomResource))
    zombie.biteTicks = 0
    zombie.deathTicksRemaining = 0
}

function chillZombie(world: World, entity: number, zombie: Zombie, ticks: number): void {
    if (zombie.chilledTicks === 0) emitServerEvent(world.resources.get(EventQueueResource), 'zombieChilled', { entityId: entity })
    zombie.chilledTicks = Math.max(zombie.chilledTicks, ticks)
}

/** Zombie::DropHelm: a helm still worn falls off. */
export function dropZombieHelm(world: World, definitions: GameplayDefinitions, entity: number, zombie: Zombie): void {
    const helm = definitions.zombies[zombie.typeId].helm
    if (!helm || zombie.helmHealth <= 0) return
    zombie.helmHealth = 0
    emitServerEvent(world.resources.get(EventQueueResource), 'zombieHelmDropped', { entityId: entity, helm: helm.type })
}

/**
 * Zombie::DropShield: a shield still held falls off. `bypassed` (DAMAGE_BYPASSES_SHIELD) skips the newspaper's rip
 * and surprise.
 */
export function dropZombieShield(world: World, definitions: GameplayDefinitions, entity: number, zombie: Zombie, bypassed = false): void {
    const shield = definitions.zombies[zombie.typeId].shield
    if (!shield || zombie.shieldHealth <= 0) return
    zombie.shieldHealth = 0
    emitServerEvent(world.resources.get(EventQueueResource), 'zombieShieldDropped', { entityId: entity, shield: shield.type, ...(bypassed ? { bypassed: true } : {}) })
}

/** LawnApp::HasFinishedAdventure || mLevel > 5. */
function canDoSuperLongDeath(world: World): boolean {
    if (!world.resources.has(TutorialResource) || !world.resources.has(LevelStateResource)) return false
    return !world.resources.get(TutorialResource).firstAdventure || world.resources.get(LevelStateResource).definition.adventureIndex > 5
}

/** Board::CountZombiesOnScreen: the zombies' side (not mind-controlled) with their heads, not dying, other than `except`. */
export function countZombiesOnScreen(world: World, except?: number): number {
    let count = 0
    for (const entity of world.query(ZombieComponent)) if (entity !== except && isZombieOnScreen(world.get(entity, ZombieComponent)!)) count++
    return count
}

export function startZombieDeath(world: World, definitions: GameplayDefinitions, entity: number, zombie: Zombie): void {
    if (zombie.state === 'dying') return
    dropZombieFlag(world, entity)
    // Zombie::PlayDeathAnim drops a shield still held with DropShield(1U).
    dropZombieShield(world, definitions, entity, zombie, true)
    const random = world.resources.get(RandomResource)
    const animation = definitions.zombies[zombie.typeId].animation, { superLongDeath, death2 } = ZOMBIE_CLIPS
    const roll = random.integer(0, 99)
    // Zombie::PlayDeathAnim: a 99 plays the super long death from level 6 (or after the adventure), unchilled, with at
    // most five zombies on screen; above 50 is anim_death2. Each for a zombie whose animation has it.
    const clip = roll === 99 && animation.clips[superLongDeath] && canDoSuperLongDeath(world) && zombie.chilledTicks === 0 && countZombiesOnScreen(world, entity) <= 5
        ? superLongDeath : roll > 50 && animation.clips[death2] ? death2 : ZOMBIE_CLIPS.death
    zombie.state = 'dying'
    // The clip's pace is drawn for it; a chilled zombie stays chilled, and so slowed, while it falls.
    const body = playZombie(zombie, animation, clip, random)
    zombie.deathTicksRemaining = Math.ceil(animation.clips[clip].frames / (body.rate * zombiePace(zombie)) * TICKS_PER_SECOND) + ZOMBIE_DEATH_HOLD_TICKS
}

export function updateHeadlessZombie(world: World, definitions: GameplayDefinitions, entity: number, zombie: Zombie): void {
    if (world.resources.get(RandomResource).integer(0, 4) !== 0) return
    // Zombie::UpdatePlaying decays sturdier bodies faster.
    zombie.health = Math.max(0, zombie.health - (zombie.maxHealth >= 500 ? 3 : 1))
    if (zombie.health === 0) startZombieDeath(world, definitions, entity, zombie)
}

/**
 * Zombie::MowDown: a mower flattens a zombie standing on the lawn; one dying, burned, in its vault or still rising from
 * a grave cannot be flattened as it stands, and goes in a puff instead.
 */
export function isFlattenableZombie(zombie: Zombie): boolean {
    return zombie.state !== 'dying' && zombie.state !== 'burned' && zombie.state !== 'vaulting' && !zombie.riseTicks
}

/**
 * Standing zombies that ground weapons can hit; vaulting zombies are in the air. Only an `attacker` on the other side
 * hits it (Zombie::EffectedByDamage); plants' weapons by default.
 */
export function isTargetableZombie(zombie: Zombie, attacker: Team = 'plants'): boolean {
    return zombie.health > 0 && !zombie.riseTicks && (zombie.state === 'walking' || zombie.state === 'eating') && isHostile(zombieTeam(zombie), attacker)
}
