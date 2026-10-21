import type { SpriteFrame } from 'cc'

const densities = new WeakMap<SpriteFrame['texture'], number>()

/** Keep frame rectangles, trimming and nine-slice borders in game coordinates. */
export function setSpriteDensity(texture: SpriteFrame['texture'], scale: number): void {
    densities.set(texture, scale)
}

export function getSpriteDensity(frame: SpriteFrame): number {
    return densities.get(frame.texture) ?? 1
}

/** Call after reset or changing slice borders, before assigning to a Sprite. */
export function applySpriteDensity(frame: SpriteFrame): void {
    const scale = getSpriteDensity(frame)
    if (scale === 1) return
    // Recompute from the logical metadata, including cloned/edited slice borders.
    // This also makes repeated calls safe.
    frame.reset({})
    // Cocos computes UVs from the logical rect and the physical texture size.
    // Normalize that result without changing geometry or trimming metadata.
    for (const values of [frame.uv, frame.unbiasUV]) {
        for (let index = 0; index < values.length; index++) values[index] *= scale
    }
    for (const uv of frame.uvSliced) { uv.u *= scale; uv.v *= scale }
    frame.packable = false
}
