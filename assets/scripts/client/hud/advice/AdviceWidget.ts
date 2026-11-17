import { Color, Graphics, Node } from 'cc'
import { uiNode } from '@/client/view/uiNode'
import { fitViewport } from '@/client/view/ClientViewport'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import { FontMetricsUtil } from '@/client/font'
import type { UI } from '@/client/ui/UI'
import type { UILabel } from '@/client/ui/UILabel'
import { loadedReanim, prepareReanims } from '@/client/reanim/ReanimAssets'
import { ASSET_FPS } from '@/shared/content/animation'
import { sampleReanimTrack } from '@/shared/content/reanim'
import type { AdviceWidgetSnapshot, AdviceWidgetStyle } from './AdviceWidgetSnapshot'

export type { AdviceWidgetSnapshot, AdviceWidgetStyle } from './AdviceWidgetSnapshot'

const ADVICE_HINT_Y = 527
const ADVICE_HINT_HEIGHT = 55
const ADVICE_TUTORIAL_LEVEL1_Y = 400
const ADVICE_TUTORIAL_LEVEL1_HEIGHT = 110
const ADVICE_TUTORIAL_LEVEL2_Y = 476
const ADVICE_TUTORIAL_LEVEL2_HEIGHT = 100
const ADVICE_WIDTH = 800
const ADVICE_DURATION_FAST = 500
/** MessageWidget::SetLabel, MESSAGE_STYLE_ACHIEVEMENT. */
const ADVICE_DURATION_ACHIEVEMENT = 250
const ADVICE_DURATION_STAY = 10000
/** MESSAGE_STYLE_HUGE_WAVE: 750 ticks of red text on a baseline at y=330, coming and going by TextFadeOn. */
const ADVICE_DURATION_HUGE_WAVE = 750
const ADVICE_HUGE_WAVE_Y = 330
const TEXT_FADE_ON_ENTER = 'pvz:textfadeon_enter'
const TEXT_FADE_ON_LEAVE = 'pvz:textfadeon_leave'
/** MessageWidget::Update plays TextFadeOn's anim_enter at 60 frames a second and its anim_leave at 40. */
const TEXT_FADE_ON_ENTER_FPS = 60
const TEXT_FADE_ON_LEAVE_FPS = 40
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
    /** Ticks since the message came up: how far the huge wave's has come in. */
    private _shownTicks = 0
    /** MessageWidget's mLabelNext: a message waiting for the huge wave's to leave. */
    private _next: { message: string, style: AdviceWidgetStyle } | null = null
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

    /** The huge wave's TextFadeOn clips, for a widget that shows it. */
    static loadAssets(): Promise<void> {
        return prepareReanims([TEXT_FADE_ON_ENTER, TEXT_FADE_ON_LEAVE])
    }

    /** MessageWidget::SetLabel: a message given while the huge wave's is up waits for it to leave, which it now does. */
    show(message: string, style: AdviceWidgetStyle = 'hint') {
        if (!this.node.isValid) return
        if (this._style === 'huge-wave' && this._durationTicks > 0) {
            this._next = { message, style }
            this.clear()
            return
        }

        this._style = style
        this._durationTicks = this._durationForStyle(style)
        this._shownTicks = 0
        this._label.text = message
        this._applyLayout()
        this.node.active = true
        this._drawBackdrop()
    }

    snapshot(): AdviceWidgetSnapshot | null {
        if (!this.node.isValid || !this.node.active || !this._label.text) return null

        return {
            message: this._label.text, style: this._style, durationTicks: this._durationTicks, pulseTick: this._pulseTick,
            shownTicks: this._shownTicks, ...(this._next ? { next: { ...this._next } } : {}),
        }
    }

    /** A snapshot as the level's save has read it (parseAdviceWidgetSnapshot). */
    restore(snapshot: AdviceWidgetSnapshot | null) {
        if (snapshot === null) {
            this.clear(true)
            return
        }

        this._style = snapshot.style
        this._durationTicks = snapshot.durationTicks
        this._pulseTick = snapshot.pulseTick
        this._shownTicks = snapshot.shownTicks
        this._next = snapshot.next ? { ...snapshot.next } : null
        this._label.text = snapshot.message
        this._applyLayout()
        this.node.active = snapshot.durationTicks > 0
        this._drawBackdrop()
    }

    /**
     * MessageWidget::ClearLabel: the huge wave's message is left to go its way, leaving within 101 ticks; any other, or
     * every one `immediately`, goes now.
     */
    clear(immediately = false) {
        if (!this.node.isValid) return
        if (!immediately && this._style === 'huge-wave' && this._durationTicks > 0) {
            this._durationTicks = Math.min(this._durationTicks, 100 + this._slideOffTicks() + 1)
            return
        }

        this._next = null
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
        this._shownTicks += ticks
        if (this._durationTicks >= ADVICE_DURATION_STAY) {
            this._applyLayout()
            this._drawBackdrop()
            return
        }

        this._durationTicks = Math.max(0, this._durationTicks - ticks)
        if (this._durationTicks === 0) {
            this.node.active = false
            const next = this._next
            this._next = null
            if (next) this.show(next.message, next.style)
            return
        }

        this._applyLayout()
        this._drawBackdrop()
    }

    private _applyLayout() {
        if (this._style === 'huge-wave') {
            this._applyHugeWave()
            return
        }
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

    /**
     * MessageWidget::DrawReanimatedText for the huge wave: TextFadeOn's locator scales the text about the middle of its
     * baseline and fades it, coming in as it shows and leaving `_slideOffTicks` before it ends (MessageWidget::Update).
     */
    private _applyHugeWave() {
        const labelWidth = this._width - 40
        this._label.color = new Color(255, 0, 0, 255)
        this._label.renderer.fontSize = ADVICE_TEXT_SIZE
        this._label.renderer.lineSpacing = 0
        this._label.renderer.maxWidth = labelWidth
        this._label.renderer.forceRebuild()
        const metrics = FontMetricsUtil.getMetrics(this._font?.config ?? null)
        this._height = 0
        uiNode({ node: this.node, size: { width: this._width, height: 0 } })
        this.node.setPosition(ADVICE_WIDTH / 2, -ADVICE_HUGE_WAVE_Y, 0)
        uiNode({ node: this._label.node, size: { width: labelWidth, height: metrics.height }, anchor: { x: 0, y: 1 } })
        this._label.node.setPosition(-labelWidth / 2, metrics.ascent, 0)
        const slideOff = this._slideOffTicks()
        const pose = this._durationTicks > slideOff
            ? heldPose(TEXT_FADE_ON_ENTER, TEXT_FADE_ON_ENTER_FPS, this._shownTicks)
            // anim_leave starts as the message reaches its slide-off time and plays from the tick after.
            : heldPose(TEXT_FADE_ON_LEAVE, TEXT_FADE_ON_LEAVE_FPS, slideOff - this._durationTicks - 1)
        this.node.setScale(pose?.scaleX ?? 1, pose?.scaleY ?? 1, 1)
        uiNode({ node: this.node, opacity: Math.round(255 * (pose?.alpha ?? 1)) })
    }

    /** MessageWidget::LayoutReanimText: the label's length in bytes (UTF-8) and 100 more. */
    private _slideOffTicks(): number {
        let bytes = 0
        for (const char of this._label.text) {
            const code = char.codePointAt(0)!
            bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4
        }
        return bytes + 100
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
        return {
            ...this._place(),
            textOffsetY: ADVICE_TEXT_OFFSET_Y,
            textColor: new Color(253, 245, 173, this._pulseAlpha()),
            fontSize: ADVICE_TEXT_SIZE,
            lineHeight: 0,
            backdropAlpha: this._style === 'huge-wave' ? 0 : 128,
        }
    }

    /** MessageWidget::Draw: the first tutorial's band, the later ones' (the achievement's too) or the hint's. */
    private _place(): { y: number, height: number } {
        switch (this._style) {
            case 'tutorial-level1':
            case 'tutorial-level1-stay':
                return { y: ADVICE_TUTORIAL_LEVEL1_Y, height: ADVICE_TUTORIAL_LEVEL1_HEIGHT }
            case 'tutorial-level2':
            case 'tutorial-later':
            case 'tutorial-later-stay':
            case 'achievement':
                return { y: ADVICE_TUTORIAL_LEVEL2_Y, height: ADVICE_TUTORIAL_LEVEL2_HEIGHT }
            case 'hint':
            case 'hint-stay':
                return { y: ADVICE_HINT_Y, height: ADVICE_HINT_HEIGHT }
            case 'huge-wave':
                return { y: ADVICE_HUGE_WAVE_Y, height: 0 }
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
            case 'hint-stay':
            case 'tutorial-level1-stay':
            case 'tutorial-later-stay':
                return ADVICE_DURATION_STAY
            case 'achievement':
                return ADVICE_DURATION_ACHIEVEMENT
            case 'huge-wave':
                return ADVICE_DURATION_HUGE_WAVE
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
        // MessageWidget::Draw: CURVE_BOUNCE_SLOW_MIDDLE, the bounce eased out (PvzpCurveInvQuad) so it lingers bright.
        const t = (this._pulseTick % 75) / 75
        const bounce = 1 - Math.abs(t * 2 - 1)
        const peak = 2 * bounce - bounce * bounce
        return Math.round(ADVICE_TEXT_MIN_ALPHA + (255 - ADVICE_TEXT_MIN_ALPHA) * peak)
    }
}

/**
 * A TextFadeOn clip's locator after `ticks` played at `fps` frames a second, held on its last frame
 * (Reanimation::Update, REANIM_PLAY_ONCE_AND_HOLD); nothing while the clip is not loaded.
 */
function heldPose(id: string, fps: number, ticks: number) {
    const clip = loadedReanim(id)?.data, track = clip?.tracks.find(track => track.id === 'locator_text')
    if (!clip || !track) return null
    const frames = Math.round(clip.durationSeconds * ASSET_FPS)
    const played = Math.min(1, Math.max(0, ticks) / 100 * fps / frames)
    return sampleReanimTrack(track, played * (frames - 1) / ASSET_FPS)
}
