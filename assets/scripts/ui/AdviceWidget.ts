import { Color, Graphics, Node, UIOpacity } from 'cc'
import type { BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { createUINode, setUISize } from '@/ui/UIFactory'

export type AdviceWidgetStyle =
    | 'hint'
    | 'hint-stay'
    | 'tutorial-level1'
    | 'tutorial-level1-stay'
    | 'tutorial-level2'
    | 'tutorial-later'
    | 'tutorial-later-stay'

const ADVICE_HINT_Y = 527
const ADVICE_HINT_HEIGHT = 55
const ADVICE_TUTORIAL_LEVEL1_Y = 400
const ADVICE_TUTORIAL_LEVEL1_HEIGHT = 110
const ADVICE_TUTORIAL_LEVEL2_Y = 476
const ADVICE_TUTORIAL_LEVEL2_HEIGHT = 100
const ADVICE_WIDTH = 800
const ADVICE_DURATION_FAST = 500
const ADVICE_DURATION_STAY = 10000
const PVZ_NATIVE_FONT_SIZE = 0
const ADVICE_TEXT_SIZE = PVZ_NATIVE_FONT_SIZE
const ADVICE_TEXT_OFFSET_Y = -4
const ADVICE_TEXT_MIN_ALPHA = 192

export class AdviceWidget {
    readonly node: Node

    private readonly _font: BitmapFontAssets | null
    private readonly _backdrop: Graphics
    private readonly _label: FontRenderer
    private _durationTicks = 0
    private _style: AdviceWidgetStyle = 'hint'
    private _pulseTick = 0

    constructor(args: {
        parent: Node
        layer?: number
        font: BitmapFontAssets | null
    }) {
        this._font = args.font
        this.node = createUINode('AdviceWidget', {
            parent: args.parent,
            layer: args.layer,
            anchorX: 0.5,
            anchorY: 0.5,
            width: ADVICE_WIDTH,
            height: ADVICE_HINT_HEIGHT,
            x: ADVICE_WIDTH / 2,
            y: -(ADVICE_HINT_Y + ADVICE_HINT_HEIGHT / 2),
        })
        this._backdrop = this.node.addComponent(Graphics)
        this.node.addComponent(UIOpacity).opacity = 255

        const labelNode = createUINode('AdviceLabel', {
            parent: this.node,
            layer: args.layer,
            anchorX: 0,
            anchorY: 1,
            width: ADVICE_WIDTH - 40,
            height: ADVICE_HINT_HEIGHT,
        })
        this._label = labelNode.addComponent(FontRenderer)
        if (this._font) this._label.setFontAssets(this._font)
        this._label.fontSize = ADVICE_TEXT_SIZE
        this._label.lineSpacing = 0
        this._label.maxWidth = ADVICE_WIDTH - 40
        this._label.textAlign = 2
        this._label.string = ''
        this._label.forceRebuild()
        this.node.active = false
    }

    show(message: string, style: AdviceWidgetStyle = 'hint') {
        if (!this.node.isValid) return

        this._style = style
        this._durationTicks = this._durationForStyle(style)
        this._label.string = message
        this._label.forceRebuild()
        this._applyLayout()
        this.node.active = true
        this._drawBackdrop()
    }

    clear() {
        if (!this.node.isValid) return

        this._label.string = ''
        this._label.forceRebuild()
        this._backdrop.clear()
        this.node.active = false
        this.node.setScale(1, 1, 1)
        const opacity = this.node.getComponent(UIOpacity)
        if (opacity) opacity.opacity = 255
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
        const labelWidth = ADVICE_WIDTH - 40
        this._label.fontColor = layout.textColor
        this._label.fontSize = layout.fontSize
        this._label.lineSpacing = layout.lineHeight
        this._label.maxWidth = labelWidth
        this._label.textAlign = 2
        this._label.forceRebuild()
        setUISize(this.node, ADVICE_WIDTH, layout.height)
        this.node.setPosition(ADVICE_WIDTH / 2, -(layout.y + layout.height / 2), 0)
        setUISize(this._label.node, labelWidth, layout.height, 0, 1)
        this._label.node.setPosition(-labelWidth / 2, this._getTextLocalTopY(layout, labelWidth), 0)
        this._syncTransform()
    }

    private _drawBackdrop() {
        const layout = this._layout()
        this._backdrop.clear()
        if (layout.backdropAlpha <= 0) return

        this._backdrop.fillColor = new Color(0, 0, 0, layout.backdropAlpha)
        this._backdrop.fillRect(-ADVICE_WIDTH / 2, -layout.height / 2, ADVICE_WIDTH, layout.height)
    }

    private _syncTransform() {
        const opacity = this.node.getComponent(UIOpacity)
        this.node.setScale(1, 1, 1)
        if (opacity) opacity.opacity = 255
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

    private _getTextLocalTopY(layout: {
        y: number
        height: number
        textOffsetY: number
        fontSize: number
    }, labelWidth: number) {
        const fontConfig = this._font?.config ?? null
        const metrics = FontMetricsUtil.getMetrics(fontConfig)
        if (metrics.height <= 0) return this._label.contentHeight / 2 + layout.textOffsetY

        const rawConfig = fontConfig?.json as { defaultPointSize?: number } | undefined
        const defaultPointSize = rawConfig?.defaultPointSize ?? layout.fontSize
        const pointSize = layout.fontSize > 0 ? layout.fontSize : defaultPointSize
        const scale = defaultPointSize > 0 ? pointSize / defaultPointSize : 1
        const wrapped = FontMetricsUtil.measureWordWrapped(
            fontConfig,
            this._label.string,
            scale > 0 ? labelWidth / scale : labelWidth,
        )
        const lineCount = Math.max(1, wrapped.lineWidths.length)
        const wrappedHeight = (
            metrics.height - metrics.ascentPadding + Math.max(0, lineCount - 1) * metrics.lineSpacing
        ) * scale
        const centeredRectY = layout.y + layout.textOffsetY + Math.trunc((layout.height - wrappedHeight) / 2)
        const textTopY = centeredRectY - metrics.ascentPadding * scale
        return layout.y + layout.height / 2 - textTopY
    }

    private _durationForStyle(style: AdviceWidgetStyle) {
        switch (style) {
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
