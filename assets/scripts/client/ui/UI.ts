import { BlockInputEvents, Button, Canvas, Color, gfx, Material, Node, Sprite, UITransform, type SpriteFrame } from 'cc'
import { FontMetricsUtil } from '@/client/font'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { uiNode } from '@/client/view/uiNode'
import { applySpriteDensity } from '@/client/content/SpriteDensity'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { loadUIAssets, type UIAssets, type UIFont } from './UIAssets'
import { UIButton, type UIButtonPolygon, type UIButtonState } from './UIButton'
import { UIDialog } from './UIDialog'
import { UILabel, type UILabelOptions } from './UILabel'
import { UISlider } from './UISlider'
import { UIInput, type UIInputOptions } from './UIInput'
import { UIScroll, type UIScrollOptions } from './UIScroll'
import { UITooltip, type UITooltipOptions } from './UITooltip'

interface Box { x?: number, y?: number, width?: number, height?: number }
/** LawnDialog's mSpaceAfterHeader (1073 0x45a5be, 1096 0x45cd2e); Dialog itself uses 10. */
const DIALOG_SPACE_AFTER_HEADER = 3

export type UIButtonSkin = 'stone' | 'back' | 'seed' | 'seedSmall' | 'almanacIndex' | 'almanacClose' | 'image'
export interface UIButtonImages {
    normal: SpriteFrame
    hover?: SpriteFrame
    pressed?: SpriteFrame
    disabled?: SpriteFrame
}
export interface UIButtonOptions extends Box {
    disabledColor?: Color
    text?: string
    skin?: UIButtonSkin
    images?: UIButtonImages
    /** Image bounds relative to the hit area; defaults to filling the button. */
    imageBox?: Box
    polygon?: UIButtonPolygon
    /** A UI font name or loaded font; with hoverFont the stone and back skins' lit text can differ. */
    font?: UIFont | BitmapFontAssets
    hoverFont?: UIFont | BitmapFontAssets
    color?: Color
    enabled?: boolean
    rightClickTriggers?: boolean
    rightClickPressesVisual?: boolean
    releaseToNormalOnPressOut?: boolean
    refreshHoverOnEnable?: boolean
    clickOnPress?: boolean
    /** Visual offset on press, in pixels: x right, y down. Hit area stays fixed. */
    pressOffset?: readonly [number, number]
    pressSound?: SoundEffect | null
    clickSound?: SoundEffect | null
    hoverSound?: SoundEffect | null
    tooltip?: string | UITooltipOptions
    onClick?: () => void
}
export interface UIDialogOptions {
    title?: string
    message?: string
    width?: number
    height?: number
    extraWidth?: number
    extraHeight?: number
    tall?: boolean
    centerMessage?: boolean
    contentInsetTopExtra?: number
    /** LawnDialog sets 3 instead of Dialog's 10 (1073 and 1096). */
    spaceAfterHeader?: number
    background?: SpriteFrame
    footer?: boolean
    confirmText?: string
    cancelText?: string
    /** Up to two action buttons, with an optional third footer button. */
    buttons?: readonly { text: string, onClick: (dialog: UIDialog) => void }[]
    /** Footer release and keyboard confirmation/cancellation sound. */
    clickSound?: SoundEffect | null
    onClose?: (confirmed: boolean) => void
}

/** Controls use parent-local pixels: x points right, y points down. */
export class UI {
    private glowMaterial?: Material

    static async load(): Promise<UI> { return new UI(await loadUIAssets()) }

    constructor(readonly assets: UIAssets) {}

    /** Every key lives in the string tables (base, text packs, Mods); a missing one shows the key and logs. */
    text(key: string): string {
        const value = this.assets.strings[key]
        if (value !== undefined) return value
        console.error(`[UI] Missing string: ${key}`)
        return key
    }

    /** A table string with its %s/%d placeholders filled by args in order, like the original's StrFormat. */
    format(key: string, args: readonly string[] = []): string {
        let index = 0
        return this.text(key).replace(/%[sd]/g, match => index < args.length ? args[index++] : match)
    }

    /** The installed text's language, for content such as images with words in them. */
    get locale(): string { return this.assets.locale }

