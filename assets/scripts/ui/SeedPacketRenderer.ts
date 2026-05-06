import { Color, Node, Rect, Size, SpriteFrame, Vec2 } from 'cc'
import type { BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { createSpriteNode, createUINode } from '@/ui/UIFactory'

export const SEED_PACKET_WIDTH = 50
export const SEED_PACKET_HEIGHT = 70

const SEED_PACKET_ATLAS_COLUMNS = 9
const PACKET_PLANTS_ATLAS_COLUMNS = 13
const PACKET_PLANTS_CACHED_ATLAS_COLUMNS = 8
const BACKGROUND_IMITATER = 0
const BACKGROUND_UPGRADE = 1
const BACKGROUND_NORMAL = 2
const COST_BASELINE_X = 32
const COST_BASELINE_Y = 64

const PACKET_PLANT_CELS = new Map<number, number>([
    [4, 0],
    [6, 1],
    [12, 2],
    [23, 3],
    [27, 4],
    [30, 5],
    [41, 6],
    [47, 7],
    [32, 8],
    [34, 9],
    [39, 10],
    [44, 11],
    [46, 12],
])

const atlasFrames: WeakMap<SpriteFrame, Map<string, SpriteFrame>> = new WeakMap()

export type SeedPacketSeedType =
    | number
    | 'peashooter'
    | 'sunflower'
    | 'cherrybomb'
    | 'wallnut'
    | 'potatomine'
    | 'snowpea'
    | 'chomper'
    | 'repeater'

const SEED_PACKET_ICON_IDS: Record<string, number> = {
    peashooter: 0,
    sunflower: 1,
    cherrybomb: 2,
    wallnut: 3,
    potatomine: 4,
    snowpea: 5,
    chomper: 6,
    repeater: 7,
}

export interface SeedPacketRenderArgs {
    name?: string
    parent: Node
    layer?: number
    x: number
    y: number
    seedType: SeedPacketSeedType
    cost?: number
    drawCost?: boolean
    upgrade?: boolean
    seeds: SpriteFrame | null
    packetPlants?: SpriteFrame | null
    cachedPacketPlants?: SpriteFrame | null
    costFont?: BitmapFontAssets | null
}

export class SeedPacketRenderer {
    static drawSeedPacket(args: SeedPacketRenderArgs): Node {
        const root = createUINode(args.name ?? 'SeedPacket', {
            parent: args.parent,
            layer: args.layer,
            anchorX: 0,
            anchorY: 1,
            width: SEED_PACKET_WIDTH,
            height: SEED_PACKET_HEIGHT,
            x: args.x,
            y: args.y,
        })

        this._drawBackground(root, args)
        this._drawPlantIcon(root, args)
        if (args.drawCost !== false && args.cost != null) {
            this._drawCost(root, args.cost, args.costFont ?? null, args.layer)
        }

        return root
    }

    private static _drawBackground(root: Node, args: SeedPacketRenderArgs) {
        if (!args.seeds) return

        const backgroundCel =
            args.seedType === 48
                ? BACKGROUND_IMITATER
                : args.upgrade
                  ? BACKGROUND_UPGRADE
                  : BACKGROUND_NORMAL

        createSpriteNode({
            name: 'Background',
            spriteFrame: getAtlasFrame(
                args.seeds,
                backgroundCel,
                SEED_PACKET_WIDTH,
                SEED_PACKET_HEIGHT,
                SEED_PACKET_ATLAS_COLUMNS,
            ),
            parent: root,
            layer: args.layer,
            x: 0,
            y: 0,
            width: SEED_PACKET_WIDTH,
            height: SEED_PACKET_HEIGHT,
        })
    }

    private static _drawPlantIcon(root: Node, args: SeedPacketRenderArgs) {
        const seedId = typeof args.seedType === 'string' ? SEED_PACKET_ICON_IDS[args.seedType] : args.seedType
        if (typeof seedId !== 'number') return

        const packetPlantCel = PACKET_PLANT_CELS.get(seedId)
        const atlas = packetPlantCel != null ? args.packetPlants : args.cachedPacketPlants
        if (!atlas) return

        createSpriteNode({
            name: 'PacketPlant',
            spriteFrame: getAtlasFrame(
                atlas,
                packetPlantCel ?? seedId,
                SEED_PACKET_WIDTH,
                SEED_PACKET_HEIGHT,
                packetPlantCel != null ? PACKET_PLANTS_ATLAS_COLUMNS : PACKET_PLANTS_CACHED_ATLAS_COLUMNS,
            ),
            parent: root,
            layer: args.layer,
            x: 0,
            y: 0,
            width: SEED_PACKET_WIDTH,
            height: SEED_PACKET_HEIGHT,
        })
    }

    private static _drawCost(root: Node, cost: number, fontAssets: BitmapFontAssets | null, layer?: number) {
        const node = createUINode('Cost', { parent: root, layer, anchorX: 0, anchorY: 1 })
        const renderer = node.addComponent(FontRenderer)
        if (fontAssets) {
            renderer.setFontAssets(fontAssets)
        }
        renderer.fontColor = Color.BLACK
        renderer.string = String(cost)
        renderer.forceRebuild()

        const metrics = FontMetricsUtil.getMetrics(fontAssets?.config ?? null)
        const width =
            FontMetricsUtil.measureTextWidth(fontAssets?.config ?? null, renderer.string) ||
            renderer.contentWidth
        node.setPosition(COST_BASELINE_X - width, -(COST_BASELINE_Y - metrics.ascent), 30)
    }
}

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
    framesByAtlas.set(cacheKey, frame)
    return frame
}
