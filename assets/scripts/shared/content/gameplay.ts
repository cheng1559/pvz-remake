import { isQualifiedId } from '@/shared/mod/index'
import { jsonRoundTrip, type JsonObject, PLANT_ABILITY_STATES, type PlantAbilityState, type Team } from '@/shared/protocol'

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

/** The catalog seeds in the chooser's grid (places below CHOOSER_PLACES), in place order. */
export function chooserSeeds(definitions: Pick<GameplayDefinitions, 'seedCatalog'>): string[] {
    return Object.entries(definitions.seedCatalog).filter(([, entry]) => entry.position < CHOOSER_PLACES)
        .sort(([, left], [, right]) => left.position - right.position).map(([id]) => id)
}

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
    zombieGaits: Record<string, ZombieGait>
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

/** Where a mower rides in a row: a level's waits there, and a mowing projectile runs there, on the ground. */
export function mowerY(board: BoardDefinition, row: number): number {
    return board.origin.y + row * board.cell.height + 23
}

/** The ground of a row, where a mower's wheels stand (mowerY and its height): what is thrown comes down there. */
export function rowGroundY(board: BoardDefinition, row: number): number {
    return mowerY(board, row) + 80
}

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
    /** What it plays, which the server keeps (server/plants/animation.ts); a plant without one is animated by its view. */
    animation?: PlantAnimationDefinition
}

/**
 * One clip of a plant's animation, under the name its presentation has the pictures under. It loops unless it has a
 * `next` or is `once`.
 */
export interface PlantClip {
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
}

export interface PlantAnimationDefinition {
    clips: Record<string, PlantClip>
    /**
     * Its layers, drawn in this order (a later one on an earlier one's part), and the clip each starts with; `null`
     * for one that is not there until something plays a clip on it.
     */
    layers: Record<string, string | null>
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
    dropsFlag?: boolean
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
    /** Explicit animation profile and variants; equipment does not imply animation support. */
    gait: string
    tongueChance: number
    walk2Chance: number
    targetingInsets?: Record<string, number>
    /** ZombieDefinition: mZombieValue, mPickWeight and mFirstAllowedWave, the defaults of a level's zombiePool entry. */
    wave?: { points: number; weight: number; firstWave?: number }
    /** Board::PickGraveRisingZombieType: rises with its wave weight from the graves of levels that allow it; levels
     *  with their own graves name their zombies instead. */
    graveRise?: boolean
    /** Runs at the first plant and vaults over it once. */
    vault?: {
        runSpeedPerTick: { min: number; max: number }
        runGround: number[]
        attack: Rect
        /**
         * The rect it finds a rolling nut to vault over with, from much further, then jumping where it stands: the
         * original's on Wall-nut Bowling (Zombie::ZombieInitialize, UpdateZombiePolevaulter), whose plants all roll.
         */
        bowlingAttack?: Rect
        landedAttack: Rect
        jumpFrames: number
        jumpRate: number
        landingOffset: number
    }
}

/** `ground` samples the `_ground` track per frame; it sets walking speed like the original reanim. */
export interface ZombieGait {
    walkGround: number[]
    eat: { frames: number; rate: number; chewTimes: number[] }
    /** `rate` fixes the animation rate, as Zombie::PlayDeathAnim does for anim_superlongdeath (14). */
    deaths: Array<{ animation: 'anim_death' | 'anim_death2' | 'anim_superlongdeath'; frames: number; fallTime: number; rate?: number }>
}

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
const PROJECTILE_ATTRIBUTES: Record<keyof ProjectileOverrides, (value: unknown, name: string) => unknown> = {
    damage: positiveInteger,
    pierce: flag,
    splash: flag,
    chillTicks: positiveInteger,
    speed: positiveFinite,
    lifetimeTicks: positiveInteger,
    flightTicks: positiveInteger,
    landingOffset: finite,
    rotation: finite,
    spin(value, name) {
        if (!Array.isArray(value) || value.length !== 2 || !value.every(Number.isFinite) || value[0] > value[1]) throw new Error(`${name} must be two ordered finite numbers`)
        return [value[0], value[1]]
    },
    homingSpeed: positiveFinite,
    turn: positiveFinite,
}

function flag(value: unknown, name: string): true {
    if (value !== true) throw new Error(`${name} must be true`)
    return true
}

function parseProjectileAttributes(source: Record<string, unknown>, name: string): ProjectileOverrides {
    const result: Record<string, unknown> = {}
    for (const [key, parse] of Object.entries(PROJECTILE_ATTRIBUTES)) if (source[key] !== undefined) result[key] = parse(source[key], `${name}.${key}`)
    return result
}

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

interface Point { x: number; y: number }
interface Rect extends Point { width: number; height: number }

export function parseGameplayDefinitions(value: unknown, seedCatalog: unknown): GameplayDefinitions {
    const source = exactObject(value, [
        'schemaVersion', 'economy', 'boards', 'seeds', 'plants', 'zombies',
        'projectiles', 'items', 'achievements', 'zombieGaits', 'seedBank',
    ], 'gameplay definitions')
    const economy = exactObject(source.economy, ['maxSun', 'maxMoney'], 'gameplay definitions.economy')
    const seedBank = exactObject(source.seedBank, ['baseSlots', 'maxSlots', 'startingSeeds'], 'gameplay definitions.seedBank')
    if (source.schemaVersion !== 2) throw new Error('gameplay definitions.schemaVersion must be 2')

    const definitions: GameplayDefinitions = {
        schemaVersion: 2,
        economy: { maxSun: positiveInteger(economy.maxSun, 'economy.maxSun'), maxMoney: positiveInteger(economy.maxMoney, 'economy.maxMoney') },
        boards: mapped(source.boards, 'boards', parseBoard),
        seeds: mapped(source.seeds, 'seeds', parseSeed),
        seedCatalog: mapped(seedCatalog, 'seed catalog', (entry, entryName) => ({
            position: nonNegativeInteger(exactObject(entry, ['position'], entryName).position, `${entryName}.position`),
        })),
        plants: mapped(source.plants, 'plants', parsePlant),
        zombies: mapped(source.zombies, 'zombies', parseZombie),
        zombieGaits: mapped(source.zombieGaits, 'zombieGaits', parseZombieGait),
        projectiles: mapped(source.projectiles, 'projectiles', parseProjectile),
        items: mapped(source.items, 'items', parseItem),
        achievements: mapped(source.achievements, 'achievements', parseAchievement),
        seedBank: { baseSlots: positiveInteger(seedBank.baseSlots, 'seedBank.baseSlots'), maxSlots: positiveInteger(seedBank.maxSlots, 'seedBank.maxSlots'),
            startingSeeds: qualifiedIdArray(seedBank.startingSeeds, 'seedBank.startingSeeds') },
    }
    if (definitions.seedBank.baseSlots > definitions.seedBank.maxSlots) throw new Error('seedBank.baseSlots exceeds maxSlots')
    for (const id of definitions.seedBank.startingSeeds) reference(id, definitions.seeds, 'seedBank.startingSeeds')

    const places = new Map<number, string>()
    for (const [id, { position }] of Object.entries(definitions.seedCatalog)) {
        const other = places.get(position)
        if (other) throw new Error(`seed catalog puts ${other} and ${id} in the same place (${position})`)
        places.set(position, id)
        reference(id, definitions.seeds, 'seed catalog')
        if (definitions.seeds[id].kind !== 'plant') throw new Error(`seed catalog lists ${id}, not a plant seed; the chooser only offers plants`)
    }
    for (const [id, seed] of Object.entries(definitions.seeds)) {
        if (seed.kind === 'plant') reference(seed.id, definitions.plants, `seeds.${id}.id`)
        else if (seed.kind === 'zombie') reference(seed.id, definitions.zombies, `seeds.${id}.id`)
    }
    for (const [id, plant] of Object.entries(definitions.plants)) {
        if (plant.shooter?.projectile) {
            const name = `plants.${id}.${plant.shooter.type}.projectile`
            reference(plant.shooter.projectile, definitions.projectiles, name)
            if (plant.shooter.overrides?.damage !== undefined && definitions.projectiles[plant.shooter.projectile].mow) throw new Error(`${name}.damage is not supported: ${plant.shooter.projectile} mows`)
        }
        if (plant.producer) reference(plant.producer.item, definitions.items, `plants.${id}.producer.item`)
        if (plant.producer?.growth) reference(plant.producer.growth.smallItem, definitions.items, `plants.${id}.producer.growth.smallItem`)
    }
    for (const [id, zombie] of Object.entries(definitions.zombies)) {
        reference(zombie.gait, definitions.zombieGaits, `zombies.${id}.gait`)
    }

    return definitions
}

