import {
    defineComponent,
    defineResource,
    type GameSystem,
    type World,
} from '@/ecs/index'
import type {
    BoardDefinitionV2,
    GameplayDefinitionsV2,
    LevelDefinitionV2,
} from '@/shared/content/gameplay'
import type { DeterministicRng } from './DeterministicRng'
import { EventQueueResource, emitServerEvent } from './events'

export interface Position {
    x: number
    y: number
    row: number
}

export interface LawnMower {
    typeId: string
    state: 'ready' | 'active' | 'spent'
    chompCounter: number
}

export interface Plant {
    typeId: string
    seedId: string
    column: number
    health: number
    maxHealth: number
    eatenFlashCounter: number
}

export interface PlantAttack {
    readyAtTick: number
    fireAtTick?: number
    shotsRemaining?: number
}

export interface Zombie {
    typeId: string
    health: number
    maxHealth: number
    state: 'walking' | 'eating' | 'dying' | 'mowered'
    speedPerTick: number
    biteTicks: number
    deathTicksRemaining: number
    moweredTicksRemaining: number
    walkAnimation: 'anim_walk' | 'anim_walk2'
    animation: 'anim_walk' | 'anim_walk2' | 'anim_eat' | 'anim_death' | 'anim_death2' | 'mowered'
    animationTime: number
    animationSpeed: number
    hasHead: boolean
    hasArm: boolean
    hitFlashCounter: number
    groanCounter: number
}

export interface Projectile {
    typeId: string
    sourcePlantId?: number
}

export interface SeedBankState {
    selectedSeedId?: string
    packets: Array<{ seedId: string, readyAtTick: number }>
}

export interface EconomyState {
    sun: number
    money: number
    pendingSunSpend: number
}

export interface LevelState {
    id: string
    definition: LevelDefinitionV2
    board: BoardDefinitionV2
    phase: 'intro' | 'gameplay'
    result: 'playing' | 'won' | 'lost'
    paused: boolean
}

export const PositionComponent = defineComponent<Position>('pvz:position')
export const LawnMowerComponent = defineComponent<LawnMower>('pvz:lawn_mower')
export const PlantComponent = defineComponent<Plant>('pvz:plant')
export const PlantAttackComponent = defineComponent<PlantAttack>('pvz:plant_attack')
export const ZombieComponent = defineComponent<Zombie>('pvz:zombie')
export const ProjectileComponent = defineComponent<Projectile>('pvz:projectile')
export const LevelStateResource = defineResource<LevelState>('pvz:level-state')
export const EconomyStateResource = defineResource<EconomyState>('pvz:economy-state')
export const RandomResource = defineResource<DeterministicRng>('pvz:random-state')
export const SeedBankResource = defineResource<SeedBankState>('pvz:seed-bank')

// ponytail: 1-1 screen edge; move this into BoardDefinition when another board needs it.
const DAY_BOARD_RIGHT = 800
const BOARD_EDGE = -100
const ZOMBIE_ASSET_FPS = 12
const TICKS_PER_SECOND = 100
const ZOMBIE_WALK_RATE_FACTOR = 47
const ZOMBIE_EAT_RATE = 36
const ZOMBIE_EAT_FRAME_SPAN = 39
const HIT_FLASH_TICKS = 25
const ZOMBIE_EAT_LEFT_HAND_TIME = 0.14
const ZOMBIE_EAT_RIGHT_HAND_TIME = 0.68
const ZOMBIE_DEATH_RATE_MIN = 24
const ZOMBIE_DEATH_RATE_MAX = 30
const ZOMBIE_DEATH_FRAME_SPAN = 38
const ZOMBIE_DEATH2_FRAME_SPAN = 32
const ZOMBIE_DEATH_FALL_TIME = 0.77
const ZOMBIE_DEATH2_FALL_TIME = 0.71
const ZOMBIE_DEATH_HOLD_TICKS = 40
const ZOMBIE_MOWERED_FRAME_SPAN = 7
const ZOMBIE_MOWERED_TICKS = 50
const ZOMBIE_MOWERED_ANIMATION_SPEED = 16 / ZOMBIE_ASSET_FPS
const ZOMBIE_WALK_GROUND_X = [
    -9.8, -8.4, -7.0, -5.6, -4.1, -2.7, -1.3, 0.0, 1.4, 2.8, 4.2, 5.7,
    7.1, 7.9, 8.8, 9.7, 10.5, 10.6, 10.8, 10.9, 11.0, 11.0, 11.0, 11.0,
    11.0, 13.4, 15.8, 18.1, 20.5, 22.8, 25.2, 27.6, 29.9, 31.1, 32.3,
    33.5, 34.6, 35.9, 37.0, 38.2, 39.4, 39.5, 39.6, 39.7, 39.8, 39.9, 40.0,
]
const ZOMBIE_WALK_FRAME_SPAN = ZOMBIE_WALK_GROUND_X.length - 1
const ZOMBIE_WALK_DISTANCE = ZOMBIE_WALK_GROUND_X.at(-1)! - ZOMBIE_WALK_GROUND_X[0]

