import type { SpriteFrame } from 'cc'
import { modResources } from '@/client/content/ModResources'
import { animationFrames } from '@/client/render/AnimationAtlas'
import { loadKernelMaterial } from '@/client/render/KernelBatch'
import { parseReanim, type Reanim } from '@/shared/content/reanim'
import { loadKernel } from '@/shared/kernel/index'

/** A clip and the pictures it draws, each by the pack that has it for this clip (ModResources.sprite). */
export interface ReanimAssets {
    data: Reanim
    frames: ReadonlyArray<readonly [string, SpriteFrame]>
}

const pending = new Map<string, Promise<ReanimAssets>>()
/** The ones that have arrived, for a player changing clips at once (ReanimPlayer.change). */
const loaded = new Map<string, ReanimAssets>()

/** A Reanim clip by its resource ID, loaded once for every player and view. */
export function loadReanim(id: string): Promise<ReanimAssets> {
    const cached = pending.get(id)
    if (cached) return cached
    const promise = (async () => {
        const data = await modResources.json('reanim', id, json => {
            const clip = parseReanim(json)
            if (clip.id !== id) throw new Error(`reanim ID mismatch: expected ${id}, got ${clip.id}`)
            return clip
        })
        if (data === undefined) throw new Error(`unknown reanim: ${id}`)
        const spriteIds = new Set<string>()
        for (const track of data.tracks) {
            for (const frame of track.keyframes) if (frame.sprite) spriteIds.add(frame.sprite)
        }
        const [frames] = await Promise.all([Promise.all([...spriteIds].sort().map(async spriteId =>
            [spriteId, await modResources.sprite(spriteId, id)] as const,
        )), loadKernel()])
        // Pack after every image has arrived, so one animation's images share a page.
        const packed = animationFrames(frames.map(([, frame]) => frame))
        const assets = { data, frames: frames.map(([spriteId], index) => [spriteId, packed[index]] as const) }
        loaded.set(id, assets)
        return assets
    })().catch(error => {
        pending.delete(id)
        throw error
    })
    pending.set(id, promise)
    return promise
}

/**
 * Has every clip a view will play in memory, with what draws them, so that the view changes between them at once
 * (ReanimPlayer.change): what the loading screen already did for all of them, where it loads everything.
 */
export async function prepareReanims(ids: Iterable<string>): Promise<void> {
    await Promise.all([...[...new Set(ids)].map(loadReanim), loadKernelMaterial()])
}

/** A clip already in memory (prepareReanims), or nothing. */
export function loadedReanim(id: string): ReanimAssets | undefined {
    return loaded.get(id)
}
