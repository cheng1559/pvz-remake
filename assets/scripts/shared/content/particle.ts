import { isQualifiedId } from '@/shared/mod/index'

export const PARTICLE_STEP_SECONDS = 0.01
const MAX_DURATION_SECONDS = 10
const MAX_EMITTERS = 32
const MAX_PARTICLES = 4096
const MAX_ATLAS_FRAMES = 4096
const MAX_ABSOLUTE_VALUE = 1_000_000

export interface ParticleTrackNodeV2 {
    timeRatio: number
    low: number
    high: number
}

export interface ParticleTrackV2 {
    nodes: ParticleTrackNodeV2[]
}

export interface ParticleFieldV2 {
    type: 'friction' | 'acceleration'
    x: ParticleTrackV2
    y: ParticleTrackV2
}

export interface ParticleEmitterV2 {
    sprite: string
    columns: number
    rows: number
    firstFrame: number
    frameCount: number
    durationSeconds: number
    emitterOffsetX: ParticleTrackV2
    emitterOffsetY: ParticleTrackV2
    spawnMinActive: ParticleTrackV2
    spawnMaxLaunched: ParticleTrackV2
    emitterRadius: ParticleTrackV2
    particleDurationSeconds: ParticleTrackV2
    launchSpeed: ParticleTrackV2
    particleAlpha: ParticleTrackV2
    particleScale: ParticleTrackV2
    particleSpinSpeed: ParticleTrackV2
    randomLaunchSpin: boolean
    fields: ParticleFieldV2[]
}

export interface ParticleV2 {
    schemaVersion: 2
    id: string
    durationSeconds: number
    emitters: ParticleEmitterV2[]
}

export interface ParticlePose {
    emitterIndex: number
    sprite: string
    frame: number
    x: number
    y: number
    scale: number
    angleDegrees: number
    alpha: number
}

export interface ParticlePlaybackSnapshot {
    id: string
    seed: number
    ageTicks: number
    playing: boolean
    visible: boolean
}

interface ParticleState {
    ageTicks: number
    durationTicks: number
    x: number
    y: number
    velocityX: number
    velocityY: number
    angleDegrees: number
    spinSpeed: number
    alphaInterpolation: number
    scaleInterpolation: number
    fieldInterpolations: Array<{ x: number; y: number }>
    frame: number
}

interface EmitterState {
    particles: ParticleState[]
    spawned: number
    minimumInterpolation: number
}

export class ParticleRng {
    state: number

    constructor(seed: number) {
        this.state = uint32(seed, 'particle seed')
    }

    next(): number {
        let value = this.state += 0x6D2B79F5
        value = Math.imul(value ^ value >>> 15, value | 1)
        value ^= value + Math.imul(value ^ value >>> 7, value | 61)
        this.state >>>= 0
        return ((value ^ value >>> 14) >>> 0) / 0x100000000
    }
}

export class ParticleSimulation {
    readonly definition: ParticleV2
    readonly seed: number
    readonly rng: ParticleRng
    playing = true
    visible = true
    ageTicks = 0
    private emitters: EmitterState[]

    constructor(definition: ParticleV2, seed: number) {
        this.definition = definition
        this.seed = uint32(seed, 'particle seed')
        this.rng = new ParticleRng(this.seed)
        this.emitters = this.createEmitters()
    }

    advance(ticks = 1): void {
        if (!Number.isSafeInteger(ticks) || ticks < 0) throw new Error('particle ticks must be a non-negative safe integer')
        if (!this.playing) return
        for (let i = 0; i < ticks; i++) this.step()
    }

    pose(): ParticlePose[] {
        if (!this.visible) return []
        return this.emitters.flatMap((emitter, emitterIndex) => {
            const definition = this.definition.emitters[emitterIndex]
            const emitterRatio = lifetimeRatio(this.ageTicks, secondsToTicks(definition.durationSeconds))
            return emitter.particles.map(particle => {
                const ratio = lifetimeRatio(particle.ageTicks, particle.durationTicks)
                return {
                    emitterIndex,
                    sprite: definition.sprite,
                    frame: particle.frame,
                    x: particle.x + sampleTrack(definition.emitterOffsetX, emitterRatio, 0),
                    y: particle.y + sampleTrack(definition.emitterOffsetY, emitterRatio, 0),
                    scale: sampleTrack(definition.particleScale, ratio, particle.scaleInterpolation),
                    angleDegrees: particle.angleDegrees,
                    alpha: sampleTrack(definition.particleAlpha, ratio, particle.alphaInterpolation),
                }
            })
        })
    }

    snapshot(): ParticlePlaybackSnapshot {
        return {
            id: this.definition.id,
            seed: this.seed,
            ageTicks: this.ageTicks,
            playing: this.playing,
            visible: this.visible,
        }
    }

