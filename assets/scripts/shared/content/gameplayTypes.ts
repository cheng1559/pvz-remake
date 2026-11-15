import type { JsonObject, Team } from '@/shared/protocol'
import type { PlantAbilityState } from './plantAbilities'

/** The gameplay definitions' types (GameplayDefinitions, GameplayLevels), and the fixed names and places they share. */

/** Board pixel where collected sun flies to: the sun counter in the original 800-wide layout. */
export const SUN_BANK_TARGET = { x: 15, y: 0 } as const

/**
 * SeedChooserScreen's grid, the original's plant seed types: 0-39 in five rows, and the upgrade plants 40-47 in a sixth
 * once the chooser has seven rows (SeedChooserScreen::Has7Rows). 48 is the Imitater's, drawn on its own button, and
 * the hidden seeds follow from 49 (SEED_EXPLODE_O_NUT); none of those is offered.
 */
export const CHOOSER_PLACES = 48

/** The places in the chooser's usual five rows. */
export const FIVE_ROW_PLACES = 40

/** A seed's place in the chooser grid (SeedChooserScreen::GetSeedPositionInChooser), in reading order from 0. */
export interface SeedCatalogEntry { position: number }

export interface GameplayDefinitions {
    schemaVersion: 2
    /** Board::AddSun and PlayerInfo::AddCoins cap the sun at 9990 and the coins at 99999 (shown as $999,990). */
    economy: { maxSun: number; maxMoney: number }
    boards: Record<string, BoardDefinition>
    seeds: Record<string, SeedDefinition>
    /**
     * The chooser catalog, a table like the others: a Mod adds its own seeds and moves anyone's through `overrides`.
     * A place left out stays empty in the grid.
     */
    seedCatalog: Record<string, SeedCatalogEntry>
    plants: Record<string, PlantDefinition>
    zombies: Record<string, ZombieDefinition>
    projectiles: Record<string, ProjectileDefinition>
    items: Record<string, ItemDefinition>
    /** The achievements, in their screen order (base first, then each Mod's). */
    achievements: Record<string, AchievementDefinition>
    /** Board::GetNumSeedsInBank: `baseSlots` plus one per seed-slot upgrade, at most `maxSlots` (SEEDBANK_MAX). */
    /**
     * `startingSeeds` are every player's without being awarded or bought (the Peashooter: LawnApp::HasSeedType with
     * GetAwardSeedForLevel(1) = 1); the profile records the rest.
     */
    seedBank: { baseSlots: number; maxSlots: number; startingSeeds: string[] }
}

export interface GameplayLevels {
    schemaVersion: 2
    levels: Record<string, LevelDefinition>
}

/** Where a level's mower waits, its left edge (LawnMower::LawnMowerInitialize). */
export const MOWER_READY_X = -21

export interface BoardDefinition {
    /** Nocturnal plants sleep on boards that are not at night. */
    night?: boolean
    bounds: { left: number; right: number }
    rows: number
    columns: number
    origin: Point
    cell: { width: number; height: number }
}

interface SeedCommon {
    sunCost: number
    cooldownTicks: number
    initialCooldownTicks?: number
}

/** A seed that plants the plant `id`. */
export interface PlantSeedDefinition extends SeedCommon {
    kind: 'plant'
    /** The plant it plants: the seed's own ID unless its definition names another. */
    id: string
    /** `grave`: only on a grave, like the Grave Buster (PLANTING_ONLY_ON_GRAVES). */
    placement: 'ground' | 'grave'
}

/**
 * A seed that places the zombie `id` (the original's SEED_ZOMBIE_*, Challenge::IZombiePlaceZombie), usable on any level:
 * in any cell of an active row, whatever stands there, on the zombies' side unless its packet says otherwise.
 */
export interface ZombieSeedDefinition extends SeedCommon {
    kind: 'zombie'
    /** The zombie it places: the seed's own ID unless its definition names another. */
    id: string
}

/**
 * A seed that puts down a grave, which the original has no seed for: in any cell of an active row, as Grave Danger's
 * graves come (Challenge::GraveDangerSpawnGraveAt: the plants there die), but not in a cell with a grave already. Its
 * zombies rise on the grave's side, the zombies' unless its packet says otherwise.
 */