    label(parent: Node, options: UILabelOptions & { font?: UIFont | BitmapFontAssets }): UILabel {
        const font = typeof options.font === 'object' ? options.font : this.assets.fonts[options.font ?? 'label']
        return new UILabel(parent, font, options)
    }

    tooltip(anchor: Node, options: string | UITooltipOptions): UITooltip {
        const tooltip = anchor.addComponent(UITooltip)
        tooltip.initialize(this, typeof options === 'string' ? { text: options } : options)
        return tooltip
    }

    image(parent: Node, frame: SpriteFrame, box: Box = {}): Sprite {
        return uiNode({
            name: 'Image', parent, anchor: { x: 0, y: 1 },
            position: { x: box.x ?? 0, y: -(box.y ?? 0) },
            size: { width: box.width ?? frame.originalSize.width, height: box.height ?? frame.originalSize.height },
            sprite: { frame, sizeMode: Sprite.SizeMode.CUSTOM, trim: false },
        }).sprite!
    }

    additiveImage(parent: Node, frame: SpriteFrame, box: Box = {}, opacity = 255): Sprite {
        const sprite = this.image(parent, frame, box)
        sprite.customMaterial = this.seedGlowMaterial()
        sprite.color = new Color(255, 255, 255, opacity)
        return sprite
    }

