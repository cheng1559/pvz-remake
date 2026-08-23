export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject
export type JsonObject = { [key: string]: JsonValue }

export type EntityId = number
export type ClientSequence = number
export type ServerTick = number
export type EventId = number

export interface EnabledMod {
    id: string
    version: string
    contentHash: string
}

export type GameCommand =
    | { type: 'selectSeed'; seedId: string }
    | { type: 'selectConveyorPacket'; packetId: EntityId }
    | { type: 'selectTool'; toolId: string }
    | { type: 'placePlant'; row: number; column: number }
    | { type: 'useToolAt'; row: number; column: number }
    | { type: 'collectItemAt'; itemId: EntityId }
    | { type: 'clearCursor' }
    | { type: 'pause' }
    | { type: 'resume' }
    | { type: 'advanceDialog' }
    | { type: 'completeIntro' }

export interface ClientPacketBase {
    protocolVersion: 1
    sequence: ClientSequence
}

export interface StartSessionPacket extends ClientPacketBase {
    type: 'startSession'
    levelId: string
    randomSeed: number
    initialMoney: number
    firstAdventure: boolean
    mods: EnabledMod[]
    save?: JsonValue
}

export interface GameCommandPacket extends ClientPacketBase {
    type: 'command'
    command: GameCommand
}

export interface DebugCommandPacket extends ClientPacketBase {
    type: 'debugCommand'
    command: string
    args: JsonValue
}

export interface RequestSavePacket extends ClientPacketBase {
    type: 'requestSave'
}

export interface StopSessionPacket extends ClientPacketBase {
    type: 'stopSession'
}

export type ClientPacket =
    | StartSessionPacket
    | GameCommandPacket
    | DebugCommandPacket
    | RequestSavePacket
    | StopSessionPacket

export interface ServerEvent {
    eventId: EventId
    type: string
    data: JsonObject
}

export interface WorldSnapshot {
    levelId: string
    tick: ServerTick
    gameplayTick: number
    phase: 'intro' | 'gameplay'
    result: 'playing' | 'won' | 'lost'
    paused: boolean
    sun: number
    availableSun: number
    money: number
    wave: WaveSnapshot
    cursor: CursorSnapshot
    seedPackets: SeedPacketSnapshot[]
    conveyorPackets: JsonObject[]
    plants: PlantSnapshot[]
    zombies: ZombieSnapshot[]
    projectiles: ProjectileSnapshot[]
    items: ItemSnapshot[]
    lawnMowers: LawnMowerSnapshot[]
    tutorial: TutorialSnapshot
    extensions: Record<string, JsonValue>
}

export type CursorSnapshot =
    | { mode: 'none' }
    | { mode: 'seed', seedId: string }

export interface SeedPacketSnapshot {
    seedId: string
    ready: boolean
    selected: boolean
    cooldownRemaining: number
    cooldownTotal: number
}

export interface PlantSnapshot {
    entityId: EntityId
    typeId: string
    seedId: string
    x: number
    y: number
    row: number
    column: number
    health: number
    maxHealth: number
    eatenFlashCounter: number
}

export interface ZombieSnapshot {
    entityId: EntityId
    typeId: string
    state: 'walking' | 'eating' | 'dying' | 'mowered'
    x: number
    y: number
    row: number
    health: number
    maxHealth: number
    animation: 'anim_walk' | 'anim_walk2' | 'anim_eat' | 'anim_death' | 'anim_death2' | 'mowered'
    animationTime: number
    animationSpeed: number
    moweredTicksRemaining: number
    hasHead: boolean
    hasArm: boolean
    hitFlashCounter: number
}

export interface ProjectileSnapshot {
    entityId: EntityId
    typeId: string
    x: number
    y: number
    row: number
}

export interface ItemSnapshot {
    entityId: EntityId
    typeId: string
    state: 'available' | 'collecting' | 'fading'
    x: number
    y: number
    scale: number
    alpha: number
}

export interface WaveSnapshot {
    index: number
    total: number
    countdown: number
}

export interface TutorialSnapshot {
    id: string
    step: string
}

export interface LawnMowerSnapshot {
    entityId: EntityId
    typeId: string
    state: 'ready' | 'active' | 'spent'
    x: number
    y: number
    row: number
}

export interface SessionStartedPacket {
    protocolVersion: 1
    type: 'sessionStarted'
    acknowledgedSequence: ClientSequence
    snapshot: WorldSnapshot
}

export interface ServerFramePacket {
    protocolVersion: 1
    type: 'frame'
    serverTick: ServerTick
    acknowledgedSequence: ClientSequence
    snapshot: WorldSnapshot
    events: ServerEvent[]
}