export function parseGameplayLevels(
    value: unknown,
    definitions: GameplayDefinitions,
): GameplayLevels {
    const source = exactObject(value, ['schemaVersion', 'levels'], 'gameplay levels')
    if (source.schemaVersion !== 2) throw new Error('gameplay levels.schemaVersion must be 2')
    const levels = mapped(source.levels, 'levels', (entry, name) => parseLevel(entry, name, definitions))
    const result: GameplayLevels = { schemaVersion: 2, levels }
    for (const [id, level] of Object.entries(levels)) {
        if (level.nextLevel) reference(level.nextLevel, levels, `levels.${id}.nextLevel`)
    }
    return result
}

/**
 * The tools a game has: the ones levels award (the 1-4 shovel), from the level after on a first adventure and on
 * every level of a replay (CutScene::ShowShovel).
 */
export interface AwardOpens { page: 'almanac'; buttonKey: string }
export type UnlockedEntry = 'almanac' | 'store' | 'garden'
const UNLOCKED_ENTRIES: readonly string[] = ['almanac', 'store', 'garden'] satisfies UnlockedEntry[]

export function levelTools(levels: GameplayLevels, level: LevelDefinition, firstAdventure: boolean): string[] {
    if (level.tools) return [...level.tools]
    const awards = Object.values(levels.levels).flatMap(entry => entry.award.kind === 'tool' ? [entry] : [])
        .sort((a, b) => a.adventureIndex - b.adventureIndex)
    return [...new Set(awards.filter(entry => !firstAdventure || entry.adventureIndex < level.adventureIndex).map(entry => entry.award.id))]
}

function parseBoard(value: unknown, name: string): BoardDefinition {
    const source = exactObject(value, ['rows', 'columns', 'origin', 'cell', 'bounds'], name, ['night'])
    if (source.night !== undefined && typeof source.night !== 'boolean') throw new Error(`${name}.night must be boolean`)
    const bounds = exactObject(source.bounds, ['left', 'right'], `${name}.bounds`)
    const left = finite(bounds.left, `${name}.bounds.left`), right = finite(bounds.right, `${name}.bounds.right`)
    if (left >= right) throw new Error(`${name}.bounds must be ordered`)
    const cell = exactObject(source.cell, ['width', 'height'], `${name}.cell`)
    return {
        ...(source.night === undefined ? {} : { night: source.night as boolean }),
        bounds: { left, right },
        rows: positiveInteger(source.rows, `${name}.rows`),
        columns: positiveInteger(source.columns, `${name}.columns`),
        origin: point(source.origin, `${name}.origin`),
        cell: {
            width: positiveFinite(cell.width, `${name}.cell.width`),
            height: positiveFinite(cell.height, `${name}.cell.height`),
        },
    }
}

/**
 * `kind` says what a seed puts down; a plant or zombie seed's `id`, the plant or zombie, is the seed's own ID unless
 * given. Only a plant seed has a `placement`, and a grave seed has no `id`.
 */
function parseSeed(value: unknown, name: string, seedId: string): SeedDefinition {
    const source = exactObject(value, ['kind', 'sunCost', 'cooldownTicks'], name, ['id', 'placement', 'initialCooldownTicks'])
    const common = {
        sunCost: nonNegativeInteger(source.sunCost, `${name}.sunCost`),
        cooldownTicks: nonNegativeInteger(source.cooldownTicks, `${name}.cooldownTicks`),
        ...(source.initialCooldownTicks === undefined ? {} : { initialCooldownTicks: nonNegativeInteger(source.initialCooldownTicks, `${name}.initialCooldownTicks`) }),
    }
    if (source.kind !== 'plant' && source.kind !== 'zombie' && source.kind !== 'grave') throw new Error(`${name}.kind must be plant, zombie or grave`)
    if (source.kind !== 'plant' && source.placement !== undefined) throw new Error(`${name}.placement is for plant seeds`)
    const id = () => source.id === undefined ? seedId : qualifiedId(source.id, `${name}.id`)
    switch (source.kind) {
        case 'plant':
            if (source.placement !== 'ground' && source.placement !== 'grave') throw new Error(`${name}.placement must be ground or grave`)
            return { ...common, kind: 'plant', id: id(), placement: source.placement }
        case 'zombie':
            return { ...common, kind: 'zombie', id: id() }
        case 'grave':
            if (source.id !== undefined) throw new Error(`${name}.id is for plant and zombie seeds`)
            return { ...common, kind: 'grave' }
    }
}

