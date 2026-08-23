import type { EntityAllocatorSnapshot, EntityId } from '@/ecs/index'
import {
    assertJsonValue,
    type JsonObject,
    type EnabledMod,
    type ServerEvent,
} from '@/shared/protocol/index'
import { DeterministicRng, type DeterministicRngState } from './DeterministicRng'
import type { EventQueue } from './events'
import type {
    LawnMower,
    Plant,
    PlantAttack,
    Position,
    Projectile,
    SeedBankState,
    Zombie,
} from './gameplay'
import type { Item, TutorialState, WaveState } from './levelOne'

export interface SavedEntityV2 {
    entityId: EntityId
    position?: Position
    lawnMower?: LawnMower
    plant?: Plant
    plantAttack?: PlantAttack
    zombie?: Zombie
    projectile?: Projectile
    item?: Item
}

export interface ServerSaveSnapshotV2 {
    schemaVersion: 2
    levelId: string
    mods: EnabledMod[]
    tick: number
    gameplayTick: number
    allocator: EntityAllocatorSnapshot
    random: DeterministicRngState
    level: { phase: 'intro' | 'gameplay', result: 'playing' | 'won' | 'lost', paused: boolean }
    economy: { sun: number, money: number, pendingSunSpend: number }
    seedBank: SeedBankState
    tutorial: TutorialState
    wave: WaveState
    eventQueue: EventQueue
    entities: SavedEntityV2[]
}

export function parseServerSaveSnapshotV2(value: unknown): ServerSaveSnapshotV2 {
    assertJsonValue(value)
    const save = exact(value, [
        'schemaVersion', 'levelId', 'mods', 'tick', 'gameplayTick', 'allocator', 'random', 'level', 'economy',
        'seedBank', 'tutorial', 'wave', 'eventQueue', 'entities',
    ], 'server save')
    if (save.schemaVersion !== 2) throw new TypeError('server save.schemaVersion must be 2')

    const allocatorSource = exact(save.allocator, ['nextEntity'], 'server save.allocator')
    const allocator = { nextEntity: positiveInteger(allocatorSource.nextEntity, 'server save.allocator.nextEntity') }
    const randomSource = exact(save.random, ['algorithm', 'state'], 'server save.random')
    const random = {
        algorithm: randomSource.algorithm,
        state: integer(randomSource.state, 'server save.random.state'),
    } as DeterministicRngState
    DeterministicRng.restore(random)

    const levelSource = exact(save.level, ['phase', 'result', 'paused'], 'server save.level')
    if (levelSource.phase !== 'intro' && levelSource.phase !== 'gameplay') {
        throw new TypeError('server save.level.phase is unknown')
    }
    if (levelSource.result !== 'playing' && levelSource.result !== 'won' && levelSource.result !== 'lost') {
        throw new TypeError('server save.level.result is unknown')
    }
    const level = {
        phase: levelSource.phase as 'intro' | 'gameplay',
        result: levelSource.result as 'playing' | 'won' | 'lost',
        paused: boolean(levelSource.paused, 'server save.level.paused'),
    }

    const economySource = exact(save.economy, ['sun', 'money', 'pendingSunSpend'], 'server save.economy')
    const economy = {
        sun: integer(economySource.sun, 'server save.economy.sun'),
        money: integer(economySource.money, 'server save.economy.money'),
        pendingSunSpend: integer(economySource.pendingSunSpend, 'server save.economy.pendingSunSpend'),
    }
    const seedBank = parseSeedBank(save.seedBank)
    const tutorial = parseTutorial(save.tutorial)
    const wave = parseWave(save.wave)
    const eventQueue = parseEventQueue(save.eventQueue)
    const entities = array(save.entities, 'server save.entities').map((entity, index) =>
        parseEntity(entity, index, allocator.nextEntity))
    const entityIds = entities.map(entity => entity.entityId)
    if (new Set(entityIds).size !== entityIds.length) throw new TypeError('server save.entities has duplicate IDs')
    const mods = array(save.mods, 'server save.mods').map((value, index) => {
        const name = `server save.mods[${index}]`
        const mod = exact(value, ['id', 'version', 'contentHash'], name)
        return {
            id: nonEmptyString(mod.id, `${name}.id`),
            version: nonEmptyString(mod.version, `${name}.version`),
            contentHash: nonEmptyString(mod.contentHash, `${name}.contentHash`),
        }
    })
    if (new Set(mods.map(mod => mod.id)).size !== mods.length) {
        throw new TypeError('server save.mods has duplicate IDs')
    }
    const tick = nonNegativeInteger(save.tick, 'server save.tick')
    const gameplayTick = nonNegativeInteger(save.gameplayTick, 'server save.gameplayTick')
    if (gameplayTick > tick) throw new TypeError('server save.gameplayTick must not exceed tick')

    return {
        schemaVersion: 2,
        levelId: nonEmptyString(save.levelId, 'server save.levelId'),
        mods,
        tick,
        gameplayTick,
        allocator,
        random,
        level,
        economy,
        seedBank,
        tutorial,
        wave,
        eventQueue,
        entities,
    }
}