export function createPeashooterSystem(definitions: GameplayDefinitionsV2): GameSystem {
    return {
        id: 'pvz:peashooter',
        run({ world, commands, tick }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result !== 'playing' || level.paused) return
            for (const entity of world.query(PositionComponent, PlantComponent, PlantAttackComponent)) {
                const position = world.get(entity, PositionComponent)!
                const plant = world.get(entity, PlantComponent)!
                const attack = world.get(entity, PlantAttackComponent)!
                const shooter = definitions.plants[plant.typeId].shooter

                if (attack.fireAtTick !== undefined) {
                    if (tick < attack.fireAtTick) continue
                    const projectileDefinition = definitions.projectiles[shooter.projectile]
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

                // ponytail: v2 uses fixed timing; add range fields when original cadence jitter is migrated.
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

export function createProjectileSystem(definitions: GameplayDefinitionsV2): GameSystem {
    return {
        id: 'pvz:projectile',
        run({ world, commands }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result !== 'playing' || level.paused) return
            for (const entity of world.query(PositionComponent, ProjectileComponent)) {
                const position = world.get(entity, PositionComponent)!
                const projectile = world.get(entity, ProjectileComponent)!
                const definition = definitions.projectiles[projectile.typeId]
                position.x += definition.speedPerTick.x
                position.y += definition.speedPerTick.y
                if (position.x > DAY_BOARD_RIGHT) {
                    commands.destroyEntity(entity)
                    continue
                }

                // ponytail: current pea cannot cross a body in one tick; add swept collision for faster projectiles.
                const target = findProjectileTarget(world, definitions, position, definition.hitbox)
                if (target !== undefined) {
                    const zombie = world.get(target, ZombieComponent)!
                    damageZombie(world, target, definition.damage)
                    emitServerEvent(world.resources.get(EventQueueResource), 'projectileImpact', {
                        projectileId: entity,
                        targetId: target,
                        ...(projectile.sourcePlantId === undefined ? {} : { sourcePlantId: projectile.sourcePlantId }),
                        x: position.x,
                        y: position.y,
                    })
                    commands.destroyEntity(entity)
                    continue
                }
            }
        },
    }
}

export function createZombieSystem(definitions: GameplayDefinitionsV2): GameSystem {
    return {
        id: 'pvz:zombie-lifecycle',
        run({ world, commands }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result !== 'playing' || level.paused) return

            for (const entity of world.query(PlantComponent)) {
                const plant = world.get(entity, PlantComponent)!
                if (plant.eatenFlashCounter > 0) plant.eatenFlashCounter--
            }

            for (const entity of world.query(PositionComponent, ZombieComponent)) {
                const position = world.get(entity, PositionComponent)!
                const zombie = world.get(entity, ZombieComponent)!
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
                            emitServerEvent(events, 'zombiePartDropped', { entityId: entity, part: 'head', mowered: true })
                        }
                        if (zombie.hasArm) {
                            zombie.hasArm = false
                            emitServerEvent(events, 'zombiePartDropped', { entityId: entity, part: 'arm', mowered: true })
                        }
                        commands.destroyEntity(entity)
                    }
                    continue
                }
                if (zombie.state === 'dying') {
                    const previousAnimationTime = zombie.animationTime
                    zombie.animationTime = Math.min(
                        deathFrameSpan(zombie.animation),
                        zombie.animationTime + zombie.animationSpeed * ZOMBIE_ASSET_FPS / TICKS_PER_SECOND,
                    )
                    const fallTime = deathFrameSpan(zombie.animation) *
                        (zombie.animation === 'anim_death2' ? ZOMBIE_DEATH2_FALL_TIME : ZOMBIE_DEATH_FALL_TIME)
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
                if (zombie.health <= 0) {
                    startZombieDeath(world, entity, zombie)
                    continue
                }

                const definition = definitions.zombies[zombie.typeId]
                const target = zombie.hasHead || zombie.state === 'eating'
                    ? findPlantTarget(world, definitions, position, definition.attack)
                    : undefined
                if (target === undefined) {
                    if (zombie.state !== 'walking') {
                        zombie.state = 'walking'
                        zombie.animation = zombie.walkAnimation
                        zombie.animationTime = 0
                        zombie.animationSpeed = walkAnimationSpeed(zombie.speedPerTick)
                    }
                    zombie.biteTicks = 0
                    const previous = sampleWalkGround(zombie.animationTime)
                    zombie.animationTime = (zombie.animationTime + walkFrameAdvance(zombie.speedPerTick)) % ZOMBIE_WALK_FRAME_SPAN
                    const next = sampleWalkGround(zombie.animationTime)
                    position.x -= next >= previous
                        ? next - previous
                        : ZOMBIE_WALK_GROUND_X.at(-1)! - previous + next - ZOMBIE_WALK_GROUND_X[0]
                    if (!zombie.hasHead) updateHeadlessZombie(world, entity, zombie)
                } else {
                    if (zombie.state !== 'eating') {
                        zombie.state = 'eating'
                        zombie.animation = 'anim_eat'
                        zombie.animationTime = 0
                        zombie.animationSpeed = ZOMBIE_EAT_RATE / ZOMBIE_ASSET_FPS
                    }
                    const previousAnimationTime = zombie.animationTime
                    zombie.animationTime = (zombie.animationTime + ZOMBIE_EAT_RATE / TICKS_PER_SECOND) % ZOMBIE_EAT_FRAME_SPAN
                    if (!zombie.hasHead) {
                        updateHeadlessZombie(world, entity, zombie)
                        continue
                    }
                    if (didCrossLoopingTime(previousAnimationTime, zombie.animationTime,
                        ZOMBIE_EAT_LEFT_HAND_TIME * ZOMBIE_EAT_FRAME_SPAN) ||
                        didCrossLoopingTime(previousAnimationTime, zombie.animationTime,
                            ZOMBIE_EAT_RIGHT_HAND_TIME * ZOMBIE_EAT_FRAME_SPAN)) {
                        world.get(target, PlantComponent)!.eatenFlashCounter = HIT_FLASH_TICKS
                        emitServerEvent(world.resources.get(EventQueueResource), 'zombieChewedPlant', {
                            zombieId: entity,
                            plantId: target,
                        })
                    }
                    zombie.biteTicks++
                    if (zombie.biteTicks >= definition.bite.cadenceTicks) {
                        zombie.biteTicks = 0
                        const plant = world.get(target, PlantComponent)!
                        plant.health = Math.max(0, plant.health - definition.bite.damage)
                        if (plant.health === 0) commands.destroyEntity(target)
                    }
                }

                if (position.x <= BOARD_EDGE) {
                    level.result = 'lost'
                    emitServerEvent(world.resources.get(EventQueueResource), 'levelLost', {
                        zombieId: entity,
                    })
                    return
                }
            }
        },
    }
}

