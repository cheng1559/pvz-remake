import { type GameplayDefinitions, MOWER_READY_X, mowerY } from '@/shared/content/gameplay'
import type { GameSystem, World } from '@/ecs/index'
import {
    LevelStateResource, MowedPlantComponent, type Plant, PlantAttackComponent, PlantComponent, type Position, PositionComponent, type Projectile,
    ProjectileComponent, type Zombie, ZombieComponent,
} from '../state/components'
import { MOWERED_TICKS } from '@/shared/content/zombieAnimation'
import { destroyZombie, dropZombieHelm, dropZombieShield, isFlattenableZombie, mowZombie as flattenZombie } from '../zombies/damage'
import { dropZombieLoot } from './loot'
import { dropZombieFlag } from '../zombies/flag'
import { WaveResource } from '../state/levelState'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { isHostile, type Team, zombieFacingRect, zombieTeam } from '@/shared/content/teams'
import { getDebugRules } from '../debug/debugRules'
import { launchProjectile, STRAIGHT } from '../combat/motions'

/** LawnMower::mChompCounter: a mower a zombie sets off chews on it for less than on the ones it runs into after. */
const CHOMP_READY_TICKS = 25
const CHOMP_ACTIVE_TICKS = 50
/** The original's mower slows from its 3.33 a tick to 1 as it chews: this much of its speed. */
const CHOMP_SPEED_SCALE = 1 / 3.33

type MowTarget = { entity: number, position: Position, zombie: Zombie }

/**
 * The level's mowers. One waits at each active row's end (LevelState.mowerRows) until a zombie with its head reaches
 * it, and then sets off as the level's mowing projectile (startMower), which the projectile system flies like any
 * other: the rest of this is what `mow` does to what such a projectile hits (ProjectileDefinition.mow), a level's or
 * a shooter's.
 */
export function createMowerSystem(definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:mower',
        run({ world, commands }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result === 'lost' || level.paused) return
            const waiting = definitions.projectiles[level.definition.lawnMower].hitbox, left = MOWER_READY_X + waiting.x
            if (level.mowerRows.length) for (const entity of [...world.query(PositionComponent, ZombieComponent)]) {
                const position = world.get(entity, PositionComponent)!, zombie = world.get(entity, ZombieComponent)!
                // Dead zombies cannot set a mower off themselves (LawnMower::Update).
                if (!level.mowerRows.includes(position.row) || !zombie.hasHead || !mowsZombie(zombie, 'plants')) continue
                const body = zombieFacingRect(definitions.zombies[zombie.typeId].body, zombieTeam(zombie))
                if (Math.min(left + waiting.width, position.x + body.x + body.width) > Math.max(left, position.x + body.x)) {
                    startMower(world, definitions, position.row, { entity, position, zombie })
                }
            }
            // A mowed plant is squashed for as long as a mowed zombie, then gone.
            for (const entity of world.query(MowedPlantComponent)) {
                if (++world.get(entity, MowedPlantComponent)!.ticks >= MOWERED_TICKS) commands.destroyEntity(entity)
            }
        },
    }
}

/**
 * LawnMower::StartMower: the row's mower sets off, a mowing projectile from where it waited, crushing the zombie that
 * reached it (`trigger`) first; `/lawnmower trigger` sets one off with none.
 */
export function startMower(world: World, definitions: GameplayDefinitions, row: number, trigger?: MowTarget): void {
    const level = world.resources.get(LevelStateResource)
    level.mowerRows = level.mowerRows.filter(waiting => waiting !== row)
    if (world.resources.has(WaveResource)) {
        const wave = world.resources.get(WaveResource)
        const picks = wave.rowPicks?.find(state => state.row === row)
        if (picks) picks.mowedAtWave = wave.index
    }
    const entity = launchProjectile(world, definitions, world, {
        typeId: level.definition.lawnMower, position: { x: MOWER_READY_X, y: mowerY(level.board, row), row }, motion: STRAIGHT,
    })
    emitServerEvent(world.resources.get(EventQueueResource), 'mowerActivated', { entityId: entity, row })
    if (!trigger) return
    const mower = world.get(entity, ProjectileComponent)!
    mowZombie(world, definitions, entity, mower, trigger)
    mower.chompCounter = CHOMP_READY_TICKS
}

