import { isQualifiedId } from '@/shared/mod/index'

export interface ParticleTintSnapshot {
    r: number
    g: number
    b: number
    a: number
}

export interface ParticlePlayerSnapshot {
    id: string
    seed: number
    ageTicks: number
    accumulatorSeconds: number
    renderOrder: number
    tint: ParticleTintSnapshot | null
    extraAdditive: boolean
    spriteOverride: string | null
    playing: boolean
    visible: boolean
    scale: number
}

let nextSeed = 0x9e3779b9
export function nextParticleSeed(): number {
    nextSeed = (nextSeed + 0x9e3779b9) >>> 0
    return nextSeed
}

export function parseParticlePlayerSnapshot(value: unknown): ParticlePlayerSnapshot {
    const source = exact(value, [
        'id', 'seed', 'ageTicks', 'accumulatorSeconds', 'renderOrder', 'tint',
        'extraAdditive', 'spriteOverride', 'playing', 'visible', 'scale',
    ], 'Particle snapshot')
    const accumulator = nonNegativeFinite(source.accumulatorSeconds, 'Particle snapshot.accumulatorSeconds')
    if (accumulator >= 0.01) throw new TypeError('Particle snapshot.accumulatorSeconds must be below one tick')
    return {
        id: qualifiedId(source.id, 'Particle snapshot.id'),
        seed: uint32(source.seed, 'Particle snapshot.seed'),
        ageTicks: nonNegativeInteger(source.ageTicks, 'Particle snapshot.ageTicks'),
        accumulatorSeconds: accumulator,
        renderOrder: finite(source.renderOrder, 'Particle snapshot.renderOrder'),
        tint: source.tint === null ? null : parseTint(source.tint),
        extraAdditive: boolean(source.extraAdditive, 'Particle snapshot.extraAdditive'),
        spriteOverride: source.spriteOverride === null
            ? null
            : qualifiedId(source.spriteOverride, 'Particle snapshot.spriteOverride'),
        playing: boolean(source.playing, 'Particle snapshot.playing'),
        visible: boolean(source.visible, 'Particle snapshot.visible'),
        scale: nonNegativeFinite(source.scale, 'Particle snapshot.scale'),
    }
}

function parseTint(value: unknown): ParticleTintSnapshot {
    const source = exact(value, ['r', 'g', 'b', 'a'], 'Particle snapshot.tint')
    return {
        r: colorChannel(source.r, 'Particle snapshot.tint.r'),
        g: colorChannel(source.g, 'Particle snapshot.tint.g'),
        b: colorChannel(source.b, 'Particle snapshot.tint.b'),
        a: colorChannel(source.a, 'Particle snapshot.tint.a'),
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

function qualifiedId(value: unknown, name: string): string {
    if (!isQualifiedId(value)) throw new TypeError(`${name} must be a qualified ID`)
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

function nonNegativeInteger(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`${name} must be a non-negative safe integer`)
    }
    return value
}

function uint32(value: unknown, name: string): number {
    const result = nonNegativeInteger(value, name)
    if (result > 0xffffffff) throw new TypeError(`${name} must be a uint32`)
    return result
}

function colorChannel(value: unknown, name: string): number {
    const result = nonNegativeInteger(value, name)
    if (result > 255) throw new TypeError(`${name} must not exceed 255`)
    return result
}

function boolean(value: unknown, name: string): boolean {
    if (typeof value !== 'boolean') throw new TypeError(`${name} must be boolean`)
    return value
}
