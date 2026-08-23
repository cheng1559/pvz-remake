import {
    PARTICLE_STEP_SECONDS,
    type ParticlePlaybackSnapshot,
    type ParticleV2,
} from '@/shared/content/particle'
import { isQualifiedId } from '@/shared/mod/index'

export interface ParticlePlayerSnapshot extends ParticlePlaybackSnapshot {
    accumulatorSeconds: number
}

export function parseParticlePlayerSnapshot(value: unknown): ParticlePlayerSnapshot {
    const source = exactObject(
        value,
        ['id', 'seed', 'ageTicks', 'playing', 'visible', 'accumulatorSeconds'],
        'particle player snapshot',
    )
    if (!isQualifiedId(source.id)) throw new Error('particle player snapshot.id must be a qualified ID')
    const seed = uint32(source.seed, 'particle player snapshot.seed')
    const ageTicks = nonNegativeInteger(source.ageTicks, 'particle player snapshot.ageTicks')
    const accumulatorSeconds = finite(source.accumulatorSeconds, 'particle player snapshot.accumulatorSeconds')
    if (accumulatorSeconds < 0 || accumulatorSeconds >= PARTICLE_STEP_SECONDS) {
        throw new Error('particle player snapshot.accumulatorSeconds must be within one tick')
    }
    return {
        id: source.id,
        seed,
        ageTicks,
        playing: boolean(source.playing, 'particle player snapshot.playing'),
        visible: boolean(source.visible, 'particle player snapshot.visible'),
        accumulatorSeconds,
    }
}

export function validateParticlePlayerSnapshotContent(
    snapshot: ParticlePlayerSnapshot,
    data: Pick<ParticleV2, 'id' | 'durationSeconds'>,
): ParticlePlayerSnapshot {
    if (snapshot.id !== data.id) {
        throw new Error(`particle ID mismatch: expected ${data.id}, got ${snapshot.id}`)
    }
    const durationTicks = Math.max(1, Math.round(data.durationSeconds / PARTICLE_STEP_SECONDS))
    if (snapshot.ageTicks > durationTicks) {
        throw new Error('particle player snapshot.ageTicks exceeds effect duration')
    }
    return snapshot
}

function exactObject(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)
        || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
        throw new Error(`${name} must be a plain object`)
    }
    const source = value as Record<string, unknown>
    const allowed = new Set(keys)
    for (const key of Object.keys(source)) if (!allowed.has(key)) throw new Error(`${name}.${key} is not supported`)
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) throw new Error(`${name}.${key} is required`)
    }
    return source
}

function finite(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be finite`)
    return value
}

function nonNegativeInteger(value: unknown, name: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) {
        throw new Error(`${name} must be a non-negative safe integer`)
    }
    return value as number
}

function uint32(value: unknown, name: string): number {
    const result = nonNegativeInteger(value, name)
    if (result > 0xffffffff) throw new Error(`${name} must be a uint32`)
    return result
}

function boolean(value: unknown, name: string): boolean {
    if (typeof value !== 'boolean') throw new Error(`${name} must be boolean`)
    return value
}
