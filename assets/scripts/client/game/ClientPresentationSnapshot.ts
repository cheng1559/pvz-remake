import {
    assertJsonValue,
    jsonRoundTrip,
    parseServerPacket,
    type WorldSnapshot,
} from '@/shared/protocol/index'
import {
    parseAdventure11PresentationSnapshotV2,
    type Adventure11PresentationSnapshotV2,
} from '@/client/showcase/Adventure11PresentationSnapshotV2'

export interface ClientTransportSnapshotV2 {
    sequence: number
    highestEventId: number
    previous: WorldSnapshot | null
    current: WorldSnapshot
}

export interface ClientPresentationSnapshotV2 {
    schemaVersion: 2
    transport: ClientTransportSnapshotV2
    adventure11: Adventure11PresentationSnapshotV2
}

export function parseClientPresentationSnapshotV2(value: unknown): ClientPresentationSnapshotV2 {
    assertJsonValue(value)
    const save = exact(value, ['schemaVersion', 'transport', 'adventure11'], 'client presentation')
    if (save.schemaVersion !== 2) throw new TypeError('client presentation.schemaVersion must be 2')
    const source = exact(
        save.transport,
        ['sequence', 'highestEventId', 'previous', 'current'],
        'client presentation.transport',
    )
    const previous = source.previous === null
        ? null
        : parseSnapshot(source.previous, 'client presentation.transport.previous')
    const current = parseSnapshot(source.current, 'client presentation.transport.current')
    if (previous && previous.levelId !== current.levelId) {
        throw new TypeError('client presentation snapshots must use the same levelId')
    }
    if (previous && previous.tick >= current.tick) {
        throw new TypeError('client presentation previous tick must be below current tick')
    }
    const adventure11 = parseAdventure11PresentationSnapshotV2(save.adventure11)
    validateAdventure11(adventure11, current)

    return {
        schemaVersion: 2,
        adventure11,
        transport: {
            sequence: nonNegativeInteger(source.sequence, 'client presentation.transport.sequence'),
            highestEventId: nonNegativeInteger(
                source.highestEventId,
                'client presentation.transport.highestEventId',
            ),
            previous,
            current,
        },
    }
}

function validateAdventure11(snapshot: Adventure11PresentationSnapshotV2, current: WorldSnapshot): void {
    if (current.levelId !== 'pvz:adventure-1-1') {
        throw new TypeError('client presentation.adventure11 requires pvz:adventure-1-1')
    }
    if (snapshot.flow.introCompletionSent !== (current.phase === 'gameplay')) {
        throw new TypeError('client presentation Adventure 1-1 intro flow does not match the current phase')
    }
    if ((snapshot.end.ticks >= 0) !== (current.result === 'won')) {
        throw new TypeError('client presentation Adventure 1-1 end flow does not match the current result')
    }
    if (snapshot.advice.lastSyncedTick !== current.gameplayTick ||
        snapshot.hud.progressTick !== current.gameplayTick) {
        throw new TypeError('client presentation Adventure 1-1 presenter ticks must match the current tick')
    }
    if (snapshot.hud.progressWave !== current.wave.index) {
        throw new TypeError('client presentation Adventure 1-1 progress wave must match the current wave')
    }

    const kinds = new Map<number, Adventure11PresentationSnapshotV2['entities'][number]['kind']>()
    for (const plant of current.plants) kinds.set(plant.entityId, 'plant')
    for (const zombie of current.zombies) kinds.set(zombie.entityId, 'zombie')
    for (const mower of current.lawnMowers) kinds.set(mower.entityId, 'mower')
    for (const item of current.items) if (item.typeId === 'pvz:sun') kinds.set(item.entityId, 'sun')
    for (const entity of snapshot.entities) {
        if (kinds.get(entity.entityId) !== entity.kind) {
            throw new TypeError(`client presentation Adventure 1-1 ${entity.kind} ${entity.entityId} is not in the current frame`)
        }
    }

    const worldIds = new Set([
        ...current.plants, ...current.zombies, ...current.projectiles,
        ...current.items, ...current.lawnMowers,
    ].map(entity => entity.entityId))
    for (const particle of snapshot.particles) {
        if (particle.owner.kind === 'entity' && !worldIds.has(particle.owner.entityId)) {
            throw new TypeError(`client presentation Adventure 1-1 particle owner ${particle.owner.entityId} is not in the current frame`)
        }
    }
}

function parseSnapshot(value: unknown, name: string): WorldSnapshot {
    try {
        const packet = parseServerPacket({
            protocolVersion: 1,
            type: 'sessionStarted',
            acknowledgedSequence: 0,
            snapshot: jsonRoundTrip(value),
        })
        if (packet.type !== 'sessionStarted') throw new TypeError(`${name} is not a world snapshot`)
        return packet.snapshot
    } catch (error) {
        throw new TypeError(`${name} is invalid: ${error instanceof Error ? error.message : String(error)}`)
    }
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

function nonNegativeInteger(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`${name} must be a non-negative safe integer`)
    }
    return value
}