export interface GraveSeedDefinition extends SeedCommon {
    kind: 'grave'
}

/** A seed, told apart by `kind`: a new kind is one more definition here, none of the others change. */
export type SeedDefinition = PlantSeedDefinition | ZombieSeedDefinition | GraveSeedDefinition

export type SeedKind = SeedDefinition['kind']

/** Damages zombies whose body overlaps the circle; `burn` chars them like the original ApplyBurn. */
export interface ExplosionDefinition {
    offset: Point
    radius: number
    rowRange: number
    damage: number
    burn: boolean
}

export interface PlantTargeting {
    eatingExtraRange: number
    excludeHeldPole: boolean
    insetKey?: string
    /**
     * Not in the original, whose plants never face each other: against hostile plants, the attack rect and the blast
     * sit this much further forward (the potato mine's half cell).
     */
    plantReach?: number
}

/** At most one ability; a plant without one only blocks, like the wall-nut. */
export interface PlantDefinition {
    occupiesCell?: boolean
    plantingOffset?: { min: Point; max: Point }
    /** Mushrooms: asleep, doing nothing, on a board that is not at night. */
    nocturnal?: boolean
    /** Projectile::FindCollisionTargetPlant: so low that projectiles fly over it (the puff-shroom, the potato mine). */
    low?: boolean
    maxHealth: number
    body: Rect
    /** JSON configuration consumed by a registered plant behavior. */
    behavior?: JsonObject
    /**
     * A plant that attacks on a rhythm, written as `shooter`, `lobber` or `seeker` (`type`): the three keep the same
     * rhythm and differ in what they aim at and how what they fire flies (PLANT_ATTACKS), as Plant::Fire picks the
     * motion by the plant. A projectile says how fast and the like (ProjectileDefinition), not which way it flies.
     */
    shooter?: {
        /**
         * `shooter`: at the first thing ahead on its row, straight along it. `lobber`: at the same, thrown up to come
         * down on it. `seeker`: at the nearest thing anywhere, homing on it.
         */
        type: PlantAttack
        cadenceTicks: { min: number; max: number }
        initialDelayTicks: { min: number; max: number }
        windupTicks: number
        shotsPerBurst: number
        burstIntervalTicks: number
        /**
         * Exactly one of `projectile` and `area`; only a `shooter` has an `area`. Written as the projectile's id, or as
         * `{id, ...}` with what this plant's are to have their own way (`overrides`).
         */
        projectile?: string
        /** What of its projectile this plant's have their own way, the rest as the projectile is defined. */
        overrides?: ProjectileOverrides
        /** Plant::DoRowAreaDamage: hits every zombie in the row within reach, like the Fume-shroom. */
        area?: { damage: number; hitsShieldAndBody: boolean }
        /**
         * Its mouth: where the middle of what it fires (of its hitbox) leaves, whatever its size. Within the plant, or
         * from its `anchor`.
         */
        offset: Point
        /**
         * Plant::GetPeaHeadOffset: the mouth goes with a part of the plant as it moves, this track of the clip that
         * layer of its animation plays (the stem a pea shooter's head sways on).
         */
        anchor?: { layer: string; track: string }
        /** Reach beyond the plant body, like the puff-shroom's 230; unlimited when omitted. A `seeker` reaches everywhere. */
        range?: number
    }
    producer?: {
        item: string
        cadenceTicks: number
        initialDelayTicks: { min: number; max: number }
        /** Sun-shroom: produces `smallItem` until it grows after `ticks`, pausing production while growing. */
        growth?: { ticks: number; growingTicks: number; smallItem: string }
    }
    /** Lands, eats the grave in its cell, then disappears; shovels cannot dig it. */
    graveBuster?: { landTicks: { min: number; max: number }; eatTicks: number }
    /** Explodes after the fuse; zombies cannot damage it meanwhile. */
    fuse?: { ticks: number; explosion: ExplosionDefinition }
    /** Arms underground, rises, then explodes when a zombie enters the attack rect. */
    mine?: { armingTicks: number; riseTicks: number; attack: Rect; targeting: PlantTargeting; explosion: ExplosionDefinition }
    /** Swallows the first zombie in reach, then digests before it can bite again. */
    chomper?: { attack: Rect; targeting: PlantTargeting; biteDelayTicks: number; biteTicks: number; digestTicks: number; swallowTicks: number }
    /** Explodes when eaten or otherwise destroyed by zombies. */
    deathExplosion?: ExplosionDefinition
    /**
     * What it plays, which the server keeps (server/plants/animation.ts); a plant without one is animated by its view.
     * With `from`, it plays another's (the explode-o-nut the wall-nut's), adding what it writes of its own (withFrom).
     */
    animation?: PlantAnimationDefinition
}

