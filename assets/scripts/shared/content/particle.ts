import { isQualifiedId } from '@/shared/mod/index'

export const PARTICLE_STEP_SECONDS = 0.01

export interface ParticleTrackNode {
    time: number
    low: number
    high: number
    curve?: ParticleTrackCurve
    distribution?: ParticleTrackCurve
}

export interface ParticleTrack {
    nodes: ParticleTrackNode[]
}

export type ParticleTrackCurve = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'fast-in-out' | 'bounce'

export type ParticleFieldType =
    | 'friction'
    | 'acceleration'
    | 'attractor'
    | 'max-velocity'
    | 'velocity'
    | 'position'
    | 'system-position'
    | 'ground-constraint'
    | 'shake'
    | 'circle'
    | 'away'
    | 'unknown'

export interface ParticleField {
    type: ParticleFieldType
    x: ParticleTrack
    y: ParticleTrack
}

export interface ParticleEmitter {
    sprite: string
    name?: string
    emitterType: string
    additive: boolean
    columns: number
    rows: number
    firstFrame: number
    frameCount: number
    randomLaunchSpin: boolean
    alignLaunchSpin: boolean
    particleLoops: boolean
    systemLoops: boolean
    randomStartTime: boolean
    particlesDontFollow: boolean
    systemDuration?: ParticleTrack
    spawnRate: ParticleTrack
    spawnMinActive: ParticleTrack
    spawnMaxActive: ParticleTrack
    spawnMaxLaunched: ParticleTrack
    emitterOffsetX: ParticleTrack
    emitterOffsetY: ParticleTrack
    emitterRadius: ParticleTrack
    emitterBoxX: ParticleTrack
    emitterBoxY: ParticleTrack
    emitterSkewX: ParticleTrack
    emitterSkewY: ParticleTrack
    emitterPath: ParticleTrack
    particleDuration: ParticleTrack
    launchSpeed: ParticleTrack
    launchAngle: ParticleTrack
    systemRed: ParticleTrack
    systemGreen: ParticleTrack
    systemBlue: ParticleTrack
    systemAlpha: ParticleTrack
    systemBrightness: ParticleTrack
    particleRed: ParticleTrack
    particleGreen: ParticleTrack
    particleBlue: ParticleTrack
    particleAlpha: ParticleTrack
    particleBrightness: ParticleTrack
    particleSpinAngle: ParticleTrack
    particleSpinSpeed: ParticleTrack
    particleScale: ParticleTrack
    particleStretch: ParticleTrack
    collisionReflect: ParticleTrack
    collisionSpin: ParticleTrack
    fields: ParticleField[]
    systemFields: ParticleField[]
}

export interface Particle {
    schemaVersion: 3
    id: string
    emitters: ParticleEmitter[]
}

const constant = (value: number): ParticleTrack => ({
    nodes: [{ time: 0, low: value, high: value }],
})

const DEFAULT_EMITTER: Omit<ParticleEmitter, 'sprite'> = {
    emitterType: 'circle',
    additive: false,
    columns: 1,
    rows: 1,
    firstFrame: 0,
    frameCount: 1,
    randomLaunchSpin: false,
    alignLaunchSpin: false,
    particleLoops: false,
    systemLoops: false,
    randomStartTime: false,
    particlesDontFollow: false,
    spawnRate: constant(0),
    spawnMinActive: constant(-1),
    spawnMaxActive: constant(-1),
    spawnMaxLaunched: constant(-1),
    emitterOffsetX: constant(0),
    emitterOffsetY: constant(0),
    emitterRadius: constant(0),
    emitterBoxX: constant(0),
    emitterBoxY: constant(0),
    emitterSkewX: constant(0),
    emitterSkewY: constant(0),
    emitterPath: constant(0),
    particleDuration: constant(100),
    launchSpeed: constant(0),
    launchAngle: constant(0),
    systemRed: constant(1),
    systemGreen: constant(1),
    systemBlue: constant(1),
    systemAlpha: constant(1),
    systemBrightness: constant(1),
    particleRed: constant(1),
    particleGreen: constant(1),
    particleBlue: constant(1),
    particleAlpha: constant(1),
    particleBrightness: constant(1),
    particleSpinAngle: constant(0),
    particleSpinSpeed: constant(0),
    particleScale: constant(1),
    particleStretch: constant(1),
    collisionReflect: constant(0),
    collisionSpin: constant(0),
    fields: [],
    systemFields: [],
}


const CURVES = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'fast-in-out', 'bounce']
const FIELD_TYPES = ['friction', 'acceleration', 'attractor', 'max-velocity', 'velocity', 'position', 'system-position', 'ground-constraint', 'shake', 'circle', 'away', 'unknown']
const EMITTER_TYPES = ['circle', 'circlepath', 'circleevenspacing', 'box', 'boxpath']

/** One full particle format. Duration and velocity tracks use the original 100 Hz tick units. */
export function parseParticle(value: unknown): Particle {
    const source = object(value, ['schemaVersion', 'id', 'emitters'], 'particle')
    if (source.schemaVersion !== 3) throw new Error('particle.schemaVersion must be 3')
    if (!isQualifiedId(source.id)) throw new Error('particle.id must be a qualified ID')
    if (!Array.isArray(source.emitters) || source.emitters.length > 128) throw new Error('particle.emitters must be an array of at most 128 emitters')
    return { schemaVersion: 3, id: source.id, emitters: source.emitters.map(parseEmitter) }
}

