import { exact, array, nonEmptyString, nonNegativeInteger, positiveInteger } from '@/shared/validate'
import { BASE_MOD_ID } from '@/shared/mod'
import {
    parseClientPresentationSnapshot,
    type ClientPresentationSnapshot,
} from '@/client/game/ClientPresentationSnapshot'
import { parseServerSaveSnapshot, type ServerSaveSnapshot } from '@/server/session/save'
import { jsonRoundTrip, type EnabledMod } from '@/shared/protocol/index'

export interface ContentSetSnapshot {
    base: EnabledMod
    mods: EnabledMod[]
}

export interface GameSave {
    schemaVersion: 2
    profileId: number
    mode: 'adventure'
    levelId: string
    createdAt: number
    updatedAt: number
    contentSet: ContentSetSnapshot
    server: ServerSaveSnapshot
    client: ClientPresentationSnapshot
}

export type GameSaveInput = Omit<GameSave, 'schemaVersion'>

export function createGameSave(input: GameSaveInput): GameSave {
    return parseGameSave({ schemaVersion: 2, ...input })
}

export function isCompatibleBaseContent(saved: EnabledMod, installed: EnabledMod): boolean {
    return saved.id === installed.id && saved.version === installed.version
        && saved.contentHash === installed.contentHash
}

export function parseGameSave(value: unknown): GameSave {
    const save = exact(jsonRoundTrip(value), [
        'schemaVersion', 'profileId', 'mode', 'levelId', 'createdAt', 'updatedAt',
        'contentSet', 'server', 'client',
    ], 'game save')
    if (save.schemaVersion !== 2) throw new TypeError('game save.schemaVersion must be 2')
    if (save.mode !== 'adventure') throw new TypeError('game save.mode must be adventure')

    const levelId = nonEmptyString(save.levelId, 'game save.levelId')
    const createdAt = nonNegativeInteger(save.createdAt, 'game save.createdAt')
    const updatedAt = nonNegativeInteger(save.updatedAt, 'game save.updatedAt')
    if (updatedAt < createdAt) throw new TypeError('game save.updatedAt must not be below createdAt')

    const contentSet = parseContentSet(save.contentSet)
    const server = parseServerSaveSnapshot(save.server)
    const client = parseClientPresentationSnapshot(save.client)
    if (server.levelId !== levelId || client.transport.current.levelId !== levelId) {
        throw new TypeError('game save levelId must match server and client snapshots')
    }
    if (server.tick !== client.transport.current.tick) {
        throw new TypeError('game save server and client current ticks must match')
    }
    if (server.gameplayTick !== client.transport.current.gameplayTick) {
        throw new TypeError('game save server and client gameplay ticks must match')
    }
    const firstPendingEventId = server.eventQueue.events[0]?.eventId ?? server.eventQueue.nextEventId
    if (client.transport.highestEventId + 1 !== firstPendingEventId) {
        throw new TypeError('game save server events must continue after the client event baseline')
    }
    if (!sameContentSet(server.mods, contentSet.mods)) {
        throw new TypeError('game save contentSet.mods must match server mods')
    }

    return {
        schemaVersion: 2,
        profileId: positiveInteger(save.profileId, 'game save.profileId'),
        mode: 'adventure',
        levelId,
        createdAt,
        updatedAt,
        contentSet,
        server,
        client,
    }
}

function parseContentSet(value: unknown): ContentSetSnapshot {
    const source = exact(value, ['base', 'mods'], 'game save.contentSet')
    const base = parseContent(source.base, 'game save.contentSet.base')
    if (base.id !== BASE_MOD_ID) throw new TypeError(`game save.contentSet.base.id must be ${BASE_MOD_ID}`)
    const mods = array(source.mods, 'game save.contentSet.mods').map((entry, index) =>
        parseContent(entry, `game save.contentSet.mods[${index}]`))
    const ids = [base.id, ...mods.map(mod => mod.id)]
    if (new Set(ids).size !== ids.length) throw new TypeError('game save.contentSet has duplicate IDs')
    return { base, mods }
}

function parseContent(value: unknown, name: string): EnabledMod {
    const source = exact(value, ['id', 'version', 'contentHash'], name)
    return {
        id: nonEmptyString(source.id, `${name}.id`),
        version: nonEmptyString(source.version, `${name}.version`),
        contentHash: nonEmptyString(source.contentHash, `${name}.contentHash`),
    }
}

function sameContentSet(left: EnabledMod[], right: EnabledMod[]): boolean {
    if (left.length !== right.length) return false
    const byId = new Map(right.map(mod => [mod.id, mod]))
    return left.every(mod => {
        const other = byId.get(mod.id)
        return other?.version === mod.version && other.contentHash === mod.contentHash
    })
}
