import { director, gfx, Rect, SpriteFrame, Texture2D } from 'cc'
import { applySpriteDensity, getSpriteDensity, setSpriteDensity } from '@/client/content/SpriteDensity'

interface Page { texture: Texture2D; density: number; minFilter: number; magFilter: number; x: number; y: number; rowHeight: number }
interface Placement { page: Page; x: number; y: number }
const pages: Page[] = []
/** A shared image may be copied to several pages, so each animation draws from one page. */
const placements = new WeakMap<Texture2D, Placement[]>()
const frames = new WeakMap<SpriteFrame, Map<Page, SpriteFrame>>()
const PAGE_SIZE = 2048
const BORDER = 2

const padded = (texture: Texture2D) => [texture.width + BORDER * 2, texture.height + BORDER * 2] as const
const packable = (texture: Texture2D) => padded(texture).every(size => size <= PAGE_SIZE)

/** Shelf packing; returns the positions, or null when the page cannot take every texture. */
function fit(page: Pick<Page, 'x' | 'y' | 'rowHeight'>, textures: readonly Texture2D[]): Array<[number, number]> | null {
    let { x, y, rowHeight } = page
    const result: Array<[number, number]> = []
    for (const texture of textures) {
        const [width, height] = padded(texture)
        if (x + width > PAGE_SIZE) { x = 0; y += rowHeight; rowHeight = 0 }
        if (y + height > PAGE_SIZE) return null
        result.push([x, y])
        x += width
        rowHeight = Math.max(rowHeight, height)
    }
    Object.assign(page, { x, y, rowHeight })
    return result
}

function copyInto(page: Page, texture: Texture2D, left: number, top: number): void {
    const x = left + BORDER, y = top + BORDER
    const regions: gfx.TextureBlit[] = []
    // Extrude the edge texels so linear filtering cannot sample another sprite.
    const edges = (size: number, origin: number) => [
        ...Array.from({ length: BORDER }, (_, i) => [0, 1, origin - BORDER + i, 1]),
        [0, size, origin, size],
        ...Array.from({ length: BORDER }, (_, i) => [size - 1, 1, origin + size + i, 1]),
    ]
    for (const [sx, sw, dx, dw] of edges(texture.width, x)) {
        for (const [sy, sh, dy, dh] of edges(texture.height, y)) {
            regions.push(new gfx.TextureBlit(undefined, new gfx.Offset(sx, sy, 0), new gfx.Extent(sw, sh, 1),
                undefined, new gfx.Offset(dx, dy, 0), new gfx.Extent(dw, dh, 1)))
        }
    }
    // Keep uploads and atlas copies in the frame's command buffer. A separate
    // buffer cannot finish before pending uploads in the current frame commit.
    director.root!.device.commandBuffer.blitTexture(texture.getGFXTexture()!, page.texture.getGFXTexture()!, regions, gfx.Filter.POINT)
    const list = placements.get(texture) ?? []
    list.push({ page, x, y })
    placements.set(texture, list)
}

const placementOn = (texture: Texture2D, page: Page | undefined) => placements.get(texture)?.find(placement => placement.page === page)

function newPage(density: number, minFilter: number, magFilter: number): Page {
    const atlas = new Texture2D()
    atlas.reset({ width: PAGE_SIZE, height: PAGE_SIZE, format: Texture2D.PixelFormat.RGBA8888 })
    atlas.setFilters(minFilter === gfx.Filter.POINT ? Texture2D.Filter.NEAREST : Texture2D.Filter.LINEAR,
        magFilter === gfx.Filter.POINT ? Texture2D.Filter.NEAREST : Texture2D.Filter.LINEAR)
    atlas.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE)
    setSpriteDensity(atlas, density)
    const page = { texture: atlas, density, minFilter, magFilter, x: 0, y: 0, rowHeight: 0 }
    pages.push(page)
    return page
}

/**
 * Copies the images of one animation into a shared page, so it can be drawn in one batch.
 * GPU-to-GPU copies keep native decoded images releasable; no CPU image cache is needed.
 * `near` keeps later images, such as damage overrides, on the page of the animation using them.
 */
export function animationFrames(sources: readonly SpriteFrame[], near?: SpriteFrame): SpriteFrame[] {
    const groups = new Map<string, Texture2D[]>()
    for (const source of sources) {
        const texture = source.texture as Texture2D
        if (!packable(texture)) continue
        const { minFilter, magFilter } = texture.getSamplerInfo()
        const key = `${getSpriteDensity(source)}:${minFilter}:${magFilter}`
        const group = groups.get(key) ?? []
        if (!group.includes(texture)) group.push(texture)
        groups.set(key, group)
    }
    const targets = new Map<Texture2D, Page>()
    const hint = near && pages.find(candidate => candidate.texture === near.texture)
    for (const [key, textures] of groups) {
        const [density, minFilter, magFilter] = key.split(':').map(Number)
        const matches = (page: Page) => page.density === density && page.minFilter === minFilter && page.magFilter === magFilter
        // Prefer the hinted page, then the page already holding most of the group, then any page with room.
        const held = (page: Page) => page === hint ? Infinity : textures.filter(texture => placementOn(texture, page)).length
        const missing = (page: Page) => textures.filter(texture => !placementOn(texture, page))
        const candidates = pages.filter(matches).sort((a, b) => held(b) - held(a))
        let page = candidates.find(candidate => fit({ ...candidate }, missing(candidate)))
        page ??= fit({ x: 0, y: 0, rowHeight: 0 }, textures) ? newPage(density, minFilter, magFilter) : undefined
        if (page) {
            const added = missing(page)
            fit(page, added)!.forEach(([x, y], index) => copyInto(page!, added[index], x, y))
            for (const texture of textures) targets.set(texture, page)
            continue
        }
        // Too large for one page together: place each image wherever it fits.
        for (const texture of textures) {
            const existing = placements.get(texture)?.[0]?.page
            if (existing) { targets.set(texture, existing); continue }
            const single = pages.filter(matches).find(candidate => fit({ ...candidate }, [texture])) ?? newPage(density, minFilter, magFilter)
            const [[x, y]] = fit(single, [texture])!
            copyInto(single, texture, x, y)
            targets.set(texture, single)
        }
    }
    return sources.map(source => {
        const texture = source.texture as Texture2D, page = targets.get(texture)
        const placement = placementOn(texture, page)
        if (!page || !placement) return source
        let copies = frames.get(source)
        if (!copies) frames.set(source, copies = new Map())
        const cached = copies.get(page)
        if (cached) return cached
        const density = getSpriteDensity(source), rect = source.rect
        const frame = new SpriteFrame()
        frame.reset({ texture: page.texture, rect: new Rect(rect.x + placement.x / density, rect.y + placement.y / density, rect.width, rect.height),
            originalSize: source.originalSize, offset: source.offset, isRotate: source.rotated,
            borderLeft: source.insetLeft, borderTop: source.insetTop, borderRight: source.insetRight, borderBottom: source.insetBottom })
        applySpriteDensity(frame)
        frame.packable = false
        copies.set(page, frame)
        return frame
    })
}

export function animationFrame(source: SpriteFrame, near?: SpriteFrame): SpriteFrame {
    return animationFrames([source], near)[0]
}
