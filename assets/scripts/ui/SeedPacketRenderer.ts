import { Color, Node, Rect, Size, Sprite, SpriteFrame, Vec2 } from 'cc'
import type { BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import type { FontConfig, FontLayerConfig } from '@/core/FontRenderer/FontRenderer.d'
import { createSpriteNode, createUINode } from '@/ui/UIFactory'

export const SEED_PACKET_WIDTH = 50
export const SEED_PACKET_HEIGHT = 70

const SEED_PACKET_ATLAS_COLUMNS = 9
const PACKET_PLANTS_ATLAS_COLUMNS = 13
const PACKET_PLANTS_CACHED_ATLAS_COLUMNS = 8
const PLANT_PREVIEWS_CACHED_ATLAS_COLUMNS = 8
const PLANT_PREVIEW_CACHE_CELL_WIDTH = 220
const PLANT_PREVIEW_CACHE_CELL_HEIGHT = 160
const PLANT_PREVIEW_CACHE_OFFSET_X = -40
const PLANT_PREVIEW_CACHE_OFFSET_Y = -40
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

interface SeedPacketPlantPlacement {
    scale: number
    offsetX: number
    offsetY: number
}

const DEFAULT_PLANT_PLACEMENT: SeedPacketPlantPlacement = { scale: 0.5, offsetX: 5, offsetY: 8 }
const PLANT_PLACEMENTS = new Map<number, SeedPacketPlantPlacement>([
    [4, { scale: 0.4, offsetX: 8, offsetY: 12 }],
    [6, { scale: 0.4, offsetX: 8, offsetY: 12 }],
    [10, { scale: 0.4, offsetX: 8, offsetY: 12 }],
    [11, { scale: 0.4, offsetX: 10, offsetY: 15 }],
    [12, { scale: 0.4, offsetX: 8, offsetY: 12 }],
    [15, { scale: 0.4, offsetX: 8, offsetY: 12 }],
    [17, { scale: 0.4, offsetX: 8, offsetY: 12 }],
    [18, { scale: 0.5, offsetX: 5, offsetY: 10 }],
    [19, { scale: 0.4, offsetX: 8, offsetY: 12 }],
    [21, { scale: 0.4, offsetX: 8, offsetY: 12 }],
    [22, { scale: 0.4, offsetX: 8, offsetY: 12 }],
    [23, { scale: 0.3, offsetX: 12, offsetY: 22 }],
    [25, { scale: 0.4, offsetX: 8, offsetY: 12 }],
    [26, { scale: 0.5, offsetX: 9, offsetY: 13 }],
    [27, { scale: 0.4, offsetX: 8, offsetY: 17 }],
    [28, { scale: 0.45, offsetX: 12, offsetY: 12 }],
    [29, { scale: 0.5, offsetX: 6, offsetY: 8 }],
    [30, { scale: 0.4, offsetX: 8, offsetY: 12 }],
    [31, { scale: 0.5, offsetX: 5, offsetY: 12 }],
    [32, { scale: 0.4, offsetX: 15, offsetY: 14 }],
    [34, { scale: 0.4, offsetX: 13, offsetY: 14 }],
    [35, { scale: 0.55, offsetX: 0, offsetY: 9 }],
    [37, { scale: 0.5, offsetX: 5, offsetY: 10 }],
    [39, { scale: 0.35, offsetX: 18, offsetY: 19 }],
    [40, { scale: 0.5, offsetX: 2, offsetY: 8 }],
    [41, { scale: 0.45, offsetX: 7, offsetY: 14 }],
    [42, { scale: 0.45, offsetX: 7, offsetY: 14 }],
    [43, { scale: 0.45, offsetX: 8, offsetY: 13 }],
    [44, { scale: 0.35, offsetX: 18, offsetY: 19 }],
    [46, { scale: 0.4, offsetX: 8, offsetY: 12 }],
    [47, { scale: 0.26, offsetX: 6, offsetY: 22 }],
])

export interface SeedPacketRenderArgs {
    name?: string
    parent: Node
    layer?: number
    x: number
    y: number
    scale?: number
    seedType: SeedPacketSeedType
    cost?: number
    drawCost?: boolean
    upgrade?: boolean
    seeds: SpriteFrame | null
    seedPacketLarger?: SpriteFrame | null
    packetPlants?: SpriteFrame | null
    cachedPacketPlants?: SpriteFrame | null
    plantPreviews?: SpriteFrame | null
    costFont?: BitmapFontAssets | null
}

export class SeedPacketRenderer {
    static drawSeedPacket(args: SeedPacketRenderArgs): Node {
        const scale = args.scale ?? 1
        const rootScale = scale > 1 ? 1 : scale
        const root = createUINode(args.name ?? 'SeedPacket', {
            parent: args.parent,
            layer: args.layer,
            anchorX: 0,
            anchorY: 1,
            width: SEED_PACKET_WIDTH * scale,
            height: SEED_PACKET_HEIGHT * scale,
            x: args.x,
            y: args.y,
        })
        root.setScale(rootScale, rootScale, 1)

        this._drawBackground(root, args, scale)
        this._drawPlantIcon(root, args, scale)
        if (args.drawCost !== false && args.cost != null) {
            this._drawCost(root, args.cost, args.costFont ?? null, args.layer, scale)
        }

        return root
    }

    private static _drawBackground(root: Node, args: SeedPacketRenderArgs, scale: number) {
        if (scale > 1) {
            if (!args.seedPacketLarger) return

            createSpriteNode({
                name: 'Background',
                spriteFrame: args.seedPacketLarger,
                parent: root,
                layer: args.layer,
                x: 0,
                y: 0,
                width: SEED_PACKET_WIDTH * scale,
                height: SEED_PACKET_HEIGHT * scale,
            })
            return
        }

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

    private static _drawPlantIcon(root: Node, args: SeedPacketRenderArgs, scale: number) {
        const seedId = typeof args.seedType === 'string' ? SEED_PACKET_ICON_IDS[args.seedType] : args.seedType
        if (typeof seedId !== 'number') return

        if (scale > 1) {
            this._drawScaledCachedPlant(root, seedId, args, scale)
            return
        }

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

    private static _drawScaledCachedPlant(root: Node, seedId: number, args: SeedPacketRenderArgs, scale: number) {
        const atlas = args.plantPreviews
        if (!atlas) return

        const placement = PLANT_PLACEMENTS.get(seedId) ?? DEFAULT_PLANT_PLACEMENT
        const plantRoot = createUINode('PacketPlant', {
            parent: root,
            layer: args.layer,
            anchorX: 0,
            anchorY: 1,
            width: PLANT_PREVIEW_CACHE_CELL_WIDTH,
            height: PLANT_PREVIEW_CACHE_CELL_HEIGHT,
            x: placement.offsetX * scale,
            y: -(placement.offsetY + 1) * scale,
            z: 10,
        })
        plantRoot.setScale(placement.scale * scale, placement.scale * scale, 1)

        createSpriteNode({
            name: 'CachedPlantPreview',
            spriteFrame: getAtlasFrame(
                atlas,
                seedId,
                PLANT_PREVIEW_CACHE_CELL_WIDTH,
                PLANT_PREVIEW_CACHE_CELL_HEIGHT,
                PLANT_PREVIEWS_CACHED_ATLAS_COLUMNS,
            ),
            parent: plantRoot,
            layer: args.layer,
            x: PLANT_PREVIEW_CACHE_OFFSET_X,
            y: -PLANT_PREVIEW_CACHE_OFFSET_Y,
            width: PLANT_PREVIEW_CACHE_CELL_WIDTH,
            height: PLANT_PREVIEW_CACHE_CELL_HEIGHT,
        })
    }

    private static _drawCost(
        root: Node,
        cost: number,
        fontAssets: BitmapFontAssets | null,
        layer: number | undefined,
        scale: number,
    ) {
        if (scale > 1 && fontAssets) {
            this._drawScaledCostMatrix(root, cost, fontAssets, layer, scale)
            return
        }

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

    private static _drawScaledCostMatrix(
        root: Node,
        cost: number,
        fontAssets: BitmapFontAssets,
        layer: number | undefined,
        scale: number,
    ) {
        const text = String(cost)
        const config = fontAssets.config.json as FontConfig | null
        if (!config?.layers?.length) return

        const chars = this._resolveFontChars(config, text)
        const textWidth = this._measureMatrixStringWidth(config, chars)
        const originX = COST_BASELINE_X - textWidth
        const originY = COST_BASELINE_Y
        const costRoot = createUINode('Cost', { parent: root, layer, anchorX: 0, anchorY: 1 })

        let cursorX = 0
        for (let charIndex = 0; charIndex < chars.length; charIndex++) {
            const charCode = chars[charIndex]
            const nextCode = charIndex + 1 < chars.length ? chars[charIndex + 1] : 0
            let maxX = cursorX

            for (let layerIndex = 0; layerIndex < config.layers.length; layerIndex++) {
                const fontLayer = config.layers[layerIndex]
                const texture = fontAssets.textures[layerIndex]
                const charInfo = fontLayer.chars[String(charCode)]
                if (!texture || !charInfo) continue

                const imageX = charInfo.offset[0] + fontLayer.offset[0] + cursorX
                const imageY = charInfo.offset[1] + fontLayer.offset[1] - fontLayer.ascent
                const spriteFrame = new SpriteFrame()
                spriteFrame.reset({
                    texture,
                    rect: new Rect(...charInfo.rect),
                    originalSize: new Size(charInfo.rect[2], charInfo.rect[3]),
                    offset: new Vec2(0, 0),
                    isRotate: false,
                })

                const charNode = createSpriteNode({
                    name: `char_${charCode}_L${layerIndex}`,
                    spriteFrame,
                    parent: costRoot,
                    layer,
                    x: (originX + imageX) * scale,
                    y: -(originY + imageY) * scale,
                    z: 30 + Math.max(0, Math.min(255, fontLayer.baseOrder + charInfo.order + 128)) / 1000,
                    width: charInfo.rect[2] * scale,
                    height: charInfo.rect[3] * scale,
                })
                const sprite = charNode.getComponent(Sprite)
                if (sprite) {
                    sprite.color = this._resolveFontLayerColor(fontLayer, Color.BLACK)
                }

                const advance = charInfo.width + this._getMatrixSpacing(fontLayer, charInfo.kerning, nextCode)
                if (maxX < cursorX + advance) maxX = cursorX + advance
            }

            cursorX = maxX
        }
    }

    private static _resolveFontChars(config: FontConfig, text: string) {
        const chars: number[] = []
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i)
            chars.push(config.charMap[String(code)] ?? code)
        }
        return chars
    }

    private static _measureMatrixStringWidth(config: FontConfig, chars: number[]) {
        let cursorX = 0
        for (let charIndex = 0; charIndex < chars.length; charIndex++) {
            const charCode = chars[charIndex]
            const nextCode = charIndex + 1 < chars.length ? chars[charIndex + 1] : 0
            let maxX = cursorX

            for (const fontLayer of config.layers) {
                const charInfo = fontLayer.chars[String(charCode)]
                if (!charInfo) continue
                const advance = charInfo.width + this._getMatrixSpacing(fontLayer, charInfo.kerning, nextCode)
                if (maxX < cursorX + advance) maxX = cursorX + advance
            }

            cursorX = maxX
        }
        return cursorX
    }

    private static _getMatrixSpacing(
        fontLayer: FontLayerConfig,
        kerning: Record<string, number>,
        nextCode: number,
    ) {
        return nextCode === 0 ? 0 : fontLayer.spacing + (kerning[String(nextCode)] ?? 0)
    }

    private static _resolveFontLayerColor(fontLayer: FontLayerConfig, inputColor: Color) {
        const colorMult = fontLayer.colorMult
        const colorAdd = fontLayer.colorAdd
        return new Color(
            Math.min(255, Math.floor(inputColor.r * colorMult[0] / 255) + colorAdd[0]),
            Math.min(255, Math.floor(inputColor.g * colorMult[1] / 255) + colorAdd[1]),
            Math.min(255, Math.floor(inputColor.b * colorMult[2] / 255) + colorAdd[2]),
            Math.min(255, Math.floor(inputColor.a * colorMult[3] / 255) + colorAdd[3]),
        )
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
