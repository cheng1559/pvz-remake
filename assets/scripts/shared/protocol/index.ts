import type { DebugCliResult } from '@/shared/debug/DebugCli'

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject
export type JsonObject = { [key: string]: JsonValue }
export interface EntityBehaviorState { behaviorState?: JsonObject }

const PLANT_ABILITY_STATES: readonly PlantAbilityState[] = [
    'fuse', 'arming', 'rising', 'armed', 'ready', 'biting', 'got-one', 'missed', 'digesting', 'swallowing',
    'small', 'growing', 'big', 'landing', 'eating',
]
const ZOMBIE_STATES: readonly ZombieState[] = ['walking', 'eating', 'vaulting', 'dying', 'burned', 'mowered']
const ZOMBIE_ANIMATIONS: readonly ZombieAnimationName[] = [
    'anim_walk', 'anim_walk2', 'anim_run', 'anim_jump', 'anim_eat', 'anim_gasp', 'anim_death', 'anim_death2', 'mowered',
]

/** A burned zombie keeps the frame it was standing in. */
export function zombieAnimationMatchesState(state: ZombieState, animation: ZombieAnimationName): boolean {
    switch (state) {
        case 'walking': return animation === 'anim_walk' || animation === 'anim_walk2' || animation === 'anim_run' || animation === 'anim_gasp'
        case 'eating': return animation === 'anim_eat'
        case 'vaulting': return animation === 'anim_jump'
        case 'dying': return animation === 'anim_death' || animation === 'anim_death2'
        case 'burned': return animation !== 'mowered' && animation !== 'anim_death' && animation !== 'anim_death2'
        case 'mowered': return animation === 'mowered'
    }
}

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
    | { type: 'mod'; id: string; data: JsonObject }
    /** `slot` picks one bank packet when the bank holds the seed more than once. */
    | { type: 'selectSeed'; seedId: string; slot?: number }
    | { type: 'chooseSeed'; seedId: string }
    | { type: 'confirmSeeds' }
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

export interface GraveSnapshot {
    column: number
    row: number
    variant: number
    riseDelay: number
    offsetX: number
    offsetY: number
}

/** Board::AddAGraveStone: 20 stone looks and a rise delay of 0-49 ticks. */
export const GRAVE_VARIANTS = 20
export const GRAVE_MAX_RISE_DELAY = 49

export function graveAt(graves: readonly GraveSnapshot[] | undefined, row: number, column: number): GraveSnapshot | undefined {
    return graves?.find(grave => grave.row === row && grave.column === column)
}

