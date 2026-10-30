import type { DeterministicRng } from '../state/DeterministicRng'
import type { GameplayDefinitions, ZombieDefinition } from '@/shared/content/gameplay'
import { PositionComponent, RandomResource, ZombieComponent } from '../state/components'
import type { World } from '@/ecs/index'
import { walkAnimationSpeed, zombieGait } from './animation'
import { ZombieBehaviorsResource } from './behaviors'

/** Wave spawning and CLI summons share the configured range and flag-wave offset. */
export function pickZombieSpawnX(definition: ZombieDefinition, random: DeterministicRng, flagWave = false): number {
    const { minX, maxX, flagWaveOffset } = definition.spawn
    return random.integer(minX, maxX) + (flagWave ? flagWaveOffset : 0)
}

export function spawnZombie(
    world: World,
    definitions: GameplayDefinitions,
    typeId: string,
    row: number,
    x: number,
    y: number,
): number {
    const definition = definitions.zombies[typeId]
    if (!definition) throw new Error(`Unknown zombie: ${typeId}`)
    const behaviorState = world.resources.has(ZombieBehaviorsResource)
        ? world.resources.get(ZombieBehaviorsResource).createState(typeId, definition) : undefined
    if (definition.behavior !== undefined && behaviorState === undefined) throw new Error(`Zombie behavior is not installed: ${typeId}`)
    const random = world.resources.get(RandomResource)
    const vault = definition.vault
    const gait = zombieGait(definition, definitions)
    const speed = vault?.runSpeedPerTick ?? definition.speedPerTick
    const entity = world.createEntity()
    world.add(entity, PositionComponent, { x, y, row })
    world.add(entity, ZombieComponent, {
        typeId,
        health: definition.maxHealth,
        maxHealth: definition.maxHealth,
        state: 'walking',
        hasTongue: definition.tongueChance > 0 && random.nextFloat() < definition.tongueChance,
        groanCounter: random.integer(300, 400),
        speedPerTick: speed.min + random.nextFloat() * (speed.max - speed.min),
        biteTicks: 0,
        deathTicksRemaining: 0,
        moweredTicksRemaining: 0,
        walkAnimation: 'anim_walk',
        animation: 'anim_walk',
        animationTime: 0,
        animationSpeed: walkAnimationSpeed(speed.min, gait.walkGround),
        hasHead: true,
        hasArm: true,
        hitFlashCounter: 0,
        helmHealth: definition.helm?.health ?? 0,
        chilledTicks: 0,
        hasPole: vault !== undefined,
        ...(behaviorState === undefined ? {} : { behaviorState }),
    })
    const zombie = world.get(entity, ZombieComponent)!
    zombie.walkAnimation = random.nextFloat() < 1 - definition.walk2Chance ? 'anim_walk' : 'anim_walk2'
    zombie.animation = vault ? 'anim_run' : zombie.walkAnimation
    zombie.animationSpeed = walkAnimationSpeed(zombie.speedPerTick, vault?.runGround ?? gait.walkGround)
    return entity
}
