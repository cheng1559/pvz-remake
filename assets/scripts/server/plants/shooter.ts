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
    ProjectileComponent,
    RandomResource,
    ZombieComponent,
} from '../state/components'
import { damageZombie, isTargetableZombie } from '../zombies/damage'
import { plantFacingRect, plantFacingX, plantTeam, teamDirection, zombieFacingRect, zombieTeam } from '@/shared/content/teams'
import { hostilePlants } from '../combat/targets'
import { damagePlant } from './damage'
import { type GameplayDefinitions, mowerY } from '@/shared/content/gameplay'

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
                        const hits = targetsAhead(world, definitions, position, plant)
                        for (const zombie of hits.zombies) damageZombie(world, definitions, zombie, shooter.area.damage,
                            { hitsShieldAndBody: shooter.area.hitsShieldAndBody }, commands)
                        for (const target of hits.plants) damagePlant(world, definitions, target, shooter.area.damage, commands)
                        emitServerEvent(world.resources.get(EventQueueResource), 'plantAreaAttack', {
                            plantId: entity, typeId: plant.typeId, hits: hits.zombies.length + hits.plants.length,
                        })
                        delete attack.burst
                        continue
                    }
                    const projectile = commands.createEntity()
                    // A plant facing left fires from its mirrored mouth: the projectile's hitbox mirrors across the plant.
                    const { hitbox, lifetimeTicks: lifetime, mow } = definitions.projectiles[shooter.projectile!]
                    const fired = plantFacingRect({ x: shooter.offset.x + hitbox.x, width: hitbox.width }, plantTeam(plant))
                    commands.add(projectile, PositionComponent, {
                        x: position.x + fired.x - hitbox.x,
                        // A mower runs on the ground, as a level's does.
                        y: mow ? mowerY(level.board, position.row) : position.y + shooter.offset.y,
                        row: position.row,
                    })
                    commands.add(projectile, ProjectileComponent, {
                        typeId: shooter.projectile!,
                        ...(plant.team ? { team: plant.team } : {}),
                        ...(lifetime === undefined ? {} : { ticksLeft: lifetime }),
                        ...(mow ? { chompCounter: 0 } : {}),
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
                const ahead = targetsAhead(world, definitions, position, plant)
                if (!ahead.zombies.length && !ahead.plants.length) continue
                attack.burst = { fireAtTick: tick + shooter.windupTicks - 1, shotsRemaining: shooter.shotsPerBurst }
                emitServerEvent(world.resources.get(EventQueueResource), 'plantFiring', {
                    plantId: entity,
                })
            }
        },
    }
}

/**
 * Hostile zombies and plants in the row overlapping the attack rect: what a shooter aims at, and what an area attack
 * hits. The rect runs from the body's front edge `range` ahead within the board, mirrored for a plant facing left.
 */
function targetsAhead(
    world: World,
    definitions: GameplayDefinitions,
    plantPosition: Position,
    plant: Plant,
): { zombies: number[], plants: number[] } {
    const { body: plantBody, shooter } = definitions.plants[plant.typeId]
    const team = plantTeam(plant), forward = teamDirection(team) > 0
    const bounds = getBoardBounds(world), reach = shooter?.range ?? Infinity
    const front = plantPosition.x + plantFacingX(plantBody.width, team)
    const ahead = (left: number, width: number) => forward
        ? left < Math.min(bounds.right, front + reach) && left + width >= front
        : left < bounds.right && left + width > Math.max(bounds.left, front - reach) && left <= front
    const zombies: number[] = []
    for (const entity of world.query(PositionComponent, ZombieComponent)) {
        const position = world.get(entity, PositionComponent)!
        const zombie = world.get(entity, ZombieComponent)!
        if (!isTargetableZombie(zombie, team) || position.row !== plantPosition.row) continue
        const body = zombieFacingRect(definitions.zombies[zombie.typeId].body, zombieTeam(zombie))
        if (ahead(position.x + body.x, body.width)) zombies.push(entity)
    }
    // A projectile would fly over a low plant, so only an area attack aims at one.
    const plants = hostilePlants(world, definitions, team, plantPosition.row)
        .filter(target => (shooter?.area || !definitions.plants[target.plant.typeId].low) && ahead(target.rect.x, target.rect.width))
        .map(target => target.entity)
    return { zombies, plants }
}
