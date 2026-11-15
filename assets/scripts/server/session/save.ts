import type { EntityAllocatorSnapshot, EntityId } from '@/ecs/index'
import { jsonRoundTrip, TEAMS, type JsonObject, type EnabledMod, type ServerEvent, assertJsonValue } from '@/shared/protocol/index'
import { isQualifiedId } from '@/shared/mod'
import { array, boolean, exact, finite, integer, nonEmptyString, nonNegativeFinite, nonNegativeInteger, oneOf, positiveInteger, record, trueFlag } from '@/shared/validate'
import { DeterministicRng, type DeterministicRngState } from '../state/DeterministicRng'
import type { EventQueue } from '../state/events'
import type { GridItem, MowedPlant, Plant, PlantAttack, Position, Projectile, SeedBankState, SeedPacketState, Zombie } from '../state/components'
import { type Item, type SkySunState, TUTORIAL_STEPS, type TutorialState, type WaveState } from '../state/levelState'
import type { SavedComponents } from '../registry/JsonComponents'
import { SAVED_COMPONENTS } from './savedComponents'

export interface SavedEntity {
    extensions?: SavedComponents
    entityId: EntityId
    position?: Position
    plant?: Plant
    mowedPlant?: MowedPlant
    plantAttack?: PlantAttack
    zombie?: Zombie
    projectile?: Projectile
    item?: Item
    /** What stands in a cell: it has no position. */
    gridItem?: GridItem
}

export interface ServerSaveSnapshot {
    schemaVersion: 2
    levelId: string
    mods: EnabledMod[]
    tick: number
    gameplayTick: number
    allocator: EntityAllocatorSnapshot
    random: DeterministicRngState
    level: { phase: 'intro' | 'gameplay', result: 'playing' | 'won' | 'lost', paused: boolean, mowerRows: number[] }
    economy: { sun: number, money: number, pendingSunSpend: number, packetUpgrades: number }
    /** Crazy Dave's seed-slot offer of a game started with one, so a restored intro can still sell it. */
    packetUpgradeOffer?: { cost: number }
    seedBank: SeedBankState
    tutorial: TutorialState
    skySun: SkySunState
    wave: WaveState
    eventQueue: EventQueue
    /** Each achievement's trigger state in the level (AchievementState.progress). */
    achievementProgress: Record<string, JsonObject>
    entities: SavedEntity[]
}

