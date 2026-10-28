import {
    CHILLED_ANIMATION_FACTOR,
    TICKS_PER_SECOND,
    ZOMBIE_ASSET_FPS,
    ZOMBIE_MOWERED_FRAME_SPAN,
    ZOMBIE_MOWERED_TICKS,
    deathOf,
    walkZombie,
    zombieGait,
} from './animation'
import { EventQueueResource, emitServerEvent } from '../events'
import type { GameSystem, SystemContext, World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { HIT_FLASH_TICKS, damageZombie, startZombieDeath, updateHeadlessZombie } from './damage'
import { LevelStateResource, PlantComponent, type Plant, type Position, PositionComponent, ZombieComponent } from '../components'
import { startPostVaultWalk, startVault, updateVault } from './poleVault'
import { RECENTLY_EATEN_TICKS, destroyEatenPlant, isPlantInedible } from '../plants/damage'
import { getDebugRules } from '../debug/DebugRules'

const CHILLED_BITE_CADENCE_FACTOR = 2
/** A plant's body span on its row; plants do not move during a run. Cell-less plants are never bitten. */
interface PlantTarget { entity: number, position: Position, plant: Plant, left: number, right: number }

export function createZombieSystem(definitions: GameplayDefinitions): GameSystem { return new ZombieSystem(definitions) }

export class ZombieSystem implements GameSystem {
    readonly id = 'pvz:zombie-lifecycle'
    /** Plants by row, collected once per run; positions and components are not replaced during it. */
    private plantRows: PlantTarget[][] = []
    constructor(private readonly definitions: GameplayDefinitions) {}
    run(context: SystemContext): void {
        const { world, commands } = context
        const definitions = this.definitions

        const level = world.resources.get(LevelStateResource)
        if (level.result === 'lost' || level.paused) return

        for (const entity of world.query(PlantComponent)) {
            const plant = world.get(entity, PlantComponent)!
            if (plant.eatenFlashCounter > 0) plant.eatenFlashCounter--
            if (plant.recentlyEatenCounter > 0) plant.recentlyEatenCounter--
        }
        this.plantRows = []
        for (const entity of world.query(PositionComponent, PlantComponent)) {
            const position = world.get(entity, PositionComponent)!, plant = world.get(entity, PlantComponent)!
            const type = definitions.plants[plant.typeId]
            if (type.occupiesCell === false) continue
            const left = position.x + type.body.x
            ;(this.plantRows[position.row] ??= []).push({ entity, position, plant, left, right: left + type.body.width })
        }

        for (const entity of world.query(PositionComponent, ZombieComponent)) {
            const position = world.get(entity, PositionComponent)
            const zombie = world.get(entity, ZombieComponent)
            // An earlier zombie's bite may have blown this one up.
            if (!position || !zombie || !world.hasEntity(entity)) continue
            const definition = definitions.zombies[zombie.typeId]
            const gait = zombieGait(definition, definitions)
            if (zombie.hitFlashCounter > 0) zombie.hitFlashCounter--
            if (zombie.state === 'mowered') {
                zombie.animationTime = Math.min(
                    ZOMBIE_MOWERED_FRAME_SPAN,
                    zombie.animationTime + ZOMBIE_MOWERED_FRAME_SPAN / ZOMBIE_MOWERED_TICKS,
                )
                if (--zombie.moweredTicksRemaining <= 0) {
                    const events = world.resources.get(EventQueueResource)
                    if (zombie.hasHead) {
                        zombie.hasHead = false
                        emitServerEvent(events, 'zombiePartDropped', { entityId: entity, part: 'head', mowered: true, row: position.row })
                    }
                    if (zombie.hasArm) {
                        zombie.hasArm = false
                        emitServerEvent(events, 'zombiePartDropped', { entityId: entity, part: 'arm', mowered: true, row: position.row })
                    }
                    commands.destroyEntity(entity)
                }
                continue
            }
            if (zombie.state === 'dying') {
                const death = deathOf(gait, zombie.animation)
                const span = death.frames - 1
                const previousAnimationTime = zombie.animationTime
                zombie.animationTime = Math.min(
                    span,
                    zombie.animationTime + span * zombie.animationSpeed * ZOMBIE_ASSET_FPS / (death.frames * TICKS_PER_SECOND),
                )
                const fallTime = span * death.fallTime
                if (previousAnimationTime < fallTime && zombie.animationTime >= fallTime) {
                    emitServerEvent(world.resources.get(EventQueueResource), 'zombieDying', {
                        entityId: entity,
                        typeId: zombie.typeId,
                        animation: zombie.animation,
                    })
                }
                if (--zombie.deathTicksRemaining <= 0) commands.destroyEntity(entity)
                continue
            }
            if (zombie.state === 'burned') {
                if (--zombie.deathTicksRemaining <= 0) commands.destroyEntity(entity)
                continue
            }
            if (zombie.health <= 0) {
                startZombieDeath(world, definitions, entity, zombie)
                continue
            }
            if (zombie.chilledTicks > 0) zombie.chilledTicks--
            this.updateActive(context, entity)
            if (world.resources.get(LevelStateResource).result === 'lost') return
        }
    }
    updateActive({ world, commands }: SystemContext, entity: number): void {
        const definitions = this.definitions
        const zombie = world.get(entity, ZombieComponent)!
        const position = world.get(entity, PositionComponent)!
        const definition = definitions.zombies[zombie.typeId]
        const gait = zombieGait(definition, definitions)
        const level = world.resources.get(LevelStateResource)
        const pace = zombie.chilledTicks > 0 ? CHILLED_ANIMATION_FACTOR : 1

        const vaultTarget = zombie.hasPole && zombie.hasHead && zombie.state === 'walking' && definition.vault
            ? findPlantTarget(world, this.plantRows[position.row] ?? [], position, definition.vault.attack)
            : undefined
        if (zombie.state === 'vaulting') {
            updateVault(world, definitions, entity, zombie, position, pace)
        } else if (vaultTarget !== undefined) {
            startVault(zombie, position, world.get(vaultTarget, PositionComponent)!, definition, pace)
        } else {
            // A running pole vaulter never stops to eat.
            const target = !zombie.hasPole && (zombie.hasHead || zombie.state === 'eating')
                ? findPlantTarget(world, this.plantRows[position.row] ?? [], position, definition.vault?.landedAttack ?? definition.attack)
                : undefined
            if (target === undefined) {
                if (zombie.state !== 'walking') {
                    zombie.state = 'walking'
                    zombie.animation = zombie.hasPole ? 'anim_run' : zombie.walkAnimation
                    zombie.animationTime = 0
                }
                zombie.biteTicks = 0
                const ground = zombie.animation === 'anim_run' ? definition.vault!.runGround : gait.walkGround
                walkZombie(zombie, position, ground, pace)
                if (!zombie.hasHead) updateHeadlessZombie(world, definitions, entity, zombie)
            } else {
                if (zombie.state !== 'eating') {
                    zombie.state = 'eating'
                    zombie.animation = 'anim_eat'
                    zombie.animationTime = 0
                }
                const eat = gait.eat
                const span = eat.frames - 1
                zombie.animationSpeed = eat.rate / ZOMBIE_ASSET_FPS * pace
                const previousAnimationTime = zombie.animationTime
                zombie.animationTime = (zombie.animationTime + eat.rate * pace / TICKS_PER_SECOND) % span
                if (!zombie.hasHead) {
                    updateHeadlessZombie(world, definitions, entity, zombie)
                } else {
                    if (eat.chewTimes.some(time => didCrossLoopingTime(previousAnimationTime, zombie.animationTime, time * span))) {
                        world.get(target, PlantComponent)!.eatenFlashCounter = HIT_FLASH_TICKS
                        emitServerEvent(world.resources.get(EventQueueResource), 'zombieChewedPlant', {
                            zombieId: entity,
                            plantId: target,
                        })
                    }
                    zombie.biteTicks++
                    const cadence = definition.bite.cadenceTicks * (zombie.chilledTicks > 0 ? CHILLED_BITE_CADENCE_FACTOR : 1)
                    if (zombie.biteTicks >= cadence) {
                        zombie.biteTicks = 0
                        const plant = world.get(target, PlantComponent)!
                        if (!isPlantInedible(plant) && !getDebugRules(world).plantInvincible) {
                            plant.recentlyEatenCounter = RECENTLY_EATEN_TICKS
                            plant.health = Math.max(0, plant.health - definition.bite.damage)
                            if (plant.health === 0) {
                                emitServerEvent(world.resources.get(EventQueueResource), 'plantEaten', {
                                    zombieId: entity,
                                    plantId: target,
                                })
                                destroyEatenPlant(world, definitions, target, commands)
                            }
                        }
                    }
                }
            }
        }

        // Zombie::CheckForBoardEdge: only headed zombies win; headless bodies die 70px earlier.
        const edge = definition.boardEdgeX
        if (!zombie.hasHead && position.x <= edge + 70) {
            damageZombie(world, definitions, entity, 1800, { flash: false })
        } else if (zombie.hasHead && level.result === 'playing' && position.x <= edge) {
            // Zombie::WalkIntoHouse changes a pre-vault winner to its unarmed walking phase.
            if (definition.vault && zombie.hasPole) startPostVaultWalk(world, definitions, zombie, pace)
            level.result = 'lost'
            emitServerEvent(world.resources.get(EventQueueResource), 'levelLost', {
                zombieId: entity,
            })
            return
        }
    }
}

function didCrossLoopingTime(previous: number, current: number, target: number): boolean {
    return current >= previous
        ? previous < target && target <= current
        : previous < target || target <= current
}

function findPlantTarget(
    world: World,
    /** The plants on the zombie's row. */
    plants: readonly PlantTarget[],
    zombiePosition: Position,
    attack: { x: number, y: number, width: number, height: number },
): number | undefined {
    let target: number | undefined
    let targetX = Infinity
    const left = zombiePosition.x + attack.x, right = left + attack.width
    // Runs for every zombie on every tick, so the span overlap test comes before entity lookups.
    for (let i = 0; i < plants.length; i++) {
        const { entity, position, plant } = plants[i]
        if (Math.min(right, plants[i].right) - Math.max(left, plants[i].left) < 20) continue
        // An earlier zombie may have finished this plant during the same run.
        if (plant.health <= 0 || !world.hasEntity(entity)) continue
        if (position.x < targetX || (position.x === targetX && entity < (target ?? Infinity))) {
            target = entity
            targetX = position.x
        }
    }
    return target
}
