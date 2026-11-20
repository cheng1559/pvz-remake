import { exact, boolean, finite, nonNegativeFinite, nonNegativeInteger, uint32 } from '@/shared/validate'
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
    /** Played flipped left to right (ParticleSpawnArgs.mirrored); absent when not. */
    mirrored?: true
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
    ], 'Particle snapshot', ['mirrored'])
    if (source.mirrored !== undefined && source.mirrored !== true) throw new TypeError('Particle snapshot.mirrored must be true when present')
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
        ...(source.mirrored ? { mirrored: true as const } : {}),
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

function qualifiedId(value: unknown, name: string): string {
    if (!isQualifiedId(value)) throw new TypeError(`${name} must be a qualified ID`)
    return value
}

function colorChannel(value: unknown, name: string): number {
    const result = nonNegativeInteger(value, name)
    if (result > 255) throw new TypeError(`${name} must not exceed 255`)
    return result
}
