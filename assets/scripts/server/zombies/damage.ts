import {
    CHILLED_ANIMATION_FACTOR,
    TICKS_PER_SECOND,
    ZOMBIE_ASSET_FPS,
    ZOMBIE_MOWERED_ANIMATION_SPEED,
    ZOMBIE_MOWERED_TICKS,
    zombieGait,
} from './animation'
import { type EntityRemover, LevelStateResource, RandomResource, type Zombie, ZombieComponent } from '../state/components'
import { TutorialResource } from '../state/levelState'
import { EventQueueResource, emitServerEvent } from '../state/events'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import type { World } from '@/ecs/index'
import { dropZombieFlag } from './flag'
import { dropZombieLoot } from '../level/loot'
import { isEnemyZombie, isHostile, type Team, zombieTeam } from '@/shared/content/teams'

const ZOMBIE_DEATH_RATE_MIN = 24

const ZOMBIE_DEATH_RATE_MAX = 30

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
    // to flash and stops the flash (`flash: false`). A hit that also reaches the body (`through`) flashes both.
    if (hit.flash !== false) emitServerEvent(events, 'zombieHit', {
        entityId: entity,
        ...(shield && (hit.shieldOnly ? damage >= zombie.shieldHealth : damage === zombie.shieldHealth) && !hit.hitsShieldAndBody
            ? { flash: false } : {}),
        ...(shield && hit.hitsShieldAndBody ? { through: true } : {}),
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
                zombie.animation = 'anim_gasp'
                zombie.animationTime = 0
                zombie.animationSpeed = 8 / ZOMBIE_ASSET_FPS
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
    if (zombie.hasArm && zombie.shieldHealth === 0 &&
        zombie.health > 0 && zombie.health < zombie.maxHealth * 2 / 3) {
        zombie.hasArm = false
        emitServerEvent(events, 'zombiePartDropped', { entityId: entity, part: 'arm' })
    }
    if (zombie.hasHead && zombie.health < zombie.maxHealth / 3) {
        dropZombieFlag(world, definitions, entity)
        zombie.hasHead = false
        emitServerEvent(events, 'zombiePartDropped', { entityId: entity, part: 'head' })
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

export function mowZombie(zombie: Zombie): void {
    if (zombie.state === 'dying' || zombie.state === 'mowered') return
    zombie.health = 0
    zombie.state = 'mowered'
    zombie.animation = 'mowered'
    zombie.animationTime = 0
    zombie.animationSpeed = ZOMBIE_MOWERED_ANIMATION_SPEED
    zombie.biteTicks = 0
    zombie.deathTicksRemaining = 0
    zombie.moweredTicksRemaining = ZOMBIE_MOWERED_TICKS
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

/** Board::CountZombiesOnScreen: the zombies' side with their heads, not dying, other than `except`. */
function countZombiesOnScreen(world: World, except: number): number {
    let count = 0
    for (const entity of world.query(ZombieComponent)) {
        const zombie = world.get(entity, ZombieComponent)!
        if (entity !== except && zombie.hasHead && isEnemyZombie(zombie) && zombie.state !== 'dying' && zombie.state !== 'burned' && zombie.state !== 'mowered') count++
    }
    return count
}

export function startZombieDeath(world: World, definitions: GameplayDefinitions, entity: number, zombie: Zombie): void {
    if (zombie.state === 'dying') return
    dropZombieFlag(world, definitions, entity)
    // Zombie::PlayDeathAnim drops a shield still held with DropShield(1U).
    dropZombieShield(world, definitions, entity, zombie, true)
    const random = world.resources.get(RandomResource)
    const deaths = zombieGait(definitions.zombies[zombie.typeId], definitions).deaths
    const roll = random.integer(0, 99)
    const superLong = deaths.find(death => death.animation === 'anim_superlongdeath')
    const death2 = deaths.find(death => death.animation === 'anim_death2')
    // Zombie::PlayDeathAnim: a 99 plays the super long death from level 6 (or after the adventure), unchilled, with at
    // most five zombies on screen; above 50 is anim_death2.
    const death = roll === 99 && superLong && canDoSuperLongDeath(world) && zombie.chilledTicks === 0 && countZombiesOnScreen(world, entity) <= 5
        ? superLong : roll > 50 && death2 ? death2 : deaths[0]
    zombie.state = 'dying'
    zombie.animation = death.animation
    zombie.animationTime = 0
    // A chilled zombie keeps its slowed animation while falling.
    const randomRate = (ZOMBIE_DEATH_RATE_MIN + random.nextFloat() * (ZOMBIE_DEATH_RATE_MAX - ZOMBIE_DEATH_RATE_MIN)) *
        (zombie.chilledTicks > 0 ? CHILLED_ANIMATION_FACTOR : 1)
    const rate = death.rate ?? randomRate
    zombie.animationSpeed = rate / ZOMBIE_ASSET_FPS
    zombie.deathTicksRemaining = Math.ceil(death.frames / rate * TICKS_PER_SECOND) + ZOMBIE_DEATH_HOLD_TICKS
}

export function updateHeadlessZombie(world: World, definitions: GameplayDefinitions, entity: number, zombie: Zombie): void {
    if (world.resources.get(RandomResource).integer(0, 4) !== 0) return
    // Zombie::UpdatePlaying decays sturdier bodies faster.
    zombie.health = Math.max(0, zombie.health - (zombie.maxHealth >= 500 ? 3 : 1))
    if (zombie.health === 0) startZombieDeath(world, definitions, entity, zombie)
}

function isDeadOrDying(zombie: Zombie): boolean {
    return zombie.state === 'dying' || zombie.state === 'burned' || zombie.state === 'mowered'
}

/**
 * Standing zombies that ground weapons can hit; vaulting zombies are in the air. Only an `attacker` on the other side
 * hits it (Zombie::EffectedByDamage); plants' weapons by default.
 */
export function isTargetableZombie(zombie: Zombie, attacker: Team = 'plants'): boolean {
    return zombie.health > 0 && !zombie.riseTicks && (zombie.state === 'walking' || zombie.state === 'eating') && isHostile(zombieTeam(zombie), attacker)
}
