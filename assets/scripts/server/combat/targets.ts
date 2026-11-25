import type { World } from '@/server/state/World'
import type { GameplayDefinitions, Rect } from '@/shared/content/gameplay'
import type { Plant } from '../plants/Plant'
import type { Zombie } from '../zombies/Zombie'
import { isHostile, plantTeam, type Team, zombieTeam } from '@/shared/content/teams'
import { plantRectAt, zombieRectAt, zombieRise } from '@/shared/content/hitRects'
import { plantsInPlay } from '../level/lawn'
import { LevelStateResource } from '../state/resources'

/**
 * Zombie::GetZombieRect: a zombie's body (or `rect`, its attack: GetZombieAttackRect) as it faces, where it stands in
 * whole pixels (Zombie::mX and mY, which Zombie::Update leaves as it ends), down and cut short while it rises
 * (zombieRectAt): as plants find it, which act before the zombies, and projectiles meet it, after.
 */
export function zombieRect(world: World, definitions: GameplayDefinitions, zombie: Zombie, rect = definitions.zombies[zombie.typeId].body): Rect {
    const { position, riseTicks } = zombie, definition = definitions.zombies[zombie.typeId]
    const rising = riseTicks ? { rise: zombieRise(definition, world.resources.get(LevelStateResource).board, zombie.calledUp()), ticks: riseTicks } : undefined
    return zombieRectAt(rect, zombieTeam(zombie), Math.trunc(position.x), Math.trunc(position.y), rising)
}

/** Plant::GetPlantRect: a plant's body (or `rect`, its attack) as it faces, where it stands in whole pixels (Plant::mX, mY). */
export function plantRect(definitions: GameplayDefinitions, plant: Plant, rect = definitions.plants[plant.typeId].body): Rect {
    return plantRectAt(rect, plantTeam(plant), Math.trunc(plant.position.x), Math.trunc(plant.position.y))
}

/** A plant an attack can hit, with its body on the board as it faces (Plant::GetPlantRect). */
export interface PlantTarget {
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
        const { position } = plant
        if (row !== undefined && position.row !== row || !isHostile(plantTeam(plant), team)) continue
        if (plant.health <= 0) continue
        targets.push({ plant, rect: plantRect(definitions, plant) })
    }
    return targets
}
