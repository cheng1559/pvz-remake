import { isQualifiedId } from '@/shared/mod/index'

export interface GameplayDefinitionsV2 {
    schemaVersion: 2
    tickSeconds: number
    boards: Record<string, BoardDefinitionV2>
    seeds: Record<string, SeedDefinitionV2>
    plants: Record<string, PlantDefinitionV2>
    zombies: Record<string, ZombieDefinitionV2>
    projectiles: Record<string, ProjectileDefinitionV2>
    items: Record<string, ItemDefinitionV2>
    lawnMowers: Record<string, LawnMowerDefinitionV2>
}

export interface GameplayLevelsV2 {
    schemaVersion: 2
    levels: Record<string, LevelDefinitionV2>
}

export interface GameplayStringsV2 {
    schemaVersion: 2
    locale: string
    entries: Record<string, string>
}

export interface BoardDefinitionV2 {
    rows: number
    columns: number
    origin: PointV2
    cell: { width: number; height: number }
}

export interface SeedDefinitionV2 {
    plant: string
    sunCost: number
    cooldownTicks: number
    placement: 'ground'
}

export interface PlantDefinitionV2 {
    maxHealth: number
    body: RectV2
    shooter: {
        cadenceTicks: number
        initialDelayTicks: number
        windupTicks: number
        shotsPerBurst: number
        burstIntervalTicks: number
        projectile: string
        offset: PointV2
    }
}

export interface ZombieDefinitionV2 {
    maxHealth: number
    speedPerTick: { min: number; max: number }
    body: RectV2
    attack: RectV2
    bite: { damage: number; cadenceTicks: number }
}

export interface ProjectileDefinitionV2 {
    damage: number
    speedPerTick: PointV2
    hitbox: RectV2
}

export interface ItemDefinitionV2 {
    value: number
    width: number
    height: number
}

export interface LawnMowerDefinitionV2 {
    speedPerTick: number
    attack: RectV2
}

export interface LevelDefinitionV2 {
    adventureIndex: number
    board: string
    activeRows: number[]
    startingSun: number
    seedPackets: string[]
    lawnMower: string
    skySun: string
    waves: Array<{ zombies: string[] }>
    tutorial: string
    award: { kind: 'seed'; id: string; packetCost: number }
}

interface PointV2 { x: number; y: number }
interface RectV2 extends PointV2 { width: number; height: number }

export function parseGameplayDefinitionsV2(value: unknown): GameplayDefinitionsV2 {
    const source = exactObject(value, [
        'schemaVersion', 'tickSeconds', 'boards', 'seeds', 'plants', 'zombies',
        'projectiles', 'items', 'lawnMowers',
    ], 'gameplay definitions')
    if (source.schemaVersion !== 2) throw new Error('gameplay definitions.schemaVersion must be 2')

    const definitions: GameplayDefinitionsV2 = {
        schemaVersion: 2,
        tickSeconds: positiveFinite(source.tickSeconds, 'gameplay definitions.tickSeconds'),
        boards: mapped(source.boards, 'boards', parseBoard),
        seeds: mapped(source.seeds, 'seeds', parseSeed),
        plants: mapped(source.plants, 'plants', parsePlant),
        zombies: mapped(source.zombies, 'zombies', parseZombie),
        projectiles: mapped(source.projectiles, 'projectiles', parseProjectile),
        items: mapped(source.items, 'items', parseItem),
        lawnMowers: mapped(source.lawnMowers, 'lawnMowers', parseLawnMower),
    }

    for (const [id, seed] of Object.entries(definitions.seeds)) {
        reference(seed.plant, definitions.plants, `seeds.${id}.plant`)
    }
    for (const [id, plant] of Object.entries(definitions.plants)) {
        reference(plant.shooter.projectile, definitions.projectiles, `plants.${id}.shooter.projectile`)
    }
    return definitions
}

export function parseGameplayLevelsV2(
    value: unknown,
    definitions: GameplayDefinitionsV2,
): GameplayLevelsV2 {
    const source = exactObject(value, ['schemaVersion', 'levels'], 'gameplay levels')
    if (source.schemaVersion !== 2) throw new Error('gameplay levels.schemaVersion must be 2')
    const levels = mapped(source.levels, 'levels', (entry, name) => parseLevel(entry, name, definitions))
    return { schemaVersion: 2, levels }
}

