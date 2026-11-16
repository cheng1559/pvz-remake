import type { BoardDefinition, PlantDefinition } from '@/shared/content/gameplay'

/**
 * Plant::mIsAsleep: a nocturnal plant (a mushroom) on a board that is not at night. Plant::Update returns early while it
 * sleeps: it does nothing, its blink waits, and what zombies would leave alone while it is awake (a lit ice-shroom, a
 * hypno-shroom's mind control) they eat as any plant.
 */
export const isPlantAsleep = (definition: PlantDefinition, board: BoardDefinition): boolean => !!definition.nocturnal && !board.night
