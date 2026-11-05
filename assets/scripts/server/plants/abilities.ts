import { getBoardBounds, rectOverlap } from '../combat/collision'
import { EventQueueResource, emitServerEvent } from '../state/events'
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
} from '../state/components'
import { WaveResource } from '../state/levelState'
import { dropGraveLoot } from '../level/loot'
import type { DeterministicRng } from '../state/DeterministicRng'
import { destroyZombie, isTargetableZombie } from '../zombies/damage'
import { zombieFacingRect, plantFacingRect, plantTeam, teamDirection, zombieTeam } from '@/shared/content/teams'
import { hostilePlants } from '../combat/targets'
import { destroyEatenPlant, detonatePlant, isPlantInedible } from './damage'
import { plantSkipsTick } from './chill'

export function initialPlantAbility(definition: PlantDefinition, random?: DeterministicRng): PlantAbility | undefined {
    if (definition.fuse) return { state: 'fuse', ticks: definition.fuse.ticks }
    if (definition.mine) return { state: 'arming', ticks: definition.mine.armingTicks }
    if (definition.chomper) return { state: 'ready', ticks: 0 }
    if (definition.producer?.growth) return { state: 'small', ticks: definition.producer.growth.ticks }
    // The landing clip plays once at the body's random 10-15 fps.
    const land = definition.graveBuster?.landTicks
    if (land) return { state: 'landing', ticks: random ? random.integer(land.min, land.max) : land.min }
    return undefined
}

/** Fuse, mine, chomper, sun-shroom and grave buster plants, following Plant::UpdateAbilities. */
export function createPlantAbilitySystem(definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:plant-abilities',
        run({ world, commands }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result === 'lost' || level.paused) return
            const events = world.resources.get(EventQueueResource)
            for (const entity of world.query(PositionComponent, PlantComponent)) {
                // An earlier plant's blast or bite may have taken this one out.
                const plant = world.get(entity, PlantComponent)
                const ability = plant?.ability
                if (!plant || !ability || plantSkipsTick(plant)) continue
                const position = world.get(entity, PositionComponent)!
                const definition = definitions.plants[plant.typeId]
                // Plant::Update returns early while asleep, so a sleeping sun-shroom does not grow.
                if (definition.nocturnal && !level.board.night) continue
                const detonate = (explosion: ExplosionDefinition) => detonatePlant(world, definitions, entity, explosion, commands)
                const next = (state: PlantAbilityState, ticks: number) => {
                    ability.state = state
                    ability.ticks = ticks
                    if (state === 'ready') delete ability.prey
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
                        // A pole vaulter still holding the pole slips away, as in Plant::UpdateChomper. A hostile plant
                        // is swallowed whole, unless zombies could not hurt it either (a lit cherry bomb, a rising or
                        // armed potato mine): it slips away.
                        const zombie = target === undefined ? undefined : world.get(target, ZombieComponent)
                        const prey = target === undefined || zombie ? undefined : world.get(target, PlantComponent)!
                        const ate = target !== undefined && (zombie ? !zombie.hasPole : !isPlantInedible(prey!))
                        if (ate && zombie) destroyZombie(world, definitions, target, commands)
                        else if (ate) destroyEatenPlant(world, definitions, target, commands)
                        next(ate ? 'got-one' : 'missed', chomper.biteTicks - chomper.biteDelayTicks)
                        // The client hides the eaten zombie's arm while it chews a plant.
                        if (ate && !zombie) ability.prey = 'plant'
                        emitServerEvent(events, 'chomperBit', {
                            entityId: entity, ate, ...(ate ? zombie ? { zombieId: target } : { plantId: target } : {}),
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
                    case 'small':
                        // Plant::UpdateSunShroom: anim_grow, then the big sun-shroom.
                        if (ability.ticks > 0) break
                        next('growing', definition.producer!.growth!.growingTicks)
                        emitServerEvent(events, 'plantGrew', { entityId: entity, typeId: plant.typeId })
                        break
                    case 'growing':
                        if (ability.ticks === 0) next('big', 0)
                        break
                    case 'landing':
                        if (ability.ticks === 0) next('eating', definition.graveBuster!.eatTicks)
                        break
                    case 'eating': {
                        // Plant::UpdateGraveBuster: the grave and the buster disappear together.
                        if (ability.ticks > 0) break
                        const waves = world.resources.get(WaveResource)
                        const graves = waves.graves ?? []
                        waves.graves = graves.filter(grave => grave.row !== position.row || grave.column !== plant.column)
                        const ate = waves.graves.length < graves.length
                        commands.destroyEntity(entity)
                        // `team`: a buster of the zombies' side, facing left, whose dirt turns round with it.
                        emitServerEvent(events, 'graveBusted', {
                            entityId: entity, row: position.row, column: plant.column, x: position.x, y: position.y,
                            ...(plantTeam(plant) === 'zombies' ? { team: 'zombies' } : {}),
                        })
                        // The original drops its loot piece even without a grave, which planting never allows but `/plant`
                        // does; here only a grave eaten by the plants' side pays the player.
                        if (ate && plantTeam(plant) === 'plants') dropGraveLoot(world, definitions, position.x, position.y)
                        break
                    }
                }
            }
        },
    }
}

/**
 * Plant::FindTargetZombie for the chomper and the potato mine: the nearest hostile zombie or plant in reach, the
 * leftmost for a plant facing right. A plant facing left mirrors the attack rect, the zombie's inset on its far side.
 */
function findAbilityTarget(
    world: World,
    definitions: GameplayDefinitions,
    plantPosition: Position,
    plant: Plant,
    { attack, targeting }: { attack: { x: number, width: number }, targeting: PlantTargeting },
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
    const biting = plant.ability?.state === 'biting'
    for (const entity of world.query(PositionComponent, ZombieComponent)) {
        const position = world.get(entity, PositionComponent)!
        const zombie = world.get(entity, ZombieComponent)!
        if (position.row !== plantPosition.row || !zombie.hasHead || !isTargetableZombie(zombie, team)) continue
        if (targeting.excludeHeldPole && zombie.hasPole) continue
        const definition = definitions.zombies[zombie.typeId]
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