export function parseServerSaveSnapshot(value: unknown): ServerSaveSnapshot {
    assertJsonValue(value)
    const save = exact(value, [
        'schemaVersion', 'levelId', 'mods', 'tick', 'gameplayTick', 'allocator', 'random', 'level', 'economy',
        'seedBank', 'tutorial', 'skySun', 'wave', 'eventQueue', 'achievementProgress', 'entities',
    ], 'server save', ['packetUpgradeOffer'])
    if (save.schemaVersion !== 2) throw new TypeError('server save.schemaVersion must be 2')

    const allocatorSource = exact(save.allocator, ['nextEntity'], 'server save.allocator')
    const allocator = { nextEntity: positiveInteger(allocatorSource.nextEntity, 'server save.allocator.nextEntity') }
    const randomSource = exact(save.random, ['algorithm', 'state'], 'server save.random')
    const random = {
        algorithm: randomSource.algorithm,
        state: integer(randomSource.state, 'server save.random.state'),
    } as DeterministicRngState
    DeterministicRng.restore(random)

    const levelSource = exact(save.level, ['phase', 'result', 'paused', 'mowerRows'], 'server save.level')
    const level = {
        phase: oneOf(levelSource.phase, ['intro', 'gameplay'] as const, 'server save.level.phase'),
        result: oneOf(levelSource.result, ['playing', 'won', 'lost'] as const, 'server save.level.result'),
        paused: boolean(levelSource.paused, 'server save.level.paused'),
        mowerRows: array(levelSource.mowerRows, 'server save.level.mowerRows').map(row => integer(row, 'server save.level.mowerRows[]')),
    }

    const economySource = exact(save.economy, ['sun', 'money', 'pendingSunSpend', 'packetUpgrades'], 'server save.economy', ['firstCoinDropped', 'mowerCoinTicks', 'diamonds'])
    const economy = {
        sun: integer(economySource.sun, 'server save.economy.sun'),
        money: integer(economySource.money, 'server save.economy.money'),
        pendingSunSpend: integer(economySource.pendingSunSpend, 'server save.economy.pendingSunSpend'),
        packetUpgrades: nonNegativeInteger(economySource.packetUpgrades, 'server save.economy.packetUpgrades'),
        ...(economySource.firstCoinDropped === undefined ? {} : { firstCoinDropped: trueFlag(economySource.firstCoinDropped, 'server save.economy.firstCoinDropped') }),
        ...(economySource.diamonds === undefined ? {} : { diamonds: trueFlag(economySource.diamonds, 'server save.economy.diamonds') }),
        ...(economySource.mowerCoinTicks === undefined ? {} : { mowerCoinTicks: nonNegativeInteger(economySource.mowerCoinTicks, 'server save.economy.mowerCoinTicks') }),
    }
    const seedBank = parseSeedBank(save.seedBank)
    const tutorial = parseTutorial(save.tutorial)
    const skySunSource = exact(save.skySun, ['fallen'], 'server save.skySun', ['atTick'])
    const skySun: SkySunState = {
        fallen: nonNegativeInteger(skySunSource.fallen, 'server save.skySun.fallen'),
        ...(skySunSource.atTick === undefined ? {} : { atTick: nonNegativeInteger(skySunSource.atTick, 'server save.skySun.atTick') }),
    }
    const wave = parseWave(save.wave)
    const eventQueue = parseEventQueue(save.eventQueue)
    const achievementProgress = Object.fromEntries(Object.entries(record(save.achievementProgress, 'server save.achievementProgress'))
        .map(([id, state]) => [nonEmptyString(id, 'server save.achievementProgress key'), record(state, `server save.achievementProgress.${id}`) as JsonObject]))
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
        ...(save.packetUpgradeOffer === undefined ? {} : {
            packetUpgradeOffer: { cost: nonNegativeInteger(exact(save.packetUpgradeOffer, ['cost'], 'server save.packetUpgradeOffer').cost, 'server save.packetUpgradeOffer.cost') },
        }),
        seedBank,
        tutorial,
        skySun,
        wave,
        eventQueue,
        achievementProgress,
        entities,
    }
}