export function parseGameplayStringsV2(value: unknown): GameplayStringsV2 {
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

function parseBoard(value: unknown, name: string): BoardDefinitionV2 {
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

function parseSeed(value: unknown, name: string): SeedDefinitionV2 {
    const source = exactObject(value, ['plant', 'sunCost', 'cooldownTicks', 'placement'], name)
    if (source.placement !== 'ground') throw new Error(`${name}.placement must be ground`)
    return {
        plant: qualifiedId(source.plant, `${name}.plant`),
        sunCost: nonNegativeInteger(source.sunCost, `${name}.sunCost`),
        cooldownTicks: nonNegativeInteger(source.cooldownTicks, `${name}.cooldownTicks`),
        placement: 'ground',
    }
}

function parsePlant(value: unknown, name: string): PlantDefinitionV2 {
    const source = exactObject(value, ['maxHealth', 'body', 'shooter'], name)
    const shooter = exactObject(
        source.shooter,
        ['cadenceTicks', 'initialDelayTicks', 'windupTicks', 'shotsPerBurst', 'burstIntervalTicks', 'projectile', 'offset'],
        `${name}.shooter`,
    )
    return {
        maxHealth: positiveInteger(source.maxHealth, `${name}.maxHealth`),
        body: rect(source.body, `${name}.body`),
        shooter: {
            cadenceTicks: positiveInteger(shooter.cadenceTicks, `${name}.shooter.cadenceTicks`),
            initialDelayTicks: nonNegativeInteger(shooter.initialDelayTicks, `${name}.shooter.initialDelayTicks`),
            windupTicks: positiveInteger(shooter.windupTicks, `${name}.shooter.windupTicks`),
            shotsPerBurst: positiveInteger(shooter.shotsPerBurst, `${name}.shooter.shotsPerBurst`),
            burstIntervalTicks: nonNegativeInteger(shooter.burstIntervalTicks, `${name}.shooter.burstIntervalTicks`),
            projectile: qualifiedId(shooter.projectile, `${name}.shooter.projectile`),
            offset: point(shooter.offset, `${name}.shooter.offset`),
        },
    }
}

function parseZombie(value: unknown, name: string): ZombieDefinitionV2 {
    const source = exactObject(value, ['maxHealth', 'speedPerTick', 'body', 'attack', 'bite'], name)
    const speed = exactObject(source.speedPerTick, ['min', 'max'], `${name}.speedPerTick`)
    const min = nonNegativeFinite(speed.min, `${name}.speedPerTick.min`)
    const max = nonNegativeFinite(speed.max, `${name}.speedPerTick.max`)
    if (min > max) throw new Error(`${name}.speedPerTick.min must not exceed max`)
    const bite = exactObject(source.bite, ['damage', 'cadenceTicks'], `${name}.bite`)
    return {
        maxHealth: positiveInteger(source.maxHealth, `${name}.maxHealth`),
        speedPerTick: { min, max },
        body: rect(source.body, `${name}.body`),
        attack: rect(source.attack, `${name}.attack`),
        bite: {
            damage: positiveInteger(bite.damage, `${name}.bite.damage`),
            cadenceTicks: positiveInteger(bite.cadenceTicks, `${name}.bite.cadenceTicks`),
        },
    }
}

function parseProjectile(value: unknown, name: string): ProjectileDefinitionV2 {
    const source = exactObject(value, ['damage', 'speedPerTick', 'hitbox'], name)
    return {
        damage: positiveInteger(source.damage, `${name}.damage`),
        speedPerTick: point(source.speedPerTick, `${name}.speedPerTick`),
        hitbox: rect(source.hitbox, `${name}.hitbox`),
    }
}

function parseItem(value: unknown, name: string): ItemDefinitionV2 {
    const source = exactObject(value, ['value', 'width', 'height'], name)
    return {
        value: positiveInteger(source.value, `${name}.value`),
        width: positiveFinite(source.width, `${name}.width`),
        height: positiveFinite(source.height, `${name}.height`),
    }
}

function parseLawnMower(value: unknown, name: string): LawnMowerDefinitionV2 {
    const source = exactObject(value, ['speedPerTick', 'attack'], name)
    return {
        speedPerTick: positiveFinite(source.speedPerTick, `${name}.speedPerTick`),
        attack: rect(source.attack, `${name}.attack`),
    }
}

function parseLevel(value: unknown, name: string, definitions: GameplayDefinitionsV2): LevelDefinitionV2 {
    const source = exactObject(value, [
        'adventureIndex', 'board', 'activeRows', 'startingSun', 'seedPackets',
        'lawnMower', 'skySun', 'waves', 'tutorial', 'award',
    ], name)
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
        const record = exactObject(wave, ['zombies'], waveName)
        const zombies = qualifiedIdArray(record.zombies, `${waveName}.zombies`)
        zombies.forEach((id, index) => reference(id, definitions.zombies, `${waveName}.zombies[${index}]`))
        return { zombies }
    })
    const lawnMower = qualifiedId(source.lawnMower, `${name}.lawnMower`)
    reference(lawnMower, definitions.lawnMowers, `${name}.lawnMower`)
    const skySun = qualifiedId(source.skySun, `${name}.skySun`)
    reference(skySun, definitions.items, `${name}.skySun`)
    const award = exactObject(source.award, ['kind', 'id', 'packetCost'], `${name}.award`)
    if (award.kind !== 'seed') throw new Error(`${name}.award.kind must be seed`)

    return {
        adventureIndex: positiveInteger(source.adventureIndex, `${name}.adventureIndex`),
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

function point(value: unknown, name: string): PointV2 {
    const source = exactObject(value, ['x', 'y'], name)
    return { x: finite(source.x, `${name}.x`), y: finite(source.y, `${name}.y`) }
}

function rect(value: unknown, name: string): RectV2 {
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

function exactObject(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
    const record = object(value, name)
    const expected = new Set(keys)
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
