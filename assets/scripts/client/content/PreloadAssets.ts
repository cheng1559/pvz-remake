import { AudioClip, JsonAsset, Prefab, SpriteFrame, type Asset } from 'cc'
import { loadEntityDisplayAssets } from '@/client/reanim/EntityDisplay'
import { ReanimRepository } from '@/client/reanim/ReanimPlayer'
import { SoundLoader } from '@/client/sound/LegacySoundSystem'
import { CONTENT_CATEGORIES } from '@/shared/content'
import { ParticleDefinitionLoader } from '@/core/Particle/ParticleDefinitionLoader'
import { resourcePacks } from './ResourcePacks'
import type { ResolvedContent } from './ContentRegistry'

const assetTypes = { sprites: SpriteFrame, reanim: JsonAsset, particles: JsonAsset,
    fonts: JsonAsset, sounds: AudioClip, music: JsonAsset, prefabs: Prefab }

/** Fill the existing Cocos, animation and resource pack caches during Release startup. */
export async function preloadAssets(onProgress: (progress: number) => void): Promise<void> {
    const { content: { registry, loader } } = await loadEntityDisplayAssets()
    const locations = new Set(['resources'])
    const archives: ResolvedContent[] = []
    for (const category of CONTENT_CATEGORIES) {
        for (const [, content] of registry.entries(category)) {
            if (content.bundle.startsWith('pvzmod:///')) archives.push(content)
            else locations.add(content.bundle)
        }
    }
    const bundles = await Promise.all([...locations].map(location => loader.loadBundle(location)))
    const progress = Array<number>(bundles.length + archives.length).fill(0)
    const report = (index: number, value: number) => {
        progress[index] = value
        onProgress(progress.reduce((sum, value) => sum + value, 0) / progress.length * 0.7)
    }
    await Promise.all([
        ...bundles.map((bundle, index) => new Promise<void>((resolve, reject) => {
            bundle.loadDir('', (finished, total) => report(index, total ? finished / total : 1),
                error => error ? reject(error) : resolve())
        })),
        ...archives.map(async (content, index) => {
            await loader.load<Asset>(content, assetTypes[content.category])
            report(bundles.length + index, 1)
        }),
    ])
    const reanims = [...registry.entries('reanim')]
    const repository = new ReanimRepository(registry, loader)
    let completed = 0
    await Promise.all(reanims.map(async ([id]) => {
        await repository.load(id)
        onProgress(0.7 + ++completed / reanims.length * 0.15)
    }))
    await Promise.all([
        resourcePacks.preload(value => onProgress(0.85 + value * 0.1)),
        SoundLoader.preloadAll(),
        ParticleDefinitionLoader.preloadAll(),
    ])
    onProgress(1)
}