function parsePlant(value: unknown, name: string): PlantDefinition {
    const attacks = Object.keys(PLANT_ATTACKS) as PlantAttack[]
    const abilities = [...attacks, 'producer', 'fuse', 'mine', 'chomper', 'graveBuster'] as const
    const source = exactObject(value, ['maxHealth', 'body'], name, [...abilities, 'deathExplosion', 'behavior', 'occupiesCell', 'nocturnal', 'low', 'plantingOffset', 'animation'])
    if (abilities.filter(key => source[key] !== undefined).length > 1) {
        throw new Error(`${name} allows at most one of ${abilities.join(', ')}`)
    }
    const result: PlantDefinition = {
        maxHealth: positiveInteger(source.maxHealth, `${name}.maxHealth`),
        body: rect(source.body, `${name}.body`),
    }
    if (source.occupiesCell !== undefined) {
        if (typeof source.occupiesCell !== 'boolean') throw new Error(`${name}.occupiesCell must be boolean`)
        result.occupiesCell = source.occupiesCell
    }
    if (source.low !== undefined) {
        if (typeof source.low !== 'boolean') throw new Error(`${name}.low must be boolean`)
        result.low = source.low
    }
    if (source.nocturnal !== undefined) {
        if (typeof source.nocturnal !== 'boolean') throw new Error(`${name}.nocturnal must be boolean`)
        result.nocturnal = source.nocturnal
    }
    if (source.plantingOffset !== undefined) {
        const offset = exactObject(source.plantingOffset, ['min', 'max'], `${name}.plantingOffset`)
        const min = point(offset.min, `${name}.plantingOffset.min`), max = point(offset.max, `${name}.plantingOffset.max`)
        if (![min.x, min.y, max.x, max.y].every(Number.isInteger) || min.x > max.x || min.y > max.y) {
            throw new Error(`${name}.plantingOffset must contain ordered integer coordinates`)
        }
        result.plantingOffset = { min, max }
    }
    if (source.behavior !== undefined) result.behavior = jsonRoundTrip(object(source.behavior, `${name}.behavior`)) as JsonObject
    if (source.animation !== undefined) result.animation = parsePlantAnimation(source.animation, `${name}.animation`)
    const type = attacks.find(key => source[key] !== undefined)
    if (type) {
        const block = `${name}.${type}`
        const { cadenceTicks, initialDelayTicks, windupTicks, shotsPerBurst, burstIntervalTicks, projectile: shot, area, offset, range, anchor } = exactObject(
            source[type], ['cadenceTicks', 'initialDelayTicks', 'windupTicks', 'shotsPerBurst', 'burstIntervalTicks', 'offset'], block, ['range', 'projectile', 'area', 'anchor'],
        )
        const { id: projectile, ...overrides } = shot === undefined || typeof shot === 'string' ? { id: shot } : object(shot, `${block}.projectile`)
        exactObject(overrides, [], `${block}.projectile`, Object.keys(PROJECTILE_ATTRIBUTES))
        result.shooter = {
            type,
            cadenceTicks: tickRange(cadenceTicks, `${block}.cadenceTicks`, 1),
            initialDelayTicks: tickRange(initialDelayTicks, `${block}.initialDelayTicks`, 0),
            windupTicks: positiveInteger(windupTicks, `${block}.windupTicks`),
            shotsPerBurst: positiveInteger(shotsPerBurst, `${block}.shotsPerBurst`),
            burstIntervalTicks: nonNegativeInteger(burstIntervalTicks, `${block}.burstIntervalTicks`),
            ...(shot === undefined ? {} : { projectile: qualifiedId(projectile, `${block}.projectile`) }),
            ...(Object.keys(overrides).length ? { overrides: parseProjectileAttributes(overrides, `${block}.projectile`) } : {}),
            ...(area === undefined ? {} : { area: (() => {
                const source = exactObject(area, ['damage', 'hitsShieldAndBody'], `${block}.area`)
                if (typeof source.hitsShieldAndBody !== 'boolean') throw new Error(`${block}.area.hitsShieldAndBody must be boolean`)
                return { damage: positiveInteger(source.damage, `${block}.area.damage`), hitsShieldAndBody: source.hitsShieldAndBody }
            })() }),
            offset: point(offset, `${block}.offset`),
            ...(range === undefined ? {} : { range: positiveFinite(range, `${block}.range`) }),
        }
        if (anchor !== undefined) {
            const { layer, track } = exactObject(anchor, ['layer', 'track'], `${block}.anchor`)
            // The layer starts with a clip that has the track; on a clip without it the mouth is at the plant's own place.
            const start = result.animation?.clips[result.animation.layers[layer as string] ?? '']
            if (typeof track !== 'string' || !start?.tracks?.[track]) throw new Error(`${block}.anchor must name a layer of the plant's animation and a track of the clip it starts with`)
            result.shooter.anchor = { layer: layer as string, track }
        }
        if (type === 'shooter' ? (result.shooter.projectile === undefined) === (result.shooter.area === undefined) : !result.shooter.projectile || result.shooter.area) {
            throw new Error(type === 'shooter' ? `${block} needs exactly one of projectile and area` : `${block} needs a projectile, and no area`)
        }
        if (type === 'seeker' && range !== undefined) throw new Error(`${block}.range is not supported: a seeker reaches everywhere`)
    }
    if (source.producer) {
        const producer = exactObject(source.producer, ['item', 'cadenceTicks', 'initialDelayTicks'], `${name}.producer`, ['growth'])
        const delay = exactObject(producer.initialDelayTicks, ['min', 'max'], `${name}.producer.initialDelayTicks`)
        const min = positiveInteger(delay.min, `${name}.producer.initialDelayTicks.min`)
        const max = positiveInteger(delay.max, `${name}.producer.initialDelayTicks.max`)
        if (min > max) throw new Error(`${name}.producer.initialDelayTicks.min must not exceed max`)
        result.producer = {
            item: qualifiedId(producer.item, `${name}.producer.item`),
            cadenceTicks: positiveInteger(producer.cadenceTicks, `${name}.producer.cadenceTicks`),
            initialDelayTicks: { min, max },
        }
        if (producer.growth !== undefined) {
            const growth = exactObject(producer.growth, ['ticks', 'growingTicks', 'smallItem'], `${name}.producer.growth`)
            result.producer.growth = {
                ticks: positiveInteger(growth.ticks, `${name}.producer.growth.ticks`),
                growingTicks: positiveInteger(growth.growingTicks, `${name}.producer.growth.growingTicks`),
                smallItem: qualifiedId(growth.smallItem, `${name}.producer.growth.smallItem`),
            }
        }
    }
    if (source.graveBuster) {
        const buster = exactObject(source.graveBuster, ['landTicks', 'eatTicks'], `${name}.graveBuster`)
        result.graveBuster = {
            landTicks: tickRange(buster.landTicks, `${name}.graveBuster.landTicks`, 1),
            eatTicks: positiveInteger(buster.eatTicks, `${name}.graveBuster.eatTicks`),
        }
    }
    if (source.fuse) {
        const fuse = exactObject(source.fuse, ['ticks', 'explosion'], `${name}.fuse`)
        result.fuse = {
            ticks: positiveInteger(fuse.ticks, `${name}.fuse.ticks`),
            explosion: explosion(fuse.explosion, `${name}.fuse.explosion`),
        }
    }
    if (source.mine) {
        const mine = exactObject(source.mine, ['armingTicks', 'riseTicks', 'attack', 'targeting', 'explosion'], `${name}.mine`)
        result.mine = {
            armingTicks: positiveInteger(mine.armingTicks, `${name}.mine.armingTicks`),
            riseTicks: positiveInteger(mine.riseTicks, `${name}.mine.riseTicks`),
            attack: rect(mine.attack, `${name}.mine.attack`),
            targeting: parsePlantTargeting(mine.targeting, `${name}.mine.targeting`),
            explosion: explosion(mine.explosion, `${name}.mine.explosion`),
        }
    }
    if (source.chomper) {
        const chomper = exactObject(source.chomper,
            ['attack', 'targeting', 'biteDelayTicks', 'biteTicks', 'digestTicks', 'swallowTicks'], `${name}.chomper`)
        result.chomper = {
            attack: rect(chomper.attack, `${name}.chomper.attack`),
            targeting: parsePlantTargeting(chomper.targeting, `${name}.chomper.targeting`),
            biteDelayTicks: positiveInteger(chomper.biteDelayTicks, `${name}.chomper.biteDelayTicks`),
            biteTicks: positiveInteger(chomper.biteTicks, `${name}.chomper.biteTicks`),
            digestTicks: positiveInteger(chomper.digestTicks, `${name}.chomper.digestTicks`),
            swallowTicks: positiveInteger(chomper.swallowTicks, `${name}.chomper.swallowTicks`),
        }
        if (result.chomper.biteDelayTicks > result.chomper.biteTicks) {
            throw new Error(`${name}.chomper.biteDelayTicks must not exceed biteTicks`)
        }
    }
    if (source.deathExplosion) result.deathExplosion = explosion(source.deathExplosion, `${name}.deathExplosion`)
    return result
}

function explosion(value: unknown, name: string): ExplosionDefinition {
    const source = exactObject(value, ['offset', 'radius', 'rowRange', 'damage', 'burn'], name)
    if (typeof source.burn !== 'boolean') throw new Error(`${name}.burn must be boolean`)
    return {
        offset: point(source.offset, `${name}.offset`),
        radius: positiveFinite(source.radius, `${name}.radius`),
        rowRange: nonNegativeInteger(source.rowRange, `${name}.rowRange`),
        damage: positiveInteger(source.damage, `${name}.damage`),
        burn: source.burn,
    }
}