export interface CommandRejectedPacket {
    protocolVersion: 1
    type: 'commandRejected'
    sequence: ClientSequence
    code: string
}

export interface SaveReadyPacket {
    protocolVersion: 1
    type: 'saveReady'
    acknowledgedSequence: ClientSequence
    save: JsonValue
}

export interface SessionStoppedPacket {
    protocolVersion: 1
    type: 'sessionStopped'
    acknowledgedSequence: ClientSequence
}

export interface FatalServerErrorPacket {
    protocolVersion: 1
    type: 'fatalServerError'
    code: string
    message: string
}

export type ServerPacket =
    | SessionStartedPacket
    | ServerFramePacket
    | CommandRejectedPacket
    | SaveReadyPacket
    | SessionStoppedPacket
    | FatalServerErrorPacket

export function parseClientPacket(value: unknown): ClientPacket {
    assertJsonValue(value)
    const packet = record(value, 'client packet')
    protocolVersion(packet.protocolVersion)
    integer(packet.sequence, 'client packet.sequence')

    switch (packet.type) {
        case 'startSession':
            nonEmptyString(packet.levelId, 'startSession.levelId')
            uint32(packet.randomSeed, 'startSession.randomSeed')
            integer(packet.initialMoney, 'startSession.initialMoney')
            boolean(packet.firstAdventure, 'startSession.firstAdventure')
            array(packet.mods, 'startSession.mods').forEach((value, index) => validateEnabledMod(value, index))
            break
        case 'command':
            validateGameCommand(packet.command)
            break
        case 'debugCommand':
            nonEmptyString(packet.command, 'debugCommand.command')
            if (!('args' in packet)) throw new TypeError('debugCommand.args is required')
            break
        case 'requestSave':
        case 'stopSession':
            break
        default:
            throw new TypeError('client packet.type is unknown')
    }
    return packet as unknown as ClientPacket
}

export function parseServerPacket(value: unknown): ServerPacket {
    assertJsonValue(value)
    const packet = record(value, 'server packet')
    protocolVersion(packet.protocolVersion)

    switch (packet.type) {
        case 'sessionStarted':
            integer(packet.acknowledgedSequence, 'sessionStarted.acknowledgedSequence')
            validateWorldSnapshot(packet.snapshot)
            break
        case 'frame':
            integer(packet.serverTick, 'frame.serverTick')
            integer(packet.acknowledgedSequence, 'frame.acknowledgedSequence')
            if (validateWorldSnapshot(packet.snapshot).tick !== packet.serverTick) {
                throw new TypeError('frame.serverTick must match snapshot.tick')
            }
            let previousEventId = 0
            array(packet.events, 'frame.events').forEach((value, index) => {
                const eventId = validateServerEvent(value, index)
                if (eventId <= previousEventId) throw new TypeError('frame.events IDs must be strictly increasing')
                previousEventId = eventId
            })
            break
        case 'commandRejected':
            integer(packet.sequence, 'commandRejected.sequence')
            nonEmptyString(packet.code, 'commandRejected.code')
            break
        case 'saveReady':
            integer(packet.acknowledgedSequence, 'saveReady.acknowledgedSequence')
            if (!('save' in packet)) throw new TypeError('saveReady.save is required')
            break
        case 'sessionStopped':
            integer(packet.acknowledgedSequence, 'sessionStopped.acknowledgedSequence')
            break
        case 'fatalServerError':
            nonEmptyString(packet.code, 'fatalServerError.code')
            nonEmptyString(packet.message, 'fatalServerError.message')
            break
        default:
            throw new TypeError('server packet.type is unknown')
    }
    return packet as unknown as ServerPacket
}

export function assertJsonValue(value: unknown): asserts value is JsonValue {
    assertJsonNode(value, new WeakSet<object>(), '$')
}

export function isJsonValue(value: unknown): value is JsonValue {
    try {
        assertJsonValue(value)
        return true
    } catch {
        return false
    }
}

export function jsonRoundTrip<T>(value: T): T {
    assertJsonValue(value)
    return JSON.parse(JSON.stringify(value)) as T
}

