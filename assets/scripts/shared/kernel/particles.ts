import type { ParticleEmitter } from '@/shared/content/particle'
import { kernel, type Kernel } from './index'

// Serialized tracks and flags shared with pvz_particles.cpp. Loading adapters only pack data;
// random numbers, lifetime, fields, motion and colors are evaluated solely by the C++ core.
export const PARTICLE_TRACKS = [
    'systemDuration', 'spawnRate', 'spawnMinActive', 'spawnMaxActive', 'spawnMaxLaunched',
    'emitterOffsetX', 'emitterOffsetY', 'emitterRadius', 'emitterBoxX', 'emitterBoxY',
    'emitterSkewX', 'emitterSkewY', 'emitterPath', 'particleDuration', 'launchSpeed', 'launchAngle',
    'systemRed', 'systemGreen', 'systemBlue', 'systemAlpha', 'systemBrightness',
    'particleRed', 'particleGreen', 'particleBlue', 'particleAlpha', 'particleBrightness',
    'particleSpinAngle', 'particleSpinSpeed', 'particleScale', 'particleStretch', 'collisionReflect', 'collisionSpin',
] as const
const FLAGS = ['randomLaunchSpin', 'alignLaunchSpin', 'particleLoops', 'systemLoops', 'randomStartTime', 'particlesDontFollow'] as const
const TYPES = ['circle', 'circlepath', 'circleevenspacing', 'box', 'boxpath']
const FIELDS = ['friction', 'acceleration', 'attractor', 'max-velocity', 'velocity', 'position', 'system-position', 'ground-constraint', 'shake', 'circle', 'away', 'unknown']
const CURVES = ['linear', 'ease-in', 'ease-out', 'ease-in-out', 'fast-in-out', 'bounce']

export function packParticleEmitters(emitters: readonly ParticleEmitter[]): Float64Array {
    const data: number[] = [emitters.length]
    const track = (value: ParticleEmitter['particleDuration']) => {
        const nodes = value.nodes
        data.push(nodes.length)
        for (const node of nodes) data.push(node.time, node.low, node.high, Math.max(0, CURVES.indexOf(node.curve ?? 'linear')) + 16 * Math.max(0, CURVES.indexOf(node.distribution ?? 'linear')))
    }
    const fields = (values: ParticleEmitter['fields']) => {
        data.push(values.length)
        for (const field of values) {
            data.push(FIELDS.includes(field.type) ? FIELDS.indexOf(field.type) : FIELDS.indexOf('unknown'))
            track(field.x); track(field.y)
        }
    }
    for (const emitter of emitters) {
        data.push(Math.max(0, TYPES.indexOf(emitter.emitterType ?? 'circle')),
            FLAGS.reduce((flags, key, index) => flags | (emitter[key] ? 1 << index : 0), 0),
            emitter.frameCount, emitter.columns, emitter.rows, emitter.firstFrame % emitter.columns, Math.floor(emitter.firstFrame / emitter.columns))
        for (const name of PARTICLE_TRACKS) track(emitter[name] ?? emitter.particleDuration)
        fields(emitter.fields); fields(emitter.systemFields)
    }
    return Float64Array.from(data)
}

/** Owns the native/Wasm system and its communication arrays. Call dispose when its player is destroyed. */
export class KernelParticles {
    private readonly api: Kernel
    private handle: number
    readonly counts: Float64Array
    private readonly status: Float64Array
    readonly motion: Float64Array

    constructor(definition: Float64Array, seed: number, emitters: number) {
        if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('particle seed must be a uint32')
        this.api = kernel()
        this.handle = this.api.particlesCreate(definition, seed)
        if (!this.handle) throw new Error('particle kernel rejected its definition')
        this.status = this.api.f64(emitters + 1)
        this.counts = this.status.subarray(0, emitters)
        this.motion = this.api.f64(emitters * 2)
        this.motion.fill(0)
        this.info()
    }

    step(ticks = 1): number {
        if (!Number.isSafeInteger(ticks) || ticks < 0 || ticks > 0x7fffffff) throw new Error('particle ticks must be a non-negative int32')
        if (!this.handle) throw new Error('particle kernel step failed: system was disposed')
        const stepped = this.api.particlesStep(this.handle, ticks, this.motion)
        if (stepped < 0) throw new Error('particle kernel step failed')
        this.motion.fill(0)
        this.info()
        return stepped
    }

    private info(): void {
        if (this.api.particlesInfo(this.handle, this.status) < 0) throw new Error('particle kernel system was disposed')
    }

    get dead(): boolean { return this.counts.every(count => count < 0) }

    /**
     * Nothing will be drawn again: every live emitter has launched its fixed number of particles and none remain.
     * The system would still count down its original lifetime, but a player can stop here.
     */
    get finished(): boolean { return this.dead || this.status[this.counts.length] > 0 }

    /** Writes an emitter's particles straight to vertices; options follow ParticleOption. Returns the quads written. */
    write(emitter: number, geometry: Float64Array, options: Float64Array, positions: Float32Array, vertices: Float32Array): number {
        return this.api.particlesWrite(this.handle, emitter, geometry, options, positions, vertices)
    }

    dispose(): void {
        if (!this.handle) return
        this.api.particlesDestroy(this.handle)
        this.handle = 0
        this.api.release(this.status); this.api.release(this.motion)
    }
}