export function spawnZombie(
    world: World,
    definitions: GameplayDefinitionsV2,
    typeId: string,
    row: number,
    x: number,
    y: number,
): number {
    const definition = definitions.zombies[typeId]
    if (!definition) throw new Error(`Unknown zombie: ${typeId}`)
    const random = world.resources.get(RandomResource)
    const entity = world.createEntity()
    world.add(entity, PositionComponent, { x, y, row })
    world.add(entity, ZombieComponent, {
        typeId,
        health: definition.maxHealth,
        maxHealth: definition.maxHealth,
        state: 'walking',
        groanCounter: random.integer(300, 400),
        speedPerTick: definition.speedPerTick.min +
            random.nextFloat() *
            (definition.speedPerTick.max - definition.speedPerTick.min),
        biteTicks: 0,
        deathTicksRemaining: 0,
        moweredTicksRemaining: 0,
        walkAnimation: 'anim_walk',
        animation: 'anim_walk',
        animationTime: 0,
        animationSpeed: walkAnimationSpeed(definition.speedPerTick.min),
        hasHead: true,
        hasArm: true,
        hitFlashCounter: 0,
    })
    const zombie = world.get(entity, ZombieComponent)!
    zombie.walkAnimation = random.integer(0, 1) === 0 ? 'anim_walk' : 'anim_walk2'
    zombie.animation = zombie.walkAnimation
    zombie.animationSpeed = walkAnimationSpeed(zombie.speedPerTick)
    return entity
}