function parseSeedBank(value: unknown): SeedBankState {
    const source = exact(value, ['packets', 'selection'], 'server save.seedBank', ['choosing', 'conveyor', 'owned'])
    const selected = record(source.selection, 'seedBank.selection')
    let selection: SeedBankState['selection']
    switch (selected.mode) {
        case 'none': exact(selected, ['mode'], 'selection'); selection = { mode: 'none' }; break
        case 'seed':
            exact(selected, ['mode', 'slot'], 'selection')
            selection = { mode: 'seed', slot: nonNegativeInteger(selected.slot, 'selection.slot') }; break
        case 'conveyor':
            exact(selected, ['mode', 'packetId'], 'selection')
            selection = { mode: 'conveyor', packetId: positiveInteger(selected.packetId, 'selection.packetId') }; break
        case 'tool':
            exact(selected, ['mode', 'toolId'], 'selection')
            selection = { mode: 'tool', toolId: nonEmptyString(selected.toolId, 'selection.toolId') }; break
        default: throw new Error('Invalid saved selection')
    }
    const parsePacket = (value: unknown, name: string): SeedPacketState => {
        const packet = exact(value, ['seedId', 'readyAtTick', 'cooldownTotal'], name, ['team'])
        return {
            seedId: nonEmptyString(packet.seedId, `${name}.seedId`),
            readyAtTick: nonNegativeInteger(packet.readyAtTick, `${name}.readyAtTick`),
            cooldownTotal: nonNegativeInteger(packet.cooldownTotal, `${name}.cooldownTotal`),
            ...(packet.team === undefined ? {} : { team: oneOf(packet.team, TEAMS, `${name}.team`) }),
        }
    }
    const packets = array(source.packets, 'server save.seedBank.packets').map((value, index) =>
        value === null ? null : parsePacket(value, `server save.seedBank.packets[${index}]`))
    let conveyor: SeedBankState['conveyor']
    if (source.conveyor !== undefined) {
        const data = exact(source.conveyor, ['nextId', 'spawnAtTick', 'moveTicks', 'packets'], 'seedBank.conveyor', ['lastSeedId'])
        conveyor = {
            nextId: positiveInteger(data.nextId, 'conveyor.nextId'), spawnAtTick: nonNegativeInteger(data.spawnAtTick, 'conveyor.spawnAtTick'),
            moveTicks: nonNegativeInteger(data.moveTicks, 'conveyor.moveTicks'),
            ...(data.lastSeedId === undefined ? {} : { lastSeedId: nonEmptyString(data.lastSeedId, 'conveyor.lastSeedId') }),
            packets: array(data.packets, 'conveyor.packets').map(value => {
                const packet = exact(value, ['id', 'x', 'card'], 'conveyor packet')
                const card = exact(packet.card, ['seedId'], 'conveyor packet.card', ['team'])
                return { id: positiveInteger(packet.id, 'packet.id'), x: finite(packet.x, 'packet.x'), card: {
                    seedId: nonEmptyString(card.seedId, 'packet.card.seedId'), ...(card.team === undefined ? {} : { team: oneOf(card.team, TEAMS, 'packet.card.team') }) } }
            }),
        }
        if (new Set(conveyor.packets.map(packet => packet.id)).size !== conveyor.packets.length ||
            conveyor.packets.some(packet => packet.id >= conveyor!.nextId)) throw new Error('Invalid saved conveyor packets')
    }
    if (selection.mode === 'conveyor' && !conveyor?.packets.some(packet => packet.id === selection.packetId)) throw new Error('Saved cursor has an invalid conveyor packet')
    return { packets, selection,
        ...(conveyor === undefined ? {} : { conveyor }),
        ...(source.choosing === undefined ? {} : { choosing: boolean(source.choosing, 'server save.seedBank.choosing') }),
        ...(source.owned === undefined ? {} : { owned: array(source.owned, 'server save.seedBank.owned')
            .map((id, index) => nonEmptyString(id, `server save.seedBank.owned[${index}]`)) }) }
}

function parseTutorial(value: unknown): TutorialState {
    const source = exact(value, ['firstAdventure', 'step', 'displayedAdvice'], 'server save.tutorial', ['promptAtTick', 'dialogIndex'])
    const result: TutorialState = {
        firstAdventure: boolean(source.firstAdventure, 'server save.tutorial.firstAdventure'),
        step: oneOf(source.step, TUTORIAL_STEPS, 'server save.tutorial.step'),
        displayedAdvice: array(source.displayedAdvice, 'server save.tutorial.displayedAdvice')
            .map(value => nonEmptyString(value, 'server save.tutorial.displayedAdvice[]')),
        ...(source.dialogIndex === undefined ? {} : { dialogIndex: nonNegativeInteger(source.dialogIndex, 'tutorial.dialogIndex') }),
    }
    if (source.promptAtTick !== undefined) {
        result.promptAtTick = nonNegativeInteger(source.promptAtTick, 'server save.tutorial.promptAtTick')
    }
    return result
}

