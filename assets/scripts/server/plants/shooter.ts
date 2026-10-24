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
    ZombieComponent,
} from '../components'
import { isTargetableZombie } from '../zombies/damage'

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
                const shooter = definitions.plants[plant.typeId].shooter
                if (!shooter) continue

                if (attack.fireAtTick !== undefined) {
                    if (tick < attack.fireAtTick) continue
                    const projectile = commands.createEntity()
                    commands.add(projectile, PositionComponent, {
                        x: position.x + shooter.offset.x,
                        y: position.y + shooter.offset.y,
                        row: position.row,
                    })
                    commands.add(projectile, ProjectileComponent, {
                        typeId: shooter.projectile,
                        sourcePlantId: entity,
                    })
                    emitServerEvent(world.resources.get(EventQueueResource), 'projectileFired', {
                        plantId: entity,
                        projectileId: projectile,
                        typeId: shooter.projectile,
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

                // ponytail: uses fixed timing; add range fields when original cadence jitter is migrated.
                attack.readyAtTick = tick + shooter.cadenceTicks
                if (!hasTargetAhead(world, definitions, position, plant)) continue
                attack.fireAtTick = tick + shooter.windupTicks - 1
                attack.shotsRemaining = shooter.shotsPerBurst
                emitServerEvent(world.resources.get(EventQueueResource), 'plantFiring', {
                    plantId: entity,
                })
            }
        },
    }
}

function hasTargetAhead(
    world: World,
    definitions: GameplayDefinitions,
    plantPosition: Position,
    plant: Plant,
): boolean {
    const attackX = plantPosition.x + definitions.plants[plant.typeId].body.width
    for (const entity of world.query(PositionComponent, ZombieComponent)) {
        const position = world.get(entity, PositionComponent)!
        const zombie = world.get(entity, ZombieComponent)!
        if (!isTargetableZombie(zombie) || position.row !== plantPosition.row) continue
        const body = definitions.zombies[zombie.typeId].body
        if (position.x + body.x >= getBoardBounds(world).right) continue
        if (position.x + body.x + body.width >= attackX) return true
    }
    return false
}
