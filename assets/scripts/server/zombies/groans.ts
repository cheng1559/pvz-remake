import type { GameSystem } from '@/ecs/index'
import { LevelStateResource, RandomResource, ZombieComponent } from '../state/components'
import { isDeadOrDying } from '@/shared/content/zombieStates'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { levelAwardDropped } from '../level/levelAward'

export function createZombieGroanSystem(): GameSystem {
    return {
        id: 'pvz:zombie-groans',
        run({ world }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result !== 'playing' || level.paused) return
            const zombies = [...world.query(ZombieComponent)]
            const awardDropped = levelAwardDropped(world)
            for (const entity of zombies) {
                const zombie = world.get(entity, ZombieComponent)!
                if (zombie.health <= 0 || isDeadOrDying(zombie)) continue
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
