import type { World } from '@/server/state/World'
import { cellPosition, type GameplayDefinitions, LEVEL_AWARD, levelAwardSize } from '@/shared/content/gameplay'
import { type EntityRemover, LevelStateResource, PositionComponent, ZombieComponent } from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { WaveResource } from '../state/levelState'
import { spawnItem } from './itemSpawn'
import { levelRule } from '../rules/registry'
import { isDeadOrDying, isZombieOnScreen } from '@/shared/content/zombieStates'

/** Board::HasLevelAwardDropped: the level's award is on the lawn (falling, waiting or being collected). */
export function levelAwardDropped(world: World): boolean {
    return [...world.items].some(item => item.typeId === LEVEL_AWARD)
}

/** Board::AddCoin of the level's award at (x, y), dropped like a coin (COIN_MOTION_COIN). */
export function spawnLevelAward(world: World, x: number, y: number): number {
    const award = world.resources.get(LevelStateResource).definition.award
    const entity = spawnItem(world, world, { typeId: LEVEL_AWARD, value: 1, width: levelAwardSize(award).width }, x, y, 'coin')
    emitServerEvent(world.resources.get(EventQueueResource), 'levelAwardDropped', { entityId: entity, awardId: award.id })
    return entity
}

/** Zombie::TrySpawnLevelAward: capture the defeated zombie before its entity is removed. */
export function tryDropLevelAward(world: World, definitions: GameplayDefinitions, remover: EntityRemover, defeated?: number): void {
    if (!world.resources.has(WaveResource)) return
    const level = world.resources.get(LevelStateResource)
    const waves = world.resources.get(WaveResource)
    if (level.result !== 'playing' || level.paused || waves.index < waves.plan.length) return
    if (levelRule(world)?.holdsAward?.(world)) return
    if (levelAwardDropped(world)) return
    const zombies = [...world.query(PositionComponent, ZombieComponent)]
    // Board::AreEnemyZombiesOnScreen: zombies on the plants' side do not hold the award back.
    if (zombies.some(entity => entity !== defeated && isZombieOnScreen(world.get(entity, ZombieComponent)!))) return
    const source = defeated ?? zombies.sort((left, right) =>
        world.get(right, PositionComponent)!.x - world.get(left, PositionComponent)!.x)[0]
    const position = source === undefined ? undefined : world.get(source, PositionComponent)
    const zombie = source === undefined ? undefined : world.get(source, ZombieComponent)
    const body = zombie ? definitions.zombies[zombie.typeId].body : undefined
    // With no zombie to drop it (the original then drops none), it comes down as Challenge::SpawnLevelAward puts one in
    // the middle of the lawn: 40 into cell (4, 2), as the slot machine does.
    const middle = cellPosition(level.board, 2, 4)
    spawnLevelAward(world, position && body ? position.x + body.x + body.width / 2 : middle.x + 40,
        position && body ? position.y + body.y + body.height / 2 : middle.y + 40)
    // Board::RemoveAllZombies: every zombie that is not dead or dying vanishes, the one that dropped the award included.
    for (const zombieEntity of zombies) {
        if (!isDeadOrDying(world.get(zombieEntity, ZombieComponent)!)) remover.destroyEntity(zombieEntity)
    }
}