function parseZombie(value: unknown, name: string): ZombieDefinition {
    const source = exactObject(value, ['maxHealth', 'boardEdgeX', 'spawn', 'speedPerTick', 'body', 'attack', 'bite', 'gait', 'tongueChance', 'walk2Chance'], name, ['helm', 'shield', 'enrage', 'vault', 'targetingInsets', 'behavior', 'dropsFlag', 'wave', 'graveRise', 'facingRightOffsetX'])
    const spawn = exactObject(source.spawn, ['minX', 'maxX', 'flagWaveOffset'], `${name}.spawn`)
    const minX = finite(spawn.minX, `${name}.spawn.minX`)
    const maxX = finite(spawn.maxX, `${name}.spawn.maxX`)
    if (!Number.isSafeInteger(minX) || !Number.isSafeInteger(maxX) || minX > maxX || maxX - minX + 1 > 0x100000000) {
        throw new Error(`${name}.spawn must have ordered safe integer bounds spanning at most 2^32 positions`)
    }
    const bite = exactObject(source.bite, ['damage', 'cadenceTicks'], `${name}.bite`)
    const result: ZombieDefinition = {
        maxHealth: positiveInteger(source.maxHealth, `${name}.maxHealth`),
        boardEdgeX: finite(source.boardEdgeX, `${name}.boardEdgeX`),
        spawn: { minX, maxX, flagWaveOffset: finite(spawn.flagWaveOffset, `${name}.spawn.flagWaveOffset`) },
        speedPerTick: speedRange(source.speedPerTick, `${name}.speedPerTick`),
        body: rect(source.body, `${name}.body`),
        attack: rect(source.attack, `${name}.attack`),
        gait: qualifiedId(source.gait, `${name}.gait`),
        tongueChance: fraction(source.tongueChance, `${name}.tongueChance`),
        walk2Chance: fraction(source.walk2Chance, `${name}.walk2Chance`),
        bite: {
            damage: positiveInteger(bite.damage, `${name}.bite.damage`),
            cadenceTicks: positiveInteger(bite.cadenceTicks, `${name}.bite.cadenceTicks`),
        },
    }
    if (source.facingRightOffsetX !== undefined) result.facingRightOffsetX = finite(source.facingRightOffsetX, `${name}.facingRightOffsetX`)
    if (source.dropsFlag !== undefined) {
        if (typeof source.dropsFlag !== 'boolean') throw new Error(`${name}.dropsFlag must be boolean`)
        result.dropsFlag = source.dropsFlag
    }
    if (source.behavior !== undefined) result.behavior = jsonRoundTrip(object(source.behavior, `${name}.behavior`)) as JsonObject
    if (source.wave !== undefined) {
        const wave = exactObject(source.wave, ['points', 'weight'], `${name}.wave`, ['firstWave'])
        result.wave = { points: positiveInteger(wave.points, `${name}.wave.points`), weight: nonNegativeInteger(wave.weight, `${name}.wave.weight`),
            ...(wave.firstWave === undefined ? {} : { firstWave: positiveInteger(wave.firstWave, `${name}.wave.firstWave`) }) }
    }
    if (source.graveRise !== undefined) {
        if (typeof source.graveRise !== 'boolean') throw new Error(`${name}.graveRise must be boolean`)
        if (source.graveRise && !result.wave?.weight) throw new Error(`${name}.graveRise needs a weighted wave`)
        result.graveRise = source.graveRise
    }
    if (source.targetingInsets !== undefined) {
        result.targetingInsets = mapped(source.targetingInsets, `${name}.targetingInsets`, nonNegativeFinite)
    }
    for (const slot of ['helm', 'shield'] as const) {
        if (source[slot] === undefined) continue
        const armor = exactObject(source[slot], ['type', 'health'], `${name}.${slot}`)
        // A helm with `shield: true` is now a `shield`.
        if (typeof armor.type !== 'string' || !/^[a-z][a-z0-9_]*$/.test(armor.type)) throw new Error(`${name}.${slot}.type must be a lowercase name`)
        result[slot] = { type: armor.type, health: positiveInteger(armor.health, `${name}.${slot}.health`) }
    }
    if (source.enrage !== undefined) {
        const enrage = exactObject(source.enrage, ['pauseTicks', 'speedPerTick'], `${name}.enrage`)
        if (!result.shield) throw new Error(`${name}.enrage requires a shield`)
        result.enrage = { pauseTicks: positiveInteger(enrage.pauseTicks, `${name}.enrage.pauseTicks`),
            speedPerTick: speedRange(enrage.speedPerTick, `${name}.enrage.speedPerTick`) }
    }
    if (source.vault !== undefined) {
        const vault = exactObject(source.vault,
            ['runSpeedPerTick', 'runGround', 'attack', 'landedAttack', 'jumpFrames', 'jumpRate', 'landingOffset'], `${name}.vault`,
            ['bowlingAttack'])
        result.vault = {
            runSpeedPerTick: speedRange(vault.runSpeedPerTick, `${name}.vault.runSpeedPerTick`),
            runGround: groundTrack(vault.runGround, `${name}.vault.runGround`),
            attack: rect(vault.attack, `${name}.vault.attack`),
            ...vault.bowlingAttack === undefined ? {} : { bowlingAttack: rect(vault.bowlingAttack, `${name}.vault.bowlingAttack`) },
            landedAttack: rect(vault.landedAttack, `${name}.vault.landedAttack`),
            jumpFrames: frameCount(vault.jumpFrames, `${name}.vault.jumpFrames`),
            jumpRate: positiveFinite(vault.jumpRate, `${name}.vault.jumpRate`),
            landingOffset: finite(vault.landingOffset, `${name}.vault.landingOffset`),
        }
    }
    return result
}

