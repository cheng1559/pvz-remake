import { getBoardBounds } from '../combat/collision'
import { EventQueueResource, emitServerEvent } from '../state/events'
import type { GameSystem, World } from '@/ecs/index'
import {
    LevelStateResource,
    type Plant,
    PlantAttackComponent,
    PlantComponent,
    type Position,
    PositionComponent,
    RandomResource,
    ZombieComponent,
} from '../state/components'
import { damageZombie, isTargetableZombie } from '../zombies/damage'
import { PLANT_WIDTH, plantFacingX, plantTeam, teamDirection, zombieFacingRect, zombieTeam } from '@/shared/content/teams'
import { hostilePlants } from '../combat/targets'
import { damagePlant } from './damage'
import { launchProjectile } from '../combat/motions'
import { type GameplayDefinitions, PLANT_ATTACKS } from '@/shared/content/gameplay'

export function createPeashooterSystem(definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:peashooter',
        run({ world, commands, tick }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result === 'lost' || level.paused) return
            for (const entity of world.query(PositionComponent, PlantComponent, PlantAttackComponent)) {
                // An earlier plant's area attack may have taken this one out.
                const position = world.get(entity, PositionComponent)
                const plant = world.get(entity, PlantComponent)
                const attack = world.get(entity, PlantAttackComponent)
                if (!position || !plant || !attack) continue
                const definition = definitions.plants[plant.typeId], shooter = definition.shooter
                // Mushrooms sleep on day boards.
                if (!shooter || definition.nocturnal && !level.board.night) continue

                if (attack.burst) {
                    if (tick < attack.burst.fireAtTick) continue
                    if (shooter.area) {
                        // Plant::Fire for the Fume-shroom: DoRowAreaDamage instead of a projectile.
                        const hits = targets(world, definitions, position, plant)
                        for (const zombie of hits.zombies) damageZombie(world, definitions, zombie, shooter.area.damage,
                            { hitsShieldAndBody: shooter.area.hitsShieldAndBody }, commands)
                        for (const target of hits.plants) damagePlant(world, definitions, target, shooter.area.damage, commands)
                        emitServerEvent(world.resources.get(EventQueueResource), 'plantAreaAttack', {
                            plantId: entity, typeId: plant.typeId, hits: hits.zombies.length + hits.plants.length,
                        })
                        delete attack.burst
                        continue
                    }
                    // The middle of the projectile's hitbox leaves the mouth, which a plant facing left has mirrored.
                    const hitbox = definitions.projectiles[shooter.projectile!].hitbox, team = plantTeam(plant)
                    // What it aims at, for a motion that takes a target.
                    const target = targets(world, definitions, position, plant).nearest
                    const projectile = launchProjectile(world, definitions, commands, {
                        typeId: shooter.projectile!,
                        position: {
                            x: position.x + plantFacingX(shooter.offset.x, team) - (hitbox.x + hitbox.width / 2),
                            y: position.y + shooter.offset.y - (hitbox.y + hitbox.height / 2),
                            row: position.row,
                        },
                        motion: PLANT_ATTACKS[shooter.type],
                        ...(shooter.overrides ? { overrides: shooter.overrides } : {}),
                        ...(plant.team ? { team: plant.team } : {}),
                        ...(target === undefined ? {} : { target }),
                    })
                    emitServerEvent(world.resources.get(EventQueueResource), 'projectileFired', {
                        plantId: entity,
                        projectileId: projectile,
                        typeId: shooter.projectile!,
                    })
                    if (--attack.burst.shotsRemaining > 0) {
                        attack.burst.fireAtTick = tick + shooter.burstIntervalTicks
                        emitServerEvent(world.resources.get(EventQueueResource), 'plantFiring', {
                            plantId: entity,
                        })
                    } else {
                        delete attack.burst
                    }
                    continue
                }
                if (tick < attack.readyAtTick) continue

                attack.readyAtTick = tick + world.resources.get(RandomResource).integer(shooter.cadenceTicks.min, shooter.cadenceTicks.max)
                if (targets(world, definitions, position, plant).nearest === undefined) continue
                attack.burst = { fireAtTick: tick + shooter.windupTicks - 1, shotsRemaining: shooter.shotsPerBurst }
                emitServerEvent(world.resources.get(EventQueueResource), 'plantFiring', {
                    plantId: entity,
                })
            }
        },
    }
}

/**
 * What the plant attacks, by its type (PlantDefinition.shooter), `nearest` the one it aims at.
 *
 * A `shooter` and a `lobber`: the hostile zombies and plants in the row overlapping the attack rect, which an area
 * attack hits; the rect runs from the body's front edge `range` ahead within the board, mirrored for a plant facing
 * left, and the first of them ahead is the nearest. A `seeker`: the hostile zombies and plants anywhere, the nearest
 * by how far its middle is from the plant's (Plant::FindTargetZombie for the cattail). None attacks a zombie in its
 * vault (Plant::GetDamageRangeFlags).
 */
function targets(
    world: World,
    definitions: GameplayDefinitions,
    plantPosition: Position,
    plant: Plant,
): { zombies: number[], plants: number[], nearest?: number } {
    const { body: plantBody, shooter } = definitions.plants[plant.typeId]
    const team = plantTeam(plant), direction = teamDirection(team), anywhere = shooter?.type === 'seeker'
    const bounds = getBoardBounds(world), reach = shooter?.range ?? Infinity
    const front = plantPosition.x + plantFacingX(plantBody.width, team)
    const ahead = (left: number, width: number) => direction > 0
        ? left < Math.min(bounds.right, front + reach) && left + width >= front
        : left < bounds.right && left + width > Math.max(bounds.left, front - reach) && left <= front
    // How near a body is: along the row for what is ahead, or from the plant's middle.
    const middle = { x: plantPosition.x + PLANT_WIDTH / 2, y: plantPosition.y + PLANT_WIDTH / 2 }
    const distance = (rect: { x: number, y: number, width: number, height: number }) => anywhere
        ? Math.hypot(rect.x + rect.width / 2 - middle.x, rect.y + rect.height / 2 - middle.y) : direction * rect.x
    let nearest: number | undefined, least = Infinity
    const near = (entity: number, rect: { x: number, y: number, width: number, height: number }) => {
        const far = distance(rect)
        if (far < least) { least = far; nearest = entity }
    }
    const zombies: number[] = []
    for (const entity of world.query(PositionComponent, ZombieComponent)) {
        const position = world.get(entity, PositionComponent)!
        const zombie = world.get(entity, ZombieComponent)!
        if (!isTargetableZombie(zombie, team) || !anywhere && position.row !== plantPosition.row) continue
        const body = zombieFacingRect(definitions.zombies[zombie.typeId].body, zombieTeam(zombie))
        const rect = { x: position.x + body.x, y: position.y + body.y, width: body.width, height: body.height }
        if (!anywhere && !ahead(rect.x, rect.width)) continue
        zombies.push(entity)
        near(entity, rect)
    }
    // A projectile would fly over a low plant, so only an area attack aims at one.
    const plants = hostilePlants(world, definitions, team, anywhere ? undefined : plantPosition.row)
        .filter(target => (shooter?.area || !definitions.plants[target.plant.typeId].low) && (anywhere || ahead(target.rect.x, target.rect.width)))
    for (const target of plants) near(target.entity, target.rect)
    return { zombies, plants: plants.map(target => target.entity), nearest }
}