export function damageZombie(world: World, entity: number, damage: number): void {
    const zombie = world.get(entity, ZombieComponent)
    if (!zombie || zombie.state === 'dying' || zombie.state === 'mowered' || damage <= 0) return
    zombie.hitFlashCounter = HIT_FLASH_TICKS
    zombie.health = Math.max(0, zombie.health - damage)
    const events = world.resources.get(EventQueueResource)
    if (zombie.hasArm && zombie.health > 0 && zombie.health < zombie.maxHealth * 2 / 3) {
        zombie.hasArm = false
        emitServerEvent(events, 'zombiePartDropped', { entityId: entity, part: 'arm' })
    }
    if (zombie.hasHead && zombie.health < zombie.maxHealth / 3) {
        zombie.hasHead = false
        emitServerEvent(events, 'zombiePartDropped', { entityId: entity, part: 'head' })
    }
    if (zombie.health === 0) startZombieDeath(world, entity, zombie)
}

export function mowZombie(zombie: Zombie): void {
    if (zombie.state === 'dying' || zombie.state === 'mowered') return
    zombie.health = 0
    zombie.state = 'mowered'
    zombie.animation = 'mowered'
    zombie.animationTime = 0
    zombie.animationSpeed = ZOMBIE_MOWERED_ANIMATION_SPEED
    zombie.biteTicks = 0
    zombie.deathTicksRemaining = 0
    zombie.moweredTicksRemaining = ZOMBIE_MOWERED_TICKS
}

function startZombieDeath(world: World, entity: number, zombie: Zombie): void {
    if (zombie.state === 'dying') return
    const random = world.resources.get(RandomResource)
    zombie.state = 'dying'
    zombie.animation = random.integer(0, 99) >= 51 ? 'anim_death2' : 'anim_death'
    zombie.animationTime = 0
    const rate = ZOMBIE_DEATH_RATE_MIN + random.nextFloat() * (ZOMBIE_DEATH_RATE_MAX - ZOMBIE_DEATH_RATE_MIN)
    zombie.animationSpeed = rate / ZOMBIE_ASSET_FPS
    zombie.deathTicksRemaining = Math.ceil(deathFrameSpan(zombie.animation) / rate * TICKS_PER_SECOND) + ZOMBIE_DEATH_HOLD_TICKS
}

function updateHeadlessZombie(world: World, entity: number, zombie: Zombie): void {
    if (world.resources.get(RandomResource).integer(0, 4) !== 0) return
    zombie.health = Math.max(0, zombie.health - 1)
    if (zombie.health === 0) startZombieDeath(world, entity, zombie)
}