function parsePlantAnimation(value: unknown, name: string): PlantAnimationDefinition {
    const source = exactObject(value, ['clips', 'layers'], name, ['fire', 'blink', 'states', 'asleep'])
    const clips = named(source.clips, `${name}.clips`, (entry, clipName): PlantClip => {
        const clip = exactObject(entry, ['frames'], clipName, ['fps', 'sync', 'fit', 'chewed', 'next', 'once', 'hold', 'start', 'tracks'])
        const frames = positiveInteger(clip.frames, `${clipName}.frames`)
        // One pace: its own or another layer's; or it fits, with a pace of its own only for where nothing is to fit.
        if (clip.fit ? clip.sync !== undefined : (clip.fps === undefined) === (clip.sync === undefined)) throw new Error(`${clipName} needs exactly one of fps and sync, or fit`)
        if (clip.chewed !== undefined && clip.fps === undefined) throw new Error(`${clipName}.chewed needs fps`)
        for (const key of ['once', 'hold', 'fit', 'chewed']) if (clip[key] !== undefined && clip[key] !== true) throw new Error(`${clipName}.${key} must be true`)
        if ([clip.next, clip.once, clip.hold].filter(end => end !== undefined).length > 1) throw new Error(`${clipName} allows at most one of next, once and hold`)
        const from = clip.start === undefined ? undefined : array(clip.start, `${clipName}.start`).map((part, index) => fraction(part, `${clipName}.start[${index}]`))
        if (from && (from.length !== 2 || from[0] > from[1])) throw new Error(`${clipName}.start must be [min, max]`)
        const fps = clip.fps === undefined ? undefined : (Array.isArray(clip.fps) ? clip.fps : [clip.fps, clip.fps])
            .map((rate, index) => positiveFinite(rate, `${clipName}.fps[${index}]`))
        if (fps && (fps.length !== 2 || fps[0] > fps[1])) throw new Error(`${clipName}.fps must be a rate or [min, max]`)
        return {
            frames,
            ...(fps ? { fps: { min: fps[0], max: fps[1] } } : {}),
            ...(clip.sync === undefined ? {} : { sync: string(clip.sync, `${clipName}.sync`) }),
            ...(clip.fit ? { fit: true as const } : {}),
            ...(clip.chewed ? { chewed: true as const } : {}),
            ...(clip.next === undefined ? {} : { next: string(clip.next, `${clipName}.next`) }),
            ...(clip.once ? { once: true as const } : {}),
            ...(clip.hold ? { hold: true as const } : {}),
            ...(from ? { start: { min: from[0], max: from[1] } } : {}),
            ...(clip.tracks === undefined ? {} : { tracks: named(clip.tracks, `${clipName}.tracks`, (track, trackName) => {
                const points = array(track, trackName).map((pair, index) => {
                    if (!Array.isArray(pair) || pair.length !== 2) throw new Error(`${trackName}[${index}] must be [x, y]`)
                    return { x: finite(pair[0], `${trackName}[${index}]`), y: finite(pair[1], `${trackName}[${index}]`) }
                })
                if (points.length !== frames) throw new Error(`${trackName} must have a point for each of the clip's ${frames} frames`)
                return points
            }) }),
        }
    })
    const clipOf = (entry: unknown, entryName: string): string => {
        if (typeof entry !== 'string' || !clips[entry]) throw new Error(`${entryName} must be one of the animation's clips`)
        return entry
    }
    const layers = named(source.layers, `${name}.layers`, (entry, entryName) => entry === null ? null : clipOf(entry, entryName))
    if (!Object.keys(layers).length) throw new Error(`${name}.layers must not be empty`)
    /** What some layers play: `{layer: clip}`. */
    const playing = (entry: unknown, entryName: string): Record<string, string> => {
        const result = named(entry, entryName, clipOf)
        for (const layer of Object.keys(result)) layerOf(layer, `${entryName}.${layer}`)
        return result
    }
    const abilityState = (entry: unknown, entryName: string): PlantAbilityState => {
        if (!PLANT_ABILITY_STATES.includes(entry as PlantAbilityState)) throw new Error(`${entryName} must be a state of a plant's ability`)
        return entry as PlantAbilityState
    }
    const layerOf = (entry: string, entryName: string): void => {
        if (!Object.hasOwn(layers, entry)) throw new Error(`${entryName} must be one of the animation's layers`)
    }
    for (const [id, clip] of Object.entries(clips)) {
        if (clip.next !== undefined) clipOf(clip.next, `${name}.clips.${id}.next`)
        if (clip.sync !== undefined) layerOf(clip.sync, `${name}.clips.${id}.sync`)
    }
    const result: PlantAnimationDefinition = { clips, layers }
    if (source.fire !== undefined) result.fire = playing(source.fire, `${name}.fire`)
    if (source.asleep !== undefined) result.asleep = playing(source.asleep, `${name}.asleep`)
    if (source.states !== undefined) {
        result.states = named(source.states, `${name}.states`, playing)
        for (const state of Object.keys(result.states)) abilityState(state, `${name}.states.${state}`)
    }
    if (source.blink !== undefined) {
        const blink = exactObject(source.blink, ['clip'], `${name}.blink`, ['ticks', 'states', 'first'])
        const blinks = typeof blink.clip === 'string' ? { [blink.clip]: 1 }
            : named(blink.clip, `${name}.blink.clip`, (weight, entryName) => positiveInteger(weight, entryName))
        if (!Object.keys(blinks).length) throw new Error(`${name}.blink.clip must not be empty`)
        for (const clip of Object.keys(blinks)) if (!clips[clipOf(clip, `${name}.blink.clip`)].once) throw new Error(`${name}.blink.clip must be played once: ${clip}`)
        if (Object.hasOwn(layers, PLANT_BLINK_LAYER)) throw new Error(`${name}.layers must leave ${PLANT_BLINK_LAYER} to the blink`)
        result.blink = {
            clips: blinks, ticks: blink.ticks === undefined ? PLANT_BLINK_TICKS : tickRange(blink.ticks, `${name}.blink.ticks`, 1),
            ...(blink.states === undefined ? {} : { states: array(blink.states, `${name}.blink.states`).map((state, index) => abilityState(state, `${name}.blink.states[${index}]`)) }),
            ...(blink.first === undefined ? {} : { first: tickRange(blink.first, `${name}.blink.first`, 1) }),
        }
    }
    return result
}

/** The entries of an object under names of the content's own (a plant's clips and layers), not qualified ids. */
function named<T>(value: unknown, name: string, parse: (entry: unknown, entryName: string) => T): Record<string, T> {
    return Object.fromEntries(Object.entries(object(value, name)).map(([id, entry]) => [id, parse(entry, `${name}.${id}`)]))
}

function parsePlantTargeting(value: unknown, name: string): PlantTargeting {
    const source = exactObject(value, ['eatingExtraRange', 'excludeHeldPole'], name, ['insetKey', 'plantReach'])
    if (typeof source.excludeHeldPole !== 'boolean') throw new Error(`${name}.excludeHeldPole must be boolean`)
    return {
        eatingExtraRange: nonNegativeFinite(source.eatingExtraRange, `${name}.eatingExtraRange`),
        excludeHeldPole: source.excludeHeldPole,
        ...(source.insetKey === undefined ? {} : { insetKey: qualifiedId(source.insetKey, `${name}.insetKey`) }),
        ...(source.plantReach === undefined ? {} : { plantReach: nonNegativeFinite(source.plantReach, `${name}.plantReach`) }),
    }
}

function parseZombieGait(value: unknown, name: string): ZombieGait {
    const gait = exactObject(value, ['walkGround', 'eat', 'deaths'], name)
    const eat = exactObject(gait.eat, ['frames', 'rate', 'chewTimes'], `${name}.eat`)
    const chewTimes = array(eat.chewTimes, `${name}.eat.chewTimes`).map((time, index) =>
        fraction(time, `${name}.eat.chewTimes[${index}]`))
    if (!chewTimes.length) throw new Error(`${name}.eat.chewTimes must not be empty`)
    const deaths = array(gait.deaths, `${name}.deaths`).map((entry, index) => {
        const death = exactObject(entry, ['animation', 'frames', 'fallTime'], `${name}.deaths[${index}]`, ['rate'])
        if (death.animation !== 'anim_death' && death.animation !== 'anim_death2' && death.animation !== 'anim_superlongdeath') {
            throw new Error(`${name}.deaths[${index}].animation must be anim_death, anim_death2 or anim_superlongdeath`)
        }
        return {
            animation: death.animation as 'anim_death' | 'anim_death2' | 'anim_superlongdeath',
            frames: frameCount(death.frames, `${name}.deaths[${index}].frames`),
            fallTime: fraction(death.fallTime, `${name}.deaths[${index}].fallTime`),
            ...(death.rate === undefined ? {} : { rate: positiveFinite(death.rate, `${name}.deaths[${index}].rate`) }),
        }
    })
    if (deaths.length === 0 || deaths[0].animation !== 'anim_death') {
        throw new Error(`${name}.deaths must start with anim_death`)
    }
    if (new Set(deaths.map(death => death.animation)).size !== deaths.length) throw new Error(`${name}.deaths repeats an animation`)
    return {
        walkGround: groundTrack(gait.walkGround, `${name}.walkGround`),
        eat: {
            frames: frameCount(eat.frames, `${name}.eat.frames`),
            rate: positiveFinite(eat.rate, `${name}.eat.rate`),
            chewTimes,
        },
        deaths,
    }
}

function speedRange(value: unknown, name: string): { min: number; max: number } {
    const speed = exactObject(value, ['min', 'max'], name)
    const min = nonNegativeFinite(speed.min, `${name}.min`)
    const max = nonNegativeFinite(speed.max, `${name}.max`)
    if (min > max) throw new Error(`${name}.min must not exceed max`)
    return { min, max }
}

function tickRange(value: unknown, name: string, minimum: number): { min: number; max: number } {
    const source = exactObject(value, ['min', 'max'], name)
    const min = nonNegativeInteger(source.min, `${name}.min`)
    const max = nonNegativeInteger(source.max, `${name}.max`)
    if (min < minimum || min > max) throw new Error(`${name} must satisfy ${minimum} <= min <= max`)
    return { min, max }
}

