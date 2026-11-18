import { builtinResMgr, SpriteFrame, type Texture2D } from 'cc'
import { getAtlasFrame } from '@/client/render/atlasFrame'
import { modResources } from '@/client/content/ModResources'
import { preloadTasks } from '@/client/content/preloadTasks'
import { parseParticle, type Particle, type ParticleEmitter } from '@/shared/content/particle'
import { IMAGE, kernel } from '@/shared/kernel/index'
import { packParticleEmitters } from '@/shared/kernel/particles'

export interface ParticleEmitterAssets {
    definition: ParticleEmitter
    frame: SpriteFrame
    /** One kernel image slot per sprite cell. */
    geometry: Float64Array
    /** One cell's size, which a particle's clip cuts. */
    cel: { width: number, height: number }
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
let fillFrame: SpriteFrame | undefined

/** FillRect uses only the particle's vertex color and alpha. */
function solidFillFrame(): SpriteFrame {
    if (!fillFrame) {
        fillFrame = new SpriteFrame()
        fillFrame.texture = builtinResMgr.get<Texture2D>('white-texture')
    }
    return fillFrame
}

const loaded = new Map<string, LoadedParticle>()
const pending = new Map<string, Promise<LoadedParticle>>()

/** Particles by their resource IDs, built-in and Mod alike, loaded once for preloading and playback. */
export class ParticleAssets {
    /** Already loaded assets, so a spawn can start synchronously. */
    static get(id: string, sprite?: string): LoadedParticle | undefined { return loaded.get(sprite ? `${id}|${sprite}` : id) }

    /** A particle, with its emitters' images (or `sprite` for all of them, a seed packet's flash). */
    static load(id: string, sprite?: string): Promise<LoadedParticle> {
        const key = sprite ? `${id}|${sprite}` : id
        const cached = loaded.get(key)
        if (cached) return Promise.resolve(cached)
        const waiting = pending.get(key)
        if (waiting) return waiting
        const task = this.loadUncached(id, sprite).then(result => {
            loaded.set(key, result)
            return result
        }).finally(() => pending.delete(key))
        pending.set(key, task)
        return task
    }

    static async preloadAll(): Promise<void> {
        await preloadTasks((await modResources.ids('particles')).map(id => () => this.load(id)))
    }

    private static async loadUncached(id: string, sprite?: string): Promise<LoadedParticle> {
        const json = await modResources.json('particles', id)
        if (json === undefined) throw new Error(`unknown particle: ${id}`)
        const definition = parseParticle(json)
        if (definition.id !== id) throw new Error(`particle ID mismatch: expected ${id}, got ${definition.id}`)
        const emitters = (await Promise.all(definition.emitters.map(async emitter => {
            if (emitter.fullScreen) return this.emitterAssets(emitter, solidFillFrame())
            const image = sprite ?? emitter.sprite
            try {
                return this.emitterAssets(emitter, await modResources.sprite(image))
            } catch (error) {
                // As in the original game, an emitter without its image is left out; the rest still play.
                console.warn(`[Particle] ${id} skips an emitter without ${image}`, error)
                return undefined
            }
        }))).filter((emitter): emitter is ParticleEmitterAssets => !!emitter)
        // Converted source effects may be empty when their original images no longer exist.
        if (definition.emitters.length && !emitters.length) throw new Error(`particle has no loadable emitters: ${id}`)
        return { definition, emitters, packed: packParticleEmitters(emitters.map(emitter => emitter.definition)) }
    }

    private static emitterAssets(definition: ParticleEmitter, frame: SpriteFrame): ParticleEmitterAssets {
        frame.packable = false
        const { columns, rows } = definition, key = `${columns}:${rows}`
        let grids = cells.get(frame)
        if (!grids) cells.set(frame, grids = new Map())
        let geometry = grids.get(key)
        const width = frame.originalSize.width / columns, height = frame.originalSize.height / rows
        if (!geometry) {
            geometry = kernel().f64(columns * rows * IMAGE)
            for (let index = 0; index < columns * rows; index++) {
                const cell = definition.fullScreen || columns === 1 && rows === 1 ? frame : getAtlasFrame(frame, index, width, height, columns)
                centeredGeometry(cell, geometry, index * IMAGE)
            }
            grids.set(key, geometry)
        }
        return { definition, frame, geometry, cel: { width, height } }
    }
}
