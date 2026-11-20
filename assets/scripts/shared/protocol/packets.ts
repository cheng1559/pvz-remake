import { record, array, nonEmptyString, boolean, finite, oneOf, nonNegativeInteger, uint32 } from '@/shared/validate'
import type { DebugCliResult } from '@/shared/debug/DebugCli'
import { TEAMS, validateServerEvent, validateWorldSnapshot, type EntityId, type ServerEvent, type Team, type WorldSnapshot } from '@/shared/protocol/snapshot'
import { assertJsonValue, copyJson, jsonRoundTrip, type JsonObject, type JsonValue } from '@/shared/protocol/json'

/** The packets between client and server: the commands a client sends, the replies, and how each side checks them. */

export type ClientSequence = number

export type ServerTick = number

export interface EnabledMod {
    id: string
    version: string
    contentHash: string
}

/** One Mod, the same version with the same content. */
export function sameMod(left: EnabledMod, right: EnabledMod): boolean {
    return left.id === right.id && left.version === right.version && left.contentHash === right.contentHash
}

/** The same Mods in the same order: a later Mod's definitions replace an earlier one's, so the order is part of the game. */
export function sameMods(left: readonly EnabledMod[], right: readonly EnabledMod[]): boolean {
    return left.length === right.length && left.every((mod, index) => sameMod(mod, right[index]))
}

export type GameCommand =
    | { type: 'mod'; id: string; data: JsonObject }
    /** `slot` picks one bank packet when the bank holds the seed more than once. */
    | { type: 'selectSeed'; seedId: string; slot?: number }
    /** `team`: the card's side when not its seed's own, as a Mod's chooser `entries` offer it. */
    | { type: 'chooseSeed'; seedId: string; team?: Team }
    | { type: 'confirmSeeds' }
    /** After a repick's Let's Rock: the chooser has lifted out and the bank is back, so the level goes on. */
    | { type: 'finishRepick' }
    | { type: 'selectConveyorPacket'; packetId: EntityId }
    | { type: 'selectTool'; toolId: string }
    | { type: 'placePlant'; row: number; column: number }
    | { type: 'useToolAt'; row: number; column: number }
    /** Board::MouseDown on an item: the server collects the one there (itemAt); `award: false` passes the level's award over. */
    | { type: 'collectItemAt'; x: number; y: number; award?: false }
    /** Challenge::MouseDown: a click on the board that hit nothing else, for the level's rules (the Whack-a-Zombie mallet). */
    | { type: 'boardClick'; x: number; y: number }
    | { type: 'clearCursor' }
    | { type: 'pause' }
    | { type: 'resume' }
    | { type: 'advanceDialog' }
    /** Answers the Yes/No question a dialogue line asks ({NO_CLICK}); only the active script decides what it means. */
    | { type: 'answerDialog'; accept: boolean }
    | { type: 'completeIntro' }
    /** The profile's purse after a store visit from the level (the profile owns the coins and seed-slot upgrades). */
    | { type: 'syncPurse'; money: number; packetUpgrades: number }

export interface ClientPacketBase {
    protocolVersion: 1
    sequence: ClientSequence
}

export interface StartSessionPacket extends ClientPacketBase {
    type: 'startSession'
    levelId: string
    randomSeed: number
    /** The player's coins, in original coin units. */
    initialMoney: number
    /** Seed-slot upgrades bought in the store; diamonds drop only after the first, and each adds a chooser slot. */
    packetUpgrades?: number
    /**
     * Crazy Dave may sell the next seed-slot upgrade during the intro (CutScene::CanGetPacketUpgrade); the client sends
     * it while the player has not declined twice.
     */
    packetUpgradeOffer?: { cost: number }
    /** The seeds the player owns (the profile's awards and purchases); without it every catalog seed is available. */
    ownedSeeds?: string[]
    /** The achievements the player has; the level reports only new ones. */
    earnedAchievements?: string[]
    /**
     * `/cheatseed` stands on (the player's preference): the chooser offers every seed on its pages. It counts towards
     * whether the chooser opens, so it comes with the start, a loaded save's too, rather than after it.
     */
    cheatSeeds?: boolean
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
    modId?: string
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
    nonNegativeInteger(packet.sequence, 'client packet.sequence')