const assertJsonNode = (value: unknown, ancestors: WeakSet<object>, path: string): void => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return
    if (typeof value === 'number') {
        if (Number.isFinite(value)) return
        throw new TypeError(`${path} must contain only finite numbers`)
    }
    if (typeof value !== 'object') throw new TypeError(`${path} is not JSON-safe`)
    if (ancestors.has(value)) throw new TypeError(`${path} contains a cycle`)

    const prototype = Object.getPrototypeOf(value)
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`${path} must contain only arrays and plain objects`)
    }

    ancestors.add(value)
    if (Array.isArray(value)) {
        for (const key of Reflect.ownKeys(value)) {
            if (key === 'length') continue
            if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
                throw new TypeError(`${path} contains a non-JSON array property`)
            }
            assertJsonProperty(value, key, ancestors, `${path}[${key}]`)
        }
        for (let index = 0; index < value.length; index++) {
            if (!Object.prototype.hasOwnProperty.call(value, index)) throw new TypeError(`${path}[${index}] is not JSON-safe`)
        }
    } else {
        for (const key of Reflect.ownKeys(value)) {
            if (typeof key !== 'string') throw new TypeError(`${path} contains a symbol property`)
            assertJsonProperty(value, key, ancestors, `${path}.${key}`)
        }
    }
    ancestors.delete(value)
}

const assertJsonProperty = (object: object, key: string, ancestors: WeakSet<object>, path: string): void => {
    const descriptor = Object.getOwnPropertyDescriptor(object, key)!
    if (!descriptor.enumerable || !('value' in descriptor)) {
        throw new TypeError(`${path} must be an enumerable data property`)
    }
    assertJsonNode(descriptor.value, ancestors, path)
}

const validateEnabledMod = (value: unknown, index: number): void => {
    const mod = record(value, `startSession.mods[${index}]`)
    nonEmptyString(mod.id, `startSession.mods[${index}].id`)
    nonEmptyString(mod.version, `startSession.mods[${index}].version`)
    nonEmptyString(mod.contentHash, `startSession.mods[${index}].contentHash`)
}

const validateGameCommand = (value: unknown): void => {
    const command = record(value, 'command.command')
    switch (command.type) {
        case 'selectSeed': nonEmptyString(command.seedId, 'selectSeed.seedId'); return
        case 'selectConveyorPacket': integer(command.packetId, 'selectConveyorPacket.packetId'); return
        case 'selectTool': nonEmptyString(command.toolId, 'selectTool.toolId'); return
        case 'placePlant':
            integer(command.row, 'placePlant.row')
            integer(command.column, 'placePlant.column')
            return
        case 'useToolAt':
            integer(command.row, 'useToolAt.row')
            integer(command.column, 'useToolAt.column')
            return
        case 'collectItemAt': integer(command.itemId, 'collectItemAt.itemId'); return
        case 'clearCursor':
        case 'pause':
        case 'resume':
        case 'advanceDialog':
        case 'completeIntro':
            return
        default:
            throw new TypeError('command.command.type is unknown')
    }
}

