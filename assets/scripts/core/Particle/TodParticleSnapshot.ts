export interface TodParticleTintSnapshot {
    r: number
    g: number
    b: number
    a: number
}

export interface TodParticleSystemSnapshot {
    effect: string
    seed: number
    ageTicks: number
    accumulator: number
    renderOrder: number
    tint: TodParticleTintSnapshot | null
    extraAdditive: boolean
    imageOverride: string | null
    useGameTime: boolean
    scale: number
}

export class TodParticleRng {
    private state: number

    constructor(readonly seed: number) {
        if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
            throw new TypeError('TodParticle seed must be a uint32')
        }
        this.state = seed === 0 ? 0x6d2b79f5 : seed >>> 0
    }

    nextFloat(): number {
        let value = this.state
        value ^= value << 13
        value ^= value >>> 17
        value ^= value << 5
        this.state = value >>> 0
        return this.state / 0x100000000
    }
}

let defaultSeedState = 0x9e3779b9

export function nextTodParticleSeed(): number {
    const rng = new TodParticleRng(defaultSeedState)
    defaultSeedState = (defaultSeedState + 0x9e3779b9) >>> 0
    return Math.floor(rng.nextFloat() * 0x100000000) >>> 0
}

export function parseTodParticleSystemSnapshot(value: unknown): TodParticleSystemSnapshot {
    const source = exact(value, [
        'effect', 'seed', 'ageTicks', 'accumulator', 'renderOrder', 'tint',
        'extraAdditive', 'imageOverride', 'useGameTime', 'scale',
    ], 'TodParticle snapshot')
    const accumulator = nonNegativeFinite(source.accumulator, 'TodParticle snapshot.accumulator')
    if (accumulator >= 0.01) throw new TypeError('TodParticle snapshot.accumulator must be below one tick')
    return {
        effect: nonEmptyString(source.effect, 'TodParticle snapshot.effect'),
        seed: uint32(source.seed, 'TodParticle snapshot.seed'),
        ageTicks: nonNegativeInteger(source.ageTicks, 'TodParticle snapshot.ageTicks'),
        accumulator,
        renderOrder: finite(source.renderOrder, 'TodParticle snapshot.renderOrder'),
        tint: source.tint === null ? null : parseTint(source.tint),
        extraAdditive: boolean(source.extraAdditive, 'TodParticle snapshot.extraAdditive'),
        imageOverride: source.imageOverride === null
            ? null
            : nonEmptyString(source.imageOverride, 'TodParticle snapshot.imageOverride'),
        useGameTime: boolean(source.useGameTime, 'TodParticle snapshot.useGameTime'),
        scale: nonNegativeFinite(source.scale, 'TodParticle snapshot.scale'),
    }
}

function parseTint(value: unknown): TodParticleTintSnapshot {
    const source = exact(value, ['r', 'g', 'b', 'a'], 'TodParticle snapshot.tint')
    return {
        r: colorChannel(source.r, 'TodParticle snapshot.tint.r'),
        g: colorChannel(source.g, 'TodParticle snapshot.tint.g'),
        b: colorChannel(source.b, 'TodParticle snapshot.tint.b'),
        a: colorChannel(source.a, 'TodParticle snapshot.tint.a'),
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

function nonEmptyString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${name} must be a non-empty string`)
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
