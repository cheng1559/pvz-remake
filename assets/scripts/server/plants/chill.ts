import type { GameSystem, World } from '@/server/state/World'
import { CHILLED_ANIMATION_FACTOR } from '@/shared/content/animation'
import { LevelStateResource, type Plant } from '../state/components'
import { plantsInPlay } from '../level/lawn'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { meltIce } from '../combat/ice'
import { plantCanBeChilled } from '../combat/cold'
import type { GameplayDefinitions } from '@/shared/content/gameplay'

/**
 * A hostile snow pea chills a plant as long as it would a zombie (Zombie::ApplyChill keeps the longer chill). The
 * original's plants are never chilled; here a chilled plant does everything at half speed: its animation goes at half
 * its rate, as a chilled zombie's body does (plantPace), and it sits out every other tick of the rest, its shots,
 * production, ability timers and blinks included. A hostile ice-shroom freezes it (combat/freeze.ts): it sits out
 * every tick it is frozen, its animation standing still, as a frozen zombie's body does.
 */
export function chillPlant(world: World, definitions: GameplayDefinitions, entity: number, plant: Plant, ticks: number): void {
    // A torchwood is kept from the cold (plantCanBeChilled).
    if (!plantCanBeChilled(plant)) return
    if (!plant.chilledTicks) emitServerEvent(world.resources.get(EventQueueResource), 'plantChilled', { entityId: entity })
    plant.chilledTicks = Math.max(plant.chilledTicks, ticks)
}

/** Whether a chilled or frozen plant sits out this tick; every plant system reads it after the chill system counted down. */
export const plantSkipsTick = (plant: Plant): boolean => plant.frozenTicks !== undefined || plant.chilledTicks % 2 === 1

/** The part of its rate a plant's animation goes at, every layer of it: a chilled one's is slowed (zombiePace's body), a frozen one's stopped. */
export const plantPace = (plant: Plant): number => plant.frozenTicks !== undefined ? 0 : plant.chilledTicks > 0 ? CHILLED_ANIMATION_FACTOR : 1

/**
 * Counts ice and chills down before the other plant systems run; a plant whose ice runs out acts on that tick. On a
 * tick a plant sits out, what it counts to waits a tick (Plant.sitOut: a shooter's next shot, a producer's next sun),
 * so the shooter and production systems need no check of their own.
 */
export function createPlantChillSystem(): GameSystem {
    return {
        id: 'pvz:plant-chill',
        run({ world }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result === 'lost' || level.paused) return
            for (const plant of plantsInPlay(world)) {
                if (!plant.chilledTicks && plant.frozenTicks === undefined) continue
                meltIce(world, plant.id, plant)
                if (plant.chilledTicks) plant.chilledTicks--
                if (plantSkipsTick(plant)) plant.sitOut()
            }
        },
    }
}
