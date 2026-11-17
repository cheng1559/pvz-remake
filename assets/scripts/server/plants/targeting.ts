import type { Position, World } from '@/server/state/World'
import type { GameplayDefinitions, PlantTargeting } from '@/shared/content/gameplay'
import { plantFacingRect, plantTeam, teamDirection, zombieFacingRect, zombieTeam } from '@/shared/content/teams'
import { getBoardBounds, rectOverlap } from '../combat/collision'
import { hostilePlants } from '../combat/targets'
import { isTargetableZombie } from '../zombies/damage'
import type { Plant } from './Plant'

/**
 * Plant::FindTargetZombie for the chomper and the potato mine: the nearest hostile zombie or plant in reach, the
 * leftmost for a plant facing right. A plant facing left mirrors the attack rect, the zombie's inset on its far side.
 * `biting`: a chomper biting reaches a little further (its `eatingExtraRange`).
 */
export function findAbilityTarget(
    world: World,
    definitions: GameplayDefinitions,
    plantPosition: Position,
    plant: Plant,
    { attack, targeting }: { attack: { x: number, width: number }, targeting: PlantTargeting },
    biting = false,
): number | undefined {
    const team = plantTeam(plant), forward = teamDirection(team) > 0
    let target: number | undefined
    let targetX = Infinity
    const bounds = getBoardBounds(world)
    const consider = (entity: number, rect: { x: number, width: number }, inset: number, reach: number, ahead = 0) => {
        if (rect.x > bounds.right) return
        const reachRect = plantFacingRect({ x: attack.x + inset, width: attack.width - inset }, team)
        const x = plantPosition.x + reachRect.x + (forward ? ahead : -ahead)
        if (rectOverlap({ x, width: reachRect.width }, rect) < -reach) return
        const order = forward ? rect.x : -(rect.x + rect.width)
        if (order < targetX || (order === targetX && entity < (target ?? Infinity))) {
            target = entity
            targetX = order
        }
    }
    for (const zombie of world.zombies) {
        const { id: entity, position } = zombie
        if (position.row !== plantPosition.row || !zombie.hasHead || !isTargetableZombie(zombie, team)) continue
        const definition = definitions.zombies[zombie.typeId]
        // Plant::FindTargetZombie passes over a zombie its kind keeps from this targeting (a potato mine's, a pole
        // vaulter holding its pole).
        if (targeting.insetKey !== undefined && zombie.evades(targeting.insetKey)) continue
        const body = zombieFacingRect(definition.body, zombieTeam(zombie))
        const inset = targeting.insetKey ? definition.targetingInsets?.[targeting.insetKey] ?? 0 : 0
        consider(entity, { x: position.x + body.x, width: body.width }, inset,
            zombie.state === 'eating' || biting ? targeting.eatingExtraRange : 0)
    }
    for (const { entity, rect } of hostilePlants(world, definitions, team, plantPosition.row)) {
        consider(entity, rect, 0, biting ? targeting.eatingExtraRange : 0, targeting.plantReach)
    }
    return target
}
