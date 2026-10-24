import { DAY_BOARD_RIGHT, rectOverlap } from '../collision'
import { EventQueueResource, emitServerEvent } from '../events'
import type { ExplosionDefinition, GameplayDefinitions, PlantDefinition, PlantTargeting } from '@/shared/content/gameplay'
import type { GameSystem, World } from '@/ecs/index'
import {
    LevelStateResource,
    type Plant,
    type PlantAbility,
    type PlantAbilityState,
    PlantComponent,
    type Position,
    PositionComponent,
    ZombieComponent,
} from '../components'
import { explode } from '../explosions'
import { destroyZombie, isTargetableZombie } from '../zombies/damage'

export function initialPlantAbility(definition: PlantDefinition): PlantAbility | undefined {
    if (definition.fuse) return { state: 'fuse', ticks: definition.fuse.ticks }
    if (definition.mine) return { state: 'arming', ticks: definition.mine.armingTicks }
    if (definition.chomper) return { state: 'ready', ticks: 0 }
    return undefined
}

/** Fuse, mine and chomper plants, following Plant::UpdateAbilities. */
export function createPlantAbilitySystem(definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:plant-abilities',
        run({ world, commands }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result === 'lost' || level.paused) return
            const events = world.resources.get(EventQueueResource)
            for (const entity of world.query(PositionComponent, PlantComponent)) {
                const plant = world.get(entity, PlantComponent)!
                const ability = plant.ability
                if (!ability) continue
                const position = world.get(entity, PositionComponent)!
                const definition = definitions.plants[plant.typeId]
                const detonate = (explosion: ExplosionDefinition) => {
                    explode(world, definitions, position, explosion, commands)
                    emitServerEvent(events, 'plantExploded', {
                        entityId: entity, typeId: plant.typeId, row: position.row,
                        x: position.x + explosion.offset.x, y: position.y + explosion.offset.y,
                    })
                    commands.destroyEntity(entity)
                }
                const next = (state: PlantAbilityState, ticks: number) => {
                    ability.state = state
                    ability.ticks = ticks
                }
                if (ability.ticks > 0) ability.ticks--
                switch (ability.state) {
                    case 'fuse':
                        if (ability.ticks === 0) detonate(definition.fuse!.explosion)
                        break
                    case 'arming':
                        if (ability.ticks > 0) break
                        next('rising', definition.mine!.riseTicks)
                        emitServerEvent(events, 'mineRising', { entityId: entity })
                        break
                    case 'rising':
                        if (ability.ticks === 0) next('armed', 0)
                        break
                    case 'armed':
                        if (findAbilityTarget(world, definitions, position, plant, definition.mine!) !== undefined) {
                            detonate(definition.mine!.explosion)
                        }
                        break
                    case 'ready':
                        if (findAbilityTarget(world, definitions, position, plant, definition.chomper!) === undefined) break
                        next('biting', definition.chomper!.biteDelayTicks)
                        emitServerEvent(events, 'chomperBiting', { entityId: entity })
                        break
                    case 'biting': {
                        if (ability.ticks > 0) break
                        const chomper = definition.chomper!
                        const target = findAbilityTarget(world, definitions, position, plant, chomper)
                        // A pole vaulter still holding the pole slips away, as in Plant::UpdateChomper.
                        const ate = target !== undefined && !world.get(target, ZombieComponent)!.hasPole
                        if (ate) destroyZombie(world, definitions, target, commands)
                        next(ate ? 'got-one' : 'missed', chomper.biteTicks - chomper.biteDelayTicks)
                        emitServerEvent(events, 'chomperBit', {
                            entityId: entity, ate, ...(ate ? { zombieId: target } : {}),
                        })
                        break
                    }
                    case 'got-one':
                        if (ability.ticks === 0) next('digesting', definition.chomper!.digestTicks)
                        break
                    case 'digesting':
                        if (ability.ticks === 0) next('swallowing', definition.chomper!.swallowTicks)
                        break
                    case 'missed':
                    case 'swallowing':
                        if (ability.ticks === 0) next('ready', 0)
                        break
                }
            }
        },
    }
}

/** Plant::FindTargetZombie for the chomper and the potato mine: the leftmost zombie in reach. */
function findAbilityTarget(
    world: World,
    definitions: GameplayDefinitions,
    plantPosition: Position,
    plant: Plant,
    { attack, targeting }: { attack: { x: number, width: number }, targeting: PlantTargeting },
): number | undefined {
    let target: number | undefined
    let targetX = Infinity
    for (const entity of world.query(PositionComponent, ZombieComponent)) {
        const position = world.get(entity, PositionComponent)!
        const zombie = world.get(entity, ZombieComponent)!
        if (position.row !== plantPosition.row || !zombie.hasHead || !isTargetableZombie(zombie)) continue
        if (targeting.excludeHeldPole && zombie.hasPole) continue
        const definition = definitions.zombies[zombie.typeId]
        const left = position.x + definition.body.x
        if (left > DAY_BOARD_RIGHT) continue
        const inset = targeting.insetKey ? definition.targetingInsets?.[targeting.insetKey] ?? 0 : 0
        const reach = zombie.state === 'eating' || plant.ability?.state === 'biting'
            ? targeting.eatingExtraRange
            : 0
        const overlap = rectOverlap(
            { x: plantPosition.x + attack.x + inset, width: attack.width - inset },
            { x: left, width: definition.body.width },
        )
        if (overlap < -reach) continue
        if (left < targetX || (left === targetX && entity < (target ?? Infinity))) {
            target = entity
            targetX = left
        }
    }
    return target
}
