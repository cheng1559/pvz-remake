import { isQualifiedId } from '@/shared/mod/index'
import { jsonRoundTrip, type JsonObject } from '@/shared/protocol'

/** Board pixel where collected sun flies to: the sun counter in the original 800-wide layout. */
export const SUN_BANK_TARGET = { x: 15, y: 0 } as const

export interface GameplayDefinitions {
    schemaVersion: 2
    tickSeconds: number
    boards: Record<string, BoardDefinition>
    seeds: Record<string, SeedDefinition>
    seedCatalog: string[]
    plants: Record<string, PlantDefinition>
    zombies: Record<string, ZombieDefinition>
    zombieGaits: Record<string, ZombieGait>
    projectiles: Record<string, ProjectileDefinition>
    items: Record<string, ItemDefinition>
    lawnMowers: Record<string, LawnMowerDefinition>
}

export interface GameplayLevels {
    schemaVersion: 2
    levels: Record<string, LevelDefinition>
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

export interface SeedDefinition {
    plant: string
    sunCost: number
    cooldownTicks: number
    initialCooldownTicks?: number
    /** First adventure level where this seed is available; omitted for unrestricted content. */
    unlockAdventureIndex?: number
    /** `grave`: only on a grave, like the Grave Buster (PLANTING_ONLY_ON_GRAVES). */
    placement: 'ground' | 'grave'
}

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
}