function groundTrack(value: unknown, name: string): number[] {
    const ground = array(value, name).map((x, index) => finite(x, `${name}[${index}]`))
    if (ground.length < 2 || ground[ground.length - 1] <= ground[0]) {
        throw new Error(`${name} must move forward over at least two frames`)
    }
    return ground
}

function frameCount(value: unknown, name: string): number {
    const frames = positiveInteger(value, name)
    if (frames < 2) throw new Error(`${name} must be at least 2`)
    return frames
}

function fraction(value: unknown, name: string): number {
    const result = finite(value, name)
    if (result < 0 || result > 1) throw new Error(`${name} must be between 0 and 1`)
    return result
}

export function parseProjectile(value: unknown, name: string): ProjectileDefinition {
    const source = exactObject(value, ['hitbox'], name, ['mow', ...Object.keys(PROJECTILE_ATTRIBUTES)])
    if ((source.damage === undefined) === (source.mow === undefined)) throw new Error(`${name} needs exactly one of damage and mow`)
    if (source.mow !== undefined && source.mow !== true) throw new Error(`${name}.mow must be true`)
    return { ...(source.mow ? { mow: true as const } : {}), hitbox: rect(source.hitbox, `${name}.hitbox`), ...parseProjectileAttributes(source, name) }
}

function parseItem(value: unknown, name: string): ItemDefinition {
    const source = exactObject(value, ['value', 'width', 'height'], name, ['kind', 'scale', 'lifetimeTicks'])
    if (source.kind !== undefined && source.kind !== 'sun' && source.kind !== 'money') throw new Error(`${name}.kind must be sun or money`)
    return {
        ...(source.kind === undefined ? {} : { kind: source.kind as 'sun' | 'money' }),
        ...(source.lifetimeTicks === undefined ? {} : { lifetimeTicks: positiveInteger(source.lifetimeTicks, `${name}.lifetimeTicks`) }),
        value: positiveInteger(source.value, `${name}.value`),
        width: positiveFinite(source.width, `${name}.width`),
        height: positiveFinite(source.height, `${name}.height`),
        ...(source.scale === undefined ? {} : { scale: positiveFinite(source.scale, `${name}.scale`) }),
    }
}

function parseAchievement(value: unknown, name: string): AchievementDefinition {
    const source = exactObject(value, ['titleKey', 'descriptionKey', 'icon'], name, ['trigger'])
    const icon = exactObject(source.icon, ['sprite', 'index'], `${name}.icon`)
    let trigger: AchievementTrigger | undefined
    if (source.trigger !== undefined) {
        const { kind, ...settings } = object(source.trigger, `${name}.trigger`)
        trigger = { kind: qualifiedId(kind, `${name}.trigger.kind`), settings: jsonRoundTrip(settings) as JsonObject }
    }
    return {
        titleKey: string(source.titleKey, `${name}.titleKey`),
        descriptionKey: string(source.descriptionKey, `${name}.descriptionKey`),
        icon: { sprite: qualifiedId(icon.sprite, `${name}.icon.sprite`), index: nonNegativeInteger(icon.index, `${name}.icon.index`) },
        ...(trigger ? { trigger } : {}),
    }
}

function parseLevelWaves(value: unknown[], name: string, definitions: GameplayDefinitions): LevelWave[] {
    if (value.length === 0) throw new Error(`${name}.waves must not be empty`)
    return value.map((wave, waveIndex) => {
        const waveName = `${name}.waves[${waveIndex}]`
        const record = exactObject(wave, ['zombies'], waveName, ['flagWave', 'points'])
        if (record.flagWave !== undefined && typeof record.flagWave !== 'boolean') throw new Error(`${waveName}.flagWave must be boolean`)
        const zombies = qualifiedIdArray(record.zombies, `${waveName}.zombies`)
        zombies.forEach((id, index) => reference(id, definitions.zombies, `${waveName}.zombies[${index}]`))
        return { zombies, ...(record.flagWave === undefined ? {} : { flagWave: record.flagWave as boolean }),
            ...(record.points === undefined ? {} : { points: positiveInteger(record.points, `${waveName}.points`) }) }
    })
}

function parseLevelRule(value: unknown, name: string): LevelRule {
    const { kind, count, ...settings } = object(value, name)
    return { kind: qualifiedId(kind, `${name}.kind`), count: positiveInteger(count, `${name}.count`), settings: jsonRoundTrip(settings) as JsonObject }
}

/** An entry is a zombie id taking its wave fields, or {id, ...} overriding some of them. */
function parseZombiePool(value: unknown, name: string, definitions: GameplayDefinitions): NonNullable<LevelDefinition['zombiePool']> {
    return array(value, `${name}.zombiePool`).map((value, index) => {
        const entryName = `${name}.zombiePool[${index}]`
        const entry = typeof value === 'string' ? { id: value } as Record<string, unknown> : exactObject(value, ['id'], entryName, ['points', 'weight', 'firstWave'])
        const id = qualifiedId(entry.id, `${entryName}.id`)
        const wave = reference(id, definitions.zombies, `${entryName}.id`).wave
        const points = entry.points ?? wave?.points, weight = entry.weight ?? wave?.weight, firstWave = entry.firstWave ?? wave?.firstWave
        if (points === undefined || weight === undefined) throw new Error(`${entryName} needs points and weight, from the zombie's wave or the entry`)
        return { id, points: positiveInteger(points, `${entryName}.points`), weight: nonNegativeInteger(weight, `${entryName}.weight`),
            ...(firstWave === undefined ? {} : { firstWave: positiveInteger(firstWave, `${entryName}.firstWave`) }) }
    })
}

/**
 * Board::PickGraveRisingZombieType for a level without graves of its own (they come from /grave): the zombies with
 * `graveRise` that the level allows (mZombieAllowed), in definition order.
 */
function defaultGraveZombies(definitions: GameplayDefinitions, waves: LevelDefinition['waves'],
    zombiePool: Array<{ id: string }> | undefined): LevelDefinition['graveZombies'] {
    const allowed = new Set([...zombiePool?.map(entry => entry.id) ?? [], ...waves?.flatMap(wave => wave.zombies) ?? []])
    const picks = Object.entries(definitions.zombies).flatMap(([id, { graveRise, wave }]) =>
        graveRise && allowed.has(id) ? [{ id, weight: wave!.weight }] : [])
    return picks.length ? picks : undefined
}