/**
 * One clip of an animation, a plant's or a zombie's, under the name its presentation has the pictures under. It loops
 * unless it has a `next`, is `once` or is held.
 */
export interface AnimationClip {
    /** How long it is, in frames: a loop comes round, and a clip played once ends, after this many (Reanimation::mFrameCount). */
    frames: number
    /** Frames a second (Reanimation::mAnimRate), drawn when the clip starts; written as a number or as `[min, max]`. */
    fps?: { min: number; max: number }
    /** In place of `fps`: it starts where that layer is and goes at its rate (a pea shooter's head idles with its body). */
    sync?: string
    /**
     * It lasts the ticks its plant's ability has left as it starts (a grave buster's landing). With `fps` too, that is its
     * pace where there is nothing to fit, off the board.
     */
    fit?: true
    /** Plant::AnimateNuts: while zombies chew the plant it all but stops, and goes on at a rate drawn anew once they leave it. */
    chewed?: true
    /** It plays once, and its layer goes on to this clip. */
    next?: string
    /** It plays once, and its layer is gone (a blink). */
    once?: true
    /** It plays once, and stays on its last frame (REANIM_PLAY_ONCE_AND_HOLD) until its layer plays another. */
    hold?: true
    /** How far into itself it starts, a part of its length drawn when it does; written `[min, max]`. From its start when omitted. */
    start?: { min: number; max: number }
    /** Where parts of the plant are in each of its frames, for what goes with them (PlantDefinition.shooter.anchor). */
    tracks?: Record<string, Point[]>
    /**
     * In place of `fps`: where the ground is under it in each of its frames (the Reanim's `_ground`). What walks on it
     * goes as far as its ground does, and it goes at the rate that takes its walker at the walker's speed
     * (Zombie::UpdateAnimSpeed).
     */
    ground?: number[]
    /**
     * The parts of its length at which what it shows happens (Reanimation::ShouldTriggerTimedEvent): the bites of a
     * zombie eating, the fall of one dying.
     */
    marks?: number[]
}

/** What a plant or a zombie plays: its clips, and its layers with the clip each starts on. */
export interface AnimationDefinition {
    clips: Record<string, AnimationClip>
    /**
     * Its layers, drawn in this order (a later one on an earlier one's part), and the clip each starts with; `null`
     * for one that is not there until something plays a clip on it.
     */
    layers: Record<string, string | null>
}

export interface PlantAnimationDefinition extends AnimationDefinition {
    /** The clips its layers play from the start as its ability comes to a state (Plant::PlayBodyReanim as mState changes). */
    states?: Partial<Record<PlantAbilityState, Record<string, string>>>
    /** Plant::SetSleeping: the clips its layers play in place of their own while it is asleep (a mushroom by day). */
    asleep?: Record<string, string>
    /** Plant::FindTargetAndFire: the clip a layer plays from its start as the plant starts a shot. */
    fire?: Record<string, string>
    /**
     * Plant::DoBlink: every `ticks` (400 to 799 by default) the `blink` layer, over the others, plays one of these
     * clips, drawn by their weights (written `clip` for one, `{clip: weight}` for several: a nut's three); not while
     * the plant is about to shoot or asleep. With `states`, only while its ability is in one of them, the first blink
     * `first` ticks after it comes to one (an armed potato mine's, 400 to 4399).
     */
    blink?: { clips: Record<string, number>; ticks: { min: number; max: number }; states?: PlantAbilityState[]; first?: { min: number; max: number } }
}

/** The layer a plant blinks on. */
export const PLANT_BLINK_LAYER = 'blink'

