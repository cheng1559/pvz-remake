import { exact, nonNegativeInteger } from '@/shared/validate'
import {
    assertJsonValue,
    jsonRoundTrip,
    parseServerPacket,
    type WorldSnapshot,
} from '@/shared/protocol/index'
import {
    parseLevelPresentationSnapshot,
    type LevelPresentationSnapshot,
} from '@/client/level/LevelPresentationSnapshot'

export interface ClientTransportSnapshot {
    sequence: number
    highestEventId: number
    previous: WorldSnapshot | null
    current: WorldSnapshot
}

export interface ClientPresentationSnapshot {
    schemaVersion: 2
    transport: ClientTransportSnapshot
    level: LevelPresentationSnapshot
}

export function parseClientPresentationSnapshot(value: unknown): ClientPresentationSnapshot {
    assertJsonValue(value)
    const save = exact(value, ['schemaVersion', 'transport', 'level'], 'client presentation')
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
    const level = parseLevelPresentationSnapshot(save.level)
    validateLevel(level, current)

    return {
        schemaVersion: 2,
        level,
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

function validateLevel(snapshot: LevelPresentationSnapshot, current: WorldSnapshot): void {
    if (snapshot.flow.introCompletionSent !== (current.phase === 'gameplay')) {
        throw new TypeError('client presentation Level intro flow does not match the current phase')
    }
    if ((snapshot.end.ticks >= 0) !== (current.result === 'won')) {
        throw new TypeError('client presentation Level end flow does not match the current result')
    }
    if (snapshot.advice.lastSyncedTick !== current.gameplayTick ||
        snapshot.hud.progressTick !== current.gameplayTick) {
        throw new TypeError('client presentation Level presenter ticks must match the current tick')
    }
    if (snapshot.hud.progressWave !== current.wave.index) {
        throw new TypeError('client presentation Level progress wave must match the current wave')
    }

    // Both halves of a save must describe the same frame: every presentation entry needs its entity in it.
    const worldIds = new Set([
        ...current.plants, ...current.zombies, ...current.projectiles,
        ...current.items, ...current.gridItems ?? [],
    ].map(entity => entity.entityId))
    for (const entity of snapshot.entities) {
        if (!worldIds.has(entity.entityId)) {
            throw new TypeError(`client presentation Level ${entity.kind} ${entity.entityId} is not in the current frame`)
        }
    }
    for (const particle of snapshot.particles) {
        if (particle.owner.kind === 'entity' && !worldIds.has(particle.owner.entityId)) {
            throw new TypeError(`client presentation Level particle owner ${particle.owner.entityId} is not in the current frame`)
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
