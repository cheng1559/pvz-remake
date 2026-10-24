import { Color, Graphics, Node } from 'cc'
import { uiNode } from '@/client/view/uiNode'
import { fitViewport } from '@/client/view/ClientViewport'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import { FontMetricsUtil } from '@/client/font'
import type { UI } from '@/client/ui/UI'
import type { UILabel } from '@/client/ui/UILabel'
import {
    parseAdviceWidgetSnapshot,
    type AdviceWidgetSnapshot,
    type AdviceWidgetStyle,
} from './AdviceWidgetSnapshot'

export type { AdviceWidgetSnapshot, AdviceWidgetStyle } from './AdviceWidgetSnapshot'

const ADVICE_HINT_Y = 527
const ADVICE_HINT_HEIGHT = 55
const ADVICE_TUTORIAL_LEVEL1_Y = 400
const ADVICE_TUTORIAL_LEVEL1_HEIGHT = 110
const ADVICE_TUTORIAL_LEVEL2_Y = 476
const ADVICE_TUTORIAL_LEVEL2_HEIGHT = 100
const ADVICE_WIDTH = 800
const ADVICE_DURATION_FAST = 500
const ADVICE_DURATION_LONG = 1500
const ADVICE_DURATION_STAY = 10000
const PVZ_NATIVE_FONT_SIZE = 0
const ADVICE_TEXT_SIZE = PVZ_NATIVE_FONT_SIZE
const ADVICE_TEXT_OFFSET_Y = -4
const ADVICE_TEXT_MIN_ALPHA = 192

export class AdviceWidget {
    readonly node: Node

    private readonly _font: BitmapFontAssets
    private readonly _backdrop: Graphics
    private readonly _label: UILabel
    private _durationTicks = 0
    private _style: AdviceWidgetStyle = 'hint'
    private _pulseTick = 0
    private _width = ADVICE_WIDTH
    private _height = ADVICE_HINT_HEIGHT

    constructor(args: {
        ui: UI
        node?: Node
        parent: Node
        layer?: number
        font: BitmapFontAssets
    }) {
        this._font = args.font
        const parts = uiNode({
            node: args.node,
            name: 'AdviceWidget',
            parent: args.parent,
            layer: args.layer,
            anchor: { x: 0.5, y: 0.5 },
            size: { width: ADVICE_WIDTH, height: ADVICE_HINT_HEIGHT },
            position: { x: ADVICE_WIDTH / 2, y: -(ADVICE_HINT_Y + ADVICE_HINT_HEIGHT / 2) },
            graphics: true,
            opacity: 255,
        })
        this.node = parts.node
        this._backdrop = parts.graphics!

        this._label = args.ui.label(this.node, {
            text: '', font: this._font, fontSize: ADVICE_TEXT_SIZE, width: ADVICE_WIDTH - 40, align: 'center',
        })
        this._label.node.name = 'AdviceLabel'
        fitViewport(this.node, size => {
            this._width = size.width
            this._applyLayout()
            this._drawBackdrop()
        })
        this.node.active = false
    }

    show(message: string, style: AdviceWidgetStyle = 'hint') {
        if (!this.node.isValid) return

        this._style = style
        this._durationTicks = this._durationForStyle(style)
        this._label.text = message
        this._applyLayout()
        this.node.active = true
        this._drawBackdrop()
    }

    snapshot(): AdviceWidgetSnapshot | null {
        if (!this.node.isValid || !this.node.active || !this._label.text) return null

        return parseAdviceWidgetSnapshot({
            message: this._label.text,
            style: this._style,
            durationTicks: this._durationTicks,
            pulseTick: this._pulseTick,
        })
    }

    restore(value: unknown) {
        const snapshot = parseAdviceWidgetSnapshot(value)
        if (snapshot === null) {
            this.clear()
            return
        }

        this._style = snapshot.style
        this._durationTicks = snapshot.durationTicks
        this._pulseTick = snapshot.pulseTick
        this._label.text = snapshot.message
        this._applyLayout()
        this.node.active = snapshot.durationTicks > 0
        this._drawBackdrop()
    }

    clear() {
        if (!this.node.isValid) return

        this._label.text = ''
        this._backdrop.clear()
        this.node.active = false
        this.node.setScale(1, 1, 1)
        uiNode({ node: this.node, opacity: 255 })
        this._durationTicks = 0
    }

    update(ticks: number, pulseTick?: number) {
        if (pulseTick != null) this._pulseTick = pulseTick
        if (!this.node.active) return
        if (this._durationTicks >= ADVICE_DURATION_STAY) {
            this._applyLayout()
            this._drawBackdrop()
            return
        }

        this._durationTicks = Math.max(0, this._durationTicks - ticks)
        if (this._durationTicks === 0) {
            this.node.active = false
            return
        }

        this._applyLayout()
        this._drawBackdrop()
    }

