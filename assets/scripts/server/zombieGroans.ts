import type { GameSystem } from '@/ecs/index'
import { LevelStateResource, RandomResource, ZombieComponent } from './components'
import { ItemComponent } from './levelState'
import { EventQueueResource, emitServerEvent } from './events'

export function createZombieGroanSystem(): GameSystem {
    return {
        id: 'pvz:zombie-groans',
        run({ world }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result !== 'playing' || level.paused) return
            const zombies = [...world.query(ZombieComponent)]
            const awardDropped = [...world.query(ItemComponent)].some(entity =>
                world.get(entity, ItemComponent)!.typeId === level.definition.award.id)
            for (const entity of zombies) {
                const zombie = world.get(entity, ZombieComponent)!
                if (zombie.health <= 0 || zombie.state === 'dying' || zombie.state === 'mowered') continue
                zombie.groanCounter--
                if (zombie.groanCounter !== 0) continue
                const random = world.resources.get(RandomResource)
                if (random.integer(0, zombies.length - 1) !== 0 || !zombie.hasHead || awardDropped) continue
                emitServerEvent(world.resources.get(EventQueueResource), 'zombieGroaned', { entityId: entity })
                zombie.groanCounter = random.integer(500, 1499)
            }
        },
    }
}