    switch (packet.type) {
        case 'startSession':
            nonEmptyString(packet.levelId, 'startSession.levelId')
            uint32(packet.randomSeed, 'startSession.randomSeed')
            nonNegativeInteger(packet.initialMoney, 'startSession.initialMoney')
            if (packet.packetUpgrades !== undefined) nonNegativeInteger(packet.packetUpgrades, 'startSession.packetUpgrades')
            if (packet.packetUpgradeOffer !== undefined) {
                const offer = record(packet.packetUpgradeOffer, 'startSession.packetUpgradeOffer')
                nonNegativeInteger(offer.cost, 'startSession.packetUpgradeOffer.cost')
            }
            if (packet.ownedSeeds !== undefined) {
                array(packet.ownedSeeds, 'startSession.ownedSeeds').forEach((id, index) => nonEmptyString(id, `startSession.ownedSeeds[${index}]`))
            }
            if (packet.earnedAchievements !== undefined) {
                array(packet.earnedAchievements, 'startSession.earnedAchievements')
                    .forEach((id, index) => nonEmptyString(id, `startSession.earnedAchievements[${index}]`))
            }
            if (packet.cheatSeeds !== undefined) boolean(packet.cheatSeeds, 'startSession.cheatSeeds')
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
            nonNegativeInteger(packet.acknowledgedSequence, 'sessionStarted.acknowledgedSequence')
            validateWorldSnapshot(packet.snapshot)
            break
        case 'frame':
            nonNegativeInteger(packet.serverTick, 'frame.serverTick')
            nonNegativeInteger(packet.acknowledgedSequence, 'frame.acknowledgedSequence')
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
            nonNegativeInteger(packet.sequence, 'commandRejected.sequence')
            nonEmptyString(packet.code, 'commandRejected.code')
            break
        case 'debugResult': {
            nonNegativeInteger(packet.sequence, 'debugResult.sequence')
            const result = record(packet.result, 'debugResult.result')
            boolean(result.ok, 'debugResult.result.ok')
            if (result.failure !== undefined && result.failure !== 'syntax' && result.failure !== 'condition') throw new TypeError('Unknown debug failure')
            if (result.failure === 'condition') {
                nonEmptyString(result.key, 'debugResult.result.key')
                if (result.args !== undefined) array(result.args, 'debugResult.result.args').forEach(value => {
                    if (typeof value !== 'string') throw new TypeError('debugResult.result.args entries must be strings')
                })
            } else nonEmptyString(result.message, 'debugResult.result.message')
            if (result.catalog !== undefined) {
                const catalog = record(result.catalog, 'debugResult.result.catalog')
                for (const kind of ['plants', 'zombies', 'items', 'levels']) {
                    array(catalog[kind], `debug catalog.${kind}`).forEach(value => nonEmptyString(value, `debug catalog.${kind} entry`))
                }
            }
            break
        }
        case 'saveReady':
            nonNegativeInteger(packet.acknowledgedSequence, 'saveReady.acknowledgedSequence')
            if (!('save' in packet)) throw new TypeError('saveReady.save is required')
            break
        case 'sessionStopped':
            nonNegativeInteger(packet.acknowledgedSequence, 'sessionStopped.acknowledgedSequence')
            break
        case 'fatalServerError':
            nonEmptyString(packet.code, 'fatalServerError.code')
            nonEmptyString(packet.message, 'fatalServerError.message')
            if (packet.modId !== undefined) nonEmptyString(packet.modId, 'fatalServerError.modId')
            break
        default:
            throw new TypeError('server packet.type is unknown')
    }
    return packet as unknown as ServerPacket
}

/** A validated, isolated local reply, without a second serialization/parse pass. */
export function copyServerPacket(value: ServerPacket): ServerPacket {
    if (value === null || typeof value !== 'object') return parseServerPacket(value)
    const copy = copyJson(value)
    // Keep the existing diagnostics (including property paths) for invalid values.
    return validateServerPacket(copy === undefined ? jsonRoundTrip(value) : copy)
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
            if (command.slot !== undefined) nonNegativeInteger(command.slot, 'selectSeed.slot')
            return
        case 'chooseSeed':
            nonEmptyString(command.seedId, 'chooseSeed.seedId')
            if (command.team !== undefined) oneOf(command.team, TEAMS, 'chooseSeed.team')
            return
        case 'selectConveyorPacket': nonNegativeInteger(command.packetId, 'selectConveyorPacket.packetId'); return
        case 'selectTool': nonEmptyString(command.toolId, 'selectTool.toolId'); return
        case 'placePlant':
            nonNegativeInteger(command.row, 'placePlant.row')
            nonNegativeInteger(command.column, 'placePlant.column')
            return
        case 'useToolAt':
            nonNegativeInteger(command.row, 'useToolAt.row')
            nonNegativeInteger(command.column, 'useToolAt.column')
            return
        case 'collectItemAt':
            finite(command.x, 'collectItemAt.x')
            finite(command.y, 'collectItemAt.y')
            if (command.award !== undefined && command.award !== false) throw new TypeError('collectItemAt.award must be false')
            return
        case 'boardClick':
            nonNegativeInteger(command.x, 'boardClick.x')
            nonNegativeInteger(command.y, 'boardClick.y')
            return
        case 'answerDialog': boolean(command.accept, 'answerDialog.accept'); return
        case 'syncPurse':
            nonNegativeInteger(command.money, 'syncPurse.money')
            nonNegativeInteger(command.packetUpgrades, 'syncPurse.packetUpgrades')
            return
        case 'clearCursor':
        case 'pause':
        case 'resume':
        case 'advanceDialog':
        case 'completeIntro':
        case 'confirmSeeds':
        case 'finishRepick':
            return
        default:
            throw new TypeError('command.command.type is unknown')
    }
}

const protocolVersion = (value: unknown): void => {
    if (value !== 1) throw new TypeError('protocolVersion must be 1')
}
