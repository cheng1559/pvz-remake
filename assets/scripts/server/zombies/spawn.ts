import type { DeterministicRng } from '../state/DeterministicRng'
import type { GameplayDefinitions, ZombieDefinition } from '@/shared/content/gameplay'
import { RandomResource } from '../state/resources'
import type { World } from '@/server/state/World'
import { pickWalkClip, startWalk, startZombie } from './animation'
import { ZombieFactoryResource } from './Zombie'

/** Wave spawning and CLI summons share the configured range and flag-wave offset. */
export function pickZombieSpawnX(definition: ZombieDefinition, random: DeterministicRng, flagWave = false): number {
    const { minX, maxX, flagWaveOffset } = definition.spawn
    return random.integer(minX, maxX) + (flagWave ? flagWaveOffset : 0)
}

/**
 * A zombie of a type comes on at (x, y) in `row`, walking, as Zombie::ZombieInitialize has it: made as its kind
 * (ZombieFactoryResource), with what only it has (a pole vaulter its pole), it takes its speed and walk and starts
 * what it does of its own (a dancer's dance).
 */
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
    const random = world.resources.get(RandomResource), zombie = world.resources.get(ZombieFactoryResource).create(typeId)
    zombie.hasTongue = definition.tongueChance > 0 && random.nextFloat() < definition.tongueChance
    zombie.groanCounter = random.integer(300, 400)
    zombie.id = world.createEntity()
    zombie.position = { x, y, row }
    world.insert(world.zombies, zombie)
    const entity = zombie.id
    zombie.speedPerTick = zombie.pickSpeed(random)
    zombie.walkClip = pickWalkClip(definition, random)
    startZombie(zombie, definition.animation, random)
    startWalk(zombie, definition, zombie.setOffClip(), random)
    zombie.start(random)
    return entity
}
