import type { GameSystem } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { EventQueueResource, emitServerEvent } from './events'
import { LevelStateResource, PlantAttackComponent, PlantComponent, PositionComponent, RandomResource } from './gameplay'
import { ItemComponent } from './levelState'
import { getDebugRules } from './debug/DebugRules'

export function createProductionSystem(definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:plant-production',
        run({ world, commands, tick }) {
            const level = world.resources.get(LevelStateResource)
            const stopped = level.result !== 'playing' || level.paused || !getDebugRules(world).sunSpawning ||
                [...world.query(ItemComponent)].some(entity => world.get(entity, ItemComponent)!.typeId === level.definition.award.id)
            for (const entity of world.query(PlantComponent, PlantAttackComponent, PositionComponent)) {
                const plant = world.get(entity, PlantComponent)!
                const producer = definitions.plants[plant.typeId].producer
                if (!producer) continue
                const timer = world.get(entity, PlantAttackComponent)!
                if (stopped) { timer.readyAtTick++; plant.eatenFlashCounter = 0; continue }
                const remaining = timer.readyAtTick - tick
                if (remaining <= 100) plant.eatenFlashCounter = Math.max(plant.eatenFlashCounter, 100 - Math.max(0, remaining))
                if (remaining > 0) continue
                const random = world.resources.get(RandomResource)
                timer.readyAtTick = tick + random.integer(Math.max(1, producer.cadenceTicks - 150), producer.cadenceTicks)
                const position = world.get(entity, PositionComponent)!
                const definition = definitions.items[producer.item]
                const item = commands.createEntity()
                commands.add(item, PositionComponent, { x: position.x, y: position.y, row: -1 })
                commands.add(item, ItemComponent, {
                    typeId: producer.item, value: definition.value, state: 'available',
                    velocityX: -0.4 + random.nextFloat() * 0.8,
                    velocityY: -1.7 - random.nextFloat() * 1.7, accelerationY: 0.09,
                    width: definition.width, groundY: position.y + 15 + random.integer(0, 19),
                    disappearTicks: 0, fadeTicks: 0, scale: 0.4, alpha: 255,
                })
                emitServerEvent(world.resources.get(EventQueueResource), 'sunProduced', { entityId: entity, itemId: item })
            }
        },
    }
}
