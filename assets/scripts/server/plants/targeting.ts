import type { World } from '@/server/state/World'
import type { GameplayDefinitions, PlantTargeting } from '@/shared/content/gameplay'
import { plantFacingRect, plantTeam, teamDirection } from '@/shared/content/teams'
import { getBoardBounds, rectOverlap } from '../combat/collision'
import { hostilePlants, zombieRect } from '../combat/targets'
import { isTargetableZombie } from '../zombies/damage'
import type { Plant } from './Plant'

/**
 * Plant::FindTargetZombie for the chomper, the potato mine and a bowled nut: the nearest hostile zombie or plant in
 * reach, the leftmost for a plant facing right, a zombie where it stands in whole pixels (zombieRect). A plant facing
 * left mirrors the attack rect, the zombie's inset on its far side.
 * `headless`: it takes a zombie that has lost its head too, as every plant but the potato mine, the chomper and the
 * tangle kelp does.
 * `biting`: a chomper biting reaches a little further (its `eatingExtraRange`).
 */
export function findAbilityTarget(
    world: World,
    definitions: GameplayDefinitions,
    plant: Plant,
    { attack, targeting, headless = false }: { attack: { x: number, width: number }, targeting: PlantTargeting, headless?: boolean },
    biting = false,
): number | undefined {
    const plantPosition = plant.position, team = plantTeam(plant), forward = teamDirection(team) > 0
    let target: number | undefined
    let targetX = Infinity
    const bounds = getBoardBounds(world)
    const consider = (entity: number, rect: { x: number, width: number }, inset: number, reach: number, ahead = 0) => {
        if (rect.x > bounds.right) return
        const reachRect = plantFacingRect({ x: attack.x + inset, width: attack.width - inset }, team)
        const x = plantPosition.x + reachRect.x + (forward ? ahead : -ahead)
        if (rectOverlap({ x, width: reachRect.width }, rect) < -reach) return
        // Of those as near, the first met (the zombies before the plants, each in slot order): its weight must beat the best.
        const order = forward ? rect.x : -(rect.x + rect.width)
        if (order < targetX) {
            target = entity
            targetX = order
        }
    }
    for (const zombie of world.zombies) {
        const { id: entity, position } = zombie
        if (position.row !== plantPosition.row || !headless && !zombie.hasHead || !isTargetableZombie(zombie, team)) continue
        const definition = definitions.zombies[zombie.typeId]
        // Plant::FindTargetZombie passes over a zombie its kind keeps from this targeting (a potato mine's, a pole
        // vaulter holding its pole).
        if (targeting.insetKey !== undefined && zombie.evades(targeting.insetKey)) continue
        const inset = targeting.insetKey ? definition.targetingInsets?.[targeting.insetKey] ?? 0 : 0
        consider(entity, zombieRect(world, definitions, zombie), inset, zombie.state === 'eating' || biting ? targeting.eatingExtraRange : 0)
    }
    for (const { plant: other, rect } of hostilePlants(world, definitions, team, plantPosition.row)) {
        consider(other.id, rect, 0, biting ? targeting.eatingExtraRange : 0, targeting.plantReach)
    }
    return target
}
