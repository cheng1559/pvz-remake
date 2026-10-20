import { Color, type Node } from 'cc'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import { FontMetricsUtil, FontRenderer } from '@/client/font'
import { uiNode } from '@/client/view/uiNode'

export interface UILabelOptions {
    text: string
    x?: number
    y?: number
    width?: number
    fontSize?: number
    color?: Color
    align?: 'left' | 'center' | 'right'
    baseline?: boolean
}

export class UILabel {
    readonly node: Node
    readonly renderer: FontRenderer

    constructor(parent: Node, private readonly font: BitmapFontAssets, private readonly options: UILabelOptions) {
        this.node = uiNode({ name: 'Label', parent, anchor: { x: 0, y: 1 } }).node
        this.renderer = this.node.addComponent(FontRenderer)
        this.renderer.setFontAssets(font)
        this.renderer.fontSize = options.fontSize ?? 0
        this.renderer.fontColor = options.color ?? Color.WHITE
        this.renderer.maxWidth = options.width ?? 0
        this.renderer.textAlign = options.align === 'center' ? 2 : options.align === 'right' ? 1 : 0
        this.text = options.text
    }

    get text(): string { return this.renderer.string }
    set text(value: string) {
        this.renderer.string = value
        this.renderer.forceRebuild()
        const { x = 0, y = 0, width, align, baseline } = this.options
        const scale = this.renderer.fontSize > 0
            ? this.renderer.fontSize / (this.font.config.json as { defaultPointSize: number }).defaultPointSize : 1
        const measuredWidth = FontMetricsUtil.measureTextWidth(this.font.config, value) * scale
        const offset = width ? 0 : align === 'center' ? measuredWidth / 2 : align === 'right' ? measuredWidth : 0
        const ascent = baseline ? FontMetricsUtil.getMetrics(this.font.config).ascent * scale : 0
        this.node.setPosition(x - offset, ascent - y)
    }
}