const validateWorldSnapshot = (value: unknown): Record<string, JsonValue> => {
    const snapshot = record(value, 'snapshot')
    nonEmptyString(snapshot.levelId, 'snapshot.levelId')
    integer(snapshot.tick, 'snapshot.tick')
    integer(snapshot.gameplayTick, 'snapshot.gameplayTick')
    if ((snapshot.gameplayTick as number) > (snapshot.tick as number)) {
        throw new TypeError('snapshot.gameplayTick must not exceed tick')
    }
    if (snapshot.phase !== 'intro' && snapshot.phase !== 'gameplay') {
        throw new TypeError('snapshot.phase is unknown')
    }
    if (snapshot.result !== 'playing' && snapshot.result !== 'won' && snapshot.result !== 'lost') {
        throw new TypeError('snapshot.result is unknown')
    }
    boolean(snapshot.paused, 'snapshot.paused')
    integer(snapshot.sun, 'snapshot.sun')
    integer(snapshot.availableSun, 'snapshot.availableSun')
    if ((snapshot.availableSun as number) < (snapshot.sun as number)) {
        throw new TypeError('snapshot.availableSun must not be below sun')
    }
    integer(snapshot.money, 'snapshot.money')
    const wave = record(snapshot.wave, 'snapshot.wave')
    integer(wave.index, 'snapshot.wave.index')
    integer(wave.total, 'snapshot.wave.total')
    integer(wave.countdown, 'snapshot.wave.countdown')
    if ((wave.index as number) > (wave.total as number)) {
        throw new TypeError('snapshot.wave.index must not exceed total')
    }
    const tutorial = record(snapshot.tutorial, 'snapshot.tutorial')
    nonEmptyString(tutorial.id, 'snapshot.tutorial.id')
    nonEmptyString(tutorial.step, 'snapshot.tutorial.step')
    record(snapshot.extensions, 'snapshot.extensions')
    const cursor = record(snapshot.cursor, 'snapshot.cursor')
    if (cursor.mode === 'seed') nonEmptyString(cursor.seedId, 'snapshot.cursor.seedId')
    else if (cursor.mode !== 'none') throw new TypeError('snapshot.cursor.mode is unknown')
    const seedPackets = array(snapshot.seedPackets, 'snapshot.seedPackets').map((entry, index) => {
        const name = `snapshot.seedPackets[${index}]`
        const packet = record(entry, name)
        nonEmptyString(packet.seedId, `${name}.seedId`)
        boolean(packet.ready, `${name}.ready`)
        boolean(packet.selected, `${name}.selected`)
        integer(packet.cooldownRemaining, `${name}.cooldownRemaining`)
        integer(packet.cooldownTotal, `${name}.cooldownTotal`)
        if ((packet.cooldownRemaining as number) > (packet.cooldownTotal as number)) {
            throw new TypeError(`${name}.cooldownRemaining must not exceed cooldownTotal`)
        }
        const shouldBeReady = packet.cooldownRemaining === 0 && packet.selected === false
        if (packet.ready !== shouldBeReady) throw new TypeError(`${name}.ready is inconsistent`)
        return packet
    })
    const selectedPackets = seedPackets.filter(packet => packet.selected === true)
    if (selectedPackets.length > 1) throw new TypeError('snapshot.seedPackets has multiple selected packets')
    if (cursor.mode === 'seed' && selectedPackets[0]?.seedId !== cursor.seedId) {
        throw new TypeError('snapshot.cursor does not match the selected seed packet')
    }
    if (cursor.mode === 'none' && selectedPackets.length !== 0) {
        throw new TypeError('snapshot.cursor does not match the selected seed packet')
    }
    array(snapshot.plants, 'snapshot.plants').forEach((entry, index) => {
        const name = `snapshot.plants[${index}]`
        const plant = record(entry, name)
        integer(plant.entityId, `${name}.entityId`)
        nonEmptyString(plant.typeId, `${name}.typeId`)
        nonEmptyString(plant.seedId, `${name}.seedId`)
        finite(plant.x, `${name}.x`)
        finite(plant.y, `${name}.y`)
        integer(plant.row, `${name}.row`)
        integer(plant.column, `${name}.column`)
        integer(plant.health, `${name}.health`)
        integer(plant.maxHealth, `${name}.maxHealth`)
        integer(plant.eatenFlashCounter, `${name}.eatenFlashCounter`)
        if ((plant.maxHealth as number) === 0 || (plant.health as number) > (plant.maxHealth as number)) {
            throw new TypeError(`${name}.health must not exceed a positive maxHealth`)
        }
        if ((plant.eatenFlashCounter as number) < 0) throw new TypeError(`${name}.eatenFlashCounter must be non-negative`)
    })
    array(snapshot.zombies, 'snapshot.zombies').forEach((entry, index) => {
        const name = `snapshot.zombies[${index}]`
        const zombie = validateLivingEntity(entry, name)
        if (zombie.state !== 'walking' && zombie.state !== 'eating' && zombie.state !== 'dying' && zombie.state !== 'mowered') {
            throw new TypeError(`${name}.state is unknown`)
        }
        if (zombie.animation !== 'anim_walk' && zombie.animation !== 'anim_walk2' &&
            zombie.animation !== 'anim_eat' && zombie.animation !== 'anim_death' &&
            zombie.animation !== 'anim_death2' && zombie.animation !== 'mowered') {
            throw new TypeError(`${name}.animation is unknown`)
        }
        finite(zombie.animationTime, `${name}.animationTime`)
        finite(zombie.animationSpeed, `${name}.animationSpeed`)
        integer(zombie.moweredTicksRemaining, `${name}.moweredTicksRemaining`)
        if ((zombie.animationTime as number) < 0 || (zombie.animationSpeed as number) <= 0) {
            throw new TypeError(`${name}.animation playback must be positive`)
        }
        if ((zombie.moweredTicksRemaining as number) < 0) {
            throw new TypeError(`${name}.moweredTicksRemaining must be non-negative`)
        }
        if (zombie.state === 'walking' && zombie.animation !== 'anim_walk' && zombie.animation !== 'anim_walk2' ||
            zombie.state === 'eating' && zombie.animation !== 'anim_eat' ||
            zombie.state === 'dying' && zombie.animation !== 'anim_death' && zombie.animation !== 'anim_death2' ||
            zombie.state === 'mowered' && zombie.animation !== 'mowered') {
            throw new TypeError(`${name}.animation is inconsistent with state`)
        }
        boolean(zombie.hasHead, `${name}.hasHead`)
        boolean(zombie.hasArm, `${name}.hasArm`)
        integer(zombie.hitFlashCounter, `${name}.hitFlashCounter`)
        if ((zombie.hitFlashCounter as number) < 0) throw new TypeError(`${name}.hitFlashCounter must be non-negative`)
    })
    array(snapshot.projectiles, 'snapshot.projectiles').forEach((entry, index) => {
        const name = `snapshot.projectiles[${index}]`
        const projectile = record(entry, name)
        integer(projectile.entityId, `${name}.entityId`)
        nonEmptyString(projectile.typeId, `${name}.typeId`)
        finite(projectile.x, `${name}.x`)
        finite(projectile.y, `${name}.y`)
        integer(projectile.row, `${name}.row`)
    })
    array(snapshot.conveyorPackets, 'snapshot.conveyorPackets').forEach(
        (entry, index) => record(entry, `snapshot.conveyorPackets[${index}]`),
    )
    array(snapshot.items, 'snapshot.items').forEach((entry, index) => {
        const name = `snapshot.items[${index}]`
        const item = record(entry, name)
        integer(item.entityId, `${name}.entityId`)
        nonEmptyString(item.typeId, `${name}.typeId`)
        if (item.state !== 'available' && item.state !== 'collecting' && item.state !== 'fading') {
            throw new TypeError(`${name}.state is unknown`)
        }
        finite(item.x, `${name}.x`)
        finite(item.y, `${name}.y`)
        finite(item.scale, `${name}.scale`)
        if ((item.scale as number) < 0) throw new TypeError(`${name}.scale must not be negative`)
        integer(item.alpha, `${name}.alpha`)
        if ((item.alpha as number) > 255) throw new TypeError(`${name}.alpha must not exceed 255`)
    })
    array(snapshot.lawnMowers, 'snapshot.lawnMowers').forEach((entry, index) => {
        const name = `snapshot.lawnMowers[${index}]`
        const mower = record(entry, name)
        integer(mower.entityId, `${name}.entityId`)
        nonEmptyString(mower.typeId, `${name}.typeId`)
        if (mower.state !== 'ready' && mower.state !== 'active' && mower.state !== 'spent') {
            throw new TypeError(`${name}.state is unknown`)
        }
        finite(mower.x, `${name}.x`)
        finite(mower.y, `${name}.y`)
        integer(mower.row, `${name}.row`)
    })
    return snapshot
}