    restore(snapshot: ParticlePlaybackSnapshot): void {
        if (snapshot.id !== this.definition.id) throw new Error(`particle ID mismatch: expected ${this.definition.id}, got ${snapshot.id}`)
        if (uint32(snapshot.seed, 'particle snapshot.seed') !== this.seed) throw new Error('particle snapshot seed mismatch')
        if (!Number.isSafeInteger(snapshot.ageTicks) || snapshot.ageTicks < 0) {
            throw new Error('particle snapshot.ageTicks must be a non-negative safe integer')
        }
        if (snapshot.ageTicks > secondsToTicks(this.definition.durationSeconds)) {
            throw new Error('particle snapshot.ageTicks exceeds effect duration')
        }
        if (typeof snapshot.playing !== 'boolean' || typeof snapshot.visible !== 'boolean') {
            throw new Error('particle snapshot flags must be boolean')
        }

        this.rng.state = this.seed
        this.ageTicks = 0
        this.emitters = this.createEmitters()
        for (let i = 0; i < snapshot.ageTicks; i++) this.step()
        this.playing = snapshot.playing
        this.visible = snapshot.visible
    }

    private createEmitters(): EmitterState[] {
        return this.definition.emitters.map(() => ({
            particles: [],
            spawned: 0,
            minimumInterpolation: this.rng.next(),
        }))
    }

    private step(): void {
        for (let emitterIndex = 0; emitterIndex < this.emitters.length; emitterIndex++) {
            this.stepEmitter(this.emitters[emitterIndex], this.definition.emitters[emitterIndex])
        }
        this.ageTicks++
        if (this.ageTicks >= secondsToTicks(this.definition.durationSeconds)) {
            this.playing = false
            this.visible = false
        }
    }

    private stepEmitter(state: EmitterState, definition: ParticleEmitterV2): void {
        const emitterTicks = secondsToTicks(definition.durationSeconds)
        if (this.ageTicks >= emitterTicks) {
            state.particles = []
            return
        }

        const emitterRatio = lifetimeRatio(this.ageTicks, emitterTicks)
        state.particles = state.particles.filter(particle => this.updateParticle(particle, definition))

        const minimum = Math.floor(sampleTrack(
            definition.spawnMinActive,
            emitterRatio,
            state.minimumInterpolation,
        ))
        const maximum = Math.floor(sampleTrack(definition.spawnMaxLaunched, emitterRatio, 0))
        let count = Math.max(0, minimum - state.particles.length)
        if (maximum >= 0) count = Math.min(count, maximum - state.spawned)
        for (let i = 0; i < Math.max(0, count); i++) {
            const particle = this.spawn(definition, emitterRatio)
            this.updateParticle(particle, definition)
            state.particles.push(particle)
            state.spawned++
        }
    }

    private updateParticle(particle: ParticleState, definition: ParticleEmitterV2): boolean {
        if (particle.ageTicks >= particle.durationTicks) return false
        const ratio = lifetimeRatio(particle.ageTicks, particle.durationTicks)
        for (let index = 0; index < definition.fields.length; index++) {
            const field = definition.fields[index]
            const interpolation = particle.fieldInterpolations[index]
            const x = sampleTrack(field.x, ratio, interpolation.x)
            const y = sampleTrack(field.y, ratio, interpolation.y)
            if (field.type === 'friction') {
                particle.velocityX *= 1 - x
                particle.velocityY *= 1 - y
            } else {
                particle.velocityX += x * PARTICLE_STEP_SECONDS
                particle.velocityY += y * PARTICLE_STEP_SECONDS
            }
        }
        particle.x += particle.velocityX * PARTICLE_STEP_SECONDS
        particle.y += particle.velocityY * PARTICLE_STEP_SECONDS
        particle.angleDegrees += particle.spinSpeed * PARTICLE_STEP_SECONDS
        particle.ageTicks++
        return true
    }

    private spawn(definition: ParticleEmitterV2, emitterRatio: number): ParticleState {
        const angle = this.rng.next() * Math.PI * 2
        const radius = sampleTrack(definition.emitterRadius, emitterRatio, this.rng.next())
        const speed = sampleTrack(definition.launchSpeed, emitterRatio, this.rng.next())
        return {
            ageTicks: 0,
            durationTicks: secondsToTicks(sampleTrack(definition.particleDurationSeconds, emitterRatio, this.rng.next())),
            x: Math.sin(angle) * radius,
            y: Math.cos(angle) * radius,
            velocityX: Math.sin(angle) * speed,
            velocityY: Math.cos(angle) * speed,
            angleDegrees: definition.randomLaunchSpin ? this.rng.next() * 360 : 0,
            spinSpeed: sampleTrack(definition.particleSpinSpeed, 0, this.rng.next()),
            alphaInterpolation: this.rng.next(),
            scaleInterpolation: this.rng.next(),
            fieldInterpolations: definition.fields.map(() => ({ x: this.rng.next(), y: this.rng.next() })),
            frame: definition.firstFrame + Math.floor(this.rng.next() * definition.frameCount),
        }
    }
}