/** Plant::PlantInitialize: the ticks between a plant's blinks, unless its animation says. */
export const PLANT_BLINK_TICKS = { min: 400, max: 799 }

/** One armor slot: its kind and full health. */
export interface ZombieArmor { type: string; health: number }

export interface ZombieDefinition {
    /**
     * Put down facing right from a zombie seed (the original puts none down so), it stands this much further right to
     * line up with the others: Zombie::UpdateReanim draws every zombie 90 further, flipped, which turns the plain
     * zombie about its body but not one whose body stands elsewhere in its frame. The pole vaulter's stands 6 left
     * of its frame (GetDrawPos) and 14.29 further right in it (its packet x, -8 against -3 at 0.35), so it takes
     * 6 + 14.29. Zombies that face right in the original (mind-controlled, a digger walking back) keep its place.
     */
    facingRightOffsetX?: number
    maxHealth: number
    /** JSON configuration consumed by a registered entity behavior. */
    behavior?: JsonObject
    /** X at which a headed zombie reaches the house. */
    boardEdgeX: number
    spawn: { minX: number; maxX: number; flagWaveOffset: number }
    speedPerTick: { min: number; max: number }
    body: Rect
    attack: Rect
    bite: { damage: number; cadenceTicks: number }
    /**
     * Zombie::mHelmType: worn on the head (cone, bucket), it takes damage after the shield and before the body
     * (TakeHelmDamage) and drops when depleted. `type` names it to the client and to level rules.
     */
    helm?: ZombieArmor
    /**
     * Zombie::mShieldType: held in front (newspaper, screen door), it takes damage first (TakeShieldDamage) without
     * chill, keeps the arm on and flashes alone; Board::TotalZombiesHealthInWave counts it at 0.2.
     */
    shield?: ZombieArmor
    /** After losing the shield (Zombie::UpdateZombieNewspaper): stands still for pauseTicks, then walks at the new speed. */
    enrage?: { pauseTicks: number; speedPerTick: { min: number; max: number } }
    /**
     * What it plays, which the server keeps (server/zombies/animation.ts): its `body` on the clips the server has a
     * zombie play (ZOMBIE_CLIPS), and over it what it carries (ZOMBIE_FLAG_LAYER). With `from`, a zombie plays
     * another's (a cone zombie the plain zombie's), adding what it writes of its own (withFrom).
     */
    animation: AnimationDefinition
    tongueChance: number
    walk2Chance: number
    targetingInsets?: Record<string, number>
    /** ZombieDefinition: mZombieValue, mPickWeight and mFirstAllowedWave, the defaults of a level's zombiePool entry. */
    wave?: { points: number; weight: number; firstWave?: number }
    /** Board::PickGraveRisingZombieType: rises with its wave weight from the graves of levels that allow it; levels
     *  with their own graves name their zombies instead. */
    graveRise?: boolean
    /** Runs at the first plant (its `run` clip) and vaults over it once (its `jump`). */
    vault?: {
        runSpeedPerTick: { min: number; max: number }
        attack: Rect
        /**
         * The rect it finds a rolling nut to vault over with, from much further, then jumping where it stands: the
         * original's on Wall-nut Bowling (Zombie::ZombieInitialize, UpdateZombiePolevaulter), whose plants all roll.
         */
        bowlingAttack?: Rect
        landedAttack: Rect
        landingOffset: number
    }
}

/** The layer a zombie's body plays on; the others are what it carries, going at their own pace (chill slows the body alone). */
export const ZOMBIE_BODY_LAYER = 'body'

/** The layer of a flag zombie's flag (Zombie::DropFlag drops it): a zombie with it carries a flag. */
export const ZOMBIE_FLAG_LAYER = 'flag'

/**
 * The clips the server has a zombie play, by what it does (Zombie::PlayZombieReanim): its animation has those it can
 * come to. `walk`, and `run` for a vaulter, walk on their ground; `eat` marks its bites and each death its fall;
 * `standing` and `standing2` are how it stands off the board; `mowered` is the mower's own for every zombie
 * (zombieAnimation's MOWERED_CLIP), so no animation has it.
 */