function parseWave(value: unknown): WaveState {
    const source = exact(value, ['index', 'plan', 'zombieIds', 'healthToNextWave', 'finalWaveAnnounced', 'hugeWaveAnnounced'], 'server save.wave', ['nextWaveAtTick', 'accelerateAtTick', 'rowPicks', 'graveRiseAtTick', 'ruleState'])
    const plan = array(source.plan, 'server save.wave.plan').map((value, index) => {
        const wave = exact(value, ['zombies'], `server save.wave.plan[${index}]`, ['flagWave'])
        return { zombies: array(wave.zombies, `server save.wave.plan[${index}].zombies`).map(id => nonEmptyString(id, 'wave zombie ID')),
            ...(wave.flagWave === undefined ? {} : { flagWave: trueFlag(wave.flagWave, `server save.wave.plan[${index}].flagWave`) }) }
    })
    const result: WaveState = {
        index: nonNegativeInteger(source.index, 'server save.wave.index'),
        plan,
        zombieIds: array(source.zombieIds, 'server save.wave.zombieIds').map((id, index) =>
            positiveInteger(id, `server save.wave.zombieIds[${index}]`)),
        healthToNextWave: nonNegativeFinite(source.healthToNextWave, 'server save.wave.healthToNextWave'),
        finalWaveAnnounced: boolean(source.finalWaveAnnounced, 'server save.wave.finalWaveAnnounced'),
        hugeWaveAnnounced: boolean(source.hugeWaveAnnounced, 'server save.wave.hugeWaveAnnounced'),
    }
    if (source.graveRiseAtTick !== undefined) result.graveRiseAtTick = nonNegativeInteger(source.graveRiseAtTick, 'wave.graveRiseAtTick')
    // The level's rules check their own state when the session is restored.
    if (source.ruleState !== undefined) result.ruleState = jsonRoundTrip(record(source.ruleState, 'server save.wave.ruleState')) as JsonObject
    if (source.nextWaveAtTick !== undefined) {
        result.nextWaveAtTick = nonNegativeInteger(source.nextWaveAtTick, 'server save.wave.nextWaveAtTick')
    }
    if (source.accelerateAtTick !== undefined) {
        result.accelerateAtTick = nonNegativeInteger(source.accelerateAtTick, 'server save.wave.accelerateAtTick')
    }
    if (source.rowPicks !== undefined) {
        result.rowPicks = array(source.rowPicks, 'server save.wave.rowPicks').map((value, index) => {
            const name = `server save.wave.rowPicks[${index}]`
            const row = exact(value, ['row', 'lastPicked', 'secondLastPicked'], name, ['mowedAtWave'])
            return {
                row: nonNegativeInteger(row.row, `${name}.row`),
                lastPicked: nonNegativeInteger(row.lastPicked, `${name}.lastPicked`),
                secondLastPicked: nonNegativeInteger(row.secondLastPicked, `${name}.secondLastPicked`),
                ...(row.mowedAtWave === undefined ? {} : { mowedAtWave: nonNegativeInteger(row.mowedAtWave, `${name}.mowedAtWave`) }),
            }
        })
        if (new Set(result.rowPicks.map(row => row.row)).size !== result.rowPicks.length) throw new TypeError('Saved wave row history contains duplicate rows')
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

function parseEntity(value: unknown, index: number, nextEntity: number): SavedEntity {
    const name = `server save.entities[${index}]`
    const source = exact(value, ['entityId'], name, [...SAVED_COMPONENTS.map(entry => entry.key), 'extensions'])
    const entityId = positiveInteger(source.entityId, `${name}.entityId`)
    if (entityId >= nextEntity) throw new TypeError(`${name}.entityId must be below allocator.nextEntity`)
    const entity: SavedEntity = { entityId }
    for (const { key, parse } of SAVED_COMPONENTS) {
        if (source[key] !== undefined) Object.assign(entity, { [key]: parse(source[key], `${name}.${key}`) })
    }
    if (source.extensions !== undefined) {
        const extensions = record(source.extensions, `${name}.extensions`)
        entity.extensions = Object.fromEntries(Object.entries(extensions).map(([id, data]) => {
            if (!isQualifiedId(id)) throw new TypeError(`Invalid component ID: ${id}`)
            return [id, jsonRoundTrip(record(data, `${name}.extensions.${id}`)) as JsonObject]
        }))
    }
    if (Object.keys(entity).length === 1) throw new TypeError(`${name} must contain a component`)
    return entity
}
