import { record, array, nonEmptyString, finite, nonNegativeFinite, positiveFinite, integer, nonNegativeInteger, positiveInteger, exact, trueFlag, named, oneOf, pair, point, range } from '@/shared/validate'
import { BASE_MOD_ID, isOwnId, isQualifiedId } from '@/shared/mod/index'
import { seedGroup } from './seedGroups'
import { withFrom } from './from'
import { jsonRoundTrip, type JsonObject } from '@/shared/protocol'
import { PLANT_ABILITY_STATES, type PlantAbilityState } from './plantAbilities'
import { CHOOSER_PLACES, PLANT_ATTACKS, STORE_PAGE_PLACES, TOOL_KINDS, PLANT_BLINK_LAYER, PLANT_BLINK_TICKS, ZOMBIE_BODY_LAYER, ZOMBIE_CLIPS, type AchievementDefinition, type AchievementTrigger, type AlmanacZombieEntry, type AnimationClip, type AnimationDefinition, type AwardOpens, type BoardDefinition, type ExplosionDefinition, type GameplayDefinitions, type GameplayLevels, type ItemDefinition, type LevelDefinition, type LevelRule, type LevelWave, type PlantAnimationDefinition, type PlantAttack, type PlantDefinition, type PlantTargeting, type ProjectileDefinition, type ProjectileOverrides, type Rect, type SeedDefinition, type StoreItemDefinition, type StorePageDefinition, type StorePurchase, type ToolDefinition, type UnlockedEntry, type ZenGardenPlant, type ZombieDefinition } from '@/shared/content/gameplayTypes'

/** Reading the gameplay definitions and levels from content, each checked as it is read (and against the rest). */

const PROJECTILE_ATTRIBUTES: Record<keyof ProjectileOverrides, (value: unknown, name: string) => unknown> = {
    damage: positiveInteger,
    pierce: trueFlag,
    splash: trueFlag,
    chillTicks: positiveInteger,
    speed: positiveFinite,
    lifetimeTicks: positiveInteger,
    flightTicks: positiveInteger,
    landingOffset: finite,
    rotation: finite,
    spin: range,
    homingSpeed: positiveFinite,
    turn: positiveFinite,
}

function parseProjectileAttributes(source: Record<string, unknown>, name: string): ProjectileOverrides {
    const result: Record<string, unknown> = {}
    for (const [key, parse] of Object.entries(PROJECTILE_ATTRIBUTES)) if (source[key] !== undefined) result[key] = parse(source[key], `${name}.${key}`)
    return result
}