export function sampleParticleTrack(track: ParticleTrackV2, timeRatio: number, interpolation: number): number {
    return sampleTrack(track, timeRatio, interpolation)
}

export function parseParticleV2(value: unknown): ParticleV2 {
    const source = exactObject(value, ['schemaVersion', 'id', 'durationSeconds', 'emitters'], 'particle')
    if (source.schemaVersion !== 2) throw new Error('particle.schemaVersion must be 2')
    if (!isQualifiedId(source.id)) throw new Error('particle.id must be a qualified ID')
    const durationSeconds = positiveNumber(source.durationSeconds, 'particle.durationSeconds')
    if (durationSeconds > MAX_DURATION_SECONDS) throw new Error('particle.durationSeconds is too large')
    if (!Array.isArray(source.emitters) || source.emitters.length === 0) {
        throw new Error('particle.emitters must be a non-empty array')
    }
    if (source.emitters.length > MAX_EMITTERS) throw new Error('particle has too many emitters')

    const emitters = source.emitters.map((value, index) => parseEmitter(value, index))
    if (emitters.some(emitter => emitter.durationSeconds > durationSeconds)) {
        throw new Error('particle emitter duration exceeds particle.durationSeconds')
    }
    const maximumActive = emitters.reduce((total, emitter) => total + Math.max(
        0,
        ...emitter.spawnMinActive.nodes.flatMap(node => [node.low, node.high]),
    ), 0)
    if (maximumActive > MAX_PARTICLES) throw new Error('particle can spawn too many active particles')
    return { schemaVersion: 2, id: source.id, durationSeconds, emitters } as ParticleV2
}

function parseEmitter(value: unknown, index: number): ParticleEmitterV2 {
    const name = `particle.emitters[${index}]`
    const source = exactObject(value, [
        'sprite', 'columns', 'rows', 'firstFrame', 'frameCount', 'durationSeconds',
        'emitterOffsetX', 'emitterOffsetY',
        'spawnMinActive', 'spawnMaxLaunched', 'emitterRadius', 'particleDurationSeconds',
        'launchSpeed', 'particleAlpha', 'particleScale', 'particleSpinSpeed',
        'randomLaunchSpin', 'fields',
    ], name)
    if (!isQualifiedId(source.sprite)) throw new Error(`${name}.sprite must be a qualified ID`)
    const columns = positiveInteger(source.columns, `${name}.columns`)
    const rows = positiveInteger(source.rows, `${name}.rows`)
    const firstFrame = nonNegativeInteger(source.firstFrame, `${name}.firstFrame`)
    const frameCount = positiveInteger(source.frameCount, `${name}.frameCount`)
    if (columns * rows > MAX_ATLAS_FRAMES) throw new Error(`${name} sprite grid is too large`)
    if (firstFrame + frameCount > columns * rows) throw new Error(`${name} frames exceed its sprite grid`)
    if (typeof source.randomLaunchSpin !== 'boolean') throw new Error(`${name}.randomLaunchSpin must be boolean`)
    if (!Array.isArray(source.fields)) throw new Error(`${name}.fields must be an array`)

    return {
        sprite: source.sprite,
        columns,
        rows,
        firstFrame,
        frameCount,
        durationSeconds: boundedPositiveNumber(source.durationSeconds, `${name}.durationSeconds`, MAX_DURATION_SECONDS),
        emitterOffsetX: parseTrack(source.emitterOffsetX, `${name}.emitterOffsetX`, -MAX_ABSOLUTE_VALUE, MAX_ABSOLUTE_VALUE),
        emitterOffsetY: parseTrack(source.emitterOffsetY, `${name}.emitterOffsetY`, -MAX_ABSOLUTE_VALUE, MAX_ABSOLUTE_VALUE),
        spawnMinActive: parseTrack(source.spawnMinActive, `${name}.spawnMinActive`, -1, MAX_PARTICLES),
        spawnMaxLaunched: parseTrack(source.spawnMaxLaunched, `${name}.spawnMaxLaunched`, -1, MAX_PARTICLES),
        emitterRadius: parseTrack(source.emitterRadius, `${name}.emitterRadius`, -MAX_ABSOLUTE_VALUE, MAX_ABSOLUTE_VALUE),
        particleDurationSeconds: parseTrack(
            source.particleDurationSeconds,
            `${name}.particleDurationSeconds`,
            PARTICLE_STEP_SECONDS,
            MAX_DURATION_SECONDS,
        ),
        launchSpeed: parseTrack(source.launchSpeed, `${name}.launchSpeed`, -MAX_ABSOLUTE_VALUE, MAX_ABSOLUTE_VALUE),
        particleAlpha: parseTrack(source.particleAlpha, `${name}.particleAlpha`, 0, 1),
        particleScale: parseTrack(source.particleScale, `${name}.particleScale`, 0, 100),
        particleSpinSpeed: parseTrack(
            source.particleSpinSpeed,
            `${name}.particleSpinSpeed`,
            -MAX_ABSOLUTE_VALUE,
            MAX_ABSOLUTE_VALUE,
        ),
        randomLaunchSpin: source.randomLaunchSpin,
        fields: source.fields.map((field, fieldIndex) => parseField(field, `${name}.fields[${fieldIndex}]`)),
    }
}

