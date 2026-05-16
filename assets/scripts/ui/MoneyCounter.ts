import { Color, Node, SpriteFrame, UIOpacity } from 'cc'
import type { BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { createSpriteNode, createUINode } from '@/ui/UIFactory'

const MONEY_COUNTER_COLOR = new Color(180, 255, 90)
const DEFAULT_TEXT_RIGHT_OFFSET = 113
const TEXT_BASELINE_Y = 24

export function formatPvzMoney(coins: number) {
    const value = Math.max(0, Math.floor(coins)) * 10
    if (value > 999999) {
        const millions = Math.floor(value / 1000000)
        const thousands = formatThreeDigits(Math.floor(value / 1000) % 1000)
        const ones = formatThreeDigits(value % 1000)
        return `$${millions},${thousands},${ones}`
    }
    if (value > 999) {
        return `$${Math.floor(value / 1000)},${formatThreeDigits(value % 1000)}`
    }
    return `$${value}`
}

function formatThreeDigits(value: number) {
    const normalized = Math.max(0, Math.floor(value))
    if (normalized < 10) return `00${normalized}`
    if (normalized < 100) return `0${normalized}`
    return `${normalized}`
}

export interface MoneyCounterOptions {
    parent: Node
    layer: number
    coinBank: SpriteFrame
    font: BitmapFontAssets | null
    amount?: number
    x: number
    y: number
    active?: boolean
    textRightOffset?: number
}

export class MoneyCounter {
    public readonly node: Node

    private readonly _font: BitmapFontAssets | null
    private readonly _label: FontRenderer
    private readonly _textRightOffset: number
    private readonly _opacity: UIOpacity
    private _amount = Number.NaN

    constructor(args: MoneyCounterOptions) {
        this._font = args.font
        this._textRightOffset = args.textRightOffset ?? DEFAULT_TEXT_RIGHT_OFFSET

        this.node = createUINode('MoneyCounter', {
            parent: args.parent,
            layer: args.layer,
            anchorX: 0,
            anchorY: 1,
            width: args.coinBank.originalSize.width,
            height: args.coinBank.originalSize.height,
            x: args.x,
            y: args.y,
            active: args.active ?? true,
        })
        this._opacity = this.node.addComponent(UIOpacity)

        createSpriteNode({
            name: 'CoinBank',
            spriteFrame: args.coinBank,
            parent: this.node,
            layer: args.layer,
            x: 0,
            y: 0,
            anchorX: 0,
            anchorY: 1,
        })

        const labelNode = createUINode('Money', {
            parent: this.node,
            layer: args.layer,
            anchorX: 0,
            anchorY: 1,
        })
        this._label = labelNode.addComponent(FontRenderer)
        if (this._font) this._label.setFontAssets(this._font)
        this._label.fontColor = MONEY_COUNTER_COLOR
        this.setAmount(args.amount ?? 0)
    }

    setAmount(amount: number) {
        const normalized = Math.max(0, Math.floor(amount))
        if (this._amount === normalized) return

        this._amount = normalized
        const text = formatPvzMoney(normalized)
        this._label.string = text
        this._label.forceRebuild()

        const metrics = FontMetricsUtil.getMetrics(this._font?.config ?? null)
        const width = FontMetricsUtil.measureTextWidth(this._font?.config ?? null, text) || this._label.contentWidth
        this._label.node.setPosition(
            this._textRightOffset - width,
            -(TEXT_BASELINE_Y - metrics.ascent),
            0,
        )
    }

    setOpacity(opacity: number) {
        this._opacity.opacity = Math.max(0, Math.min(255, Math.round(opacity)))
    }
}