function parseSeedBank(value: unknown): SeedBankState {
    const source = optionalExact(value, ['packets'], ['selectedSeedId'], 'server save.seedBank')
    const selectedSeedId = source.selectedSeedId === undefined
        ? undefined
        : nonEmptyString(source.selectedSeedId, 'server save.seedBank.selectedSeedId')
    const packets = array(source.packets, 'server save.seedBank.packets').map((value, index) => {
        const name = `server save.seedBank.packets[${index}]`
        const packet = exact(value, ['seedId', 'readyAtTick'], name)
        return {
            seedId: nonEmptyString(packet.seedId, `${name}.seedId`),
            readyAtTick: nonNegativeInteger(packet.readyAtTick, `${name}.readyAtTick`),
        }
    })
    if (new Set(packets.map(packet => packet.seedId)).size !== packets.length) {
        throw new TypeError('server save.seedBank.packets has duplicate seed IDs')
    }
    return selectedSeedId === undefined ? { packets } : { selectedSeedId, packets }
}

function parseTutorial(value: unknown): TutorialState {
    const source = optionalExact(
        value,
        ['firstAdventure', 'step'],
        ['sunAtTick', 'promptAtTick', 'cantAffordAdviceShown', 'seedRefreshAdviceShown'],
        'server save.tutorial',
    )
    if (source.step !== 'pick-first-seed' && source.step !== 'plant-first-seed' &&
        source.step !== 'first-plant-done' && source.step !== 'collect-first-sun' &&
        source.step !== 'collect-more-sun' && source.step !== 'enough-sun' &&
        source.step !== 'pick-second-seed' && source.step !== 'plant-second-seed' &&
        source.step !== 'complete') {
        throw new TypeError('server save.tutorial.step is unknown')
    }
    const result: TutorialState = {
        firstAdventure: boolean(source.firstAdventure, 'server save.tutorial.firstAdventure'),
        step: source.step,
    }
    if (source.sunAtTick !== undefined) {
        result.sunAtTick = nonNegativeInteger(source.sunAtTick, 'server save.tutorial.sunAtTick')
    }
    if (source.promptAtTick !== undefined) {
        result.promptAtTick = nonNegativeInteger(source.promptAtTick, 'server save.tutorial.promptAtTick')
    }
    if (source.cantAffordAdviceShown !== undefined) {
        result.cantAffordAdviceShown = boolean(
            source.cantAffordAdviceShown,
            'server save.tutorial.cantAffordAdviceShown',
        )
    }
    if (source.seedRefreshAdviceShown !== undefined) {
        result.seedRefreshAdviceShown = boolean(
            source.seedRefreshAdviceShown,
            'server save.tutorial.seedRefreshAdviceShown',
        )
    }
    return result
}

