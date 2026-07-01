import { Color, Node, Vec3, type EventMouse, type EventTouch, type SpriteFrame } from 'cc'
import type { BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { UIButton } from '@/ui/Button'
import { createSpriteNode, createUINode } from '@/ui/UIFactory'

export const SEED_CHOOSER_BUTTON_WIDTH = 156
export const SEED_CHOOSER_BUTTON_HEIGHT = 42
const SEED_CHOOSER_BUTTON_TEXT_OFFSET_Y = -1
const SEED_CHOOSER_SMALL_BUTTON_TEXT_OFFSET_Y = 1

export function createSeedChooserButton(args: {
    name: string
    parent: Node
    layer?: number
    label: string
    x: number
    y: number
    normal: SpriteFrame
    glow: SpriteFrame
    font: BitmapFontAssets | null
    color?: Color
    onClick?: (button: UIButton, event: EventMouse | EventTouch) => void
}) {
    const buttonNode = createSpriteNode({
        name: args.name,
        spriteFrame: args.normal,
        parent: args.parent,
        layer: args.layer,
        x: args.x,
        y: args.y,
        width: SEED_CHOOSER_BUTTON_WIDTH,
        height: SEED_CHOOSER_BUTTON_HEIGHT,
    })

    const glowNode = createSpriteNode({
        name: 'HoverGlow',
        spriteFrame: args.glow,
        parent: buttonNode,
        layer: args.layer,
        z: 2,
        anchorX: 0,
        anchorY: 1,
    })
    glowNode.active = false

    const label = createSeedChooserButtonLabel({
        parent: buttonNode,
        text: args.label,
        font: args.font,
        color: args.color ?? Color.WHITE,
        width: SEED_CHOOSER_BUTTON_WIDTH,
        height: SEED_CHOOSER_BUTTON_HEIGHT,
        textOffsetY: SEED_CHOOSER_BUTTON_TEXT_OFFSET_Y,
        layer: args.layer,
    })
    glowNode.setSiblingIndex(label.node.getSiblingIndex() + 1)

    const button = buttonNode.addComponent(UIButton)
    button.normalSprite = args.normal
    button.hoverSprite = args.normal
    button.pressedSprite = args.normal
    button.pressOffset = new Vec3(1, -1, 0)
    button.releaseToNormalOnPressOut = true
    button.onPress = () => void SoundLoader.play(SoundEffect.Tap)
    button.onClick = (event) => args.onClick?.(button, event)
    button.onStateChange = (state) => {
        glowNode.active = state === 'hover' || state === 'pressed'
        label.node.setPosition(label.baseX, label.baseY, 1)
    }

    return { node: buttonNode, button, label, glow: glowNode }
}

export function createSeedChooserSmallButton(args: {
    name: string
    parent: Node
    layer?: number
    label: string
    x: number
    y: number
    width?: number
    height?: number
    normal: SpriteFrame
    glow: SpriteFrame
    font: BitmapFontAssets | null
    color: Color
    onClick?: (button: UIButton, event: EventMouse | EventTouch) => void
}) {
    const width = args.width ?? args.normal.originalSize.width
    const height = args.height ?? args.normal.originalSize.height
    const buttonNode = createSpriteNode({
        name: args.name,
        spriteFrame: args.normal,
        parent: args.parent,
        layer: args.layer,
        x: args.x,
        y: args.y,
        width,
        height,
    })

    const label = createSeedChooserButtonLabel({
        parent: buttonNode,
        text: args.label,
        font: args.font,
        color: args.color,
        width,
        height,
        textOffsetY: SEED_CHOOSER_SMALL_BUTTON_TEXT_OFFSET_Y,
        layer: args.layer,
    })

    const button = buttonNode.addComponent(UIButton)
    button.normalSprite = args.normal
    button.hoverSprite = args.glow
    button.pressedSprite = args.glow
    button.pressOffset = new Vec3(0, 0, 0)
    button.releaseToNormalOnPressOut = true
    button.onPress = () => void SoundLoader.play(SoundEffect.Tap)
    button.onClick = (event) => args.onClick?.(button, event)
    button.onStateChange = (state) => {
        const pressed = state === 'pressed'
        label.node.setPosition(label.baseX + (pressed ? 1 : 0), label.baseY - (pressed ? 1 : 0), 1)
    }

    return { node: buttonNode, button, label }
}

function createSeedChooserButtonLabel(args: {
    parent: Node
    text: string
    font: BitmapFontAssets | null
    color: Color
    width: number
    height: number
    textOffsetY: number
    layer?: number
}) {
    const node = createUINode('Label', {
        parent: args.parent,
        layer: args.layer,
        anchorX: 0,
        anchorY: 1,
        z: 1,
    })
    const renderer = node.addComponent(FontRenderer)
    if (args.font) renderer.setFontAssets(args.font)
    renderer.fontColor = args.color
    renderer.string = args.text
    renderer.forceRebuild()

    const metrics = FontMetricsUtil.getMetrics(args.font?.config ?? null)
    const textWidth = FontMetricsUtil.measureTextWidth(args.font?.config ?? null, args.text) || renderer.contentWidth
    const baselineY = args.textOffsetY + (args.height - metrics.ascent / 6 + metrics.ascent - 1) / 2
    const baseX = (args.width - textWidth) / 2
    const baseY = -(baselineY - metrics.ascent)
    node.setPosition(baseX, baseY, 1)
    return { node, renderer, baseX, baseY }
}
