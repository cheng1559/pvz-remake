import { EventQueueResource, emitServerEvent } from '../events'
import type { GameplayDefinitions, ZombieDefinition } from '@/shared/content/gameplay'
import { type Position, RandomResource, type Zombie } from '../components'
import { TICKS_PER_SECOND, ZOMBIE_ASSET_FPS, walkAnimationSpeed, zombieGait } from './animation'
import type { World } from '@/ecs/index'

const POLE_VAULT_STEP_TIME = 0.2

const POLE_VAULT_SOUND_TIME = 0.4

export function startVault(
    zombie: Zombie,
    position: Position,
    plantPosition: Position,
    definition: ZombieDefinition,
    pace: number,
): void {
    const vault = definition.vault!
    zombie.state = 'vaulting'
    zombie.animation = 'anim_jump'
    zombie.animationTime = 0
    zombie.animationSpeed = vault.jumpRate / ZOMBIE_ASSET_FPS * pace
    zombie.biteTicks = 0
    zombie.hasPole = false
    // Zombie::UpdateZombiePolevaulter spreads the jump over the animation; the landing adds the rest.
    const durationTicks = vault.jumpFrames / vault.jumpRate * TICKS_PER_SECOND
    zombie.speedPerTick = (Math.trunc(position.x) - plantPosition.x - 80) / durationTicks
}

export function updateVault(
    world: World,
    definitions: GameplayDefinitions,
    entity: number,
    zombie: Zombie,
    position: Position,
    pace: number,
): void {
    const definition = definitions.zombies[zombie.typeId]
    const vault = definition.vault!
    const span = vault.jumpFrames - 1
    const previous = zombie.animationTime
    zombie.animationSpeed = vault.jumpRate / ZOMBIE_ASSET_FPS * pace
    zombie.animationTime = Math.min(span, previous + span * vault.jumpRate * pace / (vault.jumpFrames * TICKS_PER_SECOND))
    position.x -= zombie.speedPerTick * pace
    const events = world.resources.get(EventQueueResource)
    if (previous < span * POLE_VAULT_STEP_TIME && zombie.animationTime >= span * POLE_VAULT_STEP_TIME) {
        emitServerEvent(events, 'zombieVaultSound', { entityId: entity, sound: 'grassstep' })
    }
    if (previous < span * POLE_VAULT_SOUND_TIME && zombie.animationTime >= span * POLE_VAULT_SOUND_TIME) {
        emitServerEvent(events, 'zombieVaultSound', { entityId: entity, sound: 'polevault' })
    }
    if (zombie.animationTime < span) return
    position.x -= vault.landingOffset
    startPostVaultWalk(world, definitions, zombie, pace)
}

/** StartWalkAnim(0), shared by landing and WalkIntoHouse's pre-vault transition. */
export function startPostVaultWalk(world: World, definitions: GameplayDefinitions, zombie: Zombie, pace: number): void {
    const definition = definitions.zombies[zombie.typeId]
    const random = world.resources.get(RandomResource)
    zombie.hasPole = false
    zombie.state = 'walking'
    zombie.animation = zombie.walkAnimation
    zombie.animationTime = 0
    zombie.speedPerTick = definition.speedPerTick.min + random.nextFloat() * (definition.speedPerTick.max - definition.speedPerTick.min)
    zombie.animationSpeed = walkAnimationSpeed(zombie.speedPerTick, zombieGait(definition, definitions).walkGround) * pace
}
