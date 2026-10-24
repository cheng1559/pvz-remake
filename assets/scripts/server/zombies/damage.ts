import {
    CHILLED_ANIMATION_FACTOR,
    TICKS_PER_SECOND,
    ZOMBIE_ASSET_FPS,
    ZOMBIE_MOWERED_ANIMATION_SPEED,
    ZOMBIE_MOWERED_TICKS,
    zombieGait,
} from './animation'
import { type EntityRemover, RandomResource, type Zombie, ZombieComponent } from '../components'
import { EventQueueResource, emitServerEvent } from '../events'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import type { World } from '@/ecs/index'
import { dropZombieFlag } from './flag'
import { tryDropLevelAward } from '../levelAward'

export const HIT_FLASH_TICKS = 25

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
}

/** Helm first, then body, following Zombie::TakeDamage. */
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
    if (hit.flash !== false) zombie.hitFlashCounter = HIT_FLASH_TICKS
    const events = world.resources.get(EventQueueResource)
    if (hit.chillTicks !== undefined) chillZombie(world, entity, zombie, hit.chillTicks)
    let remaining = damage
    if (zombie.helmHealth > 0) {
        const absorbed = Math.min(zombie.helmHealth, remaining)
        zombie.helmHealth -= absorbed
        remaining -= absorbed
        if (zombie.helmHealth === 0) {
            emitServerEvent(events, 'zombieHelmDropped', {
                entityId: entity,
                helm: definitions.zombies[zombie.typeId].helm?.type ?? 'cone',
                ...(hit.leaveBody === false ? { silent: true } : {}),
            })
        }
    }
    if (remaining <= 0) return
    zombie.health = Math.max(0, zombie.health - remaining)
    if (zombie.health === 0 && hit.leaveBody === false) {
        destroyZombie(world, definitions, entity, remover)
        return
    }
    if (zombie.hasArm && zombie.health > 0 && zombie.health < zombie.maxHealth * 2 / 3) {
        zombie.hasArm = false
        emitServerEvent(events, 'zombiePartDropped', { entityId: entity, part: 'arm' })
    }
    if (zombie.hasHead && zombie.health < zombie.maxHealth / 3) {
        dropZombieFlag(world, definitions, entity)
        zombie.hasHead = false
        emitServerEvent(events, 'zombiePartDropped', { entityId: entity, part: 'head' })
    }
    if (zombie.health === 0) startZombieDeath(world, definitions, entity, zombie)
}

/** Instant kills still drop loot at the zombie's position, before removing its components. */
export function destroyZombie(world: World, definitions: GameplayDefinitions, entity: number, remover: EntityRemover): void {
    tryDropLevelAward(world, definitions, remover, entity)
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

export function startZombieDeath(world: World, definitions: GameplayDefinitions, entity: number, zombie: Zombie): void {
    if (zombie.state === 'dying') return
    dropZombieFlag(world, definitions, entity)
    const random = world.resources.get(RandomResource)
    const deaths = zombieGait(definitions.zombies[zombie.typeId], definitions).deaths
    const death = random.integer(0, 99) >= 51 && deaths[1] ? deaths[1] : deaths[0]
    zombie.state = 'dying'
    zombie.animation = death.animation
    zombie.animationTime = 0
    // A chilled zombie keeps its slowed animation while falling.
    const rate = (ZOMBIE_DEATH_RATE_MIN + random.nextFloat() * (ZOMBIE_DEATH_RATE_MAX - ZOMBIE_DEATH_RATE_MIN)) *
        (zombie.chilledTicks > 0 ? CHILLED_ANIMATION_FACTOR : 1)
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

/** Standing zombies that ground weapons can hit; vaulting zombies are in the air. */
export function isTargetableZombie(zombie: Zombie): boolean {
    return zombie.health > 0 && (zombie.state === 'walking' || zombie.state === 'eating')
}
