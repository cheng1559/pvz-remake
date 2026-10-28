import { Rect, Size, SpriteFrame, Vec2 } from 'cc'
import { ClientContentLoader, ParticleRepository, SpriteRepository } from '@/client/content/ClientContentLoader'
import { ContentRegistry } from '@/client/content/ContentRegistry'
import { loadClientContent } from '@/client/content/loadClientContent'
import { preloadTasks } from '@/client/content/preloadTasks'
import { applySpriteDensity } from '@/client/content/SpriteDensity'
import type { Particle, ParticleEmitter } from '@/shared/content/particle'
import { IMAGE, kernel } from '@/shared/kernel/index'
import { packParticleEmitters } from '@/shared/kernel/particles'

export interface ParticleEmitterAssets {
    definition: ParticleEmitter
    frame: SpriteFrame
    /** One kernel image slot per sprite cell. */
    geometry: Float64Array
}
export interface LoadedParticle {
    definition: Particle
    packed: Float64Array
    emitters: ParticleEmitterAssets[]
}

/** A frame's rectangle as a RAW, untrimmed, centered Sprite draws it, with its UVs. */
function centeredGeometry(frame: SpriteFrame, output: Float64Array, offset: number): void {
    const border = frame.trimmedBorder, size = frame.originalSize
    output[offset] = border.x - size.width / 2; output[offset + 1] = size.width / 2 + border.y
    output[offset + 2] = border.z - size.height / 2; output[offset + 3] = size.height / 2 + border.w
    output.set(frame.uv.slice(0, 8), offset + 4)
}
const cells = new WeakMap<SpriteFrame, Map<string, Float64Array>>()

let shared: Promise<ParticleAssets> | undefined
let ready: ParticleAssets | undefined

/** Particles of the game's content registry, built-in and Mod alike, shared by preloading and playback. */
export class ParticleAssets {
    private readonly particles: ParticleRepository
    private readonly sprites: SpriteRepository
    private readonly loaded = new Map<string, LoadedParticle>()
    private readonly pending = new Map<string, Promise<LoadedParticle>>()

    private constructor(private readonly registry: ContentRegistry, loader: ClientContentLoader) {
        this.particles = new ParticleRepository(registry, loader)
        this.sprites = new SpriteRepository(registry, loader)
    }

    private static instance(): Promise<ParticleAssets> {
        return shared ??= loadClientContent().then(({ registry, loader }) => ready = new ParticleAssets(registry, loader))
            .catch(error => { shared = undefined; throw error })
    }

    /** Already loaded assets, so a spawn can start synchronously. */
    static get(id: string, sprite?: string): LoadedParticle | undefined { return ready?.loaded.get(sprite ? `${id}|${sprite}` : id) }
    static async load(id: string, sprite?: string): Promise<LoadedParticle> { return (await this.instance()).load(id, sprite) }
    static async preloadAll(): Promise<void> {
        const assets = await this.instance()
        await preloadTasks([...assets.registry.entries('particles')].map(([id]) => () => assets.load(id)))
    }

    private load(id: string, sprite?: string): Promise<LoadedParticle> {
        const key = sprite ? `${id}|${sprite}` : id
        const cached = this.loaded.get(key)
        if (cached) return Promise.resolve(cached)
        const pending = this.pending.get(key)
        if (pending) return pending
        const task = this.loadUncached(id, sprite).then(result => {
            this.loaded.set(key, result)
            return result
        }).finally(() => this.pending.delete(key))
        this.pending.set(key, task)
        return task
    }

    private async loadUncached(id: string, sprite?: string): Promise<LoadedParticle> {
        const definition = await this.particles.load(id)
        const loaded = await Promise.all(definition.emitters.map(async emitter => {
            const image = sprite ?? emitter.sprite
            try {
                return this.emitterAssets(emitter, await this.sprites.load(image))
            } catch (error) {
                // As in the original game, an emitter without its image is left out; the rest still play.
                console.warn(`[Particle] ${id} skips an emitter without ${image}`, error)
                return undefined
            }
        }))
        const emitters = loaded.filter((emitter): emitter is ParticleEmitterAssets => !!emitter)
        // Converted source effects may be empty when their original images no longer exist.
        if (definition.emitters.length && !emitters.length) throw new Error(`particle has no loadable emitters: ${id}`)
        return { definition, emitters, packed: packParticleEmitters(emitters.map(emitter => emitter.definition)) }
    }

    private emitterAssets(definition: ParticleEmitter, frame: SpriteFrame): ParticleEmitterAssets {
        frame.packable = false
        const { columns, rows } = definition, key = `${columns}:${rows}`
        let grids = cells.get(frame)
        if (!grids) cells.set(frame, grids = new Map())
        let geometry = grids.get(key)
        if (!geometry) {
            geometry = kernel().f64(columns * rows * IMAGE)
            for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
                let cell = frame
                if (columns !== 1 || rows !== 1) {
                    const width = frame.originalSize.width / columns, height = frame.originalSize.height / rows
                    cell = new SpriteFrame()
                    cell.packable = false
                    cell.reset({ texture: frame.texture, rect: new Rect(column * width, row * height, width, height),
                        originalSize: new Size(width, height), offset: new Vec2(0, 0), isRotate: false })
                    applySpriteDensity(cell)
                    cell.packable = false
                }
                centeredGeometry(cell, geometry, (row * columns + column) * IMAGE)
                if (cell !== frame) cell.destroy()
            }
            grids.set(key, geometry)
        }
        return { definition, frame, geometry }
    }
}