/** At most one ability; a plant without one only blocks, like the wall-nut. */
export interface PlantDefinition {
    occupiesCell?: boolean
    plantingOffset?: { min: Point; max: Point }
    /** Mushrooms: asleep, doing nothing, on a board that is not at night. */
    nocturnal?: boolean
    maxHealth: number
    body: Rect
    /** JSON configuration consumed by a registered plant behavior. */
    behavior?: JsonObject
    shooter?: {
        cadenceTicks: { min: number; max: number }
        initialDelayTicks: { min: number; max: number }
        windupTicks: number
        shotsPerBurst: number
        burstIntervalTicks: number
        /** Exactly one of `projectile` and `area`. */
        projectile?: string
        /** Plant::DoRowAreaDamage: hits every zombie in the row within reach, like the Fume-shroom. */
        area?: { damage: number; hitsShieldAndBody: boolean }
        offset: Point
        /** Reach beyond the plant body, like the puff-shroom's 230; unlimited when omitted. */
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
}

export interface ZombieDefinition {
    dropsFlag?: boolean
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
    /** Absorbs damage before the body; drops when depleted. A newspaper also keeps the arm on. */
    /** A shield (the newspaper) absorbs hits without chill, keeps the arm on and flashes alone. */
    helm?: { type: 'cone' | 'bucket' | 'newspaper'; health: number; shield?: boolean }
    /** After losing the helm: stands still for pauseTicks, then walks at the new speed. */
    enrage?: { pauseTicks: number; speedPerTick: { min: number; max: number } }
    /** Explicit animation profile and variants; equipment does not imply animation support. */
    gait: string
    tongueChance: number
    walk2Chance: number
    targetingInsets?: Record<string, number>
    /** Runs at the first plant and vaults over it once. */
    vault?: {
        runSpeedPerTick: { min: number; max: number }
        runGround: number[]
        attack: Rect
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
    deaths: Array<{ animation: 'anim_death' | 'anim_death2'; frames: number; fallTime: number }>
}

export interface ProjectileDefinition {
    damage: number
    speedPerTick: Point
    hitbox: Rect
    /** Slows the target for this many ticks, renewed by each hit. */
    chillTicks?: number
    /** Disappears after this many ticks, like the puff-shroom's spore. */
    lifetimeTicks?: number
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

export interface LawnMowerDefinition {
    speedPerTick: number
    attack: Rect
}

export interface LevelDefinition {
    adventureIndex: number
    persistent?: boolean
    board: string
    activeRows: number[]
    startingSun: number
    seedPackets: string[]
    initialPlants?: Array<{ seedId: string; row: number; column: number }>
    /** Enables the shared chooser and sets its carrying capacity; seedPackets is only for a fixed bank. */
    seedBankSlots?: number
    lawnMower: string
    /** Omitted at night: no sun falls from the sky. */
    skySun?: string
    /** Board::AddGraveStones: per column, graves on random free rows. */
    graves?: Array<{ column: number; count: number }>
    /** Board::PickGraveRisingZombieType: one per grave after the final wave, by weight. Required with graves. */
    graveZombies?: Array<{ id: string; weight: number }>
    /** Crazy Dave's lines before the seed chooser, on the first adventure only. */
    introDialog?: number[]
    /**
     * Board::CanDropLoot: zombies drop money on replays, and on the first adventure only with `firstAdventure`.
     * `firstCoinAfterWave` and `savingsCap` are 2-1's first-adventure rules: a guaranteed first coin once that many
     * waves have spawned, and no drop that would bring the money (with the mowers' coins) to the cap.
     */
    loot?: { firstAdventure?: boolean; firstCoinAfterWave?: number; savingsCap?: number }
    /**
     * SeedChooserScreen::OnStartButton on the first adventure: warn first when `seed` is not picked,
     * and use `sunWarning` instead of SEED_CHOOSER_SUN_WARNING when no sun producer is.
     */
    chooserWarnings?: { seed?: { id: string; warning: string }; sunWarning?: string }
    waves: Array<{ zombies: string[]; flagWave?: boolean; points?: number }>
    zombiePool?: Array<{ id: string; points: number; weight: number; firstWave?: number }>
    firstWaveTicks?: number
    tools?: string[]
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
    bowling?: { lineColumn: number }
    shovelTutorial?: {
        opening: number[]
        repeat: number[]
        afterDig: number[]
        introPlants: Array<{ seedId: string; row: number; column: number }>
    }
    nextLevel?: string
    tutorial: string
    award: { kind: 'seed'; id: string; packetCost: number }
        | { kind: 'tool'; id: string; titleKey: string; nameKey: string; descriptionKey: string; width: number; height: number }
        | { kind: 'note'; id: string; titleKey: string; width: number; height: number }
}

interface Point { x: number; y: number }
interface Rect extends Point { width: number; height: number }

export function parseGameplayDefinitions(value: unknown, seedCatalog: unknown): GameplayDefinitions {
    const source = exactObject(value, [
        'schemaVersion', 'tickSeconds', 'boards', 'seeds', 'plants', 'zombies',
        'projectiles', 'items', 'lawnMowers', 'zombieGaits',
    ], 'gameplay definitions')
    if (source.schemaVersion !== 2) throw new Error('gameplay definitions.schemaVersion must be 2')

    const definitions: GameplayDefinitions = {
        schemaVersion: 2,
        tickSeconds: positiveFinite(source.tickSeconds, 'gameplay definitions.tickSeconds'),
        boards: mapped(source.boards, 'boards', parseBoard),
        seeds: mapped(source.seeds, 'seeds', parseSeed),
        seedCatalog: qualifiedIdArray(seedCatalog, 'seed catalog'),
        plants: mapped(source.plants, 'plants', parsePlant),
        zombies: mapped(source.zombies, 'zombies', parseZombie),
        zombieGaits: mapped(source.zombieGaits, 'zombieGaits', parseZombieGait),
        projectiles: mapped(source.projectiles, 'projectiles', parseProjectile),
        items: mapped(source.items, 'items', parseItem),
        lawnMowers: mapped(source.lawnMowers, 'lawnMowers', parseLawnMower),
    }

    if (new Set(definitions.seedCatalog).size !== definitions.seedCatalog.length) throw new Error('seed catalog must not contain duplicates')
    for (const id of definitions.seedCatalog) reference(id, definitions.seeds, 'seed catalog')
    for (const [id, seed] of Object.entries(definitions.seeds)) {
        reference(seed.plant, definitions.plants, `seeds.${id}.plant`)
    }
    for (const [id, plant] of Object.entries(definitions.plants)) {
        if (plant.shooter?.projectile) reference(plant.shooter.projectile, definitions.projectiles, `plants.${id}.shooter.projectile`)
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
    for (const [id, level] of Object.entries(levels)) {
        if (level.nextLevel) reference(level.nextLevel, levels, `levels.${id}.nextLevel`)
    }
    return { schemaVersion: 2, levels }
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

function parseSeed(value: unknown, name: string): SeedDefinition {
    const source = exactObject(value, ['plant', 'sunCost', 'cooldownTicks', 'placement'], name, ['initialCooldownTicks', 'unlockAdventureIndex'])
    if (source.placement !== 'ground' && source.placement !== 'grave') throw new Error(`${name}.placement must be ground or grave`)
    return {
        plant: qualifiedId(source.plant, `${name}.plant`),
        sunCost: nonNegativeInteger(source.sunCost, `${name}.sunCost`),
        cooldownTicks: nonNegativeInteger(source.cooldownTicks, `${name}.cooldownTicks`),
        ...(source.initialCooldownTicks === undefined ? {} : { initialCooldownTicks: nonNegativeInteger(source.initialCooldownTicks, `${name}.initialCooldownTicks`) }),
        ...(source.unlockAdventureIndex === undefined ? {} : { unlockAdventureIndex: positiveInteger(source.unlockAdventureIndex, `${name}.unlockAdventureIndex`) }),
        placement: source.placement,
    }
}

function parsePlant(value: unknown, name: string): PlantDefinition {
    const abilities = ['shooter', 'producer', 'fuse', 'mine', 'chomper', 'graveBuster'] as const
    const source = exactObject(value, ['maxHealth', 'body'], name, [...abilities, 'deathExplosion', 'behavior', 'occupiesCell', 'nocturnal', 'plantingOffset'])
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
    if (source.shooter) {
        const shooter = exactObject(
            source.shooter,
            ['cadenceTicks', 'initialDelayTicks', 'windupTicks', 'shotsPerBurst', 'burstIntervalTicks', 'offset'],
            `${name}.shooter`, ['range', 'projectile', 'area'],
        )
        result.shooter = {
            cadenceTicks: tickRange(shooter.cadenceTicks, `${name}.shooter.cadenceTicks`, 1),
            initialDelayTicks: tickRange(shooter.initialDelayTicks, `${name}.shooter.initialDelayTicks`, 0),
            windupTicks: positiveInteger(shooter.windupTicks, `${name}.shooter.windupTicks`),
            shotsPerBurst: positiveInteger(shooter.shotsPerBurst, `${name}.shooter.shotsPerBurst`),
            burstIntervalTicks: nonNegativeInteger(shooter.burstIntervalTicks, `${name}.shooter.burstIntervalTicks`),
            ...(shooter.projectile === undefined ? {} : { projectile: qualifiedId(shooter.projectile, `${name}.shooter.projectile`) }),
            ...(shooter.area === undefined ? {} : { area: (() => {
                const area = exactObject(shooter.area, ['damage', 'hitsShieldAndBody'], `${name}.shooter.area`)
                if (typeof area.hitsShieldAndBody !== 'boolean') throw new Error(`${name}.shooter.area.hitsShieldAndBody must be boolean`)
                return { damage: positiveInteger(area.damage, `${name}.shooter.area.damage`), hitsShieldAndBody: area.hitsShieldAndBody }
            })() }),
            offset: point(shooter.offset, `${name}.shooter.offset`),
            ...(shooter.range === undefined ? {} : { range: positiveFinite(shooter.range, `${name}.shooter.range`) }),
        }
        if ((result.shooter.projectile === undefined) === (result.shooter.area === undefined)) {
            throw new Error(`${name}.shooter needs exactly one of projectile and area`)
        }
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
    const source = exactObject(value, ['maxHealth', 'boardEdgeX', 'spawn', 'speedPerTick', 'body', 'attack', 'bite', 'gait', 'tongueChance', 'walk2Chance'], name, ['helm', 'enrage', 'vault', 'targetingInsets', 'behavior', 'dropsFlag'])
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
    if (source.dropsFlag !== undefined) {
        if (typeof source.dropsFlag !== 'boolean') throw new Error(`${name}.dropsFlag must be boolean`)
        result.dropsFlag = source.dropsFlag
    }
    if (source.behavior !== undefined) result.behavior = jsonRoundTrip(object(source.behavior, `${name}.behavior`)) as JsonObject
    if (source.targetingInsets !== undefined) {
        result.targetingInsets = mapped(source.targetingInsets, `${name}.targetingInsets`, nonNegativeFinite)
    }
    if (source.helm !== undefined) {
        const helm = exactObject(source.helm, ['type', 'health'], `${name}.helm`, ['shield'])
        if (helm.type !== 'cone' && helm.type !== 'bucket' && helm.type !== 'newspaper') throw new Error(`${name}.helm.type must be cone, bucket or newspaper`)
        result.helm = { type: helm.type, health: positiveInteger(helm.health, `${name}.helm.health`) }
        if (helm.shield !== undefined) {
            if (typeof helm.shield !== 'boolean') throw new Error(`${name}.helm.shield must be boolean`)
            result.helm.shield = helm.shield
        }
    }
    if (source.enrage !== undefined) {
        const enrage = exactObject(source.enrage, ['pauseTicks', 'speedPerTick'], `${name}.enrage`)
        if (!result.helm) throw new Error(`${name}.enrage requires a helm`)
        result.enrage = { pauseTicks: positiveInteger(enrage.pauseTicks, `${name}.enrage.pauseTicks`),
            speedPerTick: speedRange(enrage.speedPerTick, `${name}.enrage.speedPerTick`) }
    }
    if (source.vault !== undefined) {
        const vault = exactObject(source.vault,
            ['runSpeedPerTick', 'runGround', 'attack', 'landedAttack', 'jumpFrames', 'jumpRate', 'landingOffset'], `${name}.vault`)
        result.vault = {
            runSpeedPerTick: speedRange(vault.runSpeedPerTick, `${name}.vault.runSpeedPerTick`),
            runGround: groundTrack(vault.runGround, `${name}.vault.runGround`),
            attack: rect(vault.attack, `${name}.vault.attack`),
            landedAttack: rect(vault.landedAttack, `${name}.vault.landedAttack`),
            jumpFrames: frameCount(vault.jumpFrames, `${name}.vault.jumpFrames`),
            jumpRate: positiveFinite(vault.jumpRate, `${name}.vault.jumpRate`),
            landingOffset: finite(vault.landingOffset, `${name}.vault.landingOffset`),
        }
    }
    return result
}

function parsePlantTargeting(value: unknown, name: string): PlantTargeting {
    const source = exactObject(value, ['eatingExtraRange', 'excludeHeldPole'], name, ['insetKey'])
    if (typeof source.excludeHeldPole !== 'boolean') throw new Error(`${name}.excludeHeldPole must be boolean`)
    return {
        eatingExtraRange: nonNegativeFinite(source.eatingExtraRange, `${name}.eatingExtraRange`),
        excludeHeldPole: source.excludeHeldPole,
        ...(source.insetKey === undefined ? {} : { insetKey: qualifiedId(source.insetKey, `${name}.insetKey`) }),
    }
}

function parseZombieGait(value: unknown, name: string): ZombieGait {
    const gait = exactObject(value, ['walkGround', 'eat', 'deaths'], name)
    const eat = exactObject(gait.eat, ['frames', 'rate', 'chewTimes'], `${name}.eat`)
    const chewTimes = array(eat.chewTimes, `${name}.eat.chewTimes`).map((time, index) =>
        fraction(time, `${name}.eat.chewTimes[${index}]`))
    if (!chewTimes.length) throw new Error(`${name}.eat.chewTimes must not be empty`)
    const deaths = array(gait.deaths, `${name}.deaths`).map((entry, index) => {
        const death = exactObject(entry, ['animation', 'frames', 'fallTime'], `${name}.deaths[${index}]`)
        if (death.animation !== 'anim_death' && death.animation !== 'anim_death2') {
            throw new Error(`${name}.deaths[${index}].animation must be anim_death or anim_death2`)
        }
        return {
            animation: death.animation as 'anim_death' | 'anim_death2',
            frames: frameCount(death.frames, `${name}.deaths[${index}].frames`),
            fallTime: fraction(death.fallTime, `${name}.deaths[${index}].fallTime`),
        }
    })
    if (deaths.length === 0 || deaths[0].animation !== 'anim_death') {
        throw new Error(`${name}.deaths must start with anim_death`)
    }
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

function parseProjectile(value: unknown, name: string): ProjectileDefinition {
    const source = exactObject(value, ['damage', 'speedPerTick', 'hitbox'], name, ['chillTicks', 'lifetimeTicks'])
    return {
        damage: positiveInteger(source.damage, `${name}.damage`),
        speedPerTick: point(source.speedPerTick, `${name}.speedPerTick`),
        hitbox: rect(source.hitbox, `${name}.hitbox`),
        ...(source.chillTicks === undefined ? {} : { chillTicks: positiveInteger(source.chillTicks, `${name}.chillTicks`) }),
        ...(source.lifetimeTicks === undefined ? {} : { lifetimeTicks: positiveInteger(source.lifetimeTicks, `${name}.lifetimeTicks`) }),
    }
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

function parseLawnMower(value: unknown, name: string): LawnMowerDefinition {
    const source = exactObject(value, ['speedPerTick', 'attack'], name)
    return {
        speedPerTick: positiveFinite(source.speedPerTick, `${name}.speedPerTick`),
        attack: rect(source.attack, `${name}.attack`),
    }
}

function parseLevel(value: unknown, name: string, definitions: GameplayDefinitions): LevelDefinition {
    const source = exactObject(value, [
        'adventureIndex', 'board', 'activeRows', 'startingSun',
        'lawnMower', 'waves', 'tutorial', 'award',
    ], name, ['nextLevel', 'seedPackets', 'seedBankSlots', 'firstWaveTicks', 'zombiePool', 'bowling', 'conveyor', 'tools', 'shovelTutorial', 'initialPlants', 'persistent',
        'skySun', 'graves', 'graveZombies', 'introDialog', 'loot', 'chooserWarnings'])
    if (source.persistent !== undefined && typeof source.persistent !== 'boolean') throw new Error(`${name}.persistent must be a boolean`)
    const boardId = qualifiedId(source.board, `${name}.board`)
    const board = reference(boardId, definitions.boards, `${name}.board`)
    const activeRows = array(source.activeRows, `${name}.activeRows`).map((row, index) => {
        const parsed = nonNegativeInteger(row, `${name}.activeRows[${index}]`)
        if (parsed >= board.rows) throw new Error(`${name}.activeRows[${index}] is outside the board`)
        return parsed
    })
    if (activeRows.length === 0) throw new Error(`${name}.activeRows must not be empty`)
    if (new Set(activeRows).size !== activeRows.length) throw new Error(`${name}.activeRows must not contain duplicates`)

    const seedPackets = source.seedPackets === undefined && source.seedBankSlots !== undefined
        ? [] : qualifiedIdArray(source.seedPackets, `${name}.seedPackets`)
    seedPackets.forEach((id, index) => reference(id, definitions.seeds, `${name}.seedPackets[${index}]`))
    let bowling: LevelDefinition['bowling']
    if (source.bowling !== undefined) {
        const data = exactObject(source.bowling, ['lineColumn'], `${name}.bowling`)
        bowling = { lineColumn: nonNegativeInteger(data.lineColumn, `${name}.bowling.lineColumn`) }
        if (bowling.lineColumn >= board.columns) throw new Error(`${name}.bowling is invalid`)
    }
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
        const entry = exactObject(item, ['seedId', 'row', 'column'], entryName)
        const seedId = qualifiedId(entry.seedId, `${entryName}.seedId`)
        reference(seedId, definitions.seeds, `${entryName}.seedId`)
        const row = nonNegativeInteger(entry.row, `${entryName}.row`)
        const column = nonNegativeInteger(entry.column, `${entryName}.column`)
        if (!activeRows.includes(row) || column >= board.columns) throw new Error(`${entryName} is outside the lawn`)
        return { seedId, row, column }
    })
    const initialPlants = source.initialPlants === undefined ? undefined : plantPositions(source.initialPlants, `${name}.initialPlants`)
    let shovelTutorial: LevelDefinition['shovelTutorial']
    if (source.shovelTutorial !== undefined) {
        const data = exactObject(source.shovelTutorial, ['opening', 'repeat', 'afterDig', 'introPlants'], `${name}.shovelTutorial`)
        const dialogue = (key: string) => {
            const result = array(data[key], `${name}.shovelTutorial.${key}`).map(value => nonNegativeInteger(value, `${name}.shovelTutorial.${key}`))
            if (!result.length || new Set(result).size !== result.length) throw new Error(`${name}.shovelTutorial.${key} must contain unique dialogue IDs`)
            return result
        }
        shovelTutorial = {
            opening: dialogue('opening'), repeat: dialogue('repeat'), afterDig: dialogue('afterDig'),
            introPlants: plantPositions(data.introPlants, `${name}.shovelTutorial.introPlants`),
        }
    }
    const tools = source.tools === undefined ? undefined : qualifiedIdArray(source.tools, `${name}.tools`)
    if (source.tutorial === 'pvz:shovel' && (!shovelTutorial || !tools?.includes('pvz:shovel'))) throw new Error(`${name} shovel tutorial requires dialogue and shovel`)
    const seedBankSlots = source.seedBankSlots === undefined ? undefined : positiveInteger(source.seedBankSlots, `${name}.seedBankSlots`)
    if (seedBankSlots !== undefined && (seedBankSlots > 10 || seedBankSlots > definitions.seedCatalog.length)) throw new Error(`${name}.seedBankSlots exceeds the shared chooser or bank capacity`)
    if (seedBankSlots !== undefined && seedPackets.length) throw new Error(`${name}.seedPackets is only for a fixed bank`)
    if (seedBankSlots !== undefined && conveyor) throw new Error(`${name} cannot combine a conveyor and seed chooser`)
    const wavesSource = array(source.waves, `${name}.waves`)
    if (wavesSource.length === 0) throw new Error(`${name}.waves must not be empty`)
    const waves = wavesSource.map((wave, waveIndex) => {
        const waveName = `${name}.waves[${waveIndex}]`
        const record = exactObject(wave, ['zombies'], waveName, ['flagWave', 'points'])
        if (record.flagWave !== undefined && typeof record.flagWave !== 'boolean') throw new Error(`${waveName}.flagWave must be boolean`)
        const zombies = qualifiedIdArray(record.zombies, `${waveName}.zombies`)
        zombies.forEach((id, index) => reference(id, definitions.zombies, `${waveName}.zombies[${index}]`))
        return { zombies, ...(record.flagWave === undefined ? {} : { flagWave: record.flagWave as boolean }),
            ...(record.points === undefined ? {} : { points: positiveInteger(record.points, `${waveName}.points`) }) }
    })
    const zombiePool = source.zombiePool === undefined ? undefined : array(source.zombiePool, `${name}.zombiePool`).map((value, index) => {
        const entryName = `${name}.zombiePool[${index}]`
        const entry = exactObject(value, ['id', 'points', 'weight'], entryName, ['firstWave'])
        const id = qualifiedId(entry.id, `${entryName}.id`)
        reference(id, definitions.zombies, `${entryName}.id`)
        return { id, points: positiveInteger(entry.points, `${entryName}.points`), weight: nonNegativeInteger(entry.weight, `${entryName}.weight`),
            ...(entry.firstWave === undefined ? {} : { firstWave: positiveInteger(entry.firstWave, `${entryName}.firstWave`) }) }
    })
    if (waves.some(wave => wave.points !== undefined) && !zombiePool?.some(entry => entry.weight > 0 && entry.points === 1 && (entry.firstWave ?? 1) === 1)) {
        throw new Error(`${name}.zombiePool must include a weighted one-point zombie`)
    }
    if (zombiePool && new Set(zombiePool.map(entry => entry.id)).size !== zombiePool.length) throw new Error(`${name}.zombiePool contains duplicate IDs`)
    for (const wave of waves) if (wave.points !== undefined) {
        let spent = 0
        for (const id of wave.zombies) {
            const entry = zombiePool!.find(entry => entry.id === id)
            if (!entry) throw new Error(`${name}.zombiePool is missing ${id}`)
            spent += entry.points
        }
        if (spent > wave.points) throw new Error(`${name}.waves spends more than its points`)
    }
    const lawnMower = qualifiedId(source.lawnMower, `${name}.lawnMower`)
    reference(lawnMower, definitions.lawnMowers, `${name}.lawnMower`)
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
    const graveZombies = source.graveZombies === undefined ? undefined : array(source.graveZombies, `${name}.graveZombies`).map((value, index) => {
        const entry = exactObject(value, ['id', 'weight'], `${name}.graveZombies[${index}]`)
        const id = qualifiedId(entry.id, `${name}.graveZombies[${index}].id`)
        reference(id, definitions.zombies, `${name}.graveZombies[${index}].id`)
        return { id, weight: positiveInteger(entry.weight, `${name}.graveZombies[${index}].weight`) }
    })
    if (!!graves?.length !== !!graveZombies?.length) throw new Error(`${name}.graves and graveZombies go together`)
    const introDialog = source.introDialog === undefined ? undefined
        : array(source.introDialog, `${name}.introDialog`).map(value => nonNegativeInteger(value, `${name}.introDialog`))
    if (introDialog && (!introDialog.length || new Set(introDialog).size !== introDialog.length)) throw new Error(`${name}.introDialog must contain unique dialogue IDs`)
    let loot: LevelDefinition['loot']
    if (source.loot !== undefined) {
        const entry = exactObject(source.loot, [], `${name}.loot`, ['firstAdventure', 'firstCoinAfterWave', 'savingsCap'])
        if (entry.firstAdventure !== undefined && entry.firstAdventure !== true) throw new Error(`${name}.loot.firstAdventure must be true`)
        loot = {
            ...(entry.firstAdventure === undefined ? {} : { firstAdventure: true }),
            ...(entry.firstCoinAfterWave === undefined ? {} : { firstCoinAfterWave: positiveInteger(entry.firstCoinAfterWave, `${name}.loot.firstCoinAfterWave`) }),
            ...(entry.savingsCap === undefined ? {} : { savingsCap: positiveInteger(entry.savingsCap, `${name}.loot.savingsCap`) }),
        }
    }
    let chooserWarnings: LevelDefinition['chooserWarnings']
    if (source.chooserWarnings !== undefined) {
        const entry = exactObject(source.chooserWarnings, [], `${name}.chooserWarnings`, ['seed', 'sunWarning'])
        const seed = entry.seed === undefined ? undefined : exactObject(entry.seed, ['id', 'warning'], `${name}.chooserWarnings.seed`)
        if (seed) reference(qualifiedId(seed.id, `${name}.chooserWarnings.seed.id`), definitions.seeds, `${name}.chooserWarnings.seed.id`)
        chooserWarnings = {
            ...(seed ? { seed: { id: seed.id as string, warning: string(seed.warning, `${name}.chooserWarnings.seed.warning`) } } : {}),
            ...(entry.sunWarning === undefined ? {} : { sunWarning: string(entry.sunWarning, `${name}.chooserWarnings.sunWarning`) }),
        }
    }
    const award = object(source.award, `${name}.award`)
    let parsedAward: LevelDefinition['award']
    if (award.kind === 'seed') {
        exactObject(award, ['kind', 'id', 'packetCost'], `${name}.award`)
        parsedAward = { kind: 'seed', id: qualifiedId(award.id, `${name}.award.id`), packetCost: nonNegativeInteger(award.packetCost, `${name}.award.packetCost`) }
    } else if (award.kind === 'tool') {
        exactObject(award, ['kind', 'id', 'titleKey', 'nameKey', 'descriptionKey', 'width', 'height'], `${name}.award`)
        parsedAward = { kind: 'tool', id: qualifiedId(award.id, `${name}.award.id`),
            titleKey: string(award.titleKey, `${name}.award.titleKey`), nameKey: string(award.nameKey, `${name}.award.nameKey`),
            descriptionKey: string(award.descriptionKey, `${name}.award.descriptionKey`),
            width: positiveInteger(award.width, `${name}.award.width`), height: positiveInteger(award.height, `${name}.award.height`) }
    } else if (award.kind === 'note') {
        exactObject(award, ['kind', 'id', 'titleKey', 'width', 'height'], `${name}.award`)
        parsedAward = { kind: 'note', id: qualifiedId(award.id, `${name}.award.id`), titleKey: string(award.titleKey, `${name}.award.titleKey`),
            width: positiveInteger(award.width, `${name}.award.width`), height: positiveInteger(award.height, `${name}.award.height`) }
    } else throw new Error(`${name}.award.kind must be seed, tool or note`)

    return {
        adventureIndex: positiveInteger(source.adventureIndex, `${name}.adventureIndex`),
        ...(source.persistent === undefined ? {} : { persistent: source.persistent as boolean }),
        ...(source.nextLevel === undefined ? {} : { nextLevel: qualifiedId(source.nextLevel, `${name}.nextLevel`) }),
        board: boardId,
        activeRows,
        startingSun: nonNegativeInteger(source.startingSun, `${name}.startingSun`),
        seedPackets,
        ...(initialPlants === undefined ? {} : { initialPlants }),
        ...(seedBankSlots === undefined ? {} : { seedBankSlots }),
        ...(bowling === undefined ? {} : { bowling }),
        ...(conveyor === undefined ? {} : { conveyor }),
        ...(tools === undefined ? {} : { tools }),
        ...(shovelTutorial === undefined ? {} : { shovelTutorial }),
        lawnMower,
        ...(skySun === undefined ? {} : { skySun }),
        ...(graves === undefined ? {} : { graves }),
        ...(graveZombies === undefined ? {} : { graveZombies }),
        ...(introDialog === undefined ? {} : { introDialog }),
        ...(loot === undefined ? {} : { loot }),
        ...(chooserWarnings === undefined ? {} : { chooserWarnings }),
        waves,
        ...(zombiePool === undefined ? {} : { zombiePool }),
        ...(source.firstWaveTicks === undefined ? {} : { firstWaveTicks: positiveInteger(source.firstWaveTicks, `${name}.firstWaveTicks`) }),
        tutorial: qualifiedId(source.tutorial, `${name}.tutorial`),
        award: parsedAward,
    }
}

function mapped<T>(
    value: unknown,
    name: string,
    parse: (entry: unknown, entryName: string) => T,
): Record<string, T> {
    const source = object(value, name)
    const result: Record<string, T> = {}
    for (const [id, entry] of Object.entries(source)) {
        qualifiedId(id, `${name} key`)
        result[id] = parse(entry, `${name}.${id}`)
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