export const ZOMBIE_CLIPS = {
    standing: 'idle', standing2: 'idle2', walk: 'walk', walk2: 'walk2', run: 'run', jump: 'jump', eat: 'eat', gasp: 'gasp',
    death: 'death', death2: 'death2', superLongDeath: 'superLongDeath', mowered: 'mowered',
} as const

/**
 * The ways a plant attacks on a rhythm, each with the motion of what it fires (the server's ProjectileMotionRegistry):
 * which way a projectile flies is its launcher's, not the projectile's.
 */
export const PLANT_ATTACKS = { shooter: 'pvz:straight', lobber: 'pvz:lob', seeker: 'pvz:homing' } as const

export type PlantAttack = keyof typeof PLANT_ATTACKS

/**
 * What a projectile is and does to what it hits: its hitbox, its hit, whether a hit uses it up (`pierce`), and how it
 * flies each way a launcher may send it, each the original's when omitted. Exactly one of `damage` and `mow`.
 */
export interface ProjectileDefinition {
    /** Taken off what it hits. */
    damage?: number
    /**
     * A lawn mower's: it crushes what of the other side it hits (Zombie::MowDown, a plant squashed), slowing as it chews
     * (LawnMower::UpdatePlaying). A level's mowers set off as one when a zombie reaches them (mower.ts).
     */
    mow?: true
    /**
     * A hit does not use it up: it hits all it meets, each once, and flies on until its motion ends, as a lawn mower
     * runs through its row. Without it, it hits the nearest thing it meets and is gone.
     */
    pierce?: true
    /**
     * Projectile::DoSplashDamage, a melon's: what else of the other side its hitbox reaches where it hits, on its row
     * and the rows next to it, takes a third of its damage; less each when that would come to more than seven times
     * its damage in all.
     */
    splash?: true
    hitbox: Rect
    /** Slows the target for this many ticks, renewed by each hit. */
    chillTicks?: number
    /** Flying straight (a `shooter`'s): how far a tick, 3.33. */
    speed?: number
    /** Flying straight: it disappears after this many ticks, like the puff-shroom's spore; never when omitted. */
    lifetimeTicks?: number
    /**
     * Thrown (a `lobber`'s): the ticks it takes to its target, 120. It is thrown up under the same gravity whatever
     * this is, as hard as brings it back down by then: lower and flatter the sooner.
     */
    flightTicks?: number
    /**
     * Thrown: it only hits coming down below a height over the ground of its row (its hitbox's bottom), wherever it
     * was thrown from: 105 for a zombie, the cabbage's as the cabbage-pult throws it, and 77 for a plant, which stands
     * lower (the basketball's, from the catapult's arm). This is how much higher this one hits either: a kernel 25, the
     * butter 27, a melon 39.
     */
    landingOffset?: number
    /** Thrown: the angle it leaves at, forward (clockwise thrown right): 0.88, the cabbage's and the butter's; the kernel leaves at 0, a melon at 1.26. */
    rotation?: number
    /** Thrown: how fast it tumbles forward, a tick, picked between the two: 0.02 to 0.08, the cabbage's; the kernel's 0.08 to 0.2. */
    spin?: [number, number]
    /** Homing (a `seeker`'s): how far a tick, 2. */
    homingSpeed?: number
    /** Homing: how much more it turns toward its target for each tick it has flown, 0.001. */
    turn?: number
}

/** What of a projectile a plant firing it may have its own way: all but its hitbox and whether it mows. */
export type ProjectileOverrides = Omit<ProjectileDefinition, 'hitbox' | 'mow'>

export interface ItemDefinition {
    /** Sun goes to the sun bank; money (Coin::IsMoney) goes to the player's coins, in original coin units. */
    kind?: 'sun' | 'money'
    value: number
    width: number
    height: number
    /** Coin::GetSunScale: drawn and collected at this scale, like the small sun's 0.5. */
    scale?: number
    /** Coin::GetDisappearTime: ticks on the ground before fading; 750 when omitted. */
    lifetimeTicks?: number
}

/**
 * `icon`: cell `index` of a sprite cut into 70×70 cells, seven to a row (IMAGE_ACHEESEMENTS_ICONS). `trigger`: how a
 * level grants it, `{kind, ...settings}` for the trigger registered under `kind` (the server's AchievementTriggerRegistry);
 * without one, nothing grants it yet.
 */
