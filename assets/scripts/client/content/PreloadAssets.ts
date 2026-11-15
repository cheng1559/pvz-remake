import { prepareReanims } from '@/client/reanim/ReanimAssets'
import { SoundSystem } from '@/client/sound/SoundSystem'
import { ParticleAssets } from '@/client/particle/ParticleAssets'
import { modResources } from './ModResources'
import { preloadTasks } from './preloadTasks'

/** Warm the shared ZIP and animation caches during Release startup. */
export async function preloadAssets(onProgress: (progress: number) => void): Promise<void> {
    await modResources.preload(value => onProgress(value * 0.7))
    const reanims = await modResources.ids('reanim')
    await preloadTasks(reanims.map(id => () => prepareReanims([id])), value => onProgress(0.7 + value * 0.15))
    await Promise.all([
        SoundSystem.preloadAll(),
        ParticleAssets.preloadAll(),
    ])
    onProgress(1)
}
