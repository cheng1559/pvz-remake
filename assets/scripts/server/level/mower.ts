import { type GameplayDefinitions, MOWER_READY_X, mowerY } from '@/shared/content/gameplay'
import type { CommandBuffer, GameSystem, World } from '@/ecs/index'
import { LevelStateResource, MowedPlantComponent, PlantAttackComponent, PlantComponent, type Position, PositionComponent, ProjectileComponent, type Zombie, ZombieComponent } from '../state/components'
import { ZOMBIE_MOWERED_TICKS } from '../zombies/animation'
import { destroyZombie, dropZombieHelm, dropZombieShield, isFlattenableZombie, mowZombie } from '../zombies/damage'
import { dropZombieLoot } from './loot'
import { dropZombieFlag } from '../zombies/flag'
import { WaveResource } from '../state/levelState'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { isHostile, projectileTeam, type Team, teamDirection, zombieFacingRect, zombieTeam } from '@/shared/content/teams'
import { hostilePlants } from '../combat/targets'
import { getDebugRules } from '../debug/debugRules'
import { getBoardBounds } from '../combat/collision'

/** LawnMower::mChompCounter: a mower a zombie sets off chews on it for less than on the ones it runs into after. */
const CHOMP_READY_TICKS = 25
const CHOMP_ACTIVE_TICKS = 50

type MowTarget = { entity: number, position: Position, zombie: Zombie }

/**
 * The level's mowers and every mowing projectile (ProjectileDefinition.mow), after the other projectiles as the original
 * updates its mowers. A level's mower waits at each active row's end (LevelState.mowerRows) until a zombie with its
 * head reaches it, and then sets off as the level's mowing projectile (startMower). A mowing projectile, a level's or a
 * shooter's, runs through its row crushing the other side (LawnMower::UpdatePlaying) until it leaves the board.
 */
export function createMowerSystem(definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:mower',
        run({ world, commands }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result === 'lost' || level.paused) return
            // Collected once per run; positions and components are not replaced during it.
            const zombies: MowTarget[] = [...world.query(PositionComponent, ZombieComponent)].map(entity => ({
                entity, position: world.get(entity, PositionComponent)!, zombie: world.get(entity, ZombieComponent)!,
            }))
            const waiting = definitions.projectiles[level.definition.lawnMower].hitbox
            for (const row of [...level.mowerRows]) {
                const trigger = zombies.find(target => target.position.row === row && target.zombie.hasHead &&
                    mowable(definitions, target, 'plants', MOWER_READY_X + waiting.x, waiting.width))
                if (trigger) startMower(world, definitions, row, trigger)
            }
            // A mowed plant is squashed for as long as a mowed zombie, then gone.
            for (const entity of world.query(MowedPlantComponent)) {
                if (++world.get(entity, MowedPlantComponent)!.ticks >= ZOMBIE_MOWERED_TICKS) commands.destroyEntity(entity)
            }
            for (const entity of world.query(PositionComponent, ProjectileComponent)) {
                if (definitions.projectiles[world.get(entity, ProjectileComponent)!.typeId].mow) runMower(world, definitions, commands, entity, zombies)
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
    const entity = world.createEntity()
    world.add(entity, PositionComponent, { x: MOWER_READY_X, y: mowerY(level.board, row), row })
    world.add(entity, ProjectileComponent, { typeId: level.definition.lawnMower, chompCounter: 0 })
    emitServerEvent(world.resources.get(EventQueueResource), 'mowerActivated', { entityId: entity, row })
    if (!trigger) return
    mowDown(world, definitions, entity, trigger)
    world.get(entity, ProjectileComponent)!.chompCounter = CHOMP_READY_TICKS
}

/** A mowing projectile crushes what of the other side it meets, chewing on each, then runs on (slowed while it chews). */
function runMower(world: World, definitions: GameplayDefinitions, commands: CommandBuffer, entity: number, zombies: MowTarget[]): void {
    const position = world.get(entity, PositionComponent)!, mower = world.get(entity, ProjectileComponent)!
    const { hitbox, speedPerTick } = definitions.projectiles[mower.typeId], team = projectileTeam(mower)
    const left = position.x + hitbox.x
    for (const target of zombies) {
        if (target.position.row !== position.row || !mowable(definitions, target, team, left, hitbox.width)) continue
        mowDown(world, definitions, entity, target)
        mower.chompCounter = CHOMP_ACTIVE_TICKS
    }
    // The other side's plants go too, past their own ends (an explode-o-nut does not go off): each stops being a plant
    // at once and stays as a mowed one for its squashing, as a mowed zombie does. /plantinvincible keeps them.
    if (!getDebugRules(world).plantInvincible) for (const target of hostilePlants(world, definitions, team, position.row)) {
        if (!overlaps(left, hitbox.width, target.rect.x, target.rect.width)) continue
        mower.chompCounter = CHOMP_ACTIVE_TICKS
        world.remove(target.entity, PlantComponent)
        world.remove(target.entity, PlantAttackComponent)
        world.add(target.entity, MowedPlantComponent, { plant: target.plant, ticks: 0, ...(team === 'zombies' ? { left: true as const } : {}) })
        emitServerEvent(world.resources.get(EventQueueResource), 'plantMowered', { mowerId: entity, plantId: target.entity })
    }
    let speed = speedPerTick.x
    if (mower.chompCounter! > 0) speed = bounceSlowMiddle(CHOMP_ACTIVE_TICKS, 0, --mower.chompCounter!, speedPerTick.x, 1)
    // One of the zombies' side runs left.
    position.x += speed * teamDirection(team)
    const bounds = getBoardBounds(world)
    if (position.x > bounds.right || left + hitbox.width < bounds.left) commands.destroyEntity(entity)
}

/** A zombie of the other side, not already going, whose body overlaps the span. */
function mowable(definitions: GameplayDefinitions, { position, zombie }: MowTarget, team: Team, left: number, width: number): boolean {
    // LawnMower::UpdatePlaying (EffectedByDamage(127)): a mower passes zombies on its own side, and takes dying ones.
    if (zombie.state === 'mowered' || !isHostile(zombieTeam(zombie), team)) return false
    const body = zombieFacingRect(definitions.zombies[zombie.typeId].body, zombieTeam(zombie))
    return overlaps(left, width, position.x + body.x, body.width)
}

/**
 * Zombie::MowDown: DropShield(0U) and DropHelm(0U), then the flag; it drops loot like any other death. One that cannot
 * be flattened as it stands (dying, burned, in its vault, rising from a grave) goes in a puff instead: its head, arm
 * and armor drop, and it is gone at once (DieWithLoot).
 */
function mowDown(world: World, definitions: GameplayDefinitions, mowerId: number, { entity, position, zombie }: MowTarget): void {
    if (!world.hasEntity(entity)) return
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
    dropZombieFlag(world, definitions, entity)
    mowZombie(zombie)
    dropZombieLoot(world, definitions, entity, world)
    emitServerEvent(world.resources.get(EventQueueResource), 'zombieMowered', { mowerId, zombieId: entity })
}

function bounceSlowMiddle(timeStart: number, timeEnd: number, age: number, start: number, end: number): number {
    const warpedAge = (age - timeStart) / (timeEnd - timeStart)
    if (warpedAge <= 0 || warpedAge >= 1) return start
    const bounce = 1 - Math.abs(2 * warpedAge - 1)
    const invQuad = 2 * bounce - bounce * bounce
    return (end - start) * invQuad + start
}

function overlaps(leftA: number, widthA: number, leftB: number, widthB: number): boolean {
    return Math.min(leftA + widthA, leftB + widthB) > Math.max(leftA, leftB)
}