export interface AchievementDefinition {
    titleKey: string
    descriptionKey: string
    icon: { sprite: string; index: number }
    trigger?: AchievementTrigger
}

export interface AchievementTrigger { kind: string; settings: JsonObject }

/** `points` is the wave's whole budget: the listed zombies spend it first, the rest is picked from the zombie pool. */
export interface LevelWave { zombies: string[]; flagWave?: boolean; points?: number }

/**
 * The level rule registered under `kind` (the server's LevelRuleRegistry) builds `count` waves and may change how the
 * level plays, as the original's Challenge code does for its modes; the other keys are its own settings.
 */
export interface LevelRule { kind: string; count: number; settings: JsonObject }

export interface LevelDefinition {
    adventureIndex: number
    persistent?: boolean
    /** False: the level grants no achievements (debug and test levels). */
    achievements?: boolean
    board: string
    activeRows: number[]
    startingSun: number
    /**
     * A fixed bank. Without it and a conveyor, the bank follows the original: the available seeds fill it when they
     * fit (the first adventure's first seven levels), and the seed chooser opens when there are more.
     */
    seedPackets?: string[]
    /** `team`: `zombies` places a plant on the zombies' side, facing left. */
    initialPlants?: Array<{ seedId: string; row: number; column: number; team?: Team }>
    /** Board::CanPlantAt on Wall-nut Bowling: the player plants nothing right of `column` (the red line). */
    plantingLine?: { column: number }
    /** The mower waiting at each active row's end, set off when a zombie reaches it: a projectile that mows. */
    lawnMower: string
    /** The sun that falls from the sky; omitted at night (Board::UpdateSunSpawning). */
    skySun?: string
    /** Board::AddGraveStones: per column, graves on random free rows. */
    graves?: Array<{ column: number; count: number }>
    /** Board::PickGraveRisingZombieType: one per grave after the final wave, by weight. Omitted in the source, it comes
     *  from the zombies' `graveRise`; a lawn with graves must end up with some. */
    graveZombies?: Array<{ id: string; weight: number }>
    /** The waves as listed; a level has these or `rules`. */
    waves?: LevelWave[]
    /** The level rule that builds the waves when the level starts and may change the level's play. */
    rules?: LevelRule
    zombiePool?: Array<{ id: string; points: number; weight: number; firstWave?: number }>
    firstWaveTicks?: number
    conveyor?: {
        initialSeed?: string
        initialDelayTicks?: number
        seeds: Array<{ id: string; weight: number }>
        capacity: number
        spacing: number
        entryX: number
        moveTicks: number
        spawnDelay: Array<{ minPackets: number; ticks: number }>
        insertionGap: number
        removalGap: number
    }
    /**
     * False when the packets skip their opening recharge and start ready (SeedPacket::SetPacketType on Whack-a-Zombie,
     * Scary Potter and similar levels); planting still recharges them (SeedPacket::WasPlanted).
     */
    openingRecharge?: false
    /** The tools the level offers instead of the ones earlier levels awarded (CutScene::ShowShovel). */
    tools?: string[]
    nextLevel?: string
    tutorial: string
    /**
     * `tool` also becomes usable in later levels (the shovel); `unlock` is only collected and shown (the almanac), and
     * its award page button can open the page it unlocks before the next level (AwardScreen::StartButtonPressed).
     */
    award: { kind: 'seed'; id: string }
        | { kind: 'tool'; id: string; titleKey: string; nameKey: string; descriptionKey: string; width: number; height: number }
        | { kind: 'unlock'; id: string; titleKey: string; nameKey: string; descriptionKey: string; width: number; height: number; opens?: AwardOpens
            /** The main menu entry the award unlocks once collected (LawnApp::CanShowAlmanac, CanShowStore, CanShowZenGarden). */
            unlocks?: UnlockedEntry }
        | { kind: 'note'; id: string; titleKey: string; width: number; height: number }
}

export interface Point { x: number; y: number }

export interface Rect extends Point { width: number; height: number }

export interface AwardOpens { page: 'almanac'; buttonKey: string }

export type UnlockedEntry = 'almanac' | 'store' | 'garden'
