import type { World } from '@/server/state/World'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { type Plant, type Position } from '../state/components'
import { isHostile, plantFacingRect, plantTeam, type Team } from '@/shared/content/teams'
import { plantsInPlay } from '../level/lawn'

/** A plant an attack can hit, with its body on the board as it faces (Plant::GetPlantRect). */
export interface PlantTarget {
    entity: number
    position: Position
    plant: Plant
    rect: { x: number, y: number, width: number, height: number }
}

/**
 * The plants hostile to `team`, on `row` when given. Only plants on the zombies' side can be hostile to a plant's
 * attack; the original has none, so its plants' attacks never meet one.
 */
export function hostilePlants(world: World, definitions: GameplayDefinitions, team: Team, row?: number): PlantTarget[] {
    const targets: PlantTarget[] = []
    for (const plant of plantsInPlay(world)) {
        const { id: entity, position } = plant
        if (row !== undefined && position.row !== row || !isHostile(plantTeam(plant), team)) continue
        if (plant.health <= 0) continue
        const body = plantFacingRect(definitions.plants[plant.typeId].body, plantTeam(plant))
        targets.push({ entity, position, plant, rect: { ...body, x: position.x + body.x, y: position.y + body.y } })
    }
    return targets
}
