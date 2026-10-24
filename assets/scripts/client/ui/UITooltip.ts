import { _decorator, Canvas, Color, Component, Mask, Node, UITransform, Vec3 } from 'cc'
import { FontMetricsUtil } from '@/client/font'
import { uiNode, type UiNodeParts } from '@/client/view/uiNode'
import type { UI } from './UI'
import type { UIFont } from './UIAssets'

const { ccclass } = _decorator

export interface UITooltipOptions {
    text: string
    warning?: string
    font?: UIFont
    maxWidth?: number
    gap?: number
    /** Pixel adjustment after anchoring: x right, y down. */
    offset?: readonly [number, number]
}

interface Bounds { left: number, right: number, top: number, bottom: number }

/** UI coordinates point up; x/y describe the tooltip's top-left corner. */
export function tooltipPosition(anchor: Bounds, width: number, height: number, bounds: Bounds, gap: number, offset: readonly [number, number] = [0, 0]) {
    let y = anchor.bottom - gap - offset[1]
    if (y - height < bounds.bottom) y = anchor.top + gap + height - offset[1]
    return {
        x: Math.max(bounds.left, Math.min(bounds.right - width, (anchor.left + anchor.right - width) / 2 + offset[0])),
        y: Math.max(bounds.bottom + height, Math.min(bounds.top, y)),
    }
}

@ccclass('PvZUITooltip')
export class UITooltip extends Component {
    private ui!: UI
    private options!: UITooltipOptions
    private popup: UiNodeParts | null = null
    private visible = false
    private dirty = false
    private widthLimit = 0
    private heightLimit = 0

    initialize(ui: UI, options: UITooltipOptions): void {
        this.ui = ui
        this.options = options
    }

    get text(): string { return this.options.text }
    set text(value: string) {
        if (value === this.text) return
        this.options.text = value
        this.dirty = true
        if (this.visible) this.refresh()
    }

    get warning(): string { return this.options.warning ?? '' }
    set warning(value: string) {
        if (value === this.warning) return
        this.options.warning = value
        this.dirty = true
        if (this.visible) this.refresh()
    }

    show(): void { this.visible = true; this.refresh() }
    hide(): void { this.visible = false; if (this.popup?.node.isValid) this.popup.node.active = false }
    onDisable(): void { this.hide() }
    onDestroy(): void { if (this.popup?.node.isValid) this.popup.node.destroy() }
    lateUpdate(): void { if (this.visible) this.refresh() }

    private surface(): UITransform | null {
        let fallback: UITransform | null = null
        for (let node = this.node.parent; node; node = node.parent) {
            const transform = node.getComponent(UITransform)
            if (!transform || transform.width <= 0 || transform.height <= 0) continue
            fallback = transform
            if (node.getComponent(Mask) || node.getComponent(Canvas)) return transform
        }
        return fallback
    }

    private refresh(): void {
        if (!this.node.activeInHierarchy || !this.options.text) { this.hide(); return }
        const surface = this.surface()
        if (!surface) return
        const bounds: Bounds = {
            left: -surface.anchorX * surface.width + 2,
            right: (1 - surface.anchorX) * surface.width - 2,
            bottom: -surface.anchorY * surface.height + 2,
            top: (1 - surface.anchorY) * surface.height - 2,
        }
        const widthLimit = Math.max(1, Math.min(this.options.maxWidth ?? 300, bounds.right - bounds.left))
        const heightLimit = Math.max(1, bounds.top - bounds.bottom)
        if (this.dirty || !this.popup?.node.isValid || this.popup.node.parent !== surface.node
            || this.widthLimit !== widthLimit || this.heightLimit !== heightLimit) {
            this.render(surface.node, widthLimit, heightLimit)
        }
        const popup = this.popup!
        const anchor = this.node.getComponent(UITransform)!
        const points = [
            [0, 0], [anchor.width, 0], [0, anchor.height], [anchor.width, anchor.height],
        ].map(([x, y]) => surface.convertToNodeSpaceAR(anchor.convertToWorldSpaceAR(new Vec3(
            x - anchor.anchorX * anchor.width, y - anchor.anchorY * anchor.height,
        ))))
        const position = tooltipPosition({
            left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
            bottom: Math.min(...points.map(p => p.y)), top: Math.max(...points.map(p => p.y)),
        }, popup.transform.width, popup.transform.height, bounds, this.options.gap ?? 4, this.options.offset)
        popup.node.setPosition(position.x, position.y)
        popup.node.setSiblingIndex(surface.node.children.length - 1)
        popup.node.active = true
    }

    private render(parent: Node, widthLimit: number, heightLimit: number): void {
        if (this.popup?.node.isValid) this.popup.node.destroy()
        this.widthLimit = widthLimit
        this.heightLimit = heightLimit
        this.dirty = false
        const font = this.options.font ?? 'packetCost' // Pico129, matching the previous garden tooltip.
        const config = this.ui.assets.fonts[font].config
        const metrics = FontMetricsUtil.getMetrics(config)
        const measure = (text: string) => FontMetricsUtil.measureTextWidth(config, text)
        const width = Math.min(widthLimit, Math.max(...[this.options.text, this.warning].flatMap(text => text.split('\n').map(measure))) + 10)
        const textWidth = Math.max(1, width - 10)
        const lines = FontMetricsUtil.measureWordWrapped(config, this.options.text, textWidth).lineWidths.length
        const warningLines = this.warning ? FontMetricsUtil.measureWordWrapped(config, this.warning, textWidth).lineWidths.length : 0
        const height = Math.min(heightLimit, 4 + (lines + warningLines) * (metrics.ascent + 2))
        const popup = this.popup = uiNode({
            name: 'Tooltip', parent, active: false, anchor: { x: 0, y: 1 }, size: { width, height }, graphics: true,
        })
        const g = popup.graphics!
        g.fillColor = new Color(255, 255, 200)
        g.fillRect(0, -height, width, height)
        g.fillColor = Color.BLACK
        g.fillRect(0, -1, width, 1)
        g.fillRect(0, -height, width, 1)
        g.fillRect(0, -height, 1, height)
        g.fillRect(width - 1, -height, 1, height)
        const text = uiNode({
            name: 'Text', parent: popup.node, anchor: { x: 0, y: 1 }, position: { x: 5, y: -1 },
            size: { width: textWidth, height: Math.max(0, height - 2) }, mask: Mask.Type.GRAPHICS_RECT,
        }).node
        const drawLabel = (value: string, y: number, color: Color) => {
            const label = this.ui.label(text, { text: value, y, font, width: textWidth, align: 'center', color })
            label.renderer.lineSpacing = metrics.ascent + 2
            label.renderer.forceRebuild()
        }
        if (this.warning) drawLabel(this.warning, 0, new Color(255, 0, 0))
        drawLabel(this.options.text, warningLines * (metrics.ascent + 2), Color.BLACK)
    }
}
