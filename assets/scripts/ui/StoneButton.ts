import { Node, Vec3, type SpriteFrame } from 'cc'
import type { BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { UIButton } from '@/ui/Button'
import { buildThreeSliceRow, createUINode } from '@/ui/UIFactory'

export interface StoneButtonSprites {
    left: SpriteFrame
    middle: SpriteFrame
    right: SpriteFrame
    downLeft: SpriteFrame
    downMiddle: SpriteFrame
    downRight: SpriteFrame
}

export interface StoneButtonFonts {
    normal: BitmapFontAssets | null
    highlight: BitmapFontAssets | null
}

export function createStoneButton(args: {
    name: string
    parent: Node
    layer?: number
    label: string
    x: number
    y: number
    width: number
    height?: number
    sprites: StoneButtonSprites
    fonts: StoneButtonFonts
    onClick?: () => void
    rightClickTriggers?: boolean
}) {
    const height = args.height ?? args.sprites.left.originalSize.height
    const buttonNode = createUINode(args.name, {
        parent: args.parent,
        layer: args.layer,
        anchorX: 0,
        anchorY: 1,
        width: args.width,
        height,
    })
    buttonNode.setPosition(args.x, args.y, 0)

    const normalRow = buildThreeSliceRow({
        name: 'Normal',
        width: args.width,
        left: args.sprites.left,
        middle: args.sprites.middle,
        right: args.sprites.right,
        layer: args.layer,
        anchorX: 0,
        anchorY: 1,
    })
    normalRow.setParent(buttonNode)

    const pressedRow = buildThreeSliceRow({
        name: 'Pressed',
        width: args.width,
        left: args.sprites.downLeft,
        middle: args.sprites.downMiddle,
        right: args.sprites.downRight,
        layer: args.layer,
        anchorX: 0,
        anchorY: 1,
    })
    pressedRow.setParent(buttonNode)
    pressedRow.setPosition(1, 0, 0)
    pressedRow.active = false

    const labels = createStoneButtonLabels(
        buttonNode,
        args.label,
        args.fonts,
        args.width,
        height,
        args.layer,
    )

    const button = buttonNode.addComponent(UIButton)
    button.rightClickTriggers = args.rightClickTriggers ?? true
    button.pressOffset = new Vec3(0, 0, 0)
    button.releaseToNormalOnPressOut = true
    button.onPress = () => {
        void SoundLoader.play(SoundEffect.GraveButton)
    }
    button.onClick = () => args.onClick?.()
    button.onStateChange = (state) => {
        const pressed = state === 'pressed'
        const highlighted = state === 'hover' || pressed
        normalRow.active = !pressed
        pressedRow.active = pressed
        labels.normal.active = !highlighted
        labels.highlight.active = highlighted
        labels.normal.setPosition(labels.normalPos)
        labels.highlight.setPosition(
            labels.highlightPos.x + (pressed ? 1 : 0),
            labels.highlightPos.y - (pressed ? 1 : 0),
            0,
        )
    }

    return buttonNode
}

function createStoneButtonLabels(
    parent: Node,
    text: string,
    fonts: StoneButtonFonts,
    buttonWidth: number,
    buttonHeight: number,
    layer?: number,
) {
    const normal = createStoneButtonLabel(parent, 'Label', text, fonts.normal, layer)
    const highlight = createStoneButtonLabel(parent, 'LabelHighlight', text, fonts.highlight, layer)
    const normalPos = getStoneButtonLabelPosition(text, fonts.normal, buttonWidth, buttonHeight)
    const highlightPos = getStoneButtonLabelPosition(
        text,
        fonts.highlight ?? fonts.normal,
        buttonWidth,
        buttonHeight,
    )

    normal.setPosition(normalPos)
    highlight.setPosition(highlightPos)
    highlight.active = false
    return { normal, highlight, normalPos, highlightPos }
}

function createStoneButtonLabel(
    parent: Node,
    name: string,
    text: string,
    font: BitmapFontAssets | null,
    layer?: number,
) {
    const label = createUINode(name, {
        parent,
        layer,
        anchorX: 0,
        anchorY: 1,
    })
    const renderer = label.addComponent(FontRenderer)
    if (font) renderer.setFontAssets(font)
    renderer.string = text
    renderer.forceRebuild()
    return label
}

function getStoneButtonLabelPosition(
    text: string,
    font: BitmapFontAssets | null,
    buttonWidth: number,
    buttonHeight: number,
) {
    const metrics = FontMetricsUtil.getMetrics(font?.config ?? null)
    const width = FontMetricsUtil.measureTextWidth(font?.config ?? null, text)
    const baselineY = (buttonHeight - metrics.ascent / 6 - 1 + metrics.ascent) / 2 - 4
    return new Vec3((buttonWidth - width) / 2 + 1, -(baselineY - metrics.ascent), 0)
}