export function parseGameplayDefinitions(value: unknown): GameplayDefinitions {
    const source = exact(value, [
        'schemaVersion', 'economy', 'boards', 'seeds', 'plants', 'zombies',
        'projectiles', 'items', 'achievements', 'seedBank', 'tools', 'store', 'storePages', 'almanac', 'zenGarden',
    ], 'gameplay definitions')
    const economy = exact(source.economy, ['maxSun', 'maxMoney'], 'gameplay definitions.economy')
    const seedBank = exact(source.seedBank, ['baseSlots', 'maxSlots', 'startingSeeds'], 'gameplay definitions.seedBank')
    const zenGarden = exact(source.zenGarden, ['columns', 'capacity', 'template'], 'gameplay definitions.zenGarden')
    if (source.schemaVersion !== 2) throw new Error('gameplay definitions.schemaVersion must be 2')

    const definitions: GameplayDefinitions = {
        schemaVersion: 2,
        economy: { maxSun: positiveInteger(economy.maxSun, 'economy.maxSun'), maxMoney: positiveInteger(economy.maxMoney, 'economy.maxMoney') },
        boards: mapped(source.boards, 'boards', parseBoard),
        seeds: mapped(source.seeds, 'seeds', parseSeed),
        plants: mapped(withFrom(record(source.plants, 'plants'), 'animation', 'plants'), 'plants', parsePlant),
        zombies: mapped(withFrom(record(source.zombies, 'zombies'), 'animation', 'zombies'), 'zombies', parseZombie),
        projectiles: mapped(source.projectiles, 'projectiles', parseProjectile),
        items: mapped(source.items, 'items', parseItem),
        achievements: mapped(source.achievements, 'achievements', parseAchievement),
        seedBank: { baseSlots: positiveInteger(seedBank.baseSlots, 'seedBank.baseSlots'), maxSlots: positiveInteger(seedBank.maxSlots, 'seedBank.maxSlots'),
            startingSeeds: qualifiedIdArray(seedBank.startingSeeds, 'seedBank.startingSeeds') },
        tools: mapped(source.tools, 'tools', parseTool),
        store: mapped(source.store, 'store', parseStoreItem),
        storePages: mapped(source.storePages, 'storePages', parseStorePage),
        almanac: mapped(source.almanac, 'almanac', parseAlmanacZombie),
        zenGarden: { columns: positiveInteger(zenGarden.columns, 'zenGarden.columns'), capacity: positiveInteger(zenGarden.capacity, 'zenGarden.capacity'),
            template: parseZenGardenPlant(zenGarden.template, 'zenGarden.template') },
    }
    if (definitions.seedBank.baseSlots > definitions.seedBank.maxSlots) throw new Error('seedBank.baseSlots exceeds maxSlots')
    for (const id of definitions.seedBank.startingSeeds) reference(id, definitions.seeds, 'seedBank.startingSeeds')
    checkStore(definitions)
    // AlmanacDialog's zombie page: a window per zombie, each at a place of its own.
    const windows = new Map<number, string>()
    for (const [id, { place }] of Object.entries(definitions.almanac)) {
        reference(id, definitions.zombies, 'almanac key')
        const other = windows.get(place)
        if (other) throw new Error(`almanac.${other} and almanac.${id} share place ${place}`)
        windows.set(place, id)
    }

    // Each group numbers its places on its own (seedGroups): the original seeds are the chooser's grid of plants.
    const places = new Map<string, string>()
    for (const [id, seed] of Object.entries(definitions.seeds)) {
        const group = seedGroup(id, seed), place = `${group} ${seed.position}`
        if (seed.hidden && !isOwnId(BASE_MOD_ID, id)) throw new Error(`seeds.${id}.hidden: only the base game's seeds are hidden cards; a Mod's seeds are its own group`)
        if (group === BASE_MOD_ID && seed.kind !== 'plant') throw new Error(`seeds.${id} is not a plant seed; the chooser's grid only offers plants, so mark it hidden`)
        if (group === BASE_MOD_ID && seed.position >= CHOOSER_PLACES) throw new Error(`seeds.${id}.position must be below ${CHOOSER_PLACES}, in the chooser's grid`)
        const other = places.get(place)
        if (other) throw new Error(`seeds ${other} and ${id} share position ${seed.position} in their group`)
        places.set(place, id)
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
    return definitions
}

export function parseGameplayLevels(
    value: unknown,
    definitions: GameplayDefinitions,
): GameplayLevels {
    const source = exact(value, ['schemaVersion', 'levels'], 'gameplay levels')
    if (source.schemaVersion !== 2) throw new Error('gameplay levels.schemaVersion must be 2')
    const levels = mapped(source.levels, 'levels', (entry, name) => parseLevel(entry, name, definitions))
    const result: GameplayLevels = { schemaVersion: 2, levels }
    for (const [id, level] of Object.entries(levels)) {
        if (level.nextLevel) reference(level.nextLevel, levels, `levels.${id}.nextLevel`)
    }
    return result
}

const UNLOCKED_ENTRIES: readonly string[] = ['almanac', 'store', 'garden'] satisfies UnlockedEntry[]

function parseBoard(value: unknown, name: string): BoardDefinition {
    const source = exact(value, ['rows', 'columns', 'origin', 'cell', 'bounds'], name, ['night'])
    if (source.night !== undefined && typeof source.night !== 'boolean') throw new Error(`${name}.night must be boolean`)
    const bounds = exact(source.bounds, ['left', 'right'], `${name}.bounds`)
    const left = finite(bounds.left, `${name}.bounds.left`), right = finite(bounds.right, `${name}.bounds.right`)
    if (left >= right) throw new Error(`${name}.bounds must be ordered`)
    const cell = exact(source.cell, ['width', 'height'], `${name}.cell`)
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
    const source = exact(value, ['kind', 'position', 'sunCost', 'cooldownTicks'], name, ['id', 'placement', 'initialCooldownTicks', 'hidden'])
    const common = {
        position: nonNegativeInteger(source.position, `${name}.position`),
        ...(source.hidden === undefined ? {} : { hidden: trueFlag(source.hidden, `${name}.hidden`) }),
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
    const source = exact(value, ['maxHealth', 'body'], name, [...abilities, 'deathExplosion', 'behavior', 'occupiesCell', 'nocturnal', 'low', 'plantingOffset', 'animation'])
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
        const offset = exact(source.plantingOffset, ['min', 'max'], `${name}.plantingOffset`)
        const min = point(offset.min, `${name}.plantingOffset.min`), max = point(offset.max, `${name}.plantingOffset.max`)
        if (![min.x, min.y, max.x, max.y].every(Number.isInteger) || min.x > max.x || min.y > max.y) {
            throw new Error(`${name}.plantingOffset must contain ordered integer coordinates`)
        }
        result.plantingOffset = { min, max }
    }
    if (source.behavior !== undefined) result.behavior = jsonRoundTrip(record(source.behavior, `${name}.behavior`)) as JsonObject
    if (source.animation !== undefined) result.animation = parsePlantAnimation(source.animation, `${name}.animation`)
    const type = attacks.find(key => source[key] !== undefined)
    if (type) {
        const block = `${name}.${type}`
        const { cadenceTicks, initialDelayTicks, windupTicks, shotsPerBurst, burstIntervalTicks, projectile: shot, area, offset, range, anchor } = exact(
            source[type], ['cadenceTicks', 'initialDelayTicks', 'windupTicks', 'shotsPerBurst', 'burstIntervalTicks', 'offset'], block, ['range', 'projectile', 'area', 'anchor'],
        )
        const { id: projectile, ...overrides } = shot === undefined || typeof shot === 'string' ? { id: shot } : record(shot, `${block}.projectile`)
        exact(overrides, [], `${block}.projectile`, Object.keys(PROJECTILE_ATTRIBUTES))
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
                const source = exact(area, ['damage', 'hitsShieldAndBody'], `${block}.area`)
                if (typeof source.hitsShieldAndBody !== 'boolean') throw new Error(`${block}.area.hitsShieldAndBody must be boolean`)
                return { damage: positiveInteger(source.damage, `${block}.area.damage`), hitsShieldAndBody: source.hitsShieldAndBody }
            })() }),
            offset: point(offset, `${block}.offset`),
            ...(range === undefined ? {} : { range: positiveFinite(range, `${block}.range`) }),
        }
        if (anchor !== undefined) {
            const { layer, track } = exact(anchor, ['layer', 'track'], `${block}.anchor`)
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
        const producer = exact(source.producer, ['item', 'cadenceTicks', 'initialDelayTicks'], `${name}.producer`, ['growth'])
        const delay = exact(producer.initialDelayTicks, ['min', 'max'], `${name}.producer.initialDelayTicks`)
        const min = positiveInteger(delay.min, `${name}.producer.initialDelayTicks.min`)
        const max = positiveInteger(delay.max, `${name}.producer.initialDelayTicks.max`)
        if (min > max) throw new Error(`${name}.producer.initialDelayTicks.min must not exceed max`)
        result.producer = {
            item: qualifiedId(producer.item, `${name}.producer.item`),
            cadenceTicks: positiveInteger(producer.cadenceTicks, `${name}.producer.cadenceTicks`),
            initialDelayTicks: { min, max },
        }
        if (producer.growth !== undefined) {
            const growth = exact(producer.growth, ['ticks', 'growingTicks', 'smallItem'], `${name}.producer.growth`)
            result.producer.growth = {
                ticks: positiveInteger(growth.ticks, `${name}.producer.growth.ticks`),
                growingTicks: positiveInteger(growth.growingTicks, `${name}.producer.growth.growingTicks`),
                smallItem: qualifiedId(growth.smallItem, `${name}.producer.growth.smallItem`),
            }
        }
    }
    if (source.graveBuster) {
        const buster = exact(source.graveBuster, ['landTicks', 'eatTicks'], `${name}.graveBuster`)
        result.graveBuster = {
            landTicks: tickRange(buster.landTicks, `${name}.graveBuster.landTicks`, 1),
            eatTicks: positiveInteger(buster.eatTicks, `${name}.graveBuster.eatTicks`),
        }
    }
    if (source.fuse) {
        const fuse = exact(source.fuse, ['ticks', 'explosion'], `${name}.fuse`)
        result.fuse = {
            ticks: positiveInteger(fuse.ticks, `${name}.fuse.ticks`),
            explosion: explosion(fuse.explosion, `${name}.fuse.explosion`),
        }
    }
    if (source.mine) {
        const mine = exact(source.mine, ['armingTicks', 'riseTicks', 'attack', 'targeting', 'explosion'], `${name}.mine`)
        result.mine = {
            armingTicks: positiveInteger(mine.armingTicks, `${name}.mine.armingTicks`),
            riseTicks: positiveInteger(mine.riseTicks, `${name}.mine.riseTicks`),
            attack: rect(mine.attack, `${name}.mine.attack`),
            targeting: parsePlantTargeting(mine.targeting, `${name}.mine.targeting`),
            explosion: explosion(mine.explosion, `${name}.mine.explosion`),
        }
    }
    if (source.chomper) {
        const chomper = exact(source.chomper,
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
    const source = exact(value, ['offset', 'radius', 'rowRange', 'damage', 'burn'], name)
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
    const source = exact(value, ['maxHealth', 'boardEdgeX', 'spawn', 'speedPerTick', 'body', 'attack', 'bite', 'animation', 'tongueChance', 'walk2Chance', 'wave'], name, ['helm', 'shield', 'enrage', 'vault', 'targetingInsets', 'behavior', 'graveRise', 'facingRightOffsetX'])
    const spawn = exact(source.spawn, ['minX', 'maxX', 'flagWaveOffset'], `${name}.spawn`)
    const minX = finite(spawn.minX, `${name}.spawn.minX`)
    const maxX = finite(spawn.maxX, `${name}.spawn.maxX`)
    if (!Number.isSafeInteger(minX) || !Number.isSafeInteger(maxX) || minX > maxX || maxX - minX + 1 > 0x100000000) {
        throw new Error(`${name}.spawn must have ordered safe integer bounds spanning at most 2^32 positions`)
    }
    const bite = exact(source.bite, ['damage', 'cadenceTicks'], `${name}.bite`)
    // Every zombie has its value (mZombieValue): the points a wave spends on it and its loot's odds when it dies.
    const wave = exact(source.wave, ['points', 'weight'], `${name}.wave`, ['firstWave'])
    const result: ZombieDefinition = {
        maxHealth: positiveInteger(source.maxHealth, `${name}.maxHealth`),
        boardEdgeX: finite(source.boardEdgeX, `${name}.boardEdgeX`),
        spawn: { minX, maxX, flagWaveOffset: finite(spawn.flagWaveOffset, `${name}.spawn.flagWaveOffset`) },
        speedPerTick: speedRange(source.speedPerTick, `${name}.speedPerTick`),
        body: rect(source.body, `${name}.body`),
        attack: rect(source.attack, `${name}.attack`),
        animation: parseAnimation(exact(source.animation, ['clips', 'layers'], `${name}.animation`), `${name}.animation`),
        tongueChance: fraction(source.tongueChance, `${name}.tongueChance`),
        walk2Chance: fraction(source.walk2Chance, `${name}.walk2Chance`),
        bite: {
            damage: positiveInteger(bite.damage, `${name}.bite.damage`),
            cadenceTicks: positiveInteger(bite.cadenceTicks, `${name}.bite.cadenceTicks`),
        },
        wave: { points: positiveInteger(wave.points, `${name}.wave.points`), weight: nonNegativeInteger(wave.weight, `${name}.wave.weight`),
            ...(wave.firstWave === undefined ? {} : { firstWave: positiveInteger(wave.firstWave, `${name}.wave.firstWave`) }) },
    }
    if (source.facingRightOffsetX !== undefined) result.facingRightOffsetX = finite(source.facingRightOffsetX, `${name}.facingRightOffsetX`)
    if (source.behavior !== undefined) result.behavior = jsonRoundTrip(record(source.behavior, `${name}.behavior`)) as JsonObject
    if (source.graveRise !== undefined) {
        if (typeof source.graveRise !== 'boolean') throw new Error(`${name}.graveRise must be boolean`)
        if (source.graveRise && !result.wave.weight) throw new Error(`${name}.graveRise needs a weighted wave`)
        result.graveRise = source.graveRise
    }
    if (source.targetingInsets !== undefined) {
        result.targetingInsets = mapped(source.targetingInsets, `${name}.targetingInsets`, nonNegativeFinite)
    }
    for (const slot of ['helm', 'shield'] as const) {
        if (source[slot] === undefined) continue
        const armor = exact(source[slot], ['type', 'health'], `${name}.${slot}`)
        // A helm with `shield: true` is now a `shield`.
        if (typeof armor.type !== 'string' || !/^[a-z][a-z0-9_]*$/.test(armor.type)) throw new Error(`${name}.${slot}.type must be a lowercase name`)
        result[slot] = { type: armor.type, health: positiveInteger(armor.health, `${name}.${slot}.health`) }
    }
    if (source.enrage !== undefined) {
        const enrage = exact(source.enrage, ['pauseTicks', 'speedPerTick'], `${name}.enrage`)
        if (!result.shield) throw new Error(`${name}.enrage requires a shield`)
        result.enrage = { pauseTicks: positiveInteger(enrage.pauseTicks, `${name}.enrage.pauseTicks`),
            speedPerTick: speedRange(enrage.speedPerTick, `${name}.enrage.speedPerTick`) }
    }
    if (source.vault !== undefined) {
        const vault = exact(source.vault,
            ['runSpeedPerTick', 'attack', 'landedAttack', 'landingOffset'], `${name}.vault`,
            ['bowlingAttack'])
        result.vault = {
            runSpeedPerTick: speedRange(vault.runSpeedPerTick, `${name}.vault.runSpeedPerTick`),
            attack: rect(vault.attack, `${name}.vault.attack`),
            ...vault.bowlingAttack === undefined ? {} : { bowlingAttack: rect(vault.bowlingAttack, `${name}.vault.bowlingAttack`) },
            landedAttack: rect(vault.landedAttack, `${name}.vault.landedAttack`),
            landingOffset: finite(vault.landingOffset, `${name}.vault.landingOffset`),
        }
    }
    // The clips the server has it play: those every zombie comes to, and those of what this one does.
    const { clips, layers } = result.animation, clip = ZOMBIE_CLIPS
    const needs = (id: string, what: (clip: AnimationClip) => unknown, why: string) => {
        if (!clips[id] || !what(clips[id])) throw new Error(`${name}.animation.clips.${id} must be a clip that ${why}`)
    }
    // Its body first, walking; over it what it carries, on its own clips (a flag, a balloon's propeller).
    if (Object.keys(layers)[0] !== ZOMBIE_BODY_LAYER || layers[ZOMBIE_BODY_LAYER] !== clip.walk) throw new Error(`${name}.animation.layers must start with ${ZOMBIE_BODY_LAYER}: ${clip.walk}`)
    for (const [layer, carried] of Object.entries(layers)) if (layer !== ZOMBIE_BODY_LAYER && carried === null) throw new Error(`${name}.animation.layers.${layer} must start a clip`)
    for (const id of [clip.walk, ...(result.walk2Chance > 0 ? [clip.walk2] : []), ...(result.vault ? [clip.run] : [])]) needs(id, walked => walked.ground && !walked.fps, 'walks on its ground at its speed, without fps')
    needs(clip.eat, eaten => eaten.fps && eaten.marks, 'has fps and marks its bites')
    for (const id of [clip.death, clip.death2, clip.superLongDeath]) {
        if (id === clip.death || clips[id]) needs(id, death => death.fps && death.hold && death.marks?.length === 1, 'is held, has fps and marks its fall')
    }
    for (const id of [...(result.vault ? [clip.jump] : []), ...(result.enrage ? [clip.gasp] : [])]) needs(id, once => once.fps && once.hold, 'is held and has fps')
    for (const id of [clip.standing, clip.standing2]) if (clips[id]) needs(id, standing => standing.fps, 'has fps')
    return result
}

/** An animation's clips and layers; what else it has is its kind's to read. */
function parseAnimation(source: Record<string, unknown>, name: string): AnimationDefinition {
    const clips = named(source.clips, `${name}.clips`, (entry, clipName): AnimationClip => {
        const clip = exact(entry, ['frames'], clipName, ['fps', 'sync', 'fit', 'chewed', 'next', 'once', 'hold', 'start', 'tracks', 'ground', 'marks'])
        const frames = positiveInteger(clip.frames, `${clipName}.frames`)
        // One pace: its own, another layer's or its ground's; or it fits, with a pace of its own only for where nothing is to fit.
        // A clip of its own pace may have a ground too, for what it rolls along (a bowled nut).
        if (clip.fit ? clip.sync !== undefined || clip.ground !== undefined
            : clip.sync !== undefined ? clip.fps !== undefined || clip.ground !== undefined
            : clip.fps === undefined && clip.ground === undefined) throw new Error(`${clipName} needs exactly one of fps, sync and ground (fps may have a ground), or fit`)
        if (clip.chewed !== undefined && clip.fps === undefined) throw new Error(`${clipName}.chewed needs fps`)
        const ground = clip.ground === undefined ? undefined : groundTrack(clip.ground, `${clipName}.ground`)
        if (ground && ground.length !== frames) throw new Error(`${clipName}.ground must have a place for each of the clip's ${frames} frames`)
        const marks = clip.marks === undefined ? undefined : array(clip.marks, `${clipName}.marks`).map((mark, index) => fraction(mark, `${clipName}.marks[${index}]`))
        if (marks && !marks.length) throw new Error(`${clipName}.marks must not be empty`)
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
            ...(clip.sync === undefined ? {} : { sync: nonEmptyString(clip.sync, `${clipName}.sync`) }),
            ...(clip.fit ? { fit: true as const } : {}),
            ...(clip.chewed ? { chewed: true as const } : {}),
            ...(clip.next === undefined ? {} : { next: nonEmptyString(clip.next, `${clipName}.next`) }),
            ...(clip.once ? { once: true as const } : {}),
            ...(clip.hold ? { hold: true as const } : {}),
            ...(from ? { start: { min: from[0], max: from[1] } } : {}),
            ...(ground ? { ground } : {}),
            ...(marks ? { marks } : {}),
            ...(clip.tracks === undefined ? {} : { tracks: named(clip.tracks, `${clipName}.tracks`, (track, trackName) => {
                const points = array(track, trackName).map((entry, index) => {
                    const [x, y] = pair(entry, `${trackName}[${index}]`)
                    return { x, y }
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
    for (const [id, clip] of Object.entries(clips)) {
        if (clip.next !== undefined) clipOf(clip.next, `${name}.clips.${id}.next`)
        if (clip.sync !== undefined && !Object.hasOwn(layers, clip.sync)) throw new Error(`${name}.clips.${id}.sync must be one of the animation's layers`)
    }
    return { clips, layers }
}

function parsePlantAnimation(value: unknown, name: string): PlantAnimationDefinition {
    const source = exact(value, ['clips', 'layers'], name, ['fire', 'blink', 'states', 'asleep'])
    const result: PlantAnimationDefinition = parseAnimation(source, name), { clips, layers } = result
    const clipOf = (entry: unknown, entryName: string): string => {
        if (typeof entry !== 'string' || !clips[entry]) throw new Error(`${entryName} must be one of the animation's clips`)
        return entry
    }
    /** What some layers play: `{layer: clip}`. */
    const playing = (entry: unknown, entryName: string): Record<string, string> => {
        const result = named(entry, entryName, clipOf)
        for (const layer of Object.keys(result)) if (!Object.hasOwn(layers, layer)) throw new Error(`${entryName}.${layer} must be one of the animation's layers`)
        return result
    }
    const abilityState = (entry: unknown, entryName: string): PlantAbilityState => {
        if (!PLANT_ABILITY_STATES.includes(entry as PlantAbilityState)) throw new Error(`${entryName} must be a state of a plant's ability`)
        return entry as PlantAbilityState
    }
    if (source.fire !== undefined) result.fire = playing(source.fire, `${name}.fire`)
    if (source.asleep !== undefined) result.asleep = playing(source.asleep, `${name}.asleep`)
    if (source.states !== undefined) {
        result.states = named(source.states, `${name}.states`, playing)
        for (const state of Object.keys(result.states)) abilityState(state, `${name}.states.${state}`)
    }
    if (source.blink !== undefined) {
        const blink = exact(source.blink, ['clip'], `${name}.blink`, ['ticks', 'states', 'first'])
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

function parsePlantTargeting(value: unknown, name: string): PlantTargeting {
    const source = exact(value, ['eatingExtraRange', 'excludeHeldPole'], name, ['insetKey', 'plantReach'])
    if (typeof source.excludeHeldPole !== 'boolean') throw new Error(`${name}.excludeHeldPole must be boolean`)
    return {
        eatingExtraRange: nonNegativeFinite(source.eatingExtraRange, `${name}.eatingExtraRange`),
        excludeHeldPole: source.excludeHeldPole,
        ...(source.insetKey === undefined ? {} : { insetKey: qualifiedId(source.insetKey, `${name}.insetKey`) }),
        ...(source.plantReach === undefined ? {} : { plantReach: nonNegativeFinite(source.plantReach, `${name}.plantReach`) }),
    }
}

function speedRange(value: unknown, name: string): { min: number; max: number } {
    const speed = exact(value, ['min', 'max'], name)
    const min = nonNegativeFinite(speed.min, `${name}.min`)
    const max = nonNegativeFinite(speed.max, `${name}.max`)
    if (min > max) throw new Error(`${name}.min must not exceed max`)
    return { min, max }
}

function tickRange(value: unknown, name: string, minimum: number): { min: number; max: number } {
    const source = exact(value, ['min', 'max'], name)
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

function fraction(value: unknown, name: string): number {
    const result = finite(value, name)
    if (result < 0 || result > 1) throw new Error(`${name} must be between 0 and 1`)
    return result
}

export function parseProjectile(value: unknown, name: string): ProjectileDefinition {
    const source = exact(value, ['hitbox'], name, ['mow', ...Object.keys(PROJECTILE_ATTRIBUTES)])
    if ((source.damage === undefined) === (source.mow === undefined)) throw new Error(`${name} needs exactly one of damage and mow`)
    if (source.mow !== undefined && source.mow !== true) throw new Error(`${name}.mow must be true`)
    return { ...(source.mow ? { mow: true as const } : {}), hitbox: rect(source.hitbox, `${name}.hitbox`), ...parseProjectileAttributes(source, name) }
}

function parseItem(value: unknown, name: string): ItemDefinition {
    const source = exact(value, ['value', 'width', 'height'], name, ['kind', 'scale', 'lifetimeTicks'])
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
    const source = exact(value, ['titleKey', 'descriptionKey', 'icon'], name, ['trigger'])
    const icon = exact(source.icon, ['sprite', 'index'], `${name}.icon`)
    let trigger: AchievementTrigger | undefined
    if (source.trigger !== undefined) {
        const { kind, ...settings } = record(source.trigger, `${name}.trigger`)
        trigger = { kind: qualifiedId(kind, `${name}.trigger.kind`), settings: jsonRoundTrip(settings) as JsonObject }
    }
    return {
        titleKey: nonEmptyString(source.titleKey, `${name}.titleKey`),
        descriptionKey: nonEmptyString(source.descriptionKey, `${name}.descriptionKey`),
        icon: { sprite: qualifiedId(icon.sprite, `${name}.icon.sprite`), index: nonNegativeInteger(icon.index, `${name}.icon.index`) },
        ...(trigger ? { trigger } : {}),
    }
}

function parseTool(value: unknown, name: string): ToolDefinition {
    const source = exact(value, ['kind'], name)
    return { kind: oneOf(source.kind, TOOL_KINDS, `${name}.kind`) }
}

/** A store page or item shows from adventure level `level`, or with `completed` only after the adventure, never both. */
function storeVisibility(source: Record<string, unknown>, name: string): Pick<StorePageDefinition, 'level' | 'completed'> {
    if (source.level !== undefined && source.completed !== undefined) throw new Error(`${name} allows at most one of level and completed`)
    return {
        ...(source.level === undefined ? {} : { level: positiveInteger(source.level, `${name}.level`) }),
        ...(source.completed === undefined ? {} : { completed: trueFlag(source.completed, `${name}.completed`) }),
    }
}

function parseStorePage(value: unknown, name: string): StorePageDefinition {
    return storeVisibility(exact(value, [], name, ['level', 'completed']), name)
}

function parseStoreItem(value: unknown, name: string): StoreItemDefinition {
    const source = exact(value, ['page', 'place', 'purchase'], name,
        ['cost', 'prices', 'message', 'messages', 'level', 'completed', 'requires', 'seedSlots', 'effect', 'unlockChallenge'])
    // A price and Dave's line each come once, or by the number bought (StoreScreen::GetItemCost, the upgrade's lines).
    for (const [one, tiers] of [['cost', 'prices'], ['message', 'messages']]) {
        if ((source[one] === undefined) === (source[tiers] === undefined)) throw new Error(`${name} needs exactly one of ${one} and ${tiers}`)
    }
    const tiers = (key: string, parse: (value: unknown, name: string) => number) => {
        const values = array(source[key], `${name}.${key}`).map((entry, index) => parse(entry, `${name}.${key}[${index}]`))
        if (!values.length) throw new Error(`${name}.${key} must not be empty`)
        return values
    }
    const item: StoreItemDefinition = {
        page: qualifiedId(source.page, `${name}.page`),
        place: nonNegativeInteger(source.place, `${name}.place`),
        ...(source.cost === undefined ? {} : { cost: nonNegativeInteger(source.cost, `${name}.cost`) }),
        ...(source.prices === undefined ? {} : { prices: tiers('prices', nonNegativeInteger) }),
        ...(source.message === undefined ? {} : { message: nonNegativeInteger(source.message, `${name}.message`) }),
        ...(source.messages === undefined ? {} : { messages: tiers('messages', nonNegativeInteger) }),
        ...storeVisibility(source, name),
        purchase: parseStorePurchase(source.purchase, `${name}.purchase`),
        ...(source.seedSlots === undefined ? {} : { seedSlots: tiers('seedSlots', positiveInteger) }),
        ...(source.effect === undefined ? {} : { effect: oneOf(source.effect, ['seedSlots', 'tree'] as const, `${name}.effect`) }),
    }
    if (item.place >= STORE_PAGE_PLACES) throw new Error(`${name}.place must be below ${STORE_PAGE_PLACES}, on its page`)
    if (item.effect === 'seedSlots' && !item.seedSlots) throw new Error(`${name}.effect seedSlots needs seedSlots`)
    if (source.requires !== undefined) {
        const requires = exact(source.requires, [], `${name}.requires`, ['anyPurchases', 'allPurchases', 'minimumStored', 'finishedAdventure'])
        item.requires = {
            ...(requires.anyPurchases === undefined ? {} : { anyPurchases: qualifiedIdArray(requires.anyPurchases, `${name}.requires.anyPurchases`) }),
            ...(requires.allPurchases === undefined ? {} : { allPurchases: qualifiedIdArray(requires.allPurchases, `${name}.requires.allPurchases`) }),
            ...(requires.minimumStored === undefined ? {} : { minimumStored: nonNegativeInteger(requires.minimumStored, `${name}.requires.minimumStored`) }),
            ...(requires.finishedAdventure === undefined ? {} : { finishedAdventure: trueFlag(requires.finishedAdventure, `${name}.requires.finishedAdventure`) }),
        }
    }
    if (source.unlockChallenge !== undefined) {
        const unlock = exact(source.unlockChallenge, ['index', 'value'], `${name}.unlockChallenge`)
        item.unlockChallenge = { index: nonNegativeInteger(unlock.index, `${name}.unlockChallenge.index`), value: integer(unlock.value, `${name}.unlockChallenge.value`) }
    }
    return item
}

function parseStorePurchase(value: unknown, name: string): StorePurchase {
    const { kind } = record(value, name)
    switch (kind) {
        case 'set': return { kind, value: positiveInteger(exact(value, ['kind', 'value'], name).value, `${name}.value`) }
        case 'count': {
            const source = exact(value, ['kind', 'amount', 'limit'], name)
            return { kind, amount: positiveInteger(source.amount, `${name}.amount`), limit: nonNegativeInteger(source.limit, `${name}.limit`) }
        }
        case 'stock': {
            const source = exact(value, ['kind', 'minimum', 'amount', 'limit'], name)
            return { kind, minimum: nonNegativeInteger(source.minimum, `${name}.minimum`), amount: positiveInteger(source.amount, `${name}.amount`),
                limit: nonNegativeInteger(source.limit, `${name}.limit`) }
        }
        case 'timestamp': case 'plant': exact(value, ['kind'], name); return { kind }
        // The seed need not be installed: the store sells the upgrade plants before they are (they stay hidden till then).
        case 'seed': return { kind, id: qualifiedId(exact(value, ['kind', 'id'], name).id, `${name}.id`) }
        default: throw new Error(`${name}.kind must be set, count, stock, timestamp, plant or seed`)
    }
}

/** Each item at a place of its own on an installed page; what it requires is sold too; one seed-slot upgrade (Dave offers it). */
function checkStore(definitions: GameplayDefinitions): void {
    const places = new Map<string, string>()
    for (const [id, item] of Object.entries(definitions.store)) {
        reference(item.page, definitions.storePages, `store.${id}.page`)
        const place = `${item.page} ${item.place}`, other = places.get(place)
        if (other) throw new Error(`store.${other} and store.${id} share place ${item.place} of ${item.page}`)
        places.set(place, id)
        for (const key of ['anyPurchases', 'allPurchases'] as const) {
            item.requires?.[key]?.forEach((required, index) => reference(required, definitions.store, `store.${id}.requires.${key}[${index}]`))
        }
    }
    if (Object.values(definitions.store).filter(item => item.effect === 'seedSlots').length !== 1) {
        throw new Error('store needs exactly one item with the seedSlots effect, the seed-slot upgrade')
    }
}

function parseAlmanacZombie(value: unknown, name: string): AlmanacZombieEntry {
    const source = exact(value, ['place', 'startingLevel'], name, ['spawnedOnly', 'afterAdventure'])
    return {
        place: nonNegativeInteger(source.place, `${name}.place`),
        startingLevel: positiveInteger(source.startingLevel, `${name}.startingLevel`),
        ...(source.spawnedOnly === undefined ? {} : { spawnedOnly: trueFlag(source.spawnedOnly, `${name}.spawnedOnly`) }),
        ...(source.afterAdventure === undefined ? {} : { afterAdventure: trueFlag(source.afterAdventure, `${name}.afterAdventure`) }),
    }
}

function parseZenGardenPlant(value: unknown, name: string): ZenGardenPlant {
    const source = exact(value, ['plant', 'whichZenGarden', 'facing', 'lastWateredTime', 'drawVariation', 'plantAge', 'timesFed',
        'feedingsPerGrow', 'plantNeed', 'lastNeedFulfilledTime', 'lastFertilizedTime', 'lastChocolateTime'], name)
    const word = (key: string) => nonEmptyString(source[key], `${name}.${key}`)
    const time = (key: string) => nonNegativeFinite(source[key], `${name}.${key}`)
    return {
        plant: qualifiedId(source.plant, `${name}.plant`), whichZenGarden: word('whichZenGarden'),
        facing: oneOf(source.facing, ['left', 'right'] as const, `${name}.facing`), lastWateredTime: time('lastWateredTime'),
        drawVariation: word('drawVariation'), plantAge: word('plantAge'),
        timesFed: nonNegativeInteger(source.timesFed, `${name}.timesFed`), feedingsPerGrow: positiveInteger(source.feedingsPerGrow, `${name}.feedingsPerGrow`),
        plantNeed: word('plantNeed'), lastNeedFulfilledTime: time('lastNeedFulfilledTime'), lastFertilizedTime: time('lastFertilizedTime'),
        lastChocolateTime: time('lastChocolateTime'),
    }
}

function parseLevelWaves(value: unknown[], name: string, definitions: GameplayDefinitions): LevelWave[] {
    if (value.length === 0) throw new Error(`${name}.waves must not be empty`)
    return value.map((wave, waveIndex) => {
        const waveName = `${name}.waves[${waveIndex}]`
        const record = exact(wave, ['zombies'], waveName, ['flagWave', 'points'])
        if (record.flagWave !== undefined && typeof record.flagWave !== 'boolean') throw new Error(`${waveName}.flagWave must be boolean`)
        const zombies = qualifiedIdArray(record.zombies, `${waveName}.zombies`)
        zombies.forEach((id, index) => reference(id, definitions.zombies, `${waveName}.zombies[${index}]`))
        return { zombies, ...(record.flagWave === undefined ? {} : { flagWave: record.flagWave as boolean }),
            ...(record.points === undefined ? {} : { points: positiveInteger(record.points, `${waveName}.points`) }) }
    })
}

function parseLevelRule(value: unknown, name: string): LevelRule {
    const { kind, count, ...settings } = record(value, name)
    return { kind: qualifiedId(kind, `${name}.kind`), count: positiveInteger(count, `${name}.count`), settings: jsonRoundTrip(settings) as JsonObject }
}

/** An entry is a zombie id taking its wave fields, or {id, ...} overriding some of them. */
function parseZombiePool(value: unknown, name: string, definitions: GameplayDefinitions): NonNullable<LevelDefinition['zombiePool']> {
    return array(value, `${name}.zombiePool`).map((value, index) => {
        const entryName = `${name}.zombiePool[${index}]`
        const entry = typeof value === 'string' ? { id: value } as Record<string, unknown> : exact(value, ['id'], entryName, ['points', 'weight', 'firstWave'])
        const id = qualifiedId(entry.id, `${entryName}.id`)
        const wave = reference(id, definitions.zombies, `${entryName}.id`).wave
        const points = entry.points ?? wave.points, weight = entry.weight ?? wave.weight, firstWave = entry.firstWave ?? wave.firstWave
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
        graveRise && allowed.has(id) ? [{ id, weight: wave.weight }] : [])
    return picks.length ? picks : undefined
}

function parseLevel(value: unknown, name: string, definitions: GameplayDefinitions): LevelDefinition {
    const source = exact(value, [
        'adventureIndex', 'board', 'lawnMower', 'activeRows', 'startingSun', 'award',
    ], name, ['tutorial', 'waves', 'rules', 'nextLevel', 'seedPackets', 'firstWaveTicks', 'zombiePool', 'conveyor', 'initialPlants', 'persistent',
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
        const line = exact(source.plantingLine, ['column'], `${name}.plantingLine`)
        plantingLine = { column: nonNegativeInteger(line.column, `${name}.plantingLine.column`) }
        if (plantingLine.column >= board.columns) throw new Error(`${name}.plantingLine.column is outside the board`)
    }
    if (new Set(activeRows).size !== activeRows.length) throw new Error(`${name}.activeRows must not contain duplicates`)

    const seedPackets = source.seedPackets === undefined ? undefined : qualifiedIdArray(source.seedPackets, `${name}.seedPackets`)
    seedPackets?.forEach((id, index) => reference(id, definitions.seeds, `${name}.seedPackets[${index}]`))
    if (seedPackets && seedPackets.length > definitions.seedBank.maxSlots) throw new Error(`${name}.seedPackets exceeds the bank`)
    let conveyor: LevelDefinition['conveyor']
    if (source.conveyor !== undefined) {
        const data = exact(source.conveyor, ['seeds', 'capacity', 'spacing', 'entryX', 'moveTicks', 'spawnDelay', 'insertionGap', 'removalGap'], `${name}.conveyor`, ['initialSeed', 'initialDelayTicks'])
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
                const entry = exact(value, ['minPackets', 'ticks'], `${name}.conveyor.spawnDelay`)
                return { minPackets: nonNegativeInteger(entry.minPackets, `${name}.conveyor.minPackets`), ticks: positiveInteger(entry.ticks, `${name}.conveyor.ticks`) }
            }),
            seeds: array(data.seeds, `${name}.conveyor.seeds`).map((value, index) => {
                const entry = exact(value, ['id', 'weight'], `${name}.conveyor.seeds[${index}]`)
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
        const entry = exact(item, ['seedId', 'row', 'column'], entryName, ['team'])
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
    tools?.forEach((id, index) => reference(id, definitions.tools, `${name}.tools[${index}]`))
    const lawnMower = qualifiedId(source.lawnMower, `${name}.lawnMower`)
    reference(lawnMower, definitions.projectiles, `${name}.lawnMower`)
    if (!definitions.projectiles[lawnMower].mow) throw new Error(`${name}.lawnMower must be a projectile that mows`)
    const skySun = source.skySun === undefined ? undefined : qualifiedId(source.skySun, `${name}.skySun`)
    if (skySun) reference(skySun, definitions.items, `${name}.skySun`)
    const graves = source.graves === undefined ? undefined : array(source.graves, `${name}.graves`).map((value, index) => {
        const entry = exact(value, ['column', 'count'], `${name}.graves[${index}]`)
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
            const entry = typeof value === 'string' ? { id: value } as Record<string, unknown> : exact(value, ['id'], entryName, ['weight'])
            const id = qualifiedId(entry.id, `${entryName}.id`)
            const { wave } = reference(id, definitions.zombies, `${entryName}.id`)
            return { id, weight: positiveInteger(entry.weight ?? wave.weight, `${entryName}.weight`) }
        })
    if (source.graveZombies !== undefined && !graveZombies?.length) throw new Error(`${name}.graveZombies must not be empty`)
    const award = record(source.award, `${name}.award`)
    let parsedAward: LevelDefinition['award']
    if (award.kind === 'seed') {
        exact(award, ['kind', 'id'], `${name}.award`)
        parsedAward = { kind: 'seed', id: qualifiedId(award.id, `${name}.award.id`) }
    } else if (award.kind === 'tool' || award.kind === 'unlock') {
        exact(award, ['kind', 'id', 'titleKey', 'nameKey', 'descriptionKey', 'width', 'height'], `${name}.award`,
            award.kind === 'unlock' ? ['opens', 'unlocks'] : [])
        const fields = { id: qualifiedId(award.id, `${name}.award.id`),
            titleKey: nonEmptyString(award.titleKey, `${name}.award.titleKey`), nameKey: nonEmptyString(award.nameKey, `${name}.award.nameKey`),
            descriptionKey: nonEmptyString(award.descriptionKey, `${name}.award.descriptionKey`),
            width: positiveInteger(award.width, `${name}.award.width`), height: positiveInteger(award.height, `${name}.award.height`) }
        if (award.kind === 'tool') {
            reference(fields.id, definitions.tools, `${name}.award.id`)
            parsedAward = { kind: 'tool', ...fields }
        }
        else {
            let opens: AwardOpens | undefined
            if (award.opens !== undefined) {
                const source = exact(award.opens, ['page', 'buttonKey'], `${name}.award.opens`)
                if (source.page !== 'almanac') throw new Error(`${name}.award.opens.page must be almanac`)
                opens = { page: source.page, buttonKey: nonEmptyString(source.buttonKey, `${name}.award.opens.buttonKey`) }
            }
            if (award.unlocks !== undefined && !UNLOCKED_ENTRIES.includes(award.unlocks as string)) {
                throw new Error(`${name}.award.unlocks must be almanac, store or garden`)
            }
            parsedAward = { kind: 'unlock', ...fields, ...opens && { opens },
                ...award.unlocks !== undefined && { unlocks: award.unlocks as UnlockedEntry } }
        }
    } else if (award.kind === 'note') {
        exact(award, ['kind', 'id', 'titleKey', 'width', 'height'], `${name}.award`)
        parsedAward = { kind: 'note', id: qualifiedId(award.id, `${name}.award.id`), titleKey: nonEmptyString(award.titleKey, `${name}.award.titleKey`),
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
        // The tutorial is a server script: GameplayRegistry checks it is installed (TutorialRegistry.validate).
        ...(source.tutorial === undefined ? {} : { tutorial: qualifiedId(source.tutorial, `${name}.tutorial`) }),
        award: parsedAward,
    }
}

function mapped<T>(
    value: unknown,
    name: string,
    parse: (entry: unknown, entryName: string, id: string) => T,
): Record<string, T> {
    const source = record(value, name)
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

function rect(value: unknown, name: string): Rect {
    const source = exact(value, ['x', 'y', 'width', 'height'], name)
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

function qualifiedId(value: unknown, name: string): string {
    if (!isQualifiedId(value)) throw new Error(`${name} must be a qualified ID`)
    return value
}