    button(parent: Node, options: UIButtonOptions): UIButton {
        const skin = options.skin ?? (options.images ? 'image' : 'stone')
        const back = skin === 'back'
        const stone = skin === 'stone'
        const seed = skin === 'seed' || skin === 'seedSmall'
        const footer = skin === 'almanacIndex' || skin === 'almanacClose'
        const sprites = this.assets.sprites
        const images = options.images ?? (back ? {
            normal: sprites.options_backtogamebutton0, pressed: sprites.options_backtogamebutton2,
        } : skin === 'seed' ? {
            normal: sprites.seedchooser_button, disabled: sprites.seedchooser_button_disabled,
        } : skin === 'seedSmall' ? {
            normal: sprites.seedchooser_button2, hover: sprites.seedchooser_button2_glow,
        } : skin === 'almanacIndex' ? {
            normal: sprites.almanac_indexbutton, hover: sprites.almanac_indexbuttonhighlight,
        } : skin === 'almanacClose' ? {
            normal: sprites.almanac_closebutton, hover: sprites.almanac_closebuttonhighlight,
        } : undefined)
        if (!stone && !images) throw new Error('Image buttons require images.normal')
        const stateImages = images && {
            normal: images.normal,
            hover: images.hover ?? images.normal,
            pressed: images.pressed ?? images.hover ?? images.normal,
            disabled: images.disabled ?? images.normal,
        }
        const width = options.width ?? images?.normal.originalSize.width ?? 180
        const height = options.height ?? images?.normal.originalSize.height ?? 46
        const node = this.box(parent, options.text || 'Button', { ...options, width, height })
        node.active = false
        const visual = this.box(node, 'Visual', { width, height })
        const imageBox = { width, height, ...options.imageBox }
        let normal: Node | undefined
        let down: Node | undefined
        let image: Sprite | undefined
        if (stone && !images) {
            normal = this.box(visual, 'Normal', imageBox)
            down = this.box(visual, 'Pressed', { ...imageBox, x: (imageBox.x ?? 0) + 1 })
            this.stoneRow(normal, imageBox.width, imageBox.height, false)
            this.stoneRow(down, imageBox.width, imageBox.height, true)
        } else image = this.image(visual, images!.normal, imageBox)
        const normalFont = options.font ?? (back ? 'large' : stone ? 'button' : skin === 'seedSmall' || footer ? 'small' : 'body')
        const hoverFont = options.hoverFont ?? options.font ?? (back ? 'largeHover' : stone ? 'buttonHover' : normalFont)
        const fonts = normalFont === hoverFont ? [normalFont] : [normalFont, hoverFont]
        const color = options.color ?? (skin === 'seed' ? new Color(213, 159, 43)
            : skin === 'seedSmall' || footer ? new Color(42, 42, 90) : undefined)
        const textOffsetX = { stone: 1, back: -2, seed: 0, seedSmall: 0, almanacIndex: 8, almanacClose: -8, image: 0 }[skin]
        const textOffsetY = { stone: -4, back: -5, seed: -1, seedSmall: 1, almanacIndex: 1, almanacClose: 1, image: 0 }[skin]
        const labels = fonts.map(font => {
            const ascent = FontMetricsUtil.getMetrics((typeof font === 'object' ? font : this.assets.fonts[font]).config).ascent
            const baseline = back
                ? -5 + Math.trunc((height - Math.trunc(ascent / 6) + ascent - 1) / 2)
                : (height - ascent / 6 - 1 + ascent) / 2 + textOffsetY
            return this.label(visual, {
                text: options.text ?? '', font, color, align: 'center', baseline: true,
                x: width / 2 + textOffsetX, y: baseline,
            })
        })
        const glow = skin === 'seed' ? this.image(visual, sprites.seedchooser_button_glow, { width, height }) : undefined
        if (glow) glow.customMaterial = this.seedGlowMaterial()
        const button = node.addComponent(UIButton)
        let labelPositions = labels.map(label => label.node.position.clone())
        let currentState: UIButtonState = 'normal'
        const pressOffset = options.pressOffset ?? (skin === 'seed' || footer ? [1, 1] : [0, 0])
        const pressSound = options.pressSound === undefined
            ? seed || footer ? SoundEffect.Tap : stone || back ? SoundEffect.GraveButton : SoundEffect.ButtonClick
            : options.pressSound
        const clickSound = options.clickSound ?? null
        button.polygon = options.polygon ?? []
        button.rightClickTriggers = options.rightClickTriggers ?? true
        button.rightClickPressesVisual = options.rightClickPressesVisual ?? !footer
        button.releaseToNormalOnPressOut = options.releaseToNormalOnPressOut ?? skin !== 'image'
        button.refreshHoverOnEnable = options.refreshHoverOnEnable ?? true
        button.clickOnPress = options.clickOnPress ?? false
        button.onHoverEnter = () => { if (options.hoverSound) void SoundSystem.play(options.hoverSound) }
        if (options.tooltip) {
            const tooltip = this.tooltip(node, options.tooltip)
            button.onHoverChange = hovering => hovering ? tooltip.show() : tooltip.hide()
        }
        button.pressSound = pressSound
        button.onClick = options.onClick ?? (() => {})
        button.setText = text => {
            for (const label of labels) label.text = text
            labelPositions = labels.map(label => label.node.position.clone())
            button.onStateChange?.(currentState)
        }
        button.onStateChange = state => {
            currentState = state
            const pressed = state === 'pressed'
            const highlighted = pressed || state === 'hover'
            if (normal && down) { normal.active = !pressed; down.active = pressed }
            if (image && stateImages) image.spriteFrame = stateImages[state]
            if (glow) glow.node.active = highlighted
            visual.setPosition(pressed ? pressOffset[0] : 0, pressed ? -pressOffset[1] : 0)
            labels.forEach((label, index) => {
                if (options.disabledColor) label.color = state === 'disabled' ? options.disabledColor : color ?? Color.WHITE
                label.node.active = index === (highlighted ? labels.length - 1 : 0)
                label.node.setPosition(
                    labelPositions[index].x + (pressed && (stone || skin === 'seedSmall') ? 1 : 0),
                    labelPositions[index].y - (pressed && (stone || back || skin === 'seedSmall') ? 1 : 0),
                )
            })
            uiNode({ node, opacity: state === 'disabled' && !images?.disabled ? 128 : 255 })
        }
        button.onStateChange('normal')
        button.interactable = options.enabled ?? true
        if (clickSound !== null) node.on(Button.EventType.CLICK, () => { void SoundSystem.play(clickSound) })
        node.active = true
        return button
    }

    private seedGlowMaterial(): Material {
        if (!this.glowMaterial) {
            this.glowMaterial = new Material()
            this.glowMaterial.initialize({
                effectName: 'for2d/builtin-sprite', defines: { USE_TEXTURE: true },
                states: { blendState: { targets: [{
                    blend: true, blendSrc: gfx.BlendFactor.SRC_ALPHA, blendDst: gfx.BlendFactor.ONE,
                    blendSrcAlpha: gfx.BlendFactor.SRC_ALPHA, blendDstAlpha: gfx.BlendFactor.ONE,
                }] } },
            })
        }
        return this.glowMaterial
    }

