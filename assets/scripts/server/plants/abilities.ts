import { circleRectOverlap, getBoardBounds, rectOverlap } from '../combat/collision'
import { EventQueueResource, emitServerEvent } from '../state/events'
import type { ExplosionDefinition, GameplayDefinitions, PlantDefinition, PlantTargeting } from '@/shared/content/gameplay'
import type { GameSystem, World } from '@/ecs/index'
import {
    LevelStateResource,
    type Plant,
    type PlantAbility,
    PlantAttackComponent,
    PlantComponent,
    type Position,
    PositionComponent,
    RandomResource,
    ZombieComponent,
} from '../state/components'
import { dropGraveLoot } from '../level/loot'
import type { DeterministicRng } from '../state/DeterministicRng'
import { PLANT_ABILITY_STATES_BY_KIND, plantAbilityKind, type PlantAbilityKind, type PlantAbilityState } from '@/shared/content/plantAbilities'
import { destroyZombie, isTargetableZombie } from '../zombies/damage'
import { mindControl, mindControls } from '../zombies/mindControl'
import { isHostile, zombieFacingRect, plantFacingRect, plantFacingX, plantTeam, teamDirection, zombieTeam } from '@/shared/content/teams'
import { isDeadOrDying } from '@/shared/content/zombieStates'
import { hostilePlants } from '../combat/targets'
import { destroyEatenPlant, detonatePlant, isPlantInedible } from './damage'
import { plantSkipsTick } from './chill'
import { plantAbilityAnimation } from './animation'
import { graveAt } from '@/shared/content/graves'
import { gridItems } from '../level/lawn'

/** The ability a plant is put down with: in its first state, for as long as that lasts. */
export function initialPlantAbility(definition: PlantDefinition, random?: DeterministicRng): PlantAbility | undefined {
    const kind = plantAbilityKind(definition)
    if (!kind) return undefined
    return { state: PLANT_ABILITY_STATES_BY_KIND[kind][0], ticks: firstStateTicks(definition, kind, random) }
}

function firstStateTicks(definition: PlantDefinition, kind: PlantAbilityKind, random?: DeterministicRng): number {
    switch (kind) {
        case 'fuse': return definition.fuse!.ticks
        case 'mine': return definition.mine!.armingTicks
        case 'chomper': return 0
        case 'growth': return definition.producer!.growth!.ticks
        case 'graveBuster': {
            // The landing clip plays once at the body's random 10-15 fps.
            const land = definition.graveBuster!.landTicks
            return random ? random.integer(land.min, land.max) : land.min
        }
        case 'fright': return 0
    }
}