/** LawnMower::UpdatePlaying (EffectedByDamage(127)): a mower takes the other side's zombies, dying ones too, once. */
export function mowsZombie(zombie: Zombie, team: Team): boolean {
    return zombie.state !== 'mowered' && isHostile(zombieTeam(zombie), team)
}

/** A mower crushes the other side's plants too, unless /plantinvincible keeps them. */
export function mowsPlants(world: World): boolean {
    return !getDebugRules(world).plantInvincible
}

/** LawnMower::UpdatePlaying: it slows toward a third of its speed and back as it chews. */
export function chewSpeedScale(mower: Projectile): number {
    return mower.chompCounter! > 0 ? bounceSlowMiddle(CHOMP_ACTIVE_TICKS, 0, --mower.chompCounter!, 1, CHOMP_SPEED_SCALE) : 1
}

/**
 * Zombie::MowDown, and the mower chews on it: DropShield(0U) and DropHelm(0U), then the flag; it drops loot like any
 * other death. One that cannot be flattened as it stands (dying, burned, in its vault, rising from a grave) goes in a
 * puff instead: its head, arm and armor drop, and it is gone at once (DieWithLoot).
 */
export function mowZombie(world: World, definitions: GameplayDefinitions, mowerId: number, mower: Projectile, { entity, position, zombie }: MowTarget): void {
    mower.chompCounter = CHOMP_ACTIVE_TICKS
    const events = world.resources.get(EventQueueResource)
    if (!isFlattenableZombie(zombie)) {
        emitServerEvent(events, 'zombiePuffed', { mowerId, zombieId: entity, x: position.x, y: position.y, row: position.row })
        for (const part of ['head', 'arm'] as const) {
            const has = part === 'head' ? 'hasHead' : 'hasArm'
            if (!zombie[has]) continue
            zombie[has] = false
            emitServerEvent(events, 'zombiePartDropped', { entityId: entity, part, row: position.row })
        }
        dropZombieHelm(world, definitions, entity, zombie)
        dropZombieShield(world, definitions, entity, zombie)
        destroyZombie(world, definitions, entity, world)
        return
    }
    dropZombieShield(world, definitions, entity, zombie)
    dropZombieHelm(world, definitions, entity, zombie)
    dropZombieFlag(world, entity)
    flattenZombie(world, definitions, zombie)
    dropZombieLoot(world, definitions, entity, world)
    emitServerEvent(events, 'zombieMowered', { mowerId, zombieId: entity })
}

/**
 * A mower crushes a plant past its own end (an explode-o-nut does not go off): it stops being a plant at once and stays
 * as a mowed one for its squashing, as a mowed zombie does. `team`: the mower's, which tips it the way the mower runs.
 */
export function mowPlant(world: World, mowerId: number, mower: Projectile, target: { entity: number, plant: Plant }, team: Team): void {
    mower.chompCounter = CHOMP_ACTIVE_TICKS
    world.remove(target.entity, PlantComponent)
    world.remove(target.entity, PlantAttackComponent)
    world.add(target.entity, MowedPlantComponent, { plant: target.plant, ticks: 0, ...(team === 'zombies' ? { left: true as const } : {}) })
    emitServerEvent(world.resources.get(EventQueueResource), 'plantMowered', { mowerId, plantId: target.entity })
}

function bounceSlowMiddle(timeStart: number, timeEnd: number, age: number, start: number, end: number): number {
    const warpedAge = (age - timeStart) / (timeEnd - timeStart)
    if (warpedAge <= 0 || warpedAge >= 1) return start
    const bounce = 1 - Math.abs(2 * warpedAge - 1)
    const invQuad = 2 * bounce - bounce * bounce
    return (end - start) * invQuad + start
}
