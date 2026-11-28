import type { BoardTime, PlantDefinition } from '@/shared/content/gameplay'

/**
 * Plant::mIsAsleep: a nocturnal plant (a mushroom) at a time of day that is not night. Plant::Update returns early while it
 * sleeps: it does nothing, its blink waits, and what zombies would leave alone while it is awake (a lit ice-shroom, a
 * hypno-shroom's mind control) they eat as any plant.
 */
export const isPlantAsleep = (definition: PlantDefinition, time: BoardTime): boolean => !!definition.nocturnal && !time.night