/** Shared by snapshots and saves: the look and rise delay must come from AddAGraveStone's ranges. */
export function checkGraveRanges(grave: Pick<GraveSnapshot, 'variant' | 'riseDelay'>, name: string): void {
    if (grave.variant < 0 || grave.variant >= GRAVE_VARIANTS) throw new TypeError(`${name}.variant is invalid`)
    if (grave.riseDelay < 0 || grave.riseDelay > GRAVE_MAX_RISE_DELAY) throw new TypeError(`${name}.riseDelay is invalid`)
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
    seedChooser?: { availableSeeds: string[], slots: number, choosing: boolean, warning?: string }
    conveyorPackets: Array<{ id: number; seedId: string; x: number; selected: boolean; availability: SeedAvailability }>
    graves?: GraveSnapshot[]
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
    | { mode: 'tool', toolId: string }
    | { mode: 'seed', seedId: string }

export interface SeedAvailability {
    reason?: 'seed-not-available' | 'seed-not-ready' | 'not-enough-sun'
    warningKey?: string
}

export interface SeedPacketSnapshot {
    seedId: string
    ready: boolean
    selected: boolean
    cooldownRemaining: number
    cooldownTotal: number
    availability: SeedAvailability
}

export interface PlantSnapshot extends EntityBehaviorState {
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
    /** Omitted by older snapshots; wall-nuts freeze while it is positive. */
    recentlyEatenCounter?: number
    /** Fuse, mine or chomper progress; drives the plant animation. */
    ability?: { state: PlantAbilityState, ticks: number }
    /** A nocturnal plant on a day board. */
    asleep?: true
}

export type PlantAbilityState =
    | 'fuse'
    | 'arming' | 'rising' | 'armed'
    | 'ready' | 'biting' | 'got-one' | 'missed' | 'digesting' | 'swallowing'
    | 'small' | 'growing' | 'big'
    | 'landing' | 'eating'

export type ZombieState = 'walking' | 'eating' | 'vaulting' | 'dying' | 'burned' | 'mowered'
export type ZombieAnimationName =
    | 'anim_walk' | 'anim_walk2' | 'anim_run' | 'anim_jump' | 'anim_eat' | 'anim_gasp' | 'anim_death' | 'anim_death2' | 'mowered'

export interface ZombieSnapshot extends EntityBehaviorState {
    entityId: EntityId
    typeId: string
    state: ZombieState
    x: number
    y: number
    row: number
    health: number
    maxHealth: number
    animation: ZombieAnimationName
    animationTime: number
    animationSpeed: number
    moweredTicksRemaining: number
    /** Omitted by older snapshots; defaults to fully opaque. */
    alpha?: number
    hasHead: boolean
    hasTongue: boolean
    hasArm: boolean
    hitFlashCounter: number
    /** The last hit went through the newspaper into the body (Fume-shroom): no recoil, and the body flashes too. */
    hitThroughShield?: true
    /** Remaining helm health; 0 once the helm drops. Omitted by older snapshots. */
    helmHealth?: number
    chilled?: boolean
    /** A pole vaulter still carrying the pole. */
    hasPole?: boolean
    enraged?: boolean
    riseTicks?: number
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
    previewZombies?: Record<string, number>
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
export interface DebugResultPacket {
    protocolVersion: 1
    type: 'debugResult'
    sequence: ClientSequence
    result: DebugCliResult
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
    | DebugResultPacket
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
    return validateServerPacket(value)
}

/** Structural checks for a value already known to be JSON data, such as a JSON.parse result. */
export function validateServerPacket(value: unknown): ServerPacket {
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
        case 'debugResult': {
            integer(packet.sequence, 'debugResult.sequence')
            const result = record(packet.result, 'debugResult.result')
            boolean(result.ok, 'debugResult.result.ok')
            nonEmptyString(result.message, 'debugResult.result.message')
            if (result.failure !== undefined && result.failure !== 'syntax' && result.failure !== 'condition') throw new TypeError('Unknown debug failure')
            if (result.catalog !== undefined) {
                const catalog = record(result.catalog, 'debugResult.result.catalog')
                for (const kind of ['plants', 'zombies', 'items', 'levels']) {
                    array(catalog[kind], `debug catalog.${kind}`).forEach(value => nonEmptyString(value, `debug catalog.${kind} entry`))
                }
            }
            break
        }
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

const UNSAFE_JSON_COPY = Symbol('unsafe JSON copy')

/** A validated, isolated local reply, without a second serialization/parse pass. */
export function copyServerPacket(value: ServerPacket): ServerPacket {
    if (value === null || typeof value !== 'object') return parseServerPacket(value)
    const copy = copyJsonContainer(value, new WeakSet<object>())
    // Keep the existing diagnostics (including property paths) for invalid values.
    if (copy === UNSAFE_JSON_COPY) return validateServerPacket(jsonRoundTrip(value))
    return validateServerPacket(copy)
}

function copyJsonContainer(value: object, ancestors: WeakSet<object>): JsonValue | typeof UNSAFE_JSON_COPY {
    const isArray = Array.isArray(value)
    const prototype = Object.getPrototypeOf(value)
    if (ancestors.has(value) || (!isArray && prototype !== Object.prototype && prototype !== null)) return UNSAFE_JSON_COPY
    // Unusual array prototypes may have inherited JSON serialization behavior; use the existing path.
    if (isArray && prototype !== Array.prototype) return UNSAFE_JSON_COPY
    const keys = Reflect.ownKeys(value)
    if (isArray && keys.length !== value.length + 1) return UNSAFE_JSON_COPY
    const copy: JsonObject | JsonValue[] = isArray ? new Array(value.length) : {}
    ancestors.add(value)
    for (const key of keys) {
        if (typeof key !== 'string') return UNSAFE_JSON_COPY
        if (isArray) {
            if (key === 'length') continue
            if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) return UNSAFE_JSON_COPY
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!
        if (!descriptor.enumerable || !('value' in descriptor)) return UNSAFE_JSON_COPY
        let item = descriptor.value
        // Most snapshot fields are scalar; avoid another function call for each one on jitless V8.
        if (typeof item === 'number') {
            if (!Number.isFinite(item)) return UNSAFE_JSON_COPY
            if (item === 0) item = 0 // JSON round trips normalize negative zero.
        } else if (item !== null && typeof item !== 'string' && typeof item !== 'boolean') {
            if (typeof item !== 'object') return UNSAFE_JSON_COPY
            item = copyJsonContainer(item, ancestors)
            if (item === UNSAFE_JSON_COPY) return UNSAFE_JSON_COPY
        }
        // JSON.parse creates an own data property here, without changing the result's prototype.
        if (key === '__proto__') Object.defineProperty(copy, key, { value: item, enumerable: true, writable: true, configurable: true })
        else (copy as JsonObject)[key] = item
    }
    ancestors.delete(value)
    return copy
}

export function assertJsonValue(value: unknown): asserts value is JsonValue {
    // Snapshots are checked every tick; only build property paths when there is an error to report.
    if (!isJsonNode(value, new WeakSet<object>())) assertJsonNode(value, new WeakSet<object>(), '$')
}

/** The same rules as assertJsonNode, without allocating a path for every property. */
const isJsonNode = (value: unknown, ancestors: WeakSet<object>): boolean => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
    if (typeof value === 'number') return Number.isFinite(value)
    if (typeof value !== 'object' || ancestors.has(value)) return false
    const isArray = Array.isArray(value)
    const prototype = Object.getPrototypeOf(value)
    if (!isArray && prototype !== Object.prototype && prototype !== null) return false
    const keys = Reflect.ownKeys(value)
    // Without holes, an array's own keys are exactly its indices and 'length'.
    if (isArray && keys.length !== value.length + 1) return false
    ancestors.add(value)
    for (const key of keys) {
        if (typeof key !== 'string') return false
        if (isArray && key === 'length') continue
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!
        if (!descriptor.enumerable || !('value' in descriptor) || !isJsonNode(descriptor.value, ancestors)) return false
    }
    if (isArray) for (let index = 0; index < value.length; index++) if (!Object.prototype.hasOwnProperty.call(value, index)) return false
    ancestors.delete(value)
    return true
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
        case 'mod':
            nonEmptyString(command.id, 'mod.id')
            record(command.data, 'mod.data')
            assertJsonValue(command.data)
            return
        case 'selectSeed':
            nonEmptyString(command.seedId, 'selectSeed.seedId')
            if (command.slot !== undefined) integer(command.slot, 'selectSeed.slot')
            return
        case 'chooseSeed': nonEmptyString(command.seedId, 'chooseSeed.seedId'); return
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
        case 'confirmSeeds':
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
    if (wave.previewZombies !== undefined) for (const count of Object.values(record(wave.previewZombies, 'snapshot.wave.previewZombies'))) {
        integer(count, 'snapshot.wave.previewZombies count')
    }
    if ((wave.index as number) > (wave.total as number)) {
        throw new TypeError('snapshot.wave.index must not exceed total')
    }
    const tutorial = record(snapshot.tutorial, 'snapshot.tutorial')
    nonEmptyString(tutorial.id, 'snapshot.tutorial.id')
    nonEmptyString(tutorial.step, 'snapshot.tutorial.step')
    record(snapshot.extensions, 'snapshot.extensions')
    const cursor = record(snapshot.cursor, 'snapshot.cursor')
    if (cursor.mode === 'seed') nonEmptyString(cursor.seedId, 'snapshot.cursor.seedId')
    else if (cursor.mode === 'tool') nonEmptyString(cursor.toolId, 'snapshot.cursor.toolId')
    else if (cursor.mode !== 'none') throw new TypeError('snapshot.cursor.mode is unknown')
    const seedPackets = array(snapshot.seedPackets, 'snapshot.seedPackets').map((entry, index) => {
        const name = `snapshot.seedPackets[${index}]`
        const packet = record(entry, name)
        nonEmptyString(packet.seedId, `${name}.seedId`)
        boolean(packet.ready, `${name}.ready`)
        boolean(packet.selected, `${name}.selected`)
        validateSeedAvailability(packet.availability, name)
        integer(packet.cooldownRemaining, `${name}.cooldownRemaining`)
        integer(packet.cooldownTotal, `${name}.cooldownTotal`)
        if ((packet.cooldownRemaining as number) > (packet.cooldownTotal as number)) {
            throw new TypeError(`${name}.cooldownRemaining must not exceed cooldownTotal`)
        }
        const shouldBeReady = packet.cooldownRemaining === 0 && packet.selected === false
        if (packet.ready !== shouldBeReady) throw new TypeError(`${name}.ready is inconsistent`)
        return packet
    })
    const conveyorPackets = array(snapshot.conveyorPackets, 'snapshot.conveyorPackets').map(value => record(value, 'conveyor packet'))
    const selectedPackets = [...seedPackets, ...conveyorPackets].filter(packet => packet.selected === true)
    if (selectedPackets.length > 1) throw new TypeError('snapshot.seedPackets has multiple selected packets')
    if (cursor.mode === 'seed' && selectedPackets[0]?.seedId !== cursor.seedId) {
        throw new TypeError('snapshot.cursor does not match the selected seed packet')
    }
    if (cursor.mode !== 'seed' && selectedPackets.length !== 0) {
        throw new TypeError('snapshot.cursor does not match the selected seed packet')
    }
    if (snapshot.seedChooser !== undefined) {
        const chooser = record(snapshot.seedChooser, 'snapshot.seedChooser')
        const available = array(chooser.availableSeeds, 'snapshot.seedChooser.availableSeeds')
        available.forEach((id, index) => nonEmptyString(id, `snapshot.seedChooser.availableSeeds[${index}]`))
        integer(chooser.slots, 'snapshot.seedChooser.slots')
        const slots = chooser.slots as number
        boolean(chooser.choosing, 'snapshot.seedChooser.choosing')
        if (slots < 1 || slots > 10 || slots > available.length || new Set(available).size !== available.length ||
            seedPackets.length > slots || chooser.choosing && seedPackets.some(packet => !available.includes(packet.seedId))) throw new TypeError('Invalid seed chooser bank')
        if (chooser.warning !== undefined) nonEmptyString(chooser.warning, 'snapshot.seedChooser.warning')
    }
    if (snapshot.graves !== undefined) array(snapshot.graves, 'snapshot.graves').forEach((value, index) => {
        const name = `snapshot.graves[${index}]`, grave = record(value, name)
        for (const key of ['column', 'row', 'variant', 'riseDelay']) integer(grave[key], `${name}.${key}`)
        checkGraveRanges(grave as unknown as GraveSnapshot, name)
        finite(grave.offsetX, `${name}.offsetX`); finite(grave.offsetY, `${name}.offsetY`)
    })
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
        if (plant.recentlyEatenCounter !== undefined) integer(plant.recentlyEatenCounter, `${name}.recentlyEatenCounter`)
        if (plant.asleep !== undefined && plant.asleep !== true) throw new TypeError(`${name}.asleep must be true when present`)
        if (plant.behaviorState !== undefined) record(plant.behaviorState, `${name}.behaviorState`)
        if (plant.ability !== undefined) {
            const ability = record(plant.ability, `${name}.ability`)
            if (!PLANT_ABILITY_STATES.includes(ability.state as PlantAbilityState)) throw new TypeError(`${name}.ability.state is unknown`)
            integer(ability.ticks, `${name}.ability.ticks`)
        }
    })
    array(snapshot.zombies, 'snapshot.zombies').forEach((entry, index) => {
        const name = `snapshot.zombies[${index}]`
        const zombie = validateLivingEntity(entry, name)
        if (zombie.behaviorState !== undefined) record(zombie.behaviorState, `${name}.behaviorState`)
        if (!ZOMBIE_STATES.includes(zombie.state as ZombieState)) throw new TypeError(`${name}.state is unknown`)
        if (!ZOMBIE_ANIMATIONS.includes(zombie.animation as ZombieAnimationName)) throw new TypeError(`${name}.animation is unknown`)
        finite(zombie.animationTime, `${name}.animationTime`)
        finite(zombie.animationSpeed, `${name}.animationSpeed`)
        integer(zombie.moweredTicksRemaining, `${name}.moweredTicksRemaining`)
        if (zombie.alpha !== undefined) {
            integer(zombie.alpha, `${name}.alpha`)
            if ((zombie.alpha as number) < 0 || (zombie.alpha as number) > 255) {
                throw new TypeError(`${name}.alpha must be between 0 and 255`)
            }
        }
        if ((zombie.animationTime as number) < 0 || (zombie.animationSpeed as number) <= 0) {
            throw new TypeError(`${name}.animation playback must be positive`)
        }
        if ((zombie.moweredTicksRemaining as number) < 0) {
            throw new TypeError(`${name}.moweredTicksRemaining must be non-negative`)
        }
        if (!zombieAnimationMatchesState(zombie.state as ZombieState, zombie.animation as ZombieAnimationName)) {
            throw new TypeError(`${name}.animation is inconsistent with state`)
        }
        boolean(zombie.hasHead, `${name}.hasHead`)
        boolean(zombie.hasTongue, `${name}.hasTongue`)
        boolean(zombie.hasArm, `${name}.hasArm`)
        integer(zombie.hitFlashCounter, `${name}.hitFlashCounter`)
        if ((zombie.hitFlashCounter as number) < 0) throw new TypeError(`${name}.hitFlashCounter must be non-negative`)
        if (zombie.helmHealth !== undefined) {
            integer(zombie.helmHealth, `${name}.helmHealth`)
            if ((zombie.helmHealth as number) < 0) throw new TypeError(`${name}.helmHealth must be non-negative`)
        }
        if (zombie.chilled !== undefined) boolean(zombie.chilled, `${name}.chilled`)
        if (zombie.enraged !== undefined) boolean(zombie.enraged, `${name}.enraged`)
        if (zombie.hitThroughShield !== undefined && zombie.hitThroughShield !== true) throw new TypeError(`${name}.hitThroughShield must be true`)
        if (zombie.riseTicks !== undefined) integer(zombie.riseTicks, `${name}.riseTicks`)
        if (zombie.hasPole !== undefined) boolean(zombie.hasPole, `${name}.hasPole`)
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
    array(snapshot.conveyorPackets, 'snapshot.conveyorPackets').forEach((entry, index) => {
        const name = `snapshot.conveyorPackets[${index}]`, packet = record(entry, name)
        integer(packet.id, `${name}.id`); nonEmptyString(packet.seedId, `${name}.seedId`)
        finite(packet.x, `${name}.x`); boolean(packet.selected, `${name}.selected`)
        validateSeedAvailability(packet.availability, name)
    })
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

function validateSeedAvailability(value: unknown, name: string): void {
    const state = record(value, name + '.availability')
    if (state.reason !== undefined && !['seed-not-available', 'seed-not-ready', 'not-enough-sun'].includes(String(state.reason))) throw new TypeError(name + '.availability.reason is invalid')
    if (state.warningKey !== undefined) nonEmptyString(state.warningKey, name + '.availability.warningKey')
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