    checkbox(parent: Node, options: Box & {
        value: boolean, onChange?: (value: boolean) => void, locked?: () => void,
    }) {
        const node = this.box(parent, 'Checkbox', { ...options, width: 46, height: 45 })
        node.active = false
        const sprite = this.image(node, this.assets.sprites.options_checkbox0)
        let value = options.value
        const setValue = (next: boolean) => {
            value = next
            sprite.spriteFrame = this.assets.sprites[next ? 'options_checkbox1' : 'options_checkbox0']
        }
        const button = node.addComponent(UIButton)
        button.touchSlide = false
        button.clickOnPress = true
        button.pressSound = SoundEffect.ButtonClick
        button.onClick = () => {
            if (options.locked) options.locked()
            else { setValue(!value); options.onChange?.(value) }
        }
        setValue(value)
        node.active = true
        return { node, button, get value() { return value }, set value(next: boolean) { setValue(next) } }
    }

    slider(parent: Node, options: Box & { value: number, onChange?: (value: number) => void }): UISlider {
        const width = options.width ?? 135
        const node = this.box(parent, 'Slider', { ...options, width, height: 40 })
        this.image(node, this.assets.sprites.options_sliderslot, { y: 14, width })
        const knob = this.image(node, this.assets.sprites.options_sliderknob2, { y: 5 }).node
        const slider = node.addComponent(UISlider)
        slider.knob = knob
        slider.width = width
        slider.knobWidth = this.assets.sprites.options_sliderknob2.originalSize.width
        slider.onChange = options.onChange ?? (() => {})
        slider.value = options.value
        return slider
    }

    scroll(parent: Node, options: Box & UIScrollOptions): UIScroll {
        const node = this.box(parent, 'Scroll', options)
        node.active = false
        const scroll = node.addComponent(UIScroll)
        scroll.initialize(options)
        node.active = true
        return scroll
    }

    input(parent: Node, options: Box & UIInputOptions & { font?: UIFont } = {}): UIInput {
        let ancestor: Node | null = GameDebugSettings.isMobileMode() ? parent : null
        while (ancestor && !ancestor.getComponent(UIDialog)) ancestor = ancestor.parent
        const panel = ancestor?.getComponent(UIDialog)?.content
        if (panel) {
            panel.setPosition(panel.position.x, Math.min(280, panel.getComponent(UITransform)!.height / 2 + 100), panel.position.z)
        }
        const node = this.box(parent, 'Input', { ...options, width: options.width ?? 260, height: options.height ?? 36 })
        node.active = false
        const frame = this.assets.sprites.editbox.clone()
        frame.insetLeft = frame.insetRight = Math.floor(frame.originalSize.width / 3)
        frame.insetTop = frame.insetBottom = Math.floor(frame.originalSize.height / 3)
        applySpriteDensity(frame)
        this.image(node, frame, { width: options.width ?? 260, height: options.height ?? 36 }).type = Sprite.Type.SLICED
        node.once(Node.EventType.NODE_DESTROYED, () => frame.destroy())
        const input = node.addComponent(UIInput)
        input.initialize(this.assets.fonts[options.font ?? 'profile'], options)
        node.active = true
        return input
    }

    select(parent: Node, options: Box & {
        items: readonly string[], value: number, onChange?: (value: number) => void,
    }) {
        let value = Math.max(0, Math.min(options.items.length - 1, options.value))
        const button = this.button(parent, { ...options, text: options.items[value] ?? '' })
        const setValue = (next: number) => {
            value = Math.max(0, Math.min(options.items.length - 1, next))
            button.setText(options.items[value] ?? '')
        }
        button.onClick = () => {
            const dialog = this.dialog(parent, { width: 320, height: 130 + options.items.length * 48, footer: false })
            options.items.forEach((text, index) => this.button(dialog.content, {
                text, x: 55, y: 80 + index * 48, width: 210,
                onClick: () => { setValue(index); dialog.close(true); options.onChange?.(value) },
            }))
        }
        button.interactable = options.items.length > 0
        return { node: button.node, button, get value() { return value }, set value(next: number) { setValue(next) } }
    }

