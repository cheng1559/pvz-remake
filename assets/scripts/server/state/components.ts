import type { ZombieState } from '@/shared/content/zombieStates'
import type { PlantAbilityState } from '@/shared/content/plantAbilities'
import type { BoardDefinition, LevelDefinition, ProjectileDefinition } from '@/shared/content/gameplay'
import type { DeterministicRng } from './DeterministicRng'
import { defineComponent, defineResource } from '@/ecs/index'
import type { EntityBehaviorState, GraveSnapshot, GridItemSnapshot, JsonObject, MowerState, Team } from '@/shared/protocol'
import type { LayerState } from '@/shared/content/animation'

export interface Position {
    x: number
    y: number
    row: number
}

export interface Plant extends EntityBehaviorState {
    typeId: string
    seedId: string
    column: number
    health: number
    maxHealth: number
    /** Ticks since the last bite, from Plant::mRecentlyEatenCountdown; wall-nuts freeze while it runs. */
    recentlyEatenCounter: number
    /** Fuse, mine, chomper, sun-shroom growth or grave buster progress; `ticks` counts down to the next state. */
    ability?: PlantAbility
    /** Its side when not the plants' (see teams.ts). */
    team?: Team
    /** Brought over to the other side by swallowing a plant that mind-controls (see zombies/mindControl.ts), which tints it. */
    mindControlled?: true
    /** Ticks left slowed by a hostile snow pea (see plants/chill.ts); 0 when not chilled. */
    chilledTicks: number
    /** Ticks left frozen by a hostile ice-shroom, doing nothing (see combat/freeze.ts); absent when not frozen. */
    frozenTicks?: number
    /** What each layer of its animation plays now (PlantDefinition.animation); see plants/animation.ts. */
    animations?: Record<string, LayerState>
    /** Ticks to its next blink (Plant::mBlinkCountdown). */
    blinkTicks?: number
}

export interface PlantAbility {
    state: PlantAbilityState
    ticks: number
    /** A chomper chewing a plant rather than a zombie, until it is ready again. */
    prey?: 'plant'
}

export interface PlantAttack {
    readyAtTick: number
    /** A burst under way: the tick of its next shot and the shots left in it. */
    burst?: { fireAtTick: number, shotsRemaining: number }
}

export interface Zombie extends EntityBehaviorState {
    typeId: string
    health: number
    maxHealth: number
    state: ZombieState
    /** Walking speed; while vaulting, the horizontal jump speed. */
    speedPerTick: number
    biteTicks: number
    /** Also counts down a burned zombie. */
    deathTicksRemaining: number
    /** The clip it walks on, drawn as it comes (`walk` or `walk2`). */
    walkClip: string
    /**
     * What its body plays now (ZombieDefinition.animation), its one layer; see zombies/animation.ts. The rates are
     * those of an unchilled zombie: a chilled one's animation goes at half of them (zombiePace).
     */
    animations: Record<string, LayerState>
    hasHead: boolean
    hasTongue: boolean
    hasArm: boolean
    /** Zombie::mDroppedLoot: the one loot roll has happened. */
    droppedLoot?: true
    groanCounter: number
    /** Zombie::mHelmHealth and mShieldHealth; 0 once dropped or without one. */
    helmHealth: number
    shieldHealth: number
    chilledTicks: number
    /**
     * Zombie::mIceTrapCounter: ticks left frozen by a hostile ice-shroom (see combat/freeze.ts), standing still in its
     * block of ice; absent when not frozen.
     */
    frozenTicks?: number
    /** Pole vaulters run with the pole until their single vault. */
    hasPole: boolean
    /** Newspaper gasp and grave emergence progress, persisted with the entity. */
    enrageTicks: number
    riseTicks: number
    /** Its side when not the zombies': `plants` when mind-controlled or put down on that side (see teams.ts). */
    team?: Team
    /**
     * Zombie::mMindControlled: brought over to a plant's side by a plant that mind-controls (the hypno-shroom), which
     * tints it; one put down on the plants' side is not.
     */
    mindControlled?: true
}

export interface Projectile {
    typeId: string
    /** Projectile::mProjectileAge: the ticks it has flown, counted as each of its updates starts. */
    age: number
    /** What it is as it was set off: its type's definition, with what its launcher has its own way (shooter.overrides). */
    definition: ProjectileDefinition
    /** The side that fired it, when not the plants'. */
    team?: Team
    /** A mowing one's (ProjectileDefinition.mow) ticks left chewing, slowed (LawnMower::mChompCounter). */
    chompCounter?: number
    /** The motion it flies by (ProjectileMotionRegistry), its launcher's: a plant's attack (PLANT_ATTACKS), or the level's for its mowers. */
    motion: string
    /** What its motion keeps as it flies (ProjectileMotionDefinition.launch). */
    motionState?: JsonObject
    /** What a piercing one has hit, by entity: it hits each once (ProjectileDefinition.pierce). */
    hits?: number[]
}

/**
 * A row's lawn mower (the original's LawnMower), from the level's start, where it waits at its row's house end
 * (MOWER_READY_X), to its end. Set off (`triggered`), it also runs as the level's mowing projectile
 * (LevelDefinition.lawnMower, ProjectileComponent), which the projectile system flies; a ready one turns into gold
 * once the level is won (updateMowerCoins). See level/mower.ts.
 */
export interface Mower { state: MowerState }

/** A bank packet is picked by slot, so a bank may hold the same seed twice with separate recharges. */
export type SeedSelection = { mode: 'none' } | { mode: 'seed'; slot: number }
    | { mode: 'conveyor'; packetId: number } | { mode: 'tool'; toolId: string }

