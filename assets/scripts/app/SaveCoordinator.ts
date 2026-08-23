import {
    parseClientPresentationSnapshotV2,
    type ClientPresentationSnapshotV2,
} from '@/client/game/ClientPresentationSnapshot'
import { parseServerSaveSnapshotV2, type ServerSaveSnapshotV2 } from '@/server/save'
import { jsonRoundTrip, type EnabledMod } from '@/shared/protocol/index'

export interface ContentSetSnapshot {
    base: EnabledMod
    mods: EnabledMod[]
}

export interface GameSaveV2 {
    schemaVersion: 2
    profileId: number
    mode: 'adventure'
    levelId: string
    createdAt: number
    updatedAt: number
    contentSet: ContentSetSnapshot
    server: ServerSaveSnapshotV2
    client: ClientPresentationSnapshotV2
}

export type GameSaveV2Input = Omit<GameSaveV2, 'schemaVersion'>

export function createGameSaveV2(input: GameSaveV2Input): GameSaveV2 {
    return parseGameSaveV2({ schemaVersion: 2, ...input })
}

export function parseGameSaveV2(value: unknown): GameSaveV2 {
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
    const server = parseServerSaveSnapshotV2(save.server)
    const client = parseClientPresentationSnapshotV2(save.client)
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
    if (base.id !== 'pvz:base') throw new TypeError('game save.contentSet.base.id must be pvz:base')
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

function exact(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError(`${name} must be an object`)
    }
    const source = value as Record<string, unknown>
    const allowed = new Set(keys)
    for (const key of Object.keys(source)) if (!allowed.has(key)) throw new TypeError(`${name}.${key} is not supported`)
    for (const key of keys) if (!(key in source)) throw new TypeError(`${name}.${key} is required`)
    return source
}

function array(value: unknown, name: string): unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`)
    return value
}

function nonEmptyString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${name} must be a non-empty string`)
    return value
}

function nonNegativeInteger(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`${name} must be a non-negative safe integer`)
    }
    return value
}

function positiveInteger(value: unknown, name: string): number {
    const result = nonNegativeInteger(value, name)
    if (result === 0) throw new TypeError(`${name} must be positive`)
    return result
}