function walkAnimationSpeed(speed: number): number {
    return speed * ZOMBIE_WALK_GROUND_X.length / ZOMBIE_WALK_DISTANCE * ZOMBIE_WALK_RATE_FACTOR / ZOMBIE_ASSET_FPS
}

function walkFrameAdvance(speed: number): number {
    return walkAnimationSpeed(speed) * ZOMBIE_ASSET_FPS / TICKS_PER_SECOND
}

function sampleWalkGround(time: number): number {
    const left = Math.max(0, Math.min(ZOMBIE_WALK_GROUND_X.length - 1, Math.floor(time)))
    const right = Math.min(ZOMBIE_WALK_GROUND_X.length - 1, left + 1)
    const t = time - left
    return ZOMBIE_WALK_GROUND_X[left] + (ZOMBIE_WALK_GROUND_X[right] - ZOMBIE_WALK_GROUND_X[left]) * t
}

function didCrossLoopingTime(previous: number, current: number, target: number): boolean {
    return current >= previous
        ? previous < target && target <= current
        : previous < target || target <= current
}

function deathFrameSpan(animation: Zombie['animation']): number {
    return animation === 'anim_death2' ? ZOMBIE_DEATH2_FRAME_SPAN : ZOMBIE_DEATH_FRAME_SPAN
}

function findPlantTarget(
    world: World,
    definitions: GameplayDefinitionsV2,
    zombiePosition: Position,
    attack: { x: number, y: number, width: number, height: number },
): number | undefined {
    let target: number | undefined
    let targetX = Infinity
    for (const entity of world.query(PositionComponent, PlantComponent)) {
        const position = world.get(entity, PositionComponent)!
        if (position.row !== zombiePosition.row) continue
        const plant = world.get(entity, PlantComponent)!
        const body = definitions.plants[plant.typeId].body
        const overlap = Math.min(
            zombiePosition.x + attack.x + attack.width,
            position.x + body.x + body.width,
        ) - Math.max(zombiePosition.x + attack.x, position.x + body.x)
        if (overlap < 20) continue
        if (position.x < targetX || (position.x === targetX && entity < (target ?? Infinity))) {
            target = entity
            targetX = position.x
        }
    }
    return target
}

function hasTargetAhead(
    world: World,
    definitions: GameplayDefinitionsV2,
    plantPosition: Position,
    plant: Plant,
): boolean {
    const attackX = plantPosition.x + definitions.plants[plant.typeId].body.width
    for (const entity of world.query(PositionComponent, ZombieComponent)) {
        const position = world.get(entity, PositionComponent)!
        const zombie = world.get(entity, ZombieComponent)!
        if (zombie.health <= 0 || position.row !== plantPosition.row) continue
        const body = definitions.zombies[zombie.typeId].body
        if (position.x + body.x >= DAY_BOARD_RIGHT) continue
        if (position.x + body.x + body.width >= attackX) return true
    }
    return false
}

function findProjectileTarget(
    world: World,
    definitions: GameplayDefinitionsV2,
    projectilePosition: Position,
    hitbox: { x: number, y: number, width: number, height: number },
): number | undefined {
    let target: number | undefined
    let targetX = Infinity
    for (const entity of world.query(PositionComponent, ZombieComponent)) {
        const position = world.get(entity, PositionComponent)!
        const zombie = world.get(entity, ZombieComponent)!
        if (zombie.health <= 0 || position.row !== projectilePosition.row) continue
        const body = definitions.zombies[zombie.typeId].body
        const overlap = Math.min(
            projectilePosition.x + hitbox.x + hitbox.width,
            position.x + body.x + body.width,
        ) - Math.max(projectilePosition.x + hitbox.x, position.x + body.x)
        if (overlap <= 0) continue
        if (position.x < targetX || (position.x === targetX && entity < (target ?? Infinity))) {
            target = entity
            targetX = position.x
        }
    }
    return target
}