function parseWave(value: unknown): WaveState {
    const source = optionalExact(
        value,
        ['index'],
        ['nextWaveAtTick', 'accelerateAtTick', 'zombieIds', 'healthToNextWave', 'finalWaveAnnounced'],
        'server save.wave',
    )
    const result: WaveState = { index: nonNegativeInteger(source.index, 'server save.wave.index') }
    if (source.nextWaveAtTick !== undefined) {
        result.nextWaveAtTick = nonNegativeInteger(source.nextWaveAtTick, 'server save.wave.nextWaveAtTick')
    }
    if (source.accelerateAtTick !== undefined) {
        result.accelerateAtTick = nonNegativeInteger(source.accelerateAtTick, 'server save.wave.accelerateAtTick')
    }
    if (source.zombieIds !== undefined) {
        result.zombieIds = array(source.zombieIds, 'server save.wave.zombieIds').map((id, index) =>
            positiveInteger(id, `server save.wave.zombieIds[${index}]`))
    }
    if (source.healthToNextWave !== undefined) {
        result.healthToNextWave = nonNegativeFinite(source.healthToNextWave, 'server save.wave.healthToNextWave')
    }
    if (source.finalWaveAnnounced !== undefined) {
        result.finalWaveAnnounced = boolean(source.finalWaveAnnounced, 'server save.wave.finalWaveAnnounced')
    }
    return result
}

function parseEventQueue(value: unknown): EventQueue {
    const source = exact(value, ['nextEventId', 'events'], 'server save.eventQueue')
    const nextEventId = positiveInteger(source.nextEventId, 'server save.eventQueue.nextEventId')
    const events = array(source.events, 'server save.eventQueue.events').map((value, index) => {
        const name = `server save.eventQueue.events[${index}]`
        const event = exact(value, ['eventId', 'type', 'data'], name)
        const data = record(event.data, `${name}.data`) as JsonObject
        return {
            eventId: positiveInteger(event.eventId, `${name}.eventId`),
            type: nonEmptyString(event.type, `${name}.type`),
            data,
        } satisfies ServerEvent
    })
    for (let index = 0; index < events.length; index++) {
        if (events[index].eventId >= nextEventId ||
            (index > 0 && events[index - 1].eventId >= events[index].eventId)) {
            throw new TypeError('server save.eventQueue event IDs must be increasing and below nextEventId')
        }
    }
    return { nextEventId, events }
}

function parseEntity(value: unknown, index: number, nextEntity: number): SavedEntityV2 {
    const name = `server save.entities[${index}]`
    const source = optionalExact(value, ['entityId', 'position'], [
        'lawnMower', 'plant', 'plantAttack', 'zombie', 'projectile', 'item',
    ], name)
    const entityId = positiveInteger(source.entityId, `${name}.entityId`)
    if (entityId >= nextEntity) throw new TypeError(`${name}.entityId must be below allocator.nextEntity`)
    const entity: SavedEntityV2 = {
        entityId,
        position: parsePosition(source.position, `${name}.position`),
    }
    if (source.lawnMower !== undefined) entity.lawnMower = parseMower(source.lawnMower, `${name}.lawnMower`)
    if (source.plant !== undefined) entity.plant = parsePlant(source.plant, `${name}.plant`)
    if (source.plantAttack !== undefined) entity.plantAttack = parsePlantAttack(source.plantAttack, `${name}.plantAttack`)
    if (source.zombie !== undefined) entity.zombie = parseZombie(source.zombie, `${name}.zombie`)
    if (source.projectile !== undefined) entity.projectile = parseProjectile(source.projectile, `${name}.projectile`)
    if (source.item !== undefined) entity.item = parseItem(source.item, `${name}.item`)
    if (Object.keys(entity).length === 1) throw new TypeError(`${name} must contain a component`)
    return entity
}

function parsePosition(value: unknown, name: string): Position {
    const source = exact(value, ['x', 'y', 'row'], name)
    return { x: finite(source.x, `${name}.x`), y: finite(source.y, `${name}.y`), row: integer(source.row, `${name}.row`) }
}

function parseMower(value: unknown, name: string): LawnMower {
    const source = exact(value, ['typeId', 'state', 'chompCounter'], name)
    if (source.state !== 'ready' && source.state !== 'active' && source.state !== 'spent') {
        throw new TypeError(`${name}.state is unknown`)
    }
    return {
        typeId: nonEmptyString(source.typeId, `${name}.typeId`),
        state: source.state,
        chompCounter: nonNegativeInteger(source.chompCounter, `${name}.chompCounter`),
    }
}

