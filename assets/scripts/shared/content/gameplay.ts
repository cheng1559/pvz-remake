import { isQualifiedId } from '@/shared/mod/index'
import { jsonRoundTrip, type JsonObject } from '@/shared/protocol'

export interface GameplayDefinitions {
    schemaVersion: 2
    tickSeconds: number
    boards: Record<string, BoardDefinition>
    seeds: Record<string, SeedDefinition>
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

export interface GameplayStrings {
    schemaVersion: 2
    locale: string
    entries: Record<string, string>
}

export interface BoardDefinition {
    rows: number
    columns: number
    origin: Point
    cell: { width: number; height: number }
}

export interface SeedDefinition {
    plant: string
    sunCost: number
    cooldownTicks: number
    placement: 'ground'
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
    maxHealth: number
    body: Rect
    /** JSON configuration consumed by a registered plant behavior. */
    behavior?: JsonObject
    shooter?: {
        cadenceTicks: number
        initialDelayTicks: number
        windupTicks: number
        shotsPerBurst: number
        burstIntervalTicks: number
        projectile: string
        offset: Point
    }
    producer?: {
        item: string
        cadenceTicks: number
        initialDelayTicks: { min: number; max: number }
    }
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
    /** Absorbs damage before the body; drops when depleted. */
    helm?: { type: 'cone' | 'bucket'; health: number }
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
    eat: { frames: number; rate: number; chewTimes: [number, number] }
    deaths: Array<{ animation: 'anim_death' | 'anim_death2'; frames: number; fallTime: number }>
}

export interface ProjectileDefinition {
    damage: number
    speedPerTick: Point
    hitbox: Rect
    /** Slows the target for this many ticks, renewed by each hit. */
    chillTicks?: number
}

export interface ItemDefinition {
    value: number
    width: number
    height: number
}

export interface LawnMowerDefinition {
    speedPerTick: number
    attack: Rect
}

export interface LevelDefinition {
    adventureIndex: number
    board: string
    activeRows: number[]
    startingSun: number
    seedPackets: string[]
    lawnMower: string
    skySun: string
    waves: Array<{ zombies: string[]; flagWave?: boolean }>
    nextLevel?: string
    tutorial: string
    award: { kind: 'seed'; id: string; packetCost: number }
}

interface Point { x: number; y: number }
interface Rect extends Point { width: number; height: number }

export function parseGameplayDefinitions(value: unknown): GameplayDefinitions {
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
        plants: mapped(source.plants, 'plants', parsePlant),
        zombies: mapped(source.zombies, 'zombies', parseZombie),
        zombieGaits: mapped(source.zombieGaits, 'zombieGaits', parseZombieGait),
        projectiles: mapped(source.projectiles, 'projectiles', parseProjectile),
        items: mapped(source.items, 'items', parseItem),
        lawnMowers: mapped(source.lawnMowers, 'lawnMowers', parseLawnMower),
    }