const validateLivingEntity = (value: unknown, name: string): Record<string, JsonValue> => {
    const entity = record(value, name)
    integer(entity.entityId, `${name}.entityId`)
    nonEmptyString(entity.typeId, `${name}.typeId`)
    finite(entity.x, `${name}.x`)
    finite(entity.y, `${name}.y`)
    integer(entity.row, `${name}.row`)
    integer(entity.health, `${name}.health`)
    integer(entity.maxHealth, `${name}.maxHealth`)
    if ((entity.maxHealth as number) === 0 || (entity.health as number) > (entity.maxHealth as number)) {
        throw new TypeError(`${name}.health must not exceed a positive maxHealth`)
    }
    return entity
}

const validateServerEvent = (value: unknown, index: number): number => {
    const event = record(value, `frame.events[${index}]`)
    integer(event.eventId, `frame.events[${index}].eventId`)
    if (event.eventId === 0) throw new TypeError(`frame.events[${index}].eventId must be positive`)
    nonEmptyString(event.type, `frame.events[${index}].type`)
    record(event.data, `frame.events[${index}].data`)
    return event.eventId as number
}

const record = (value: unknown, name: string): Record<string, JsonValue> => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${name} must be an object`)
    return value as Record<string, JsonValue>
}

const array = (value: unknown, name: string): JsonValue[] => {
    if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`)
    return value
}

const protocolVersion = (value: unknown): void => {
    if (value !== 1) throw new TypeError('protocolVersion must be 1')
}

const integer = (value: unknown, name: string): void => {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`${name} must be a non-negative safe integer`)
    }
}

const uint32 = (value: unknown, name: string): void => {
    integer(value, name)
    if ((value as number) > 0xffffffff) throw new TypeError(`${name} must be a uint32`)
}

const finite = (value: unknown, name: string): void => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`)
}

const nonEmptyString = (value: unknown, name: string): void => {
    if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${name} must be a non-empty string`)
}

const boolean = (value: unknown, name: string): void => {
    if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean`)
}