function parsePlant(value: unknown, name: string): Plant {
    const source = exact(value, ['typeId', 'seedId', 'column', 'health', 'maxHealth', 'eatenFlashCounter'], name)
    const maxHealth = positiveInteger(source.maxHealth, `${name}.maxHealth`)
    const health = nonNegativeInteger(source.health, `${name}.health`)
    if (health > maxHealth) throw new TypeError(`${name}.health must not exceed maxHealth`)
    return {
        typeId: nonEmptyString(source.typeId, `${name}.typeId`),
        seedId: nonEmptyString(source.seedId, `${name}.seedId`),
        column: nonNegativeInteger(source.column, `${name}.column`),
        health,
        maxHealth,
        eatenFlashCounter: nonNegativeInteger(source.eatenFlashCounter, `${name}.eatenFlashCounter`),
    }
}

function parsePlantAttack(value: unknown, name: string): PlantAttack {
    const source = optionalExact(value, ['readyAtTick'], ['fireAtTick', 'shotsRemaining'], name)
    const attack: PlantAttack = { readyAtTick: nonNegativeInteger(source.readyAtTick, `${name}.readyAtTick`) }
    if (source.fireAtTick !== undefined) attack.fireAtTick = nonNegativeInteger(source.fireAtTick, `${name}.fireAtTick`)
    if (source.shotsRemaining !== undefined) {
        attack.shotsRemaining = positiveInteger(source.shotsRemaining, `${name}.shotsRemaining`)
    }
    return attack
}

function parseZombie(value: unknown, name: string): Zombie {
    const source = exact(value, [
        'typeId', 'health', 'maxHealth', 'state', 'speedPerTick', 'biteTicks', 'deathTicksRemaining',
        'moweredTicksRemaining', 'walkAnimation', 'animation', 'animationTime', 'animationSpeed', 'hasHead', 'hasArm',
        'hitFlashCounter', 'groanCounter',
    ], name)
    if (source.state !== 'walking' && source.state !== 'eating' && source.state !== 'dying' && source.state !== 'mowered') {
        throw new TypeError(`${name}.state is unknown`)
    }
    const maxHealth = positiveInteger(source.maxHealth, `${name}.maxHealth`)
    const health = nonNegativeInteger(source.health, `${name}.health`)
    if (health > maxHealth) throw new TypeError(`${name}.health must not exceed maxHealth`)
    if (source.walkAnimation !== 'anim_walk' && source.walkAnimation !== 'anim_walk2') {
        throw new TypeError(`${name}.walkAnimation is unknown`)
    }
    if (source.animation !== 'anim_walk' && source.animation !== 'anim_walk2' &&
        source.animation !== 'anim_eat' && source.animation !== 'anim_death' &&
        source.animation !== 'anim_death2' && source.animation !== 'mowered') {
        throw new TypeError(`${name}.animation is unknown`)
    }
    if (source.state === 'walking' && source.animation !== 'anim_walk' && source.animation !== 'anim_walk2' ||
        source.state === 'eating' && source.animation !== 'anim_eat' ||
        source.state === 'dying' && source.animation !== 'anim_death' && source.animation !== 'anim_death2' ||
        source.state === 'mowered' && source.animation !== 'mowered') {
        throw new TypeError(`${name}.animation is inconsistent with state`)
    }
    const animationSpeed = nonNegativeFinite(source.animationSpeed, `${name}.animationSpeed`)
    if (animationSpeed === 0) throw new TypeError(`${name}.animationSpeed must be positive`)
    return {
        typeId: nonEmptyString(source.typeId, `${name}.typeId`),
        health,
        maxHealth,
        state: source.state,
        speedPerTick: nonNegativeFinite(source.speedPerTick, `${name}.speedPerTick`),
        biteTicks: nonNegativeInteger(source.biteTicks, `${name}.biteTicks`),
        deathTicksRemaining: nonNegativeInteger(source.deathTicksRemaining, `${name}.deathTicksRemaining`),
        moweredTicksRemaining: nonNegativeInteger(source.moweredTicksRemaining, `${name}.moweredTicksRemaining`),
        walkAnimation: source.walkAnimation,
        animation: source.animation,
        animationTime: nonNegativeFinite(source.animationTime, `${name}.animationTime`),
        animationSpeed,
        hasHead: boolean(source.hasHead, `${name}.hasHead`),
        hasArm: boolean(source.hasArm, `${name}.hasArm`),
        hitFlashCounter: nonNegativeInteger(source.hitFlashCounter, `${name}.hitFlashCounter`),
        groanCounter: integer(source.groanCounter, `${name}.groanCounter`),
    }
}

