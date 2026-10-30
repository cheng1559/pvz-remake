import type { CommandBuffer, World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { LevelStateResource, PositionComponent, RandomResource } from '../state/components'
import { ItemComponent, TutorialResource } from '../state/levelState'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { getDebugRules } from '../debug/debugRules'

const STATIC_SUN_Y = 60
const SKY_SUN_X_MIN = 100
const SKY_SUN_X_MAX = 649

export function updateSkySun(world: World, commands: CommandBuffer, definitions: GameplayDefinitions, tick: number): boolean {
    const level = world.resources.get(LevelStateResource)
    const state = world.resources.get(TutorialResource), skySun = level.definition.skySun
    if (!skySun || level.result !== 'playing' || level.paused || !getDebugRules(world).sunSpawning ||
        state.sunAtTick === undefined || tick < state.sunAtTick ||
        [...world.query(ItemComponent)].some(entity => world.get(entity, ItemComponent)!.typeId === level.definition.award.id)) return false
    spawnSkySun(world, commands, definitions, skySun)
    const extra = Math.min(525, (state.sunsFallen = (state.sunsFallen ?? 0) + 1) * 10)
    state.sunAtTick = tick + world.resources.get(RandomResource).integer(425 + extra, 699 + extra)
    return true
}

function spawnSkySun(
    world: World,
    commands: CommandBuffer,
    definitions: GameplayDefinitions,
    typeId: string,
): void {
    const definition = definitions.items[typeId]
    const entity = commands.createEntity()
    commands.add(entity, PositionComponent, {
        x: world.resources.get(RandomResource).integer(SKY_SUN_X_MIN, SKY_SUN_X_MAX),
        y: STATIC_SUN_Y,
        row: -1,
    })
    commands.add(entity, ItemComponent, {
        typeId,
        value: definition.value,
        state: 'available',
        velocityX: 0,
        velocityY: 0.67,
        width: definition.width,
        groundY: world.resources.get(RandomResource).integer(300, 549),
        disappearTicks: 0,
        fadeTicks: 0,
        scale: 1,
        alpha: 255,
    })
    emitServerEvent(world.resources.get(EventQueueResource), 'itemSpawned', {
        entityId: entity,
        typeId,
    })
}
