import { Color, Component, gfx, Material, Node, Sprite, SpriteFrame, Vec3 } from 'cc'
import type { BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { UIButton } from '@/ui/Button'
import { createSpriteNode, createUINode, setUISize } from '@/ui/UIFactory'

export const SCREEN_WIDTH = 800
export const SCREEN_HEIGHT = 600
export const BUTTON_TEXT_HOVER_COLOR = new Color(250, 40, 40)

let additiveSpriteMaterial: Material | null = null

export abstract class MenuScreenBase extends Component {
    public onBackToMenu: (() => void) | null = null

    protected _root: Node | null = null
    private _renderPromise: Promise<void> | null = null

    start() {
        setUISize(this.node, SCREEN_WIDTH, SCREEN_HEIGHT)
        void this.ensureRendered()
    }

    abstract render(): Promise<void>

    ensureRendered(): Promise<void> {
        if (!this._renderPromise) {
            this._renderPromise = this.render().catch((error) => {
                this._renderPromise = null
                throw error
            })
        }
        return this._renderPromise
    }

    protected _resetRoot(name: string) {
        this._root?.destroy()
        this._root = createUINode(name, {
            parent: this.node,
            layer: this.node.layer,
        })
    }

    protected _createBackground(spriteFrame: SpriteFrame) {
        createSpriteNode({
            name: 'Background',
            spriteFrame,
            parent: this._root!,
            layer: this.node.layer,
            x: -SCREEN_WIDTH / 2,
            y: SCREEN_HEIGHT / 2,
            anchorX: 0,
            anchorY: 1,
        })
    }

    protected _createImageButton(args: {
        name: string
        x: number
        y: number
        normal: SpriteFrame
        hover: SpriteFrame
        pressed: SpriteFrame
        onClick: () => void
        pressSound?: SoundEffect | null
        clickSound?: SoundEffect | null
        pressOffset?: Vec3
        releaseToNormalOnPressOut?: boolean
    }) {
        const buttonNode = createUINode(args.name, {
            parent: this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
            width: args.normal.originalSize.width,
            height: args.normal.originalSize.height,
        })
        buttonNode.setPosition(this._cppX(args.x), this._cppY(args.y), 0)

        const sprite = buttonNode.addComponent(Sprite)
        sprite.trim = false
        sprite.sizeMode = Sprite.SizeMode.RAW
        sprite.spriteFrame = args.normal

        const button = buttonNode.addComponent(UIButton)
        button.normalSprite = args.normal
        button.hoverSprite = args.hover
        button.pressedSprite = args.pressed
        button.pressOffset = args.pressOffset ?? new Vec3(0, 0, 0)
        button.releaseToNormalOnPressOut = args.releaseToNormalOnPressOut ?? false
        button.onPress = () => {
            if (args.pressSound !== null) {
                void SoundLoader.play(args.pressSound ?? SoundEffect.ButtonClick)
            }
        }
        button.onClick = () => {
            if (args.clickSound !== null && args.clickSound !== undefined) {
                void SoundLoader.play(args.clickSound)
            }
            args.onClick()
            if (button.isValid) {
                button.refreshHoverFromPointer()
            }
        }
        return buttonNode
    }

    protected _createTextInNode(
        parent: Node,
        text: string,
        font: BitmapFontAssets | null,
        color: Color,
        centerX: number,
        centerY: number,
        hoverColor = BUTTON_TEXT_HOVER_COLOR,
        pressedOffsetX = 0,
        pressedOffsetY = 0,
    ) {
        const node = createUINode('Label', {
            parent,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        const renderer = node.addComponent(FontRenderer)
        if (font) renderer.setFontAssets(font)
        renderer.fontColor = color
        renderer.string = text
        renderer.forceRebuild()

        const metrics = FontMetricsUtil.getMetrics(font?.config ?? null)
        const width = FontMetricsUtil.measureTextWidth(font?.config ?? null, text) || renderer.contentWidth
        const normalX = centerX - width / 2
        const normalY = -(centerY - metrics.ascent / 2)
        node.setPosition(normalX, normalY, 0)

        const button = parent.getComponent(UIButton)
        button!.onStateChange = (state) => {
            renderer.fontColor = state === 'hover' || state === 'pressed' ? hoverColor : color
            node.setPosition(
                state === 'pressed' ? normalX + pressedOffsetX : normalX,
                state === 'pressed' ? normalY - pressedOffsetY : normalY,
                0,
            )
        }
    }

    protected _createText(args: {
        name: string
        text: string
        baselineX: number
        baselineY: number
        font: BitmapFontAssets | null
        color: Color
        align: 'left' | 'center' | 'right'
        maxWidth?: number
        parent?: Node
    }) {
        const node = createUINode(args.name, {
            parent: args.parent ?? this._root!,
            layer: this.node.layer,
            anchorX: 0,
            anchorY: 1,
        })
        const renderer = node.addComponent(FontRenderer)
        if (args.font) renderer.setFontAssets(args.font)
        renderer.fontColor = args.color
        renderer.string = args.text
        if (args.maxWidth != null) {
            renderer.maxWidth = args.maxWidth
            renderer.textAlign = 2
        }
        renderer.forceRebuild()

        const metrics = FontMetricsUtil.getMetrics(args.font?.config ?? null)
        const width =
            FontMetricsUtil.measureTextWidth(args.font?.config ?? null, args.text) ||
            renderer.contentWidth
        let x = args.baselineX
        if (args.align === 'center') x -= width / 2
        if (args.align === 'right') x -= width
        node.setPosition(this._cppX(x), this._cppY(args.baselineY - metrics.ascent), 0)
        return node
    }

    protected _applyAdditiveSpriteMaterial(node: Node) {
        const sprite = node.getComponent(Sprite)
        if (sprite) {
            sprite.customMaterial = this._getAdditiveSpriteMaterial()
        }
    }

    private _getAdditiveSpriteMaterial() {
        if (additiveSpriteMaterial) return additiveSpriteMaterial

        additiveSpriteMaterial = new Material()
        additiveSpriteMaterial.initialize({
            effectName: 'for2d/builtin-sprite',
            defines: {
                USE_TEXTURE: true,
            },
            states: {
                blendState: {
                    targets: [
                        {
                            blend: true,
                            blendSrc: gfx.BlendFactor.SRC_ALPHA,
                            blendDst: gfx.BlendFactor.ONE,
                            blendSrcAlpha: gfx.BlendFactor.SRC_ALPHA,
                            blendDstAlpha: gfx.BlendFactor.ONE,
                        },
                    ],
                },
            },
        })
        return additiveSpriteMaterial
    }

    protected _cppX(x: number) {
        return x - SCREEN_WIDTH / 2
    }

    protected _cppY(y: number) {
        return SCREEN_HEIGHT / 2 - y
    }
}
