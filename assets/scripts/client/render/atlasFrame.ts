import { Rect, Size, SpriteFrame, Vec2 } from 'cc'
import { applySpriteDensity } from '@/client/content/SpriteDensity'

const atlasFrames: WeakMap<SpriteFrame, Map<string, SpriteFrame>> = new WeakMap()

/** Cell `index` of an atlas cut into `width` x `height` cells, `columns` to a row; made once per atlas and cell. */
export function getAtlasFrame(
    atlas: SpriteFrame,
    index: number,
    width: number,
    height: number,
    columns: number,
) {
    const cacheKey = `${index}:${width}:${height}:${columns}`
    let framesByAtlas = atlasFrames.get(atlas)
    if (!framesByAtlas) {
        framesByAtlas = new Map<string, SpriteFrame>()
        atlasFrames.set(atlas, framesByAtlas)
    }

    const cached = framesByAtlas.get(cacheKey)
    if (cached) return cached

    const atlasRect = atlas.rect
    const atlasOriginalSize = atlas.originalSize
    const atlasX = atlasOriginalSize.width >= columns * width ? 0 : atlasRect.x
    const atlasY = atlasOriginalSize.height >= (Math.floor(index / columns) + 1) * height ? 0 : atlasRect.y
    const frame = new SpriteFrame()
    frame.reset({
        texture: atlas.texture,
        rect: new Rect(
            atlasX + (index % columns) * width,
            atlasY + Math.floor(index / columns) * height,
            width,
            height,
        ),
        originalSize: new Size(width, height),
        offset: new Vec2(0, 0),
        isRotate: false,
    })
    applySpriteDensity(frame)
    framesByAtlas.set(cacheKey, frame)
    return frame
}