function parseProjectile(value: unknown, name: string): Projectile {
    const source = optionalExact(value, ['typeId'], ['sourcePlantId'], name)
    return {
        typeId: nonEmptyString(source.typeId, `${name}.typeId`),
        ...(source.sourcePlantId === undefined ? {} : {
            sourcePlantId: positiveInteger(source.sourcePlantId, `${name}.sourcePlantId`),
        }),
    }
}

function parseItem(value: unknown, name: string): Item {
    const source = optionalExact(value, [
        'typeId', 'value', 'state', 'velocityX', 'velocityY', 'groundY', 'disappearTicks', 'fadeTicks', 'scale', 'alpha',
    ], ['accelerationY', 'width'], name)
    if (source.state !== 'available' && source.state !== 'collecting' && source.state !== 'fading') {
        throw new TypeError(`${name}.state is unknown`)
    }
    const alpha = nonNegativeInteger(source.alpha, `${name}.alpha`)
    const width = source.width === undefined ? undefined : nonNegativeFinite(source.width, `${name}.width`)
    if (alpha > 255) throw new TypeError(`${name}.alpha must not exceed 255`)
    if (width === 0) throw new TypeError(`${name}.width must be positive`)
    return {
        typeId: nonEmptyString(source.typeId, `${name}.typeId`),
        value: positiveInteger(source.value, `${name}.value`),
        state: source.state,
        velocityX: finite(source.velocityX, `${name}.velocityX`),
        velocityY: finite(source.velocityY, `${name}.velocityY`),
        ...(source.accelerationY === undefined ? {} : {
            accelerationY: finite(source.accelerationY, `${name}.accelerationY`),
        }),
        ...(width === undefined ? {} : { width }),
        groundY: nonNegativeFinite(source.groundY, `${name}.groundY`),
        disappearTicks: nonNegativeInteger(source.disappearTicks, `${name}.disappearTicks`),
        fadeTicks: nonNegativeInteger(source.fadeTicks, `${name}.fadeTicks`),
        scale: nonNegativeFinite(source.scale, `${name}.scale`),
        alpha,
    }
}

function optionalExact(
    value: unknown,
    required: readonly string[],
    optional: readonly string[],
    name: string,
): Record<string, unknown> {
    const source = record(value, name)
    const allowed = new Set([...required, ...optional])
    for (const key of Object.keys(source)) if (!allowed.has(key)) throw new TypeError(`${name}.${key} is not supported`)
    for (const key of required) if (!(key in source)) throw new TypeError(`${name}.${key} is required`)
    return source
}

function exact(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
    return optionalExact(value, keys, [], name)
}

function record(value: unknown, name: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${name} must be an object`)
    return value as Record<string, unknown>
}

function array(value: unknown, name: string): unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`)
    return value
}

function nonEmptyString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${name} must be a non-empty string`)
    return value
}

function boolean(value: unknown, name: string): boolean {
    if (typeof value !== 'boolean') throw new TypeError(`${name} must be boolean`)
    return value
}

function finite(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`)
    return value
}

function nonNegativeFinite(value: unknown, name: string): number {
    const result = finite(value, name)
    if (result < 0) throw new TypeError(`${name} must be non-negative`)
    return result
}

function integer(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new TypeError(`${name} must be a safe integer`)
    return value
}

function nonNegativeInteger(value: unknown, name: string): number {
    const result = integer(value, name)
    if (result < 0) throw new TypeError(`${name} must be non-negative`)
    return result
}

function positiveInteger(value: unknown, name: string): number {
    const result = integer(value, name)
    if (result < 1) throw new TypeError(`${name} must be positive`)
    return result
}