function parseEmitter(value: unknown, index: number): ParticleEmitter {
    const name = `particle.emitters[${index}]`
    const source = object(value, ['sprite', ...Object.keys(DEFAULT_EMITTER), 'name', 'systemDuration'], name, ['sprite'])
    if (!isQualifiedId(source.sprite)) throw new Error(`${name}.sprite must be a qualified ID`)
    const emitter = { ...DEFAULT_EMITTER, sprite: source.sprite } as ParticleEmitter
    if (source.name !== undefined) {
        if (typeof source.name !== 'string') throw new Error(`${name}.name must be a string`)
        emitter.name = source.name
    }
    if (source.emitterType !== undefined) {
        if (!EMITTER_TYPES.includes(source.emitterType as string)) throw new Error(`${name}.emitterType is invalid`)
        emitter.emitterType = source.emitterType as string
    }
    for (const key of ['columns', 'rows', 'frameCount', 'firstFrame'] as const) {
        if (source[key] !== undefined) emitter[key] = integer(source[key], `${name}.${key}`, key === 'firstFrame' ? 0 : 1, 4096)
    }
    if (emitter.columns * emitter.rows > 4096 || emitter.firstFrame + emitter.frameCount > emitter.columns * emitter.rows) {
        throw new Error(`${name} frames exceed its sprite grid`)
    }
    for (const key of Object.keys(DEFAULT_EMITTER) as Array<keyof typeof DEFAULT_EMITTER>) {
        const fallback = DEFAULT_EMITTER[key]
        if (typeof fallback === 'boolean' && source[key] !== undefined) {
            if (typeof source[key] !== 'boolean') throw new Error(`${name}.${key} must be boolean`)
            ;(emitter as any)[key] = source[key]
        } else if (fallback && typeof fallback === 'object' && 'nodes' in fallback && source[key] !== undefined) {
            const limit = key.startsWith('spawn') && key !== 'spawnRate' ? 4096 : 1_000_000
            ;(emitter as any)[key] = parseTrack(source[key], `${name}.${key}`, limit)
        }
    }
    emitter.systemDuration = source.systemDuration === undefined ? emitter.particleDuration : parseTrack(source.systemDuration, `${name}.systemDuration`)
    emitter.fields = parseFields(source.fields ?? [], `${name}.fields`)
    emitter.systemFields = parseFields(source.systemFields ?? [], `${name}.systemFields`)
    return emitter
}

function parseFields(value: unknown, name: string): ParticleField[] {
    if (!Array.isArray(value) || value.length > 128) throw new Error(`${name} must be an array of at most 128 fields`)
    return value.map((value, index) => {
        const source = object(value, ['type', 'x', 'y'], `${name}[${index}]`)
        if (!FIELD_TYPES.includes(source.type as string)) throw new Error(`${name}[${index}].type is invalid`)
        return { type: source.type as ParticleFieldType, x: parseTrack(source.x, `${name}[${index}].x`), y: parseTrack(source.y, `${name}[${index}].y`) }
    })
}

function parseTrack(value: unknown, name: string, limit = 1_000_000): ParticleTrack {
    const source = object(value, ['nodes'], name)
    if (!Array.isArray(source.nodes) || source.nodes.length === 0 || source.nodes.length > 4096) throw new Error(`${name}.nodes must be non-empty and bounded`)
    return { nodes: source.nodes.map((value, index) => {
        const label = `${name}.nodes[${index}]`, node = object(value, ['time', 'low', 'high', 'curve', 'distribution'], label, ['time', 'low', 'high'])
        const time = number(node.time, `${label}.time`, 1_000_000), low = number(node.low, `${label}.low`, limit), high = number(node.high, `${label}.high`, limit)
        if (node.curve !== undefined && !CURVES.includes(node.curve as string)) throw new Error(`${label}.curve is invalid`)
        if (node.distribution !== undefined && !CURVES.includes(node.distribution as string)) throw new Error(`${label}.distribution is invalid`)
        return { time, low, high, ...(node.curve === undefined ? {} : { curve: node.curve as ParticleTrackCurve }),
            ...(node.distribution === undefined ? {} : { distribution: node.distribution as ParticleTrackCurve }) }
    }) }
}

function object(value: unknown, allowed: string[], name: string, required = allowed): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object`)
    const source = value as Record<string, unknown>
    for (const key of Object.keys(source)) if (!allowed.includes(key)) throw new Error(`${name}.${key} is not supported`)
    for (const key of required) if (!(key in source)) throw new Error(`${name}.${key} is required`)
    return source
}
function number(value: unknown, name: string, limit: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit) throw new Error(`${name} is out of range`)
    return value
}
function integer(value: unknown, name: string, min: number, max: number): number {
    const result = number(value, name, max)
    if (!Number.isSafeInteger(result) || result < min) throw new Error(`${name} must be an integer between ${min} and ${max}`)
    return result
}
