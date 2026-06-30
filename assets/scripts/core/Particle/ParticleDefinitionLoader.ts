import { JsonAsset } from 'cc'
import { AssetLoader } from '../AssetLoader'
import { SpriteLoader } from '../SpriteLoader'
import {
    normalizeTodParticleDefinition,
    type TodParticleDefinition,
    type TodEmitterDefinition,
    type TodParticleEffect,
} from './ParticleDefinitions'

const PARTICLE_ROOT = 'particles'
const PLACEHOLDER_IMAGE = 'whitepixel'

export class ParticleDefinitionLoader {
    private static _definitions: Map<string, TodParticleDefinition | null> = new Map()
    private static _preloadPromise: Promise<void> | null = null

    static async preloadAll(): Promise<void> {
        if (this._preloadPromise) return this._preloadPromise
        this._preloadPromise = this._preloadAll()
        return this._preloadPromise
    }

    static get(effect: TodParticleEffect): TodParticleDefinition | null {
        return this._definitions.get(effect) ?? null
    }

    static async load(effect: TodParticleEffect): Promise<TodParticleDefinition | null> {
        if (this._definitions.has(effect)) return this._definitions.get(effect)!

        const asset = await AssetLoader.load<JsonAsset>(
            `${PARTICLE_ROOT}/${effect}`,
            JsonAsset,
            `particle definition: ${effect}`,
        )
        const definition = await this._loadDefinitionImages(
            effect,
            this._dropPlaceholderEmitters(normalizeTodParticleDefinition(asset?.json)),
        )
        this._definitions.set(effect, definition)
        return definition
    }

    private static async _preloadAll() {
        const assets = await AssetLoader.loadDir<JsonAsset>(
            PARTICLE_ROOT,
            JsonAsset,
            'particle definitions',
        )
        for (const asset of assets) {
            const definition = await this._loadDefinitionImages(
                asset.name,
                this._dropPlaceholderEmitters(normalizeTodParticleDefinition(asset.json)),
            )
            this._definitions.set(asset.name, definition)
        }
    }

    private static async _loadDefinitionImages(
        effect: string,
        definition: TodParticleDefinition | null,
    ): Promise<TodParticleDefinition | null> {
        if (!definition) return null
        const loadedImages = await this._loadImages(definition.emitters.map((emitter) => emitter.image))
        return this._filterLoadedEmitters(effect, definition, loadedImages)
    }

    private static async _loadImages(imageNames: Iterable<string>) {
        const uniqueNames = [...new Set(imageNames)]
        const loadedEntries = await Promise.all(uniqueNames.map(async (name) => ({
            name,
            loaded: await SpriteLoader.load(name) != null,
        })))
        return new Set(loadedEntries
            .filter((entry) => entry.loaded)
            .map((entry) => entry.name))
    }

    private static _dropPlaceholderEmitters(
        definition: TodParticleDefinition | null,
    ): TodParticleDefinition | null {
        if (!definition) return null
        const emitters = definition.emitters.filter((emitter) => emitter.image !== PLACEHOLDER_IMAGE)
        return emitters.length > 0
            ? { ...definition, emitters }
            : null
    }

    private static _filterLoadedEmitters(
        effect: string,
        definition: TodParticleDefinition,
        loadedImages: Set<string>,
    ): TodParticleDefinition | null {
        const emitters: TodEmitterDefinition[] = []
        for (const emitter of definition.emitters) {
            if (loadedImages.has(emitter.image)) {
                emitters.push(emitter)
            } else {
                console.warn(
                    `[ParticleDefinitionLoader] Skipping emitter '${emitter.name ?? effect}' ` +
                    `from '${effect}' because sprite '${emitter.image}' is not loaded`,
                )
            }
        }
        return emitters.length > 0
            ? { ...definition, emitters }
            : null
    }
}
