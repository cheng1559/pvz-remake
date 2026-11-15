import type { CommandBuffer, World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { LevelStateResource, RandomResource } from '../state/components'
import { SkySunResource } from '../state/levelState'
import { spawnItem } from './itemSpawn'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { levelAwardDropped } from './levelAward'

const STATIC_SUN_Y = 60
const SKY_SUN_X_MIN = 100
const SKY_SUN_X_MAX = 649

export function updateSkySun(world: World, commands: CommandBuffer, definitions: GameplayDefinitions, tick: number): boolean {
    const level = world.resources.get(LevelStateResource)
    const state = world.resources.get(SkySunResource), skySun = level.definition.skySun
    if (!skySun || level.result !== 'playing' || level.paused ||
        state.atTick === undefined || tick < state.atTick || levelAwardDropped(world)) return false
    spawnSkySun(world, commands, definitions, skySun)
    const extra = Math.min(525, ++state.fallen * 10)
    state.atTick = tick + world.resources.get(RandomResource).integer(425 + extra, 699 + extra)
    return true
}

function spawnSkySun(
    world: World,
    commands: CommandBuffer,
    definitions: GameplayDefinitions,
    typeId: string,
): void {
    const { value, width } = definitions.items[typeId]
    const x = world.resources.get(RandomResource).integer(SKY_SUN_X_MIN, SKY_SUN_X_MAX)
    const entity = spawnItem(world, commands, { typeId, value, width }, x, STATIC_SUN_Y, 'sky')
    emitServerEvent(world.resources.get(EventQueueResource), 'itemSpawned', {
        entityId: entity,
        typeId,
    })
}