    for (const [id, seed] of Object.entries(definitions.seeds)) {
        reference(seed.plant, definitions.plants, `seeds.${id}.plant`)
    }
    for (const [id, plant] of Object.entries(definitions.plants)) {
        if (plant.shooter) reference(plant.shooter.projectile, definitions.projectiles, `plants.${id}.shooter.projectile`)
        if (plant.producer) reference(plant.producer.item, definitions.items, `plants.${id}.producer.item`)
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

export function parseGameplayStrings(value: unknown): GameplayStrings {
    const source = exactObject(value, ['schemaVersion', 'locale', 'entries'], 'gameplay strings')
    if (source.schemaVersion !== 2) throw new Error('gameplay strings.schemaVersion must be 2')
    const entriesSource = object(source.entries, 'gameplay strings.entries')
    const entries: Record<string, string> = {}
    for (const [key, entry] of Object.entries(entriesSource)) {
        if (key.length === 0) throw new Error('gameplay strings entry key must be non-empty')
        entries[key] = string(entry, `gameplay strings.entries.${key}`)
    }
    return {
        schemaVersion: 2,
        locale: string(source.locale, 'gameplay strings.locale'),
        entries,
    }
}

function parseBoard(value: unknown, name: string): BoardDefinition {
    const source = exactObject(value, ['rows', 'columns', 'origin', 'cell'], name)
    const cell = exactObject(source.cell, ['width', 'height'], `${name}.cell`)
    return {
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
    const source = exactObject(value, ['plant', 'sunCost', 'cooldownTicks', 'placement'], name)
    if (source.placement !== 'ground') throw new Error(`${name}.placement must be ground`)
    return {
        plant: qualifiedId(source.plant, `${name}.plant`),
        sunCost: nonNegativeInteger(source.sunCost, `${name}.sunCost`),
        cooldownTicks: nonNegativeInteger(source.cooldownTicks, `${name}.cooldownTicks`),
        placement: 'ground',
    }
}

function parsePlant(value: unknown, name: string): PlantDefinition {
    const abilities = ['shooter', 'producer', 'fuse', 'mine', 'chomper'] as const
    const source = exactObject(value, ['maxHealth', 'body'], name, [...abilities, 'deathExplosion', 'behavior'])
    if (abilities.filter(key => source[key] !== undefined).length > 1) {
        throw new Error(`${name} allows at most one of ${abilities.join(', ')}`)
    }
    const result: PlantDefinition = {
        maxHealth: positiveInteger(source.maxHealth, `${name}.maxHealth`),
        body: rect(source.body, `${name}.body`),
    }
    if (source.behavior !== undefined) result.behavior = jsonRoundTrip(object(source.behavior, `${name}.behavior`)) as JsonObject
    if (source.shooter) {
        const shooter = exactObject(
            source.shooter,
            ['cadenceTicks', 'initialDelayTicks', 'windupTicks', 'shotsPerBurst', 'burstIntervalTicks', 'projectile', 'offset'],
            `${name}.shooter`,
        )
        result.shooter = {
            cadenceTicks: positiveInteger(shooter.cadenceTicks, `${name}.shooter.cadenceTicks`),
            initialDelayTicks: nonNegativeInteger(shooter.initialDelayTicks, `${name}.shooter.initialDelayTicks`),
            windupTicks: positiveInteger(shooter.windupTicks, `${name}.shooter.windupTicks`),
            shotsPerBurst: positiveInteger(shooter.shotsPerBurst, `${name}.shooter.shotsPerBurst`),
            burstIntervalTicks: nonNegativeInteger(shooter.burstIntervalTicks, `${name}.shooter.burstIntervalTicks`),
            projectile: qualifiedId(shooter.projectile, `${name}.shooter.projectile`),
            offset: point(shooter.offset, `${name}.shooter.offset`),
        }
    }
    if (source.producer) {
        const producer = exactObject(source.producer, ['item', 'cadenceTicks', 'initialDelayTicks'], `${name}.producer`)
        const delay = exactObject(producer.initialDelayTicks, ['min', 'max'], `${name}.producer.initialDelayTicks`)
        const min = positiveInteger(delay.min, `${name}.producer.initialDelayTicks.min`)
        const max = positiveInteger(delay.max, `${name}.producer.initialDelayTicks.max`)
        if (min > max) throw new Error(`${name}.producer.initialDelayTicks.min must not exceed max`)
        result.producer = {
            item: qualifiedId(producer.item, `${name}.producer.item`),
            cadenceTicks: positiveInteger(producer.cadenceTicks, `${name}.producer.cadenceTicks`),
            initialDelayTicks: { min, max },
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
    const source = exactObject(value, ['maxHealth', 'boardEdgeX', 'spawn', 'speedPerTick', 'body', 'attack', 'bite', 'gait', 'tongueChance', 'walk2Chance'], name, ['helm', 'vault', 'targetingInsets', 'behavior'])
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
    if (source.behavior !== undefined) result.behavior = jsonRoundTrip(object(source.behavior, `${name}.behavior`)) as JsonObject
    if (source.targetingInsets !== undefined) {
        result.targetingInsets = mapped(source.targetingInsets, `${name}.targetingInsets`, nonNegativeFinite)
    }
    if (source.helm !== undefined) {
        const helm = exactObject(source.helm, ['type', 'health'], `${name}.helm`)
        if (helm.type !== 'cone' && helm.type !== 'bucket') throw new Error(`${name}.helm.type must be cone or bucket`)
        result.helm = { type: helm.type, health: positiveInteger(helm.health, `${name}.helm.health`) }
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
    if (chewTimes.length !== 2) throw new Error(`${name}.eat.chewTimes must have two entries`)
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
            chewTimes: [chewTimes[0], chewTimes[1]],
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
    const source = exactObject(value, ['damage', 'speedPerTick', 'hitbox'], name, ['chillTicks'])
    return {
        damage: positiveInteger(source.damage, `${name}.damage`),
        speedPerTick: point(source.speedPerTick, `${name}.speedPerTick`),
        hitbox: rect(source.hitbox, `${name}.hitbox`),
        ...(source.chillTicks === undefined ? {} : { chillTicks: positiveInteger(source.chillTicks, `${name}.chillTicks`) }),
    }
}

function parseItem(value: unknown, name: string): ItemDefinition {
    const source = exactObject(value, ['value', 'width', 'height'], name)
    return {
        value: positiveInteger(source.value, `${name}.value`),
        width: positiveFinite(source.width, `${name}.width`),
        height: positiveFinite(source.height, `${name}.height`),
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
        'adventureIndex', 'board', 'activeRows', 'startingSun', 'seedPackets',
        'lawnMower', 'skySun', 'waves', 'tutorial', 'award',
    ], name, ['nextLevel'])
    const boardId = qualifiedId(source.board, `${name}.board`)
    const board = reference(boardId, definitions.boards, `${name}.board`)
    const activeRows = array(source.activeRows, `${name}.activeRows`).map((row, index) => {
        const parsed = nonNegativeInteger(row, `${name}.activeRows[${index}]`)
        if (parsed >= board.rows) throw new Error(`${name}.activeRows[${index}] is outside the board`)
        return parsed
    })
    if (activeRows.length === 0) throw new Error(`${name}.activeRows must not be empty`)
    if (new Set(activeRows).size !== activeRows.length) throw new Error(`${name}.activeRows must not contain duplicates`)

    const seedPackets = qualifiedIdArray(source.seedPackets, `${name}.seedPackets`)
    seedPackets.forEach((id, index) => reference(id, definitions.seeds, `${name}.seedPackets[${index}]`))
    const wavesSource = array(source.waves, `${name}.waves`)
    if (wavesSource.length === 0) throw new Error(`${name}.waves must not be empty`)
    const waves = wavesSource.map((wave, waveIndex) => {
        const waveName = `${name}.waves[${waveIndex}]`
        const record = exactObject(wave, ['zombies'], waveName, ['flagWave'])
        if (record.flagWave !== undefined && typeof record.flagWave !== 'boolean') throw new Error(`${waveName}.flagWave must be boolean`)
        const zombies = qualifiedIdArray(record.zombies, `${waveName}.zombies`)
        zombies.forEach((id, index) => reference(id, definitions.zombies, `${waveName}.zombies[${index}]`))
        return { zombies, ...(record.flagWave === undefined ? {} : { flagWave: record.flagWave as boolean }) }
    })
    const lawnMower = qualifiedId(source.lawnMower, `${name}.lawnMower`)
    reference(lawnMower, definitions.lawnMowers, `${name}.lawnMower`)
    const skySun = qualifiedId(source.skySun, `${name}.skySun`)
    reference(skySun, definitions.items, `${name}.skySun`)
    const award = exactObject(source.award, ['kind', 'id', 'packetCost'], `${name}.award`)
    if (award.kind !== 'seed') throw new Error(`${name}.award.kind must be seed`)

    return {
        adventureIndex: positiveInteger(source.adventureIndex, `${name}.adventureIndex`),
        ...(source.nextLevel === undefined ? {} : { nextLevel: qualifiedId(source.nextLevel, `${name}.nextLevel`) }),
        board: boardId,
        activeRows,
        startingSun: nonNegativeInteger(source.startingSun, `${name}.startingSun`),
        seedPackets,
        lawnMower,
        skySun,
        waves,
        tutorial: qualifiedId(source.tutorial, `${name}.tutorial`),
        award: {
            kind: 'seed',
            id: qualifiedId(award.id, `${name}.award.id`),
            packetCost: nonNegativeInteger(award.packetCost, `${name}.award.packetCost`),
        },
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