    dialog(parent: Node, options: UIDialogOptions = {}): UIDialog {
        const titleFont = this.assets.fonts.title.config
        const bodyFont = this.assets.fonts.body.config
        const titleMetrics = FontMetricsUtil.getMetrics(titleFont)
        const { width, height } = options.background
            ? { width: options.width ?? options.background.originalSize.width, height: options.height ?? options.background.originalSize.height }
            : this.dialogSize(options)
        const root = uiNode({ name: 'Dialog', parent, active: false, viewport: true }).node
        let canvas = parent
        while (canvas.parent && !canvas.getComponent(Canvas)) canvas = canvas.parent
        root.setWorldPosition(canvas.worldPosition)
        root.setWorldScale(canvas.worldScale)
        root.addComponent(BlockInputEvents)
        const panel = this.box(root, 'Panel', { x: -width / 2, y: -height / 2, width, height })
        panel.addComponent(BlockInputEvents)
        if (options.background) this.image(panel, options.background, { width, height })
        else this.dialogFrame(panel, width, height, options.tall)
        const dialog = root.addComponent(UIDialog)
        dialog.content = panel
        dialog.onClose = options.onClose
        dialog.clickSound = options.clickSound ?? null
        const textColor = new Color(0xe0, 0xbb, 0x62)
        let textTop = 80 + (options.contentInsetTopExtra ?? 0)
        // Dialog::WriteCenteredLine: (mWidth - width) / 2 in integers.
        if (options.title) this.label(panel, {
            text: options.title, font: 'title', y: textTop - titleMetrics.ascentPadding, color: textColor,
            x: Math.trunc((width - FontMetricsUtil.measureTextWidth(titleFont, options.title)) / 2),
        })
        if (options.title) textTop += titleMetrics.height - titleMetrics.ascentPadding + (options.spaceAfterHeader ?? DIALOG_SPACE_AFTER_HEADER)
        if (options.message) {
            const textWidth = width - 86
            const textHeight = FontMetricsUtil.measureWordWrappedHeight(bodyFont, options.message, textWidth)
            const areaHeight = height - 36 - 24 - textTop - 55 - (options.tall ? 36 : 0)
            this.label(panel, {
                text: options.message, font: 'body', x: 38, width: textWidth, align: 'center', color: textColor,
                y: textTop + (options.centerMessage === false ? 0 : Math.trunc((areaHeight - textHeight) / 2))
                    - FontMetricsUtil.getMetrics(bodyFont).ascentPadding,
            })
        }
        if (options.footer !== false) {
            const buttons = options.buttons ?? [
                { text: options.confirmText ?? this.text('DIALOG_BUTTON_OK'), onClick: (dialog: UIDialog) => dialog.onConfirm() },
                ...(options.cancelText ? [{ text: options.cancelText, onClick: (dialog: UIDialog) => dialog.onCancel() }] : []),
            ]
            const count = buttons.length
            const areaWidth = width - 74
            const minimum = this.assets.sprites.button_left.originalSize.width + this.assets.sprites.button_right.originalSize.width
            const tileWidth = this.assets.sprites.button_middle.originalSize.width
            buttons.forEach((button, index) => {
                const fullWidth = count === 1 || index === 2
                const extra = fullWidth ? areaWidth - tileWidth - minimum + 1
                    : Math.floor((areaWidth - 10) / 2) - tileWidth - minimum + 1
                const buttonWidth = minimum + Math.ceil(Math.max(0, extra) / tileWidth) * tileWidth
                this.button(panel, {
                    text: button.text, color: new Color(213, 255, 196),
                    x: 31 + (fullWidth ? Math.floor((areaWidth - buttonWidth) / 2) : index * (areaWidth - buttonWidth)),
                    y: height - (options.tall ? 75 : 80) - (count === 3 && index < 2 ? 46 : 0), width: buttonWidth,
                    clickSound: options.clickSound,
                    onClick: () => button.onClick(dialog),
                })
            })
        }
        root.active = true
        return dialog
    }

    private box(parent: Node, name: string, box: Box): Node {
        return uiNode({
            name, parent, anchor: { x: 0, y: 1 },
            position: { x: box.x ?? 0, y: -(box.y ?? 0) },
            size: { width: box.width ?? 0, height: box.height ?? 0 },
        }).node
    }

