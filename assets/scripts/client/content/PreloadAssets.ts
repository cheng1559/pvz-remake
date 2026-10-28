import { AudioClip, JsonAsset, Prefab, SpriteFrame, type Asset } from 'cc'
import { loadEntityDisplayAssets } from '@/client/reanim/EntityDisplay'
import { ReanimRepository } from '@/client/reanim/ReanimPlayer'
import { SoundSystem } from '@/client/sound/SoundSystem'
import { CONTENT_CATEGORIES } from '@/shared/content'
import { ParticleAssets } from '@/client/particle/ParticleAssets'
import { modResources } from './ModResources'
import { preloadTasks } from './preloadTasks'
import type { ResolvedContent } from './ContentRegistry'

const assetTypes = { sprites: SpriteFrame, reanim: JsonAsset, particles: JsonAsset,
    fonts: JsonAsset, sounds: AudioClip, music: JsonAsset, prefabs: Prefab }

/** Warm the shared ZIP and animation caches during Release startup. */
export async function preloadAssets(onProgress: (progress: number) => void): Promise<void> {
    const { content: { registry, loader } } = await loadEntityDisplayAssets()
    const archives: ResolvedContent[] = []
    for (const category of CONTENT_CATEGORIES) {
        for (const [, content] of registry.entries(category)) {
            if (content.bundle.startsWith('pvzmod:///')) archives.push(content)
        }
    }
    await Promise.all([
        modResources.preload(value => onProgress(value * 0.7)),
        ...archives.map(async content => {
            await loader.load<Asset>(content, assetTypes[content.category])
        }),
    ])
    const reanims = [...registry.entries('reanim')]
    const repository = new ReanimRepository(registry, loader)
    await preloadTasks(reanims.map(([id]) => () => repository.load(id)), value => onProgress(0.7 + value * 0.15))
    await Promise.all([
        SoundSystem.preloadAll(),
        ParticleAssets.preloadAll(),
    ])
    onProgress(1)
}
