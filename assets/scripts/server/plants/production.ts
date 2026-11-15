import type { GameSystem } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { EventQueueResource, emitServerEvent } from '../state/events'
import {
    EconomyStateResource,
    LevelStateResource,
    PlantAttackComponent,
    PlantComponent,
    PositionComponent,
    RandomResource,
} from '../state/components'
import { spawnItem } from '../level/itemSpawn'
import { plantTeam } from '@/shared/content/teams'
import { levelAwardDropped } from '../level/levelAward'

export function createProductionSystem(definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:plant-production',
        run({ world, commands, tick }) {
            const level = world.resources.get(LevelStateResource)
            const stopped = level.result !== 'playing' || level.paused || levelAwardDropped(world)
            for (const entity of world.query(PlantComponent, PlantAttackComponent, PositionComponent)) {
                const plant = world.get(entity, PlantComponent)!
                const definition = definitions.plants[plant.typeId], producer = definition.producer
                if (!producer) continue
                const timer = world.get(entity, PlantAttackComponent)!
                // A sleeping mushroom and a growing sun-shroom skip UpdateProductionPlant, holding the launch counter.
                const idle = definition.nocturnal && !level.board.night || plant.ability?.state === 'growing'
                if (stopped || idle) { timer.readyAtTick++; continue }
                // The client draws the glow over the last 100 ticks from the snapshot's produceTicks.
                if (timer.readyAtTick - tick > 0) continue
                const random = world.resources.get(RandomResource)
                timer.readyAtTick = tick + random.integer(Math.max(1, producer.cadenceTicks - 150), producer.cadenceTicks)
                const position = world.get(entity, PositionComponent)!
                const itemId = plant.ability?.state === 'small' ? producer.growth!.smallItem : producer.item
                const itemDefinition = definitions.items[itemId]
                if (plantTeam(plant) === 'zombies') {
                    // An enemy producer takes from the player instead: what its sun is worth leaves the bank, down to
                    // 0. One producing money gives nothing.
                    if (itemDefinition.kind === 'money') continue
                    const economy = world.resources.get(EconomyStateResource)
                    const drained = Math.min(economy.sun, itemDefinition.value)
                    economy.sun -= drained
                    emitServerEvent(world.resources.get(EventQueueResource), 'sunDrained', { entityId: entity, sun: drained })
                    continue
                }
                // It comes out small and grows to its size as it rises (Coin::Update).
                const item = spawnItem(world, commands, { typeId: itemId, value: itemDefinition.value, width: itemDefinition.width,
                    scale: 0.4 * (itemDefinition.scale ?? 1) }, position.x, position.y, 'plant')
                emitServerEvent(world.resources.get(EventQueueResource), 'sunProduced', { entityId: entity, itemId: item })
            }
        },
    }
}