function parseField(value: unknown, name: string): ParticleFieldV2 {
    const source = exactObject(value, ['type', 'x', 'y'], name)
    if (source.type !== 'friction' && source.type !== 'acceleration') {
        throw new Error(`${name}.type must be friction or acceleration`)
    }
    const limit = source.type === 'friction' ? 1 : MAX_ABSOLUTE_VALUE
    const minimum = source.type === 'friction' ? 0 : -limit
    return {
        type: source.type,
        x: parseTrack(source.x, `${name}.x`, minimum, limit),
        y: parseTrack(source.y, `${name}.y`, minimum, limit),
    }
}

function parseTrack(value: unknown, name: string, minimum = -Infinity, maximum = Infinity): ParticleTrackV2 {
    const source = exactObject(value, ['nodes'], name)
    if (!Array.isArray(source.nodes) || source.nodes.length === 0) throw new Error(`${name}.nodes must be non-empty`)
    let previousTime = -1
    const nodes = source.nodes.map((value, index) => {
        const nodeName = `${name}.nodes[${index}]`
        const node = exactObject(value, ['timeRatio', 'low', 'high'], nodeName)
        const timeRatio = finiteNumber(node.timeRatio, `${nodeName}.timeRatio`)
        const low = finiteNumber(node.low, `${nodeName}.low`)
        const high = finiteNumber(node.high, `${nodeName}.high`)
        if (timeRatio < 0 || timeRatio > 1 || timeRatio <= previousTime) {
            throw new Error(`${nodeName}.timeRatio must increase between 0 and 1`)
        }
        if (low < minimum || low > maximum || high < minimum || high > maximum) {
            throw new Error(`${nodeName} values are out of range`)
        }
        previousTime = timeRatio
        return { timeRatio, low, high }
    })
    return { nodes }
}

function sampleTrack(track: ParticleTrackV2, timeRatio: number, interpolation: number): number {
    const nodes = track.nodes
    const at = (node: ParticleTrackNodeV2) => node.low + (node.high - node.low) * interpolation
    if (timeRatio <= nodes[0].timeRatio) return at(nodes[0])
    for (let index = 1; index < nodes.length; index++) {
        const right = nodes[index]
        if (timeRatio > right.timeRatio) continue
        const left = nodes[index - 1]
        const ratio = (timeRatio - left.timeRatio) / (right.timeRatio - left.timeRatio)
        return at(left) + (at(right) - at(left)) * ratio
    }
    return at(nodes[nodes.length - 1])
}

function lifetimeRatio(ageTicks: number, durationTicks: number): number {
    return durationTicks <= 1 ? 1 : ageTicks / (durationTicks - 1)
}

function secondsToTicks(seconds: number): number {
    return Math.max(1, Math.round(seconds / PARTICLE_STEP_SECONDS))
}

function exactObject(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`)
    const record = value as Record<string, unknown>
    const expected = new Set(keys)
    for (const key of Object.keys(record)) if (!expected.has(key)) throw new Error(`${name}.${key} is not supported`)
    for (const key of keys) if (!Object.prototype.hasOwnProperty.call(record, key)) throw new Error(`${name}.${key} is required`)
    return record
}

function finiteNumber(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be a finite number`)
    return value
}

function positiveNumber(value: unknown, name: string): number {
    const number = finiteNumber(value, name)
    if (number <= 0) throw new Error(`${name} must be positive`)
    return number
}

function boundedPositiveNumber(value: unknown, name: string, maximum: number): number {
    const number = positiveNumber(value, name)
    if (number > maximum) throw new Error(`${name} is too large`)
    return number
}

function nonNegativeInteger(value: unknown, name: string): number {
    if (!Number.isSafeInteger(value) || (value as number) < 0) throw new Error(`${name} must be a non-negative safe integer`)
    return value as number
}

function positiveInteger(value: unknown, name: string): number {
    const number = nonNegativeInteger(value, name)
    if (number === 0) throw new Error(`${name} must be positive`)
    return number
}

function uint32(value: number, name: string): number {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xFFFFFFFF) throw new Error(`${name} must be a uint32`)
    return value >>> 0
}
