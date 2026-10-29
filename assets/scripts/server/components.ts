import type { BoardDefinition, LevelDefinition } from '@/shared/content/gameplay'
import type { DeterministicRng } from './DeterministicRng'
import { defineComponent, defineResource } from '@/ecs/index'
import type { EntityBehaviorState } from '@/shared/protocol'

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

export interface Plant extends EntityBehaviorState {
    typeId: string
    seedId: string
    column: number
    health: number
    maxHealth: number
    eatenFlashCounter: number
    /** Ticks since the last bite, from Plant::mRecentlyEatenCountdown; wall-nuts freeze while it runs. */
    recentlyEatenCounter: number
    /** Fuse, mine, chomper, sun-shroom growth or grave buster progress; `ticks` counts down to the next state. */
    ability?: PlantAbility
}

export type PlantAbilityState =
    | 'fuse'
    | 'arming' | 'rising' | 'armed'
    | 'ready' | 'biting' | 'got-one' | 'missed' | 'digesting' | 'swallowing'
    | 'small' | 'growing' | 'big'
    | 'landing' | 'eating'

export interface PlantAbility {
    state: PlantAbilityState
    ticks: number
}

export interface PlantAttack {
    readyAtTick: number
    fireAtTick?: number
    shotsRemaining?: number
}

export type ZombieAnimation =
    | 'anim_walk' | 'anim_walk2' | 'anim_run' | 'anim_jump' | 'anim_eat' | 'anim_gasp' | 'anim_death' | 'anim_death2' | 'mowered'

export interface Zombie extends EntityBehaviorState {
    typeId: string
    health: number
    maxHealth: number
    /** `burned` holds a blackened headless zombie until it crumbles. */
    state: 'walking' | 'eating' | 'vaulting' | 'dying' | 'burned' | 'mowered'
    /** Walking speed; while vaulting, the horizontal jump speed. */
    speedPerTick: number
    biteTicks: number
    /** Also counts down a burned zombie. */
    deathTicksRemaining: number
    moweredTicksRemaining: number
    walkAnimation: 'anim_walk' | 'anim_walk2'
    animation: ZombieAnimation
    animationTime: number
    animationSpeed: number
    hasHead: boolean
    hasTongue: boolean
    hasArm: boolean
    hitFlashCounter: number
    /** The last hit passed the shield into the body (DAMAGE_HITS_SHIELD_AND_BODY): both flash and the shield does not recoil. */
    hitThroughShield?: true
    groanCounter: number
    helmHealth: number
    chilledTicks: number
    /** Pole vaulters run with the pole until their single vault. */
    hasPole: boolean
    /** Newspaper gasp and grave emergence progress, persisted with the entity. */
    enrageTicks?: number
    riseTicks?: number
}

export interface Projectile {
    typeId: string
    sourcePlantId?: number
    /** Updates left before a limited-lifetime projectile disappears. */
    ticksLeft?: number
}

/** A bank packet is picked by slot, so a bank may hold the same seed twice with separate recharges. */
export type SeedSelection = { mode: 'none' } | { mode: 'seed'; slot: number }
    | { mode: 'conveyor'; packetId: number } | { mode: 'tool'; toolId: string }

export interface SeedBankState {
    selection: SeedSelection
    conveyor?: { nextId: number; spawnAtTick: number; moveTicks: number; lastSeedId?: string; packets: Array<{ id: number; seedId: string; x: number }> }
    choosing?: boolean
    packets: Array<{ seedId: string, readyAtTick: number, cooldownTotal?: number }>
}

export const MAX_SUN = 9990

export interface EconomyState {
    sun: number
    money: number
    pendingSunSpend: number
}

export interface LevelState {
    id: string
    definition: LevelDefinition
    board: BoardDefinition
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

/** Removes entities; systems pass their command buffer so queries stay consistent. */
export interface EntityRemover { destroyEntity(entity: number): unknown }
