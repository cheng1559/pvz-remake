import type { GameSystem, World } from '@/ecs/index'
import { CHILLED_ANIMATION_FACTOR } from '@/shared/content/animation'
import { LevelStateResource, type Plant, PlantAttackComponent, PlantComponent } from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'

/**
 * A hostile snow pea chills a plant as long as it would a zombie (Zombie::ApplyChill keeps the longer chill). The
 * original's plants are never chilled; here a chilled plant does everything at half speed: its animation goes at half
 * its rate, as a chilled zombie's body does (plantPace), and it sits out every other tick of the rest, its shots,
 * production, ability timers and blinks included.
 */
export function chillPlant(world: World, entity: number, plant: Plant, ticks: number): void {
    if (!plant.chilledTicks) emitServerEvent(world.resources.get(EventQueueResource), 'plantChilled', { entityId: entity })
    plant.chilledTicks = Math.max(plant.chilledTicks, ticks)
}

/** Whether a chilled plant sits out this tick; every plant system reads it after the chill system counted down. */
export const plantSkipsTick = (plant: Plant): boolean => plant.chilledTicks % 2 === 1

/** The part of its rate a plant's animation goes at, every layer of it: a chilled one's is slowed (zombiePace's body). */
export const plantPace = (plant: Plant): number => plant.chilledTicks > 0 ? CHILLED_ANIMATION_FACTOR : 1

/**
 * Counts chills down before the other plant systems run. On a tick a plant sits out, its shot and production
 * deadlines move one tick later, so the shooter and production systems need no check of their own.
 */
export function createPlantChillSystem(): GameSystem {
    return {
        id: 'pvz:plant-chill',
        run({ world }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result === 'lost' || level.paused) return
            for (const entity of world.query(PlantComponent)) {
                const plant = world.get(entity, PlantComponent)!
                if (!plant.chilledTicks) continue
                if (--plant.chilledTicks === 0 || !plantSkipsTick(plant)) continue
                const timer = world.get(entity, PlantAttackComponent)
                if (!timer) continue
                timer.readyAtTick++
                if (timer.burst) timer.burst.fireAtTick++
            }
        },
    }
}