    private stoneRow(parent: Node, width: number, height: number, pressed: boolean): void {
        const prefix = pressed ? 'button_down_' : 'button_'
        const frames = ['left', 'middle', 'right'].map(side => this.assets.sprites[`${prefix}${side}`])
        const left = frames[0].originalSize.width
        const end = width - frames[2].originalSize.width
        this.image(parent, frames[0], { height })
        for (let x = left; x < end; x += frames[1].originalSize.width) {
            this.image(parent, frames[1], { x, width: Math.min(frames[1].originalSize.width, end - x), height })
        }
        this.image(parent, frames[2], { x: end, height })
    }

    private dialogSize(options: UIDialogOptions): { width: number, height: number } {
        const sprites = this.assets.sprites
        const topWidth = sprites.dialog_topleft.originalSize.width + sprites.dialog_topright.originalSize.width
        const tileWidth = sprites.dialog_topmiddle.originalSize.width
        const title = this.assets.fonts.title.config
        const titleMetrics = FontMetricsUtil.getMetrics(title)
        const titleWidth = 82 + (options.extraWidth ?? 0) + FontMetricsUtil.measureTextWidth(title, options.title ?? '')
        const naturalWidth = topWidth + Math.max(1, Math.ceil((titleWidth - topWidth) / tileWidth)) * tileWidth + (options.message ? tileWidth : 0)
        const width = topWidth + Math.max(1, Math.ceil(((options.width ?? naturalWidth) - topWidth) / tileWidth)) * tileWidth
        // LawnDialog::CalcSize adds the 24px button height plus 8 (1073 0x45a9ea, 1096 0x45d270).
        let contentHeight = 35 + 36 + 45 + 24 + 8 + (options.extraHeight ?? 0) + (options.contentInsetTopExtra ?? 0)
        if (options.title) contentHeight += titleMetrics.height - titleMetrics.ascentPadding + (options.spaceAfterHeader ?? DIALOG_SPACE_AFTER_HEADER)
        if (options.message) contentHeight += FontMetricsUtil.measureWordWrappedHeight(
            this.assets.fonts.body.config, options.message, width - 86,
        ) + 30
        const borderHeight = 45 + sprites.dialog_topleft.originalSize.height + sprites[options.tall ? 'dialog_bigbottomleft' : 'dialog_bottomleft'].originalSize.height
        const tileHeight = sprites.dialog_centerleft.originalSize.height
        const height = borderHeight + Math.ceil(Math.max(0, Math.max(contentHeight, options.height ?? 0) - borderHeight) / tileHeight) * tileHeight
        return { width, height }
    }

    private dialogFrame(parent: Node, width: number, height: number, tall = false): void {
        const sprites = this.assets.sprites
        const repeatX = Math.round((width - sprites.dialog_topleft.originalSize.width - sprites.dialog_topright.originalSize.width) / sprites.dialog_topmiddle.originalSize.width)
        const repeatY = Math.round((height - 45 - sprites.dialog_topleft.originalSize.height - sprites[tall ? 'dialog_bigbottomleft' : 'dialog_bottomleft'].originalSize.height) / sprites.dialog_centerleft.originalSize.height)
        const row = (name: 'top' | 'center' | 'bottom', y: number) => {
            const prefix = name === 'bottom' && tall ? 'dialog_bigbottom' : `dialog_${name}` as const
            const left = sprites[`${prefix}left`]
            const middle = sprites[`${prefix}middle`]
            this.image(parent, left, { y })
            for (let index = 0; index < repeatX; index++) {
                this.image(parent, middle, { x: left.originalSize.width + index * middle.originalSize.width, y })
            }
            this.image(parent, sprites[`${prefix}right`], { x: left.originalSize.width + repeatX * middle.originalSize.width, y })
        }
        row('top', 45)
        const centerY = 45 + sprites.dialog_topleft.originalSize.height
        for (let index = 0; index < repeatY; index++) row('center', centerY + index * sprites.dialog_centerleft.originalSize.height)
        row('bottom', centerY + repeatY * sprites.dialog_centerleft.originalSize.height)
        this.image(parent, sprites.dialog_header, { x: (width - sprites.dialog_header.originalSize.width) / 2 - 5 })
    }
}
