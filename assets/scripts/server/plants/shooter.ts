import { getBoardBounds } from '../collision'
import { EventQueueResource, emitServerEvent } from '../events'
import type { GameSystem, World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
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
} from '../components'
import { damageZombie, isTargetableZombie } from '../zombies/damage'

export function createPeashooterSystem(definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:peashooter',
        run({ world, commands, tick }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result === 'lost' || level.paused) return
            for (const entity of world.query(PositionComponent, PlantComponent, PlantAttackComponent)) {
                const position = world.get(entity, PositionComponent)!
                const plant = world.get(entity, PlantComponent)!
                const attack = world.get(entity, PlantAttackComponent)!
                const definition = definitions.plants[plant.typeId], shooter = definition.shooter
                // Mushrooms sleep on day boards.
                if (!shooter || definition.nocturnal && !level.board.night) continue

                if (attack.fireAtTick !== undefined) {
                    if (tick < attack.fireAtTick) continue
                    if (shooter.area) {
                        // Plant::Fire for the Fume-shroom: DoRowAreaDamage instead of a projectile.
                        const hits = targetsAhead(world, definitions, position, plant)
                        for (const zombie of hits) damageZombie(world, definitions, zombie, shooter.area.damage,
                            { hitsShieldAndBody: shooter.area.hitsShieldAndBody }, commands)
                        emitServerEvent(world.resources.get(EventQueueResource), 'plantAreaAttack', {
                            plantId: entity, typeId: plant.typeId, hits: hits.length,
                        })
                        attack.fireAtTick = undefined
                        attack.shotsRemaining = undefined
                        continue
                    }
                    const projectile = commands.createEntity()
                    commands.add(projectile, PositionComponent, {
                        x: position.x + shooter.offset.x,
                        y: position.y + shooter.offset.y,
                        row: position.row,
                    })
                    const lifetime = definitions.projectiles[shooter.projectile!].lifetimeTicks
                    commands.add(projectile, ProjectileComponent, {
                        typeId: shooter.projectile!,
                        sourcePlantId: entity,
                        ...(lifetime === undefined ? {} : { ticksLeft: lifetime }),
                    })
                    emitServerEvent(world.resources.get(EventQueueResource), 'projectileFired', {
                        plantId: entity,
                        projectileId: projectile,
                        typeId: shooter.projectile!,
                    })
                    const shotsRemaining = (attack.shotsRemaining ?? 1) - 1
                    if (shotsRemaining > 0) {
                        attack.shotsRemaining = shotsRemaining
                        attack.fireAtTick = tick + shooter.burstIntervalTicks
                        emitServerEvent(world.resources.get(EventQueueResource), 'plantFiring', {
                            plantId: entity,
                        })
                    } else {
                        attack.fireAtTick = undefined
                        attack.shotsRemaining = undefined
                    }
                    continue
                }
                if (tick < attack.readyAtTick) continue

                attack.readyAtTick = tick + world.resources.get(RandomResource).integer(shooter.cadenceTicks.min, shooter.cadenceTicks.max)
                if (!targetsAhead(world, definitions, position, plant).length) continue
                attack.fireAtTick = tick + shooter.windupTicks - 1
                attack.shotsRemaining = shooter.shotsPerBurst
                emitServerEvent(world.resources.get(EventQueueResource), 'plantFiring', {
                    plantId: entity,
                })
            }
        },
    }
}

/** Zombies in the row overlapping the attack rect: what a shooter aims at, and what an area attack hits. */
function targetsAhead(
    world: World,
    definitions: GameplayDefinitions,
    plantPosition: Position,
    plant: Plant,
): number[] {
    const { body: plantBody, shooter } = definitions.plants[plant.typeId]
    const attackX = plantPosition.x + plantBody.width
    const targets: number[] = []
    for (const entity of world.query(PositionComponent, ZombieComponent)) {
        const position = world.get(entity, PositionComponent)!
        const zombie = world.get(entity, ZombieComponent)!
        if (!isTargetableZombie(zombie) || position.row !== plantPosition.row) continue
        const body = definitions.zombies[zombie.typeId].body
        if (position.x + body.x >= Math.min(getBoardBounds(world).right, attackX + (shooter?.range ?? Infinity))) continue
        if (position.x + body.x + body.width >= attackX) targets.push(entity)
    }
    return targets
}
