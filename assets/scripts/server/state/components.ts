import type { Zombie } from '../zombies/Zombie'
import type { Plant } from '../plants/Plant'
import type { Projectile } from '../combat/Projectile'
import type { Mower } from '../level/Mower'
import type { BoardDefinition, LevelDefinition } from '@/shared/content/gameplay'
import type { DeterministicRng } from './DeterministicRng'
import { defineComponent, defineResource } from '@/ecs/index'
import type { CraterSnapshot, GraveSnapshot, Team } from '@/shared/protocol'
import type { LayerState } from '@/shared/content/animation'

export type { Mower, Plant, Projectile, Zombie }

export interface Position {
    x: number
    y: number
    row: number
}

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

/** A plant: the instance of its kind's class, all there is to it (plants/Plant.ts). */
export const PlantComponent = defineComponent<Plant>('pvz:plant')


/**
 * A plant a mower has crushed, as it stood: no plant any more (nothing aims at it, eats it or holds its cell by it), it
 * stays for the squashing, as a mowed zombie does: `squash` plays the mower's driver (MOWERED_ANIMATION) as a mowed
 * zombie's body does, and it is gone once that is through. `left`: the mower ran left, so it tips that way.
 */
export interface MowedPlant { plant: Plant, squash: LayerState, left?: true }

export const MowedPlantComponent = defineComponent<MowedPlant>('pvz:mowed_plant')

/** A zombie: the instance of its kind's class, all there is to it (zombies/Zombie.ts). */
export const ZombieComponent = defineComponent<Zombie>('pvz:zombie')

/**
 * What stands in a cell without being a plant or a zombie (GridItemSnapshot), by its type: its cell is its own, so it
 * has no position.
 */
export type Grave = Omit<GraveSnapshot, 'entityId'>
export type Crater = Omit<CraterSnapshot, 'entityId'>
export type GridItem = Grave | Crater

export const GridItemComponent = defineComponent<GridItem>('pvz:grid_item')

/** A projectile in flight, of its kind (combat/Projectile.ts): a mower set off runs as one (MowingProjectile). */
export const ProjectileComponent = defineComponent<Projectile>('pvz:projectile')

/** A row's lawn mower waiting at its house end (level/Mower.ts). */
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
