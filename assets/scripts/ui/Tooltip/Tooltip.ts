import { Color, Graphics, Layers, Node } from 'cc'
import type { BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { createUINode } from '@/ui/UIFactory'

export function createTooltipNode(args: {
    name?: string
    text: string
    font: BitmapFontAssets | null
    parent?: Node
    layer?: number
    x?: number
    y?: number
    z?: number
    centerX?: boolean
    active?: boolean
}): Node {
    const layer = args.layer ?? Layers.Enum.UI_2D
    const metrics = FontMetricsUtil.getMetrics(args.font?.config ?? null)
    const textWidth = FontMetricsUtil.measureTextWidth(args.font?.config ?? null, args.text)
    const width = textWidth + 10
    const height = metrics.ascent + 6
    const node = createUINode(args.name ?? 'Tooltip', {
        parent: args.parent,
        layer,
        anchorX: 0,
        anchorY: 1,
        width,
        height,
        active: args.active,
    })
    node.setPosition((args.x ?? 0) - (args.centerX ? width / 2 : 0), args.y ?? 0, args.z ?? 0)

    const graphics = node.addComponent(Graphics)
    graphics.fillColor = new Color(255, 255, 200, 255)
    graphics.fillRect(0, -height, width, height)
    graphics.fillColor = Color.BLACK
    graphics.fillRect(0, -1, width, 1)
    graphics.fillRect(0, -height, width, 1)
    graphics.fillRect(0, -height, 1, height)
    graphics.fillRect(width - 1, -height, 1, height)

    const label = createUINode('Label', {
        parent: node,
        layer,
        anchorX: 0,
        anchorY: 1,
    })
    const renderer = label.addComponent(FontRenderer)
    if (args.font) renderer.setFontAssets(args.font)
    renderer.fontColor = Color.BLACK
    renderer.string = args.text
    renderer.forceRebuild()
    label.setPosition((width - textWidth) / 2, -1, 0)

    return node
}