function parseLevel(value: unknown, name: string, definitions: GameplayDefinitions): LevelDefinition {
    const source = exactObject(value, [
        'adventureIndex', 'board', 'lawnMower', 'activeRows', 'startingSun', 'tutorial', 'award',
    ], name, ['waves', 'rules', 'nextLevel', 'seedPackets', 'firstWaveTicks', 'zombiePool', 'conveyor', 'initialPlants', 'persistent',
        'achievements', 'plantingLine', 'skySun', 'graves', 'graveZombies', 'openingRecharge', 'tools'])
    if (source.persistent !== undefined && typeof source.persistent !== 'boolean') throw new Error(`${name}.persistent must be a boolean`)
    if (source.achievements !== undefined && typeof source.achievements !== 'boolean') throw new Error(`${name}.achievements must be a boolean`)
    const boardId = qualifiedId(source.board, `${name}.board`)
    const board = reference(boardId, definitions.boards, `${name}.board`)
    const activeRows = array(source.activeRows, `${name}.activeRows`).map((row, index) => {
        const parsed = nonNegativeInteger(row, `${name}.activeRows[${index}]`)
        if (parsed >= board.rows) throw new Error(`${name}.activeRows[${index}] is outside the board`)
        return parsed
    })
    if (activeRows.length === 0) throw new Error(`${name}.activeRows must not be empty`)
    let plantingLine: LevelDefinition['plantingLine']
    if (source.plantingLine !== undefined) {
        const line = exactObject(source.plantingLine, ['column'], `${name}.plantingLine`)
        plantingLine = { column: nonNegativeInteger(line.column, `${name}.plantingLine.column`) }
        if (plantingLine.column >= board.columns) throw new Error(`${name}.plantingLine.column is outside the board`)
    }
    if (new Set(activeRows).size !== activeRows.length) throw new Error(`${name}.activeRows must not contain duplicates`)

    const seedPackets = source.seedPackets === undefined ? undefined : qualifiedIdArray(source.seedPackets, `${name}.seedPackets`)
    seedPackets?.forEach((id, index) => reference(id, definitions.seeds, `${name}.seedPackets[${index}]`))
    if (seedPackets && seedPackets.length > definitions.seedBank.maxSlots) throw new Error(`${name}.seedPackets exceeds the bank`)
    let conveyor: LevelDefinition['conveyor']
    if (source.conveyor !== undefined) {
        const data = exactObject(source.conveyor, ['seeds', 'capacity', 'spacing', 'entryX', 'moveTicks', 'spawnDelay', 'insertionGap', 'removalGap'], `${name}.conveyor`, ['initialSeed', 'initialDelayTicks'])
        conveyor = {
            ...(data.initialSeed === undefined ? {} : { initialSeed: qualifiedId(data.initialSeed, `${name}.conveyor.initialSeed`) }),
            ...(data.initialDelayTicks === undefined ? {} : { initialDelayTicks: positiveInteger(data.initialDelayTicks, `${name}.conveyor.initialDelayTicks`) }),
            capacity: positiveInteger(data.capacity, `${name}.conveyor.capacity`),
            spacing: positiveFinite(data.spacing, `${name}.conveyor.spacing`),
            entryX: nonNegativeInteger(data.entryX, `${name}.conveyor.entryX`),
            moveTicks: positiveInteger(data.moveTicks, `${name}.conveyor.moveTicks`),
            insertionGap: positiveFinite(data.insertionGap, `${name}.conveyor.insertionGap`),
            removalGap: positiveFinite(data.removalGap, `${name}.conveyor.removalGap`),
            spawnDelay: array(data.spawnDelay, `${name}.conveyor.spawnDelay`).map(value => {
                const entry = exactObject(value, ['minPackets', 'ticks'], `${name}.conveyor.spawnDelay`)
                return { minPackets: nonNegativeInteger(entry.minPackets, `${name}.conveyor.minPackets`), ticks: positiveInteger(entry.ticks, `${name}.conveyor.ticks`) }
            }),
            seeds: array(data.seeds, `${name}.conveyor.seeds`).map((value, index) => {
                const entry = exactObject(value, ['id', 'weight'], `${name}.conveyor.seeds[${index}]`)
                const id = qualifiedId(entry.id, `${name}.conveyor.seeds.id`)
                reference(id, definitions.seeds, `${name}.conveyor.seeds.id`)
                return { id, weight: positiveInteger(entry.weight, `${name}.conveyor.seeds.weight`) }
            }),
        }
        if (!conveyor.seeds.length || conveyor.spawnDelay[0]?.minPackets !== 0 ||
            conveyor.spawnDelay.some((entry, index, entries) => index > 0 && entry.minPackets <= entries[index - 1].minPackets)) throw new Error(`${name}.conveyor has invalid supply rules`)
        if (conveyor.initialSeed && !conveyor.seeds.some(seed => seed.id === conveyor!.initialSeed)) throw new Error(`${name}.conveyor.initialSeed is not in the supply`)
    }
    const plantPositions = (value: unknown, field: string) => array(value, field).map((item, index) => {
        const entryName = `${field}[${index}]`
        const entry = exactObject(item, ['seedId', 'row', 'column'], entryName, ['team'])
        const seedId = qualifiedId(entry.seedId, `${entryName}.seedId`)
        reference(seedId, definitions.seeds, `${entryName}.seedId`)
        const row = nonNegativeInteger(entry.row, `${entryName}.row`)
        const column = nonNegativeInteger(entry.column, `${entryName}.column`)
        if (!activeRows.includes(row) || column >= board.columns) throw new Error(`${entryName} is outside the lawn`)
        if (entry.team !== undefined && entry.team !== 'plants' && entry.team !== 'zombies') throw new Error(`${entryName}.team must be plants or zombies`)
        return { seedId, row, column, ...(entry.team === 'zombies' ? { team: 'zombies' as const } : {}) }
    })
    const initialPlants = source.initialPlants === undefined ? undefined : plantPositions(source.initialPlants, `${name}.initialPlants`)
    if (seedPackets && conveyor) throw new Error(`${name} cannot combine a conveyor and fixed seed packets`)
    if ((source.waves === undefined) === (source.rules === undefined)) throw new Error(`${name} needs either waves or rules`)
    // The rule form moved from `waves: {kind, ...}` to `rules`; say so rather than asking for an array.
    if (source.waves !== undefined && !Array.isArray(source.waves)) throw new Error(`${name}.waves lists the waves; write a level rule as rules: {kind, count, ...}`)
    const waves = source.waves === undefined ? undefined : parseLevelWaves(array(source.waves, `${name}.waves`), name, definitions)
    const rules = source.rules === undefined ? undefined : parseLevelRule(source.rules, `${name}.rules`)
    const zombiePool = source.zombiePool === undefined ? undefined : parseZombiePool(source.zombiePool, name, definitions)
    if (zombiePool && new Set(zombiePool.map(entry => entry.id)).size !== zombiePool.length) throw new Error(`${name}.zombiePool contains duplicate IDs`)
    const fills = rules !== undefined || waves!.some(wave => wave.points !== undefined)
    if (fills && !zombiePool?.some(entry => entry.weight > 0 && entry.points === 1 && (entry.firstWave ?? 1) === 1)) {
        throw new Error(`${name}.zombiePool must include a weighted one-point zombie`)
    }
    for (const wave of waves ?? []) if (wave.points !== undefined) {
        let spent = 0
        for (const id of wave.zombies) {
            const entry = zombiePool!.find(entry => entry.id === id)
            if (!entry) throw new Error(`${name}.zombiePool is missing ${id}`)
            spent += entry.points
        }
        if (spent > wave.points) throw new Error(`${name}.waves spends more than its points`)
    }
    if (source.openingRecharge !== undefined && source.openingRecharge !== false) throw new Error(`${name}.openingRecharge can only be false`)
    const tools = source.tools === undefined ? undefined : qualifiedIdArray(source.tools, `${name}.tools`)
    const lawnMower = qualifiedId(source.lawnMower, `${name}.lawnMower`)
    reference(lawnMower, definitions.projectiles, `${name}.lawnMower`)
    if (!definitions.projectiles[lawnMower].mow) throw new Error(`${name}.lawnMower must be a projectile that mows`)
    const skySun = source.skySun === undefined ? undefined : qualifiedId(source.skySun, `${name}.skySun`)
    if (skySun) reference(skySun, definitions.items, `${name}.skySun`)
    const graves = source.graves === undefined ? undefined : array(source.graves, `${name}.graves`).map((value, index) => {
        const entry = exactObject(value, ['column', 'count'], `${name}.graves[${index}]`)
        const column = nonNegativeInteger(entry.column, `${name}.graves[${index}].column`)
        const count = positiveInteger(entry.count, `${name}.graves[${index}].count`)
        if (column >= board.columns || count > activeRows.length) throw new Error(`${name}.graves[${index}] does not fit the lawn`)
        return { column, count }
    })
    if (graves && new Set(graves.map(grave => grave.column)).size !== graves.length) throw new Error(`${name}.graves must contain unique columns`)
    if (graves?.length && source.graveZombies === undefined) throw new Error(`${name}.graves need graveZombies`)
    // An entry is a zombie id taking its wave weight, or {id, weight}.
    const graveZombies = source.graveZombies === undefined ? defaultGraveZombies(definitions, waves, zombiePool)
        : array(source.graveZombies, `${name}.graveZombies`).map((value, index) => {
            const entryName = `${name}.graveZombies[${index}]`
            const entry = typeof value === 'string' ? { id: value } as Record<string, unknown> : exactObject(value, ['id'], entryName, ['weight'])
            const id = qualifiedId(entry.id, `${entryName}.id`)
            const zombie = reference(id, definitions.zombies, `${entryName}.id`)
            const weight = entry.weight ?? zombie.wave?.weight
            if (weight === undefined) throw new Error(`${entryName} needs a weight, from the zombie's wave or the entry`)
            return { id, weight: positiveInteger(weight, `${entryName}.weight`) }
        })
    if (source.graveZombies !== undefined && !graveZombies?.length) throw new Error(`${name}.graveZombies must not be empty`)
    const award = object(source.award, `${name}.award`)
    let parsedAward: LevelDefinition['award']
    if (award.kind === 'seed') {
        exactObject(award, ['kind', 'id'], `${name}.award`)
        parsedAward = { kind: 'seed', id: qualifiedId(award.id, `${name}.award.id`) }
    } else if (award.kind === 'tool' || award.kind === 'unlock') {
        exactObject(award, ['kind', 'id', 'titleKey', 'nameKey', 'descriptionKey', 'width', 'height'], `${name}.award`,
            award.kind === 'unlock' ? ['opens', 'unlocks'] : [])
        const fields = { id: qualifiedId(award.id, `${name}.award.id`),
            titleKey: string(award.titleKey, `${name}.award.titleKey`), nameKey: string(award.nameKey, `${name}.award.nameKey`),
            descriptionKey: string(award.descriptionKey, `${name}.award.descriptionKey`),
            width: positiveInteger(award.width, `${name}.award.width`), height: positiveInteger(award.height, `${name}.award.height`) }
        if (award.kind === 'tool') parsedAward = { kind: 'tool', ...fields }
        else {
            let opens: AwardOpens | undefined
            if (award.opens !== undefined) {
                const source = exactObject(award.opens, ['page', 'buttonKey'], `${name}.award.opens`)
                if (source.page !== 'almanac') throw new Error(`${name}.award.opens.page must be almanac`)
                opens = { page: source.page, buttonKey: string(source.buttonKey, `${name}.award.opens.buttonKey`) }
            }
            if (award.unlocks !== undefined && !UNLOCKED_ENTRIES.includes(award.unlocks as string)) {
                throw new Error(`${name}.award.unlocks must be almanac, store or garden`)
            }
            parsedAward = { kind: 'unlock', ...fields, ...opens && { opens },
                ...award.unlocks !== undefined && { unlocks: award.unlocks as UnlockedEntry } }
        }
    } else if (award.kind === 'note') {
        exactObject(award, ['kind', 'id', 'titleKey', 'width', 'height'], `${name}.award`)
        parsedAward = { kind: 'note', id: qualifiedId(award.id, `${name}.award.id`), titleKey: string(award.titleKey, `${name}.award.titleKey`),
            width: positiveInteger(award.width, `${name}.award.width`), height: positiveInteger(award.height, `${name}.award.height`) }
    } else throw new Error(`${name}.award.kind must be seed, tool, unlock or note`)

    return {
        adventureIndex: positiveInteger(source.adventureIndex, `${name}.adventureIndex`),
        ...(source.persistent === undefined ? {} : { persistent: source.persistent as boolean }),
        ...(source.achievements === undefined ? {} : { achievements: source.achievements as boolean }),
        ...(source.nextLevel === undefined ? {} : { nextLevel: qualifiedId(source.nextLevel, `${name}.nextLevel`) }),
        board: boardId,
        activeRows,
        startingSun: nonNegativeInteger(source.startingSun, `${name}.startingSun`),
        ...(seedPackets === undefined ? {} : { seedPackets }),
        ...(initialPlants === undefined ? {} : { initialPlants }),
        ...(plantingLine === undefined ? {} : { plantingLine }),
        ...(conveyor === undefined ? {} : { conveyor }),
        ...(source.openingRecharge === false ? { openingRecharge: false as const } : {}),
        ...(tools === undefined ? {} : { tools }),
        lawnMower,
        ...(skySun === undefined ? {} : { skySun }),
        ...(graves === undefined ? {} : { graves }),
        ...(graveZombies === undefined ? {} : { graveZombies }),
        ...(waves === undefined ? {} : { waves }),
        ...(rules === undefined ? {} : { rules }),
        ...(zombiePool === undefined ? {} : { zombiePool }),
        ...(source.firstWaveTicks === undefined ? {} : { firstWaveTicks: positiveInteger(source.firstWaveTicks, `${name}.firstWaveTicks`) }),
        tutorial: qualifiedId(source.tutorial, `${name}.tutorial`),
        award: parsedAward,
    }
}

