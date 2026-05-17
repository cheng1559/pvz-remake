import { Color, Graphics, Layers, Node } from 'cc'
import type { BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { createUINode } from '@/ui/UIFactory'

export function createTooltipNode(args: {
    name?: string
    text: string
    warningText?: string
    font: BitmapFontAssets | null
    parent?: Node
    layer?: number
    x?: number
    y?: number
    z?: number
    minWidth?: number
    warningColor?: Color
    centerX?: boolean
    active?: boolean
}): Node {
    const layer = args.layer ?? Layers.Enum.UI_2D
    const metrics = FontMetricsUtil.getMetrics(args.font?.config ?? null)
    const textWidth = FontMetricsUtil.measureTextWidth(args.font?.config ?? null, args.text)
    const warningText = args.warningText ?? ''
    const warningWidth = warningText ? FontMetricsUtil.measureTextWidth(args.font?.config ?? null, warningText) : 0
    const width = Math.max(args.minWidth ?? 0, textWidth, warningWidth) + 10
    const height = metrics.ascent + 6 + (warningText ? metrics.ascent + 2 : 0)
    const node = createUINode(args.name ?? 'Tooltip', {
        parent: args.parent,
        layer,
        anchorX: 0,
        anchorY: 1,
        width,
        height,
        active: args.active,
    })
    node.setPosition((args.x ?? 0) - (args.centerX ? Math.trunc(width / 2) : 0), args.y ?? 0, args.z ?? 0)

    const graphics = node.addComponent(Graphics)
    graphics.fillColor = new Color(255, 255, 200, 255)
    graphics.fillRect(0, -height, width, height)
    graphics.fillColor = Color.BLACK
    graphics.fillRect(0, -1, width, 1)
    graphics.fillRect(0, -height, width, 1)
    graphics.fillRect(0, -height, 1, height)
    graphics.fillRect(width - 1, -height, 1, height)

    let labelY = -1
    if (warningText) {
        const warning = createUINode('Warning', {
            parent: node,
            layer,
            anchorX: 0,
            anchorY: 1,
        })
        const warningRenderer = warning.addComponent(FontRenderer)
        if (args.font) warningRenderer.setFontAssets(args.font)
        warningRenderer.fontColor = args.warningColor ?? new Color(255, 0, 0, 255)
        warningRenderer.string = warningText
        warningRenderer.forceRebuild()
        warning.setPosition(Math.trunc((width - warningWidth) / 2), labelY, 0)
        labelY -= metrics.ascent + 2
    }

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
    label.setPosition(Math.trunc((width - textWidth) / 2), labelY, 0)

    return node
}
