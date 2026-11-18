import type { BoardDefinition, LevelDefinition } from '@/shared/content/gameplay'
import type { JsonObject, Team } from '@/shared/protocol'
import type { WavePlan } from '../rules/registry'
import type { DeterministicRng } from './DeterministicRng'
import { defineResource } from './World'

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

export const LevelStateResource = defineResource<LevelState>('pvz:level-state')

export const EconomyStateResource = defineResource<EconomyState>('pvz:economy-state')

export const RandomResource = defineResource<DeterministicRng>('pvz:random-state')
export const BoardSeedResource = defineResource<number>('pvz:board-seed')

export const SeedBankResource = defineResource<SeedBankState>('pvz:seed-bank')

/** The seed-slot upgrade Crazy Dave may sell in this intro (see StartSessionPacket); intros are never saved, nor is this. */
export interface PacketUpgradeOffer { cost: number }
export const PacketUpgradeOfferResource = defineResource<PacketUpgradeOffer>('pvz:packet-upgrade-offer')

/**
 * Every step of every base tutorial script (Board::mTutorialState), `complete` once a script is done or has none. A
 * Mod's script names its own steps in its namespace (`example:dig`).
 */
export const TUTORIAL_STEPS = [
    'pick-first-seed', 'plant-first-seed', 'first-plant-done', 'collect-first-sun', 'collect-more-sun', 'enough-sun',
    'pick-second-seed', 'plant-second-seed', 'complete',
    'pick-sunflower', 'plant-sunflower', 'refresh-sunflower', 'waiting-for-sunflowers',
    'dave-opening', 'shovel-pickup', 'shovel-dig', 'shovel-keep-digging', 'dave-bowling',
    'whack-before-pick-seed', 'whack-pick-seed', 'whack-done',
] as const

export type TutorialStep = typeof TUTORIAL_STEPS[number] | `${string}:${string}`

export interface TutorialState {
    dialogIndex?: number
    firstAdventure: boolean
    step: TutorialStep
    promptAtTick?: number
    /** The advice shown this game, each once (Board::mHelpDisplayed). */
    displayedAdvice: string[]
}

export interface WaveState {
    index: number
    /** When the lawn's graves raise their zombies after the last wave (updateGraveSpawns). */
    graveRiseAtTick?: number
    /** Every wave of this game, built when it starts and kept by saves. */
    plan: WavePlan[]
    /** When the next wave comes (mZombieCountDown), for the wave system or a rule that counts its own; unset while none is due. */
    nextWaveAtTick?: number
    accelerateAtTick?: number
    zombieIds: number[]
    healthToNextWave: number
    /** The wave Board::NextWaveComing last ran for (nextWaveComing). */
    announcedWave?: number
    hugeWaveAnnounced: boolean
    rowPicks?: Array<{ row: number; lastPicked: number; secondLastPicked: number; mowedAtWave?: number }>
    /** What the level's rules keep through the game, in their own format (LevelRuleDefinition.parseState). */
    ruleState?: JsonObject
}

/** The sky's sun (Board::mSunCountDown, mNumSunsFallen): when it next drops one, none while held back, and how many it has. */
export interface SkySunState {
    atTick?: number
    fallen: number
}

export const TutorialResource = defineResource<TutorialState>('pvz:tutorial-state')
export const WaveResource = defineResource<WaveState>('pvz:wave-state')
export const SkySunResource = defineResource<SkySunState>('pvz:sky-sun')