function mapped<T>(
    value: unknown,
    name: string,
    parse: (entry: unknown, entryName: string, id: string) => T,
): Record<string, T> {
    const source = object(value, name)
    const result: Record<string, T> = {}
    for (const [id, entry] of Object.entries(source)) {
        qualifiedId(id, `${name} key`)
        result[id] = parse(entry, `${name}.${id}`, id)
    }
    return result
}

function qualifiedIdArray(value: unknown, name: string): string[] {
    return array(value, name).map((entry, index) => qualifiedId(entry, `${name}[${index}]`))
}

function point(value: unknown, name: string): Point {
    const source = exactObject(value, ['x', 'y'], name)
    return { x: finite(source.x, `${name}.x`), y: finite(source.y, `${name}.y`) }
}

function rect(value: unknown, name: string): Rect {
    const source = exactObject(value, ['x', 'y', 'width', 'height'], name)
    return {
        x: finite(source.x, `${name}.x`),
        y: finite(source.y, `${name}.y`),
        width: positiveFinite(source.width, `${name}.width`),
        height: positiveFinite(source.height, `${name}.height`),
    }
}

function reference<T>(id: string, entries: Record<string, T>, name: string): T {
    const entry = entries[id]
    if (entry === undefined) throw new Error(`${name} references unknown ID ${id}`)
    return entry
}

function exactObject(value: unknown, keys: readonly string[], name: string, optional: readonly string[] = []): Record<string, unknown> {
    const record = object(value, name)
    const expected = new Set([...keys, ...optional])
    for (const key of Object.keys(record)) if (!expected.has(key)) throw new Error(`${name}.${key} is not supported`)
    for (const key of keys) if (!Object.prototype.hasOwnProperty.call(record, key)) throw new Error(`${name}.${key} is required`)
    return record
}

function object(value: unknown, name: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`)
    return value as Record<string, unknown>
}

function array(value: unknown, name: string): unknown[] {
    if (!Array.isArray(value)) throw new Error(`${name} must be an array`)
    return value
}

function string(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string`)
    return value
}

function qualifiedId(value: unknown, name: string): string {
    if (!isQualifiedId(value)) throw new Error(`${name} must be a qualified ID`)
    return value
}

function finite(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be a finite number`)
    return value
}

function positiveFinite(value: unknown, name: string): number {
    const result = finite(value, name)
    if (result <= 0) throw new Error(`${name} must be positive`)
    return result
}

function nonNegativeFinite(value: unknown, name: string): number {
    const result = finite(value, name)
    if (result < 0) throw new Error(`${name} must be non-negative`)
    return result
}

function positiveInteger(value: unknown, name: string): number {
    const result = nonNegativeInteger(value, name)
    if (result === 0) throw new Error(`${name} must be positive`)
    return result
}

function nonNegativeInteger(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new Error(`${name} must be a non-negative safe integer`)
    }
    return value
}