    private _applyLayout() {
        const layout = this._layout()
        const labelWidth = this._width - 40
        this._label.color = layout.textColor
        this._label.renderer.fontSize = layout.fontSize
        this._label.renderer.lineSpacing = layout.lineHeight
        this._label.renderer.maxWidth = labelWidth
        this._label.renderer.forceRebuild()
        const text = this._measureText(layout.fontSize, labelWidth)
        // Grow upward beyond one hint line or two tutorial lines, preserving the bottom edge and padding.
        this._height = layout.height + Math.max(0, text.height - text.defaultHeight)
        uiNode({ node: this.node, size: { width: this._width, height: this._height } })
        this.node.setPosition(ADVICE_WIDTH / 2, -(layout.y + layout.height - this._height / 2), 0)
        uiNode({ node: this._label.node, size: { width: labelWidth, height: this._height }, anchor: { x: 0, y: 1 } })
        const textTop = layout.textOffsetY + Math.trunc((this._height - text.height) / 2) - text.ascentPadding
        this._label.node.setPosition(-labelWidth / 2, this._height / 2 - textTop, 0)
        this._syncTransform()
    }

    private _drawBackdrop() {
        const layout = this._layout()
        this._backdrop.clear()
        if (layout.backdropAlpha <= 0) return

        this._backdrop.fillColor = new Color(0, 0, 0, layout.backdropAlpha)
        this._backdrop.fillRect(-this._width / 2, -this._height / 2, this._width, this._height)
    }

    private _syncTransform() {
        this.node.setScale(1, 1, 1)
        uiNode({ node: this.node, opacity: 255 })
    }

    private _layout() {
        const alpha = this._pulseAlpha()
        switch (this._style) {
            case 'tutorial-level1':
            case 'tutorial-level1-stay':
                return {
                    y: ADVICE_TUTORIAL_LEVEL1_Y,
                    height: ADVICE_TUTORIAL_LEVEL1_HEIGHT,
                    textOffsetY: ADVICE_TEXT_OFFSET_Y,
                    textColor: new Color(253, 245, 173, alpha),
                    fontSize: ADVICE_TEXT_SIZE,
                    lineHeight: 0,
                    backdropAlpha: 128,
                }
            case 'tutorial-level2':
            case 'tutorial-later':
            case 'tutorial-later-stay':
                return {
                    y: ADVICE_TUTORIAL_LEVEL2_Y,
                    height: ADVICE_TUTORIAL_LEVEL2_HEIGHT,
                    textOffsetY: ADVICE_TEXT_OFFSET_Y,
                    textColor: new Color(253, 245, 173, alpha),
                    fontSize: ADVICE_TEXT_SIZE,
                    lineHeight: 0,
                    backdropAlpha: 128,
                }
            case 'hint-stay':
            case 'hint-long':
            case 'hint':
            default:
                return {
                    y: ADVICE_HINT_Y,
                    height: ADVICE_HINT_HEIGHT,
                    textOffsetY: ADVICE_TEXT_OFFSET_Y,
                    textColor: new Color(253, 245, 173, alpha),
                    fontSize: ADVICE_TEXT_SIZE,
                    lineHeight: 0,
                    backdropAlpha: 128,
                }
        }
    }

    private _measureText(fontSize: number, labelWidth: number) {
        const fontConfig = this._font?.config ?? null
        const metrics = FontMetricsUtil.getMetrics(fontConfig)
        if (metrics.height <= 0) {
            const height = this._label.renderer.contentHeight
            return { height, defaultHeight: height, ascentPadding: 0 }
        }

        const rawConfig = fontConfig?.json as { defaultPointSize?: number } | undefined
        const defaultPointSize = rawConfig?.defaultPointSize ?? fontSize
        const pointSize = fontSize > 0 ? fontSize : defaultPointSize
        const scale = defaultPointSize > 0 ? pointSize / defaultPointSize : 1
        const wrapped = FontMetricsUtil.measureWordWrapped(
            fontConfig,
            this._label.text,
            scale > 0 ? labelWidth / scale : labelWidth,
        )
        const lineCount = Math.max(1, wrapped.lineWidths.length)
        const wrappedHeight = (
            metrics.height - metrics.ascentPadding + Math.max(0, lineCount - 1) * metrics.lineSpacing
        ) * scale
        const defaultLines = this._style.startsWith('hint') ? 1 : 2
        return {
            height: wrappedHeight,
            defaultHeight: (metrics.height - metrics.ascentPadding + (defaultLines - 1) * metrics.lineSpacing) * scale,
            ascentPadding: metrics.ascentPadding * scale,
        }
    }

    private _durationForStyle(style: AdviceWidgetStyle) {
        switch (style) {
            case 'hint-long':
                return ADVICE_DURATION_LONG
            case 'hint-stay':
            case 'tutorial-level1-stay':
            case 'tutorial-later-stay':
                return ADVICE_DURATION_STAY
            case 'tutorial-level1':
            case 'tutorial-level2':
            case 'tutorial-later':
                return ADVICE_DURATION_FAST
            case 'hint':
            default:
                return ADVICE_DURATION_FAST
        }
    }

    private _pulseAlpha() {
        const t = (this._pulseTick % 75) / 75
        const peak = 1 - Math.abs(t * 2 - 1)
        return Math.round(ADVICE_TEXT_MIN_ALPHA + (255 - ADVICE_TEXT_MIN_ALPHA) * peak)
    }
}
