import type { World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { type EntityRemover, LevelStateResource, PositionComponent, RandomResource, ZombieComponent } from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { ItemComponent, WaveResource } from '../state/levelState'
import { levelRule } from '../rules/registry'
import { isEnemyZombie } from '@/shared/content/teams'

/** Zombie::TrySpawnLevelAward: capture the defeated zombie before its entity is removed. */
export function tryDropLevelAward(world: World, definitions: GameplayDefinitions, remover: EntityRemover, defeated?: number): void {
    if (!world.resources.has(WaveResource)) return
    const level = world.resources.get(LevelStateResource)
    const waves = world.resources.get(WaveResource)
    if (level.result !== 'playing' || level.paused || waves.index < waves.plan.length) return
    if (levelRule(world)?.holdsAward?.(world)) return
    if ([...world.query(ItemComponent)].some(entity => world.get(entity, ItemComponent)!.typeId === level.definition.award.id)) return
    const zombies = [...world.query(PositionComponent, ZombieComponent)]
    // Board::AreEnemyZombiesOnScreen: zombies on the plants' side do not hold the award back.
    if (zombies.some(entity => {
        const zombie = world.get(entity, ZombieComponent)!
        return entity !== defeated && zombie.hasHead && isEnemyZombie(zombie) && zombie.state !== 'dying' && zombie.state !== 'mowered' && zombie.state !== 'burned'
    })) return
    const source = defeated ?? zombies.sort((left, right) =>
        world.get(right, PositionComponent)!.x - world.get(left, PositionComponent)!.x)[0]
    const position = source === undefined ? undefined : world.get(source, PositionComponent)
    const zombie = source === undefined ? undefined : world.get(source, ZombieComponent)
    const body = zombie ? definitions.zombies[zombie.typeId].body : undefined
    const x = position && body ? position.x + body.x + body.width / 2 : 400
    const y = position && body ? position.y + body.y + body.height / 2 : 280
    const random = world.resources.get(RandomResource)
    const entity = world.createEntity()
    world.add(entity, PositionComponent, { x, y, row: -1 })
    world.add(entity, ItemComponent, {
        typeId: level.definition.award.id, value: 1, state: 'available',
        velocityX: -0.5 + random.nextFloat(), velocityY: -3 - random.nextFloat() * 2,
        width: level.definition.award.kind === 'seed' ? 50 : level.definition.award.width,
        // Coin::CoinInitialize (COIN_MOTION_COIN): level awards land 30 higher than the clamped coin ground.
        groundY: Math.max(80, Math.min(521, y + 45 + random.integer(0, 19))) - 30,
        disappearTicks: 0, fadeTicks: 0, scale: 1, alpha: 255,
    })
    emitServerEvent(world.resources.get(EventQueueResource), 'levelAwardDropped', { entityId: entity, typeId: level.definition.award.id })
    // Board::RemoveAllZombies: every zombie that is not dead or dying vanishes, the one that dropped the award included.
    for (const zombieEntity of zombies) {
        const zombie = world.get(zombieEntity, ZombieComponent)!
        if (zombie.state !== 'dying' && zombie.state !== 'mowered' && zombie.state !== 'burned') remover.destroyEntity(zombieEntity)
    }
}