/** Fuse, mine, chomper, sun-shroom, grave buster and scaredy-shroom plants, following Plant::UpdateAbilities. */
export function createPlantAbilitySystem(definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:plant-abilities',
        run({ world, commands, tick }) {
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
                    plantAbilityAnimation(plant, definition, state, world.resources.get(RandomResource))
                }
                if (ability.ticks > 0) ability.ticks--
                if (definition.fright) {
                    updateFright(world, definitions, entity, position, plant, ability, tick, next)
                    continue
                }
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
                        } else flashMineLight(world, definitions, position, plant)
                        break
                    case 'ready':
                        if (findAbilityTarget(world, definitions, position, plant, definition.chomper!) === undefined) break
                        next('biting', definition.chomper!.biteDelayTicks)
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
                        const bit = target !== undefined && (zombie ? !zombie.hasPole : !isPlantInedible(prey!))
                        // An awake hypno-shroom bitten turns the plant to its side, as a zombie that chews one, and is
                        // gone; it is not swallowed, so the bite goes on as one that missed, with nothing to chew.
                        const turned = bit && !zombie && mindControls(world, definitions, prey!), ate = bit && !turned
                        if (ate && zombie) destroyZombie(world, definitions, target, commands)
                        else if (turned) mindControl(world, definitions, entity, target, commands)
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
                        const grave = graveAt(gridItems(world), position.row, plant.column), ate = grave !== undefined
                        if (grave) world.destroyEntity(grave.entityId)
                        commands.destroyEntity(entity)
                        // The buster as it stood, for its draw order (Plant::CalcRenderOrder); `team`: a buster of the
                        // zombies' side, facing left, whose dirt turns round with it.
                        emitServerEvent(events, 'graveBusted', {
                            entityId: entity, typeId: plant.typeId, row: position.row, column: plant.column, x: position.x, y: position.y,
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
 * Plant::UpdateScaredyShroom: down while a hostile zombie is near (PlantDefinition.fright), and its shots held until it
 * is up again. A plant in the middle of a shot (Plant::mShootingCounter, its burst and then its firing clip) waits for
 * it to end. While it is not calm its next shot is a whole cadence away (mLaunchCounter = mLaunchRate, which
 * UpdateShooter then counts down this tick), so it shoots that long after it is up.
 */
function updateFright(
    world: World,
    definitions: GameplayDefinitions,
    entity: number,
    position: Position,
    plant: Plant,
    ability: PlantAbility,
    tick: number,
    next: (state: PlantAbilityState, ticks: number) => void,
): void {
    const definition = definitions.plants[plant.typeId], fright = definition.fright!
    const attack = world.get(entity, PlantAttackComponent)
    const firing = Object.entries(definition.animation?.fire ?? {}).some(([layer, clip]) => plant.animations?.[layer]?.clip === clip)
    if (attack?.burst || firing) return
    const near = zombieNear(world, definitions, position, plant, fright)
    switch (ability.state) {
        case 'calm':
            if (near) next('lowering', fright.lowerTicks)
            break
        case 'lowering':
            if (ability.ticks === 0) next('scared', 0)
            break
        case 'scared':
            if (!near) next('raising', world.resources.get(RandomResource).integer(fright.raiseTicks.min, fright.raiseTicks.max))
            break
        case 'raising':
            if (ability.ticks === 0) next('calm', 0)
            break
    }
    if (attack && definition.shooter && ability.state !== 'calm') attack.readyAtTick = tick + definition.shooter.cadenceTicks.max - 1
}

/**
 * A hostile zombie not dead or dying with its body within the fright's circle, on the plant's row or the rows beside
 * it. The circle's center is from the plant's corner, mirrored for a plant facing left.
 */
function zombieNear(world: World, definitions: GameplayDefinitions, position: Position, plant: Plant,
    fright: NonNullable<PlantDefinition['fright']>): boolean {
    const team = plantTeam(plant), x = position.x + plantFacingX(fright.center.x, team), y = position.y + fright.center.y
    for (const entity of world.query(PositionComponent, ZombieComponent)) {
        const at = world.get(entity, PositionComponent)!, zombie = world.get(entity, ZombieComponent)!
        if (Math.abs(at.row - position.row) > fright.rowRange || isDeadOrDying(zombie) || !isHostile(zombieTeam(zombie), team)) continue
        const body = zombieFacingRect(definitions.zombies[zombie.typeId].body, zombieTeam(zombie))
        if (circleRectOverlap(x, y, fright.radius, { x: at.x + body.x, y: at.y + body.y, width: body.width, height: body.height })) return true
    }
    return false
}

/**
 * Plant::UpdatePotato: an armed mine's light, on its `light` layer, goes round at 2 frames a second under its body's
 * rate and is lit for the first frame of each round. A round is the clip's 10 frames with no zombie within 200 of the
 * mine's reach (Plant::DistanceToClosestZombie), down to 3 with one within 50, so the light flashes faster as one nears.
 */
const MINE_LIGHT = { layer: 'light', body: 'body', near: 50, far: 200, fast: 3, slower: 2 }
function flashMineLight(world: World, definitions: GameplayDefinitions, position: Position, plant: Plant): void {
    const light = plant.animations?.[MINE_LIGHT.layer], body = plant.animations?.[MINE_LIGHT.body]
    const definition = definitions.plants[plant.typeId]
    if (!light || !body) return
    const team = plantTeam(plant), reach = plantFacingRect(definition.mine!.attack, team)
    let distance = Infinity
    for (const entity of world.query(PositionComponent, ZombieComponent)) {
        const at = world.get(entity, PositionComponent)!, zombie = world.get(entity, ZombieComponent)!
        if (at.row !== position.row || !isTargetableZombie(zombie, team)) continue
        const rect = zombieFacingRect(definitions.zombies[zombie.typeId].body, zombieTeam(zombie))
        distance = Math.min(distance, Math.max(0, -rectOverlap({ x: position.x + reach.x, width: reach.width }, { x: at.x + rect.x, width: rect.width })))
    }
    const frames = definition.animation!.clips[light.clip].frames, { near, far, fast } = MINE_LIGHT
    const round = Math.round(Math.max(fast, Math.min(frames, frames + (distance - far) * (fast - frames) / (near - far))))
    // The round is that many frames in place of the clip's, so the clip goes round that much faster.
    light.rate = (body.rate - MINE_LIGHT.slower) * frames / round
    if (light.time % frames / frames * (round - 1) < 1) delete light.hidden
    else light.hidden = true
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