/**
 * A seed card, the same in a bank slot and on the conveyor belt: its seed, and `team`, the side of what it puts down
 * when not its seed's own (packetTeam; from `/seed`).
 */
export interface SeedCard { seedId: string, team?: Team }

/** A bank packet: its card and its recharge. */
export interface SeedPacketState extends SeedCard { readyAtTick: number, cooldownTotal: number }

/** A packet on the conveyor belt: the belt's own id and position for it, and the card it carries. */
export interface ConveyorPacketState { id: number; x: number; card: SeedCard }

/**
 * A repick under way: `packets`, the bank as it stood before, its size and each packet's recharge; `chooser`, whether
 * the level had opened the chooser; `confirmed`, Let's Rock pressed and the chooser lifting out (`finishRepick`). It
 * is never saved: a save made meanwhile holds the bank from before, or once confirmed, the bank chosen.
 */
export interface SeedRepick { chooser: boolean, packets: Array<SeedPacketState | null>, confirmed?: true }

export interface SeedBankState {
    selection: SeedSelection
    conveyor?: { nextId: number; spawnAtTick: number; moveTicks: number; lastSeedId?: string; packets: ConveyorPacketState[] }
    choosing?: boolean
    /**
     * The bank's slots in order; `null` is an empty one: a slot Let's Rock left unchosen (finishSeedChoice) or emptied
     * by `/seed {slot} empty`. While choosing, the chosen packets come one after another with no empty slots.
     */
    packets: Array<SeedPacketState | null>
    /**
     * `/repick` in play, as Survival's repick (CutScene::IsSurvivalRepick): the level stands still while the bank, its
     * cards still chosen, is chosen again for its size. A card chosen again picks up the recharge it had in the bank
     * before (SeedChooserScreen keeps each seed's mRefreshCounter), any other is ready; the bank goes back to the
     * level's own state, chosen or dealt, after.
     */
    repick?: SeedRepick
    /** The seeds the player owns, from the start packet; absent, every catalog seed (see availableSeeds). */
    owned?: string[]
}

export interface EconomyState {
    sun: number
    /** The player's coins, from the profile at start or restore; collected money adds to it. */
    money: number
    pendingSunSpend: number
    /** Board::mDroppedFirstCoin. */
    firstCoinDropped?: true
    /**
     * Seed-slot upgrades the player owns now (PlayerInfo::mPurchases), which Board::DropLootPiece reads for a diamond:
     * the profile's, put in at start, by the store while the level is up, with a restore and by an upgrade bought in the
     * level. Not saved: a restore takes it from the profile.
     */
    ownedUpgrades: number
    /**
     * Seed-slot upgrades owned (PlayerInfo::mPurchases); the chooser adds a slot for each (Board::GetNumSeedsInBank).
     * From the profile at start; a save keeps the count its bank was chosen with.
     */
    packetUpgrades: number
    /** Board::mScoreNextMowerCounter: after the award, ticks until the next unused mower becomes a gold coin. */
    mowerCoinTicks?: number
}

export interface LevelState {
    id: string
    definition: LevelDefinition
    board: BoardDefinition
    phase: 'intro' | 'gameplay'
    result: 'playing' | 'won' | 'lost'
    paused: boolean
    /**
     * Board::mIceTrapCounter: ticks left since an ice-shroom froze a side, by the side frozen (see combat/freeze.ts).
     * What waits on it (the original's zombies from the pool and the sky, a zombie stepping into the pool) is not yet in.
     */
    iceTrap?: Partial<Record<Team, number>>
}

export const PositionComponent = defineComponent<Position>('pvz:position')

export const PlantComponent = defineComponent<Plant>('pvz:plant')

export const PlantAttackComponent = defineComponent<PlantAttack>('pvz:plant_attack')

/**
 * A plant a mower has crushed, as it stood: no plant any more (nothing aims at it, eats it or holds its cell by it), it
 * stays for the squashing, as a mowed zombie does: `squash` plays the mower's driver (MOWERED_ANIMATION) as a mowed
 * zombie's body does, and it is gone once that is through. `left`: the mower ran left, so it tips that way.
 */
export interface MowedPlant { plant: Plant, squash: LayerState, left?: true }

export const MowedPlantComponent = defineComponent<MowedPlant>('pvz:mowed_plant')

export const ZombieComponent = defineComponent<Zombie>('pvz:zombie')

/**
 * What stands in a cell without being a plant or a zombie (GridItemSnapshot), by its type: its cell is its own, so it
 * has no position.
 */
export type GridItem = Omit<GridItemSnapshot, 'entityId'>
export type Grave = Omit<GraveSnapshot, 'entityId'>

export const GridItemComponent = defineComponent<GridItem>('pvz:grid_item')

export const ProjectileComponent = defineComponent<Projectile>('pvz:projectile')

export const MowerComponent = defineComponent<Mower>('pvz:mower')

export const LevelStateResource = defineResource<LevelState>('pvz:level-state')

export const EconomyStateResource = defineResource<EconomyState>('pvz:economy-state')

export const RandomResource = defineResource<DeterministicRng>('pvz:random-state')

export const SeedBankResource = defineResource<SeedBankState>('pvz:seed-bank')

/** The seed-slot upgrade Crazy Dave may sell in this intro (see StartSessionPacket); intros are never saved, nor is this. */
export interface PacketUpgradeOffer { cost: number }
export const PacketUpgradeOfferResource = defineResource<PacketUpgradeOffer>('pvz:packet-upgrade-offer')

/** Removes entities; systems pass their command buffer so queries stay consistent. */
export interface EntityRemover { destroyEntity(entity: number): unknown }
