import type { World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { type EntityRemover, LevelStateResource, PositionComponent, RandomResource, ZombieComponent } from './components'
import { EventQueueResource, emitServerEvent } from './events'
import { ItemComponent, WaveResource } from './levelState'

/** Zombie::TrySpawnLevelAward: capture the defeated zombie before its entity is removed. */
export function tryDropLevelAward(world: World, definitions: GameplayDefinitions, remover: EntityRemover, defeated?: number): void {
    if (!world.resources.has(WaveResource)) return
    const level = world.resources.get(LevelStateResource)
    if (level.result !== 'playing' || level.paused || world.resources.get(WaveResource).index < level.definition.waves.length) return
    if ([...world.query(ItemComponent)].some(entity => world.get(entity, ItemComponent)!.typeId === level.definition.award.id)) return
    const zombies = [...world.query(PositionComponent, ZombieComponent)]
    if (zombies.some(entity => {
        const zombie = world.get(entity, ZombieComponent)!
        return entity !== defeated && zombie.hasHead && zombie.state !== 'dying' && zombie.state !== 'mowered' && zombie.state !== 'burned'
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
        width: 50, groundY: Math.max(80, Math.min(521, y + 45 + random.integer(0, 19))),
        disappearTicks: 0, fadeTicks: 0, scale: 1, alpha: 255,
    })
    emitServerEvent(world.resources.get(EventQueueResource), 'levelAwardDropped', { entityId: entity, typeId: level.definition.award.id })
    for (const zombieEntity of zombies) {
        if (zombieEntity === defeated) continue
        const zombie = world.get(zombieEntity, ZombieComponent)!
        if (zombie.state !== 'dying' && zombie.state !== 'mowered') remover.destroyEntity(zombieEntity)
    }
}
