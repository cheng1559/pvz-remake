export type TodParticleEffect = string

export interface TodTrackNode {
    time: number
    low: number
    high: number
    curve?: TodTrackCurve
}

export interface TodFloatTrack {
    nodes: TodTrackNode[]
}

export type TodTrackCurve = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'

export type TodParticleFieldType =
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

export interface TodParticleFieldDefinition {
    type: TodParticleFieldType
    x: TodFloatTrack
    y: TodFloatTrack
}

export interface TodEmitterDefinition {
    image: string
    name?: string
    emitterType: string
    additive: boolean
    imageCol: number
    imageRow: number
    imageColumns: number
    imageRows: number
    imageFrames: number
    randomLaunchSpin: boolean
    alignLaunchSpin: boolean
    particleLoops: boolean
    systemLoops: boolean
    randomStartTime: boolean
    particlesDontFollow: boolean
    systemDuration?: TodFloatTrack
    spawnRate: TodFloatTrack
    spawnMinActive: TodFloatTrack
    spawnMaxActive: TodFloatTrack
    spawnMaxLaunched: TodFloatTrack
    emitterOffsetX: TodFloatTrack
    emitterOffsetY: TodFloatTrack
    emitterRadius: TodFloatTrack
    emitterBoxX: TodFloatTrack
    emitterBoxY: TodFloatTrack
    emitterSkewX: TodFloatTrack
    emitterSkewY: TodFloatTrack
    emitterPath: TodFloatTrack
    particleDuration: TodFloatTrack
    launchSpeed: TodFloatTrack
    launchAngle: TodFloatTrack
    systemRed: TodFloatTrack
    systemGreen: TodFloatTrack
    systemBlue: TodFloatTrack
    systemAlpha: TodFloatTrack
    systemBrightness: TodFloatTrack
    particleRed: TodFloatTrack
    particleGreen: TodFloatTrack
    particleBlue: TodFloatTrack
    particleAlpha: TodFloatTrack
    particleBrightness: TodFloatTrack
    particleSpinAngle: TodFloatTrack
    particleSpinSpeed: TodFloatTrack
    particleScale: TodFloatTrack
    particleStretch: TodFloatTrack
    collisionReflect: TodFloatTrack
    collisionSpin: TodFloatTrack
    fields: TodParticleFieldDefinition[]
    systemFields: TodParticleFieldDefinition[]
}

export interface TodParticleDefinition {
    source?: string
    emitters: TodEmitterDefinition[]
}

const constant = (value: number): TodFloatTrack => ({
    nodes: [{ time: 0, low: value, high: value }],
})

const DEFAULT_EMITTER: Omit<TodEmitterDefinition, 'image'> = {
    emitterType: 'circle',
    additive: false,
    imageCol: 0,
    imageRow: 0,
    imageColumns: 1,
    imageRows: 1,
    imageFrames: 1,
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

function normalizeTrack(track: unknown, fallback: TodFloatTrack): TodFloatTrack {
    if (!track || typeof track !== 'object') return fallback
    const nodes = (track as TodFloatTrack).nodes
    if (!Array.isArray(nodes) || nodes.length === 0) return fallback
    return {
        nodes: nodes.map((node) => ({
            time: Number(node.time) || 0,
            low: Number(node.low) || 0,
            high: Number(node.high ?? node.low) || 0,
            curve: node.curve,
        })),
    }
}

export function normalizeTodParticleDefinition(raw: unknown): TodParticleDefinition | null {
    if (!raw || typeof raw !== 'object') return null
    const emitters = (raw as TodParticleDefinition).emitters
    if (!Array.isArray(emitters)) return null

    return {
        source: typeof (raw as TodParticleDefinition).source === 'string'
            ? (raw as TodParticleDefinition).source
            : undefined,
        emitters: emitters.map((emitter) => normalizeEmitter(emitter)),
    }
}

function normalizeEmitter(input: unknown): TodEmitterDefinition {
    const raw = input && typeof input === 'object'
        ? input as Partial<TodEmitterDefinition>
        : {}
    const merged = {
        ...DEFAULT_EMITTER,
        ...raw,
        image: typeof raw.image === 'string' && raw.image.length > 0 ? raw.image : 'whitepixel',
    }
    if (raw.imageFrames != null && raw.imageColumns == null) {
        merged.imageColumns = Math.max(1, Number(raw.imageFrames) || 1)
    }
    merged.particlesDontFollow = raw.particlesDontFollow === true

    for (const key of Object.keys(DEFAULT_EMITTER) as Array<keyof typeof DEFAULT_EMITTER>) {
        const value = DEFAULT_EMITTER[key]
        if (value && typeof value === 'object' && 'nodes' in value) {
            ;(merged as any)[key] = normalizeTrack((raw as any)[key], value)
        }
    }
    merged.systemDuration = raw.systemDuration
        ? normalizeTrack(raw.systemDuration, merged.particleDuration)
        : undefined
    merged.fields = Array.isArray(raw.fields)
        ? raw.fields.map((field) => normalizeField(field))
        : []
    merged.systemFields = Array.isArray(raw.systemFields)
        ? raw.systemFields.map((field) => normalizeField(field))
        : []

    return merged
}

function normalizeField(raw: Partial<TodParticleFieldDefinition>): TodParticleFieldDefinition {
    return {
        type: raw.type ?? 'unknown',
        x: normalizeTrack(raw.x, constant(0)),
        y: normalizeTrack(raw.y, constant(0)),
    }
}

export function evaluateTodTrack(track: TodFloatTrack, time: number, interpolation: number) {
    const nodes = track.nodes
    if (nodes.length === 0) return 0

    const valueAt = (node: TodTrackNode) => node.low + (node.high - node.low) * interpolation
    const curveFraction = (fraction: number, curve: TodTrackCurve | undefined) => {
        switch (curve) {
            case 'ease-in':
                return fraction * fraction
            case 'ease-out':
                return 1 - (1 - fraction) * (1 - fraction)
            case 'ease-in-out':
                return fraction * fraction * (3 - 2 * fraction)
            case 'linear':
            default:
                return fraction
        }
    }
    if (time <= nodes[0].time) return valueAt(nodes[0])

    for (let i = 1; i < nodes.length; i++) {
        const right = nodes[i]
        if (time > right.time) continue

        const left = nodes[i - 1]
        const span = right.time - left.time
        const fraction = span <= 0 ? 1 : (time - left.time) / span
        const curvedFraction = curveFraction(fraction, left.curve)
        return valueAt(left) + (valueAt(right) - valueAt(left)) * curvedFraction
    }

    return valueAt(nodes[nodes.length - 1])
}
