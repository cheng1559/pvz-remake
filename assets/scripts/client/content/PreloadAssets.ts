import { loadEntityDisplayAssets } from '@/client/reanim/EntityDisplay'
import { ReanimRepository } from '@/client/reanim/ReanimPlayer'
import { SoundLoader } from '@/client/sound/LegacySoundSystem'
import { CONTENT_CATEGORIES } from '@/shared/content'
import { resourcePacks } from './ResourcePacks'

/** Fill the existing Cocos, animation and resource pack caches during Release startup. */
export async function preloadAssets(onProgress: (progress: number) => void): Promise<void> {
    const { content: { registry, loader } } = await loadEntityDisplayAssets()
    const locations = new Set(['resources'])
    for (const category of CONTENT_CATEGORIES) {
        for (const [, content] of registry.entries(category)) locations.add(content.bundle)
    }
    const bundles = await Promise.all([...locations].map(location => loader.loadBundle(location)))
    const progress = bundles.map(() => 0)
    await Promise.all(bundles.map((bundle, index) => new Promise<void>((resolve, reject) => {
        bundle.loadDir('', (finished, total) => {
            progress[index] = total ? finished / total : 1
            onProgress(progress.reduce((sum, value) => sum + value, 0) / bundles.length * 0.7)
        }, error => error ? reject(error) : resolve())
    })))
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
    ])
    onProgress(1)
}
