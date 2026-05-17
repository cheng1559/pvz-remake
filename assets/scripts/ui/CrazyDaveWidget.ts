import { _decorator, Color, Component, JsonAsset, Node, SpriteFrame } from 'cc'
import { Animator } from '@/core/Animator'
import type { AnimNode } from '@/core/Animator/AnimNode'
import type { BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import {
    getAnimationRateSpeed,
    wirePlantAnimation,
    type PlantAnimationView,
} from '@/game/PlantAnimation'
import { GAME_TICK_SECONDS } from '@/game/GameDefinitions'
import { createSpriteNode, createUINode } from '@/ui/UIFactory'

const { ccclass } = _decorator

const CRAZY_DAVE_ENTER_RATE = 24
const CRAZY_DAVE_LEAVE_RATE = 24
const CRAZY_DAVE_TALK_RATE = 12
const CRAZY_DAVE_IDLE_RATE = 12
const CRAZY_DAVE_BLINK_RATE = 15
const CRAZY_DAVE_TALK_BLEND_TICKS = 50
const CRAZY_DAVE_IDLE_BLEND_TICKS = 20
const CRAZY_DAVE_LEAVE_BLEND_TICKS = 20
const CRAZY_DAVE_BLINK_COUNTDOWN_MIN = 400
const CRAZY_DAVE_BLINK_COUNTDOWN_MAX = 800
const CRAZY_DAVE_BUBBLE_X = 285
const CRAZY_DAVE_BUBBLE_Y = 20
const CRAZY_DAVE_BUBBLE_TEXT_X = 310
const CRAZY_DAVE_BUBBLE_TEXT_Y = 26
const CRAZY_DAVE_BUBBLE_TEXT_WIDTH = 233
const CRAZY_DAVE_BUBBLE_TEXT_HEIGHT = 144
const CRAZY_DAVE_BUBBLE_CONTINUE_X = 424
const CRAZY_DAVE_BUBBLE_CONTINUE_BASELINE_Y = 160
const CRAZY_DAVE_BUBBLE_FONT_SIZE = 16
const CRAZY_DAVE_BUBBLE_CONTINUE_FONT_SIZE = 9
const CRAZY_DAVE_BUBBLE_SHAKE_PIXELS = 1
const CRAZY_DAVE_BUBBLE_Z = -10000
const CRAZY_DAVE_HAND_WALLNUT_X = 100
const CRAZY_DAVE_HAND_WALLNUT_Y = 393
const CRAZY_DAVE_HAND_WALLNUT_BASE_HAND_X = 84.3
const CRAZY_DAVE_HAND_WALLNUT_BASE_HAND_Y = 433.3
const CRAZY_DAVE_HAND_WALLNUT_SCALE = 1.2
const CRAZY_DAVE_HAND_WALLNUT_Z = 53.5
const CRAZY_DAVE_SOUND_CHANNEL = 'crazyDave'

function reanimBlendSeconds(ticks: number) {
    return ticks * GAME_TICK_SECONDS
}

export interface CrazyDaveWidgetOptions {
    animation: JsonAsset | null
    bubbleSprite?: SpriteFrame | null
    bubbleX?: number
    bubbleY?: number
    daveFont?: BitmapFontAssets | null
    continueFont?: BitmapFontAssets | null
    wallnutAnimation?: JsonAsset | null
    layer?: number
    animationsEnabled?: boolean
}

export interface CrazyDaveMessageOptions {
    clickToContinue?: boolean
    restartNoSoundWhileTalking?: boolean
}

export interface CrazyDaveStopTalkingOptions {
    stopSound?: boolean
}

@ccclass('CrazyDaveWidget')
export class CrazyDaveWidget extends Component {
    private _layer = 0
    private _animation: JsonAsset | null = null
    private _wallnutAnimation: JsonAsset | null = null
    private _animator: Animator | null = null
    private _bodyNode: AnimNode | null = null
    private _blinkNode: AnimNode | null = null
    private _bubbleNode: Node | null = null
    private _bubbleLabel: FontRenderer | null = null
    private _continueLabel: FontRenderer | null = null
    private _handItemNode: Node | null = null
    private _handing = false
    private _currentRawText = ''
    private _messageToken = 0
    private _blinkCounter = 0
    private _blinking = false
    private _animationsEnabled = true
    private _bubbleX = CRAZY_DAVE_BUBBLE_X
    private _bubbleY = CRAZY_DAVE_BUBBLE_Y
    private _talking = false
    private _pendingIdleRawText: string | null = null
    private _pendingIdleCallback: (() => void) | null = null

    initialize(options: CrazyDaveWidgetOptions): Promise<boolean> {
        this._layer = options.layer ?? this.node.layer
        this._animation = options.animation
        this._wallnutAnimation = options.wallnutAnimation ?? null
        this._animationsEnabled = options.animationsEnabled ?? true
        this._bubbleX = options.bubbleX ?? CRAZY_DAVE_BUBBLE_X
        this._bubbleY = options.bubbleY ?? CRAZY_DAVE_BUBBLE_Y
        this.node.layer = this._layer
        this._createBubble(options)
        return this._createAnimation()
    }

    setAnimationsEnabled(enabled: boolean) {
        this._animationsEnabled = enabled
        this._setNodeAnimatorsEnabled(this.node, enabled)
    }

    setVisible(visible: boolean, animationsEnabled = this._animationsEnabled) {
        if (!this.node.isValid) return

        this.node.active = visible
        this.setAnimationsEnabled(visible && animationsEnabled)
    }

    playIntro(playEnter: boolean, onFinish: () => void) {
        if (!playEnter) {
            this.playIdle()
            onFinish()
            return
        }
        this.enterThen(onFinish)
    }

    enterThen(onFinish: () => void) {
        const bodyNode = this._bodyNode
        this._stopBlink()
        if (!bodyNode?.hasAnimation('anim_enter')) {
            onFinish()
            return
        }

        bodyNode.play({
            name: 'anim_enter',
            speed: getAnimationRateSpeed(bodyNode, 'anim_enter', CRAZY_DAVE_ENTER_RATE),
            keepLastFrame: true,
            onFinish: () => {
                this._queuePendingIdle('', onFinish)
            },
        })
    }

    leave(hideOnFinish: boolean, onHidden?: () => void) {
        this._talking = false
        this._pendingIdleRawText = null
        this._pendingIdleCallback = null
        this.hideHandItem()
        this._stopBlink()
        this._animator?.setTrackImageOverride('Dave_mouths', null)
        const bodyNode = this._bodyNode
        if (!bodyNode?.hasAnimation('anim_leave')) {
            if (hideOnFinish) {
                this.node.active = false
                onHidden?.()
            }
            return
        }

        bodyNode.play({
            name: 'anim_leave',
            speed: getAnimationRateSpeed(bodyNode, 'anim_leave', CRAZY_DAVE_LEAVE_RATE),
            blendTime: reanimBlendSeconds(CRAZY_DAVE_LEAVE_BLEND_TICKS),
            keepLastFrame: true,
            onFinish: () => {
                if (!hideOnFinish) return
                this.node.active = false
                onHidden?.()
            },
        })
    }

    playIdle() {
        this._talking = false
        this._pendingIdleRawText = null
        this._pendingIdleCallback = null
        const bodyNode = this._bodyNode
        const animation = this._handing && bodyNode?.hasAnimation('anim_idle_handing')
            ? 'anim_idle_handing'
            : 'anim_idle'
        if (!bodyNode?.hasAnimation(animation)) return

        bodyNode.play({
            name: animation,
            loop: true,
            speed: getAnimationRateSpeed(bodyNode, animation, CRAZY_DAVE_IDLE_RATE),
            blendTime: reanimBlendSeconds(CRAZY_DAVE_IDLE_BLEND_TICKS),
        })
    }

    showMessage(rawText: string, options: CrazyDaveMessageOptions = {}) {
        if (!rawText || !this._bubbleNode?.isValid || !this._bubbleLabel) return false

        this._currentRawText = rawText
        this._syncHandItem(rawText)
        const continueNoSoundTalk = rawText.includes('{NO_SOUND}') &&
            this._talking &&
            options.restartNoSoundWhileTalking === false
        if (!continueNoSoundTalk) {
            this._messageToken++
        }
        if (this.node.parent?.isValid) {
            this.node.setSiblingIndex(this.node.parent.children.length - 1)
        }
        this._bubbleNode.active = true
        this._bubbleNode.setSiblingIndex(0)
        if (this._continueLabel?.node.isValid) {
            this._continueLabel.node.active = options.clickToContinue !== false
            this._continueLabel.node.setSiblingIndex(this._bubbleNode.children.length - 1)
        }

        this._bubbleLabel.string = this._cleanText(rawText)
        this._bubbleLabel.forceRebuild()
        this._positionBubbleText()
        this._playTalk(rawText, this._messageToken, options)
        return true
    }

    hideBubble() {
        if (this._bubbleNode?.isValid) this._bubbleNode.active = false
        this._currentRawText = ''
    }

    stopTalking(options: CrazyDaveStopTalkingOptions = {}) {
        const shouldPlayIdle = this._talking || this._pendingIdleRawText != null
        this.hideBubble()
        this._messageToken++
        this._talking = false
        this._pendingIdleRawText = null
        this._pendingIdleCallback = null
        this._animator?.setTrackImageOverride('Dave_mouths', null)
        if (options.stopSound) {
            SoundLoader.stopExclusive(CRAZY_DAVE_SOUND_CHANNEL)
        }
        if (shouldPlayIdle) {
            this.playIdle()
        }
    }

    updateTicks(ticks: number, allowBlink: boolean) {
        if (!this.node.active) return

        this._playPendingIdle()
        this.syncHandItemTransform()
        if (!allowBlink || this._blinking || !this._blinkNode) return

        this._blinkCounter -= ticks
        if (this._blinkCounter > 0) return

        this._playBlink()
    }

    syncBubbleShake() {
        if (!this._bubbleNode?.active || !this._currentRawText.includes('{SHAKE}')) return

        this._setBubbleTextPosition(
            this._randomBubbleShakeOffset(),
            this._randomBubbleShakeOffset(),
        )
    }

    syncHandItemTransform() {
        const node = this._handItemNode
        if (!node?.isValid || !node.active) return

        const frame = this._animator?.getTrackFrame('Dave_handinghand')
        if (!frame) {
            node.setPosition(CRAZY_DAVE_HAND_WALLNUT_X, -CRAZY_DAVE_HAND_WALLNUT_Y, 0)
            node.angle = 0
            node.setScale(CRAZY_DAVE_HAND_WALLNUT_SCALE, CRAZY_DAVE_HAND_WALLNUT_SCALE, 1)
            return
        }

        const angle = -frame.kx
        const radians = angle * Math.PI / 180
        const offsetX = CRAZY_DAVE_HAND_WALLNUT_X - CRAZY_DAVE_HAND_WALLNUT_BASE_HAND_X
        const offsetY = -CRAZY_DAVE_HAND_WALLNUT_Y + CRAZY_DAVE_HAND_WALLNUT_BASE_HAND_Y
        const cos = Math.cos(radians)
        const sin = Math.sin(radians)
        node.setPosition(
            frame.x + offsetX * cos - offsetY * sin,
            -frame.y + offsetX * sin + offsetY * cos,
            0,
        )
        node.angle = angle
        node.setScale(
            CRAZY_DAVE_HAND_WALLNUT_SCALE * frame.sx,
            CRAZY_DAVE_HAND_WALLNUT_SCALE * frame.sy,
            1,
        )
    }

    hideHandItem() {
        if (this._handItemNode?.isValid) {
            this._handItemNode.active = false
        }
        this._handing = false
    }

    private async _createAnimation() {
        if (!this._animation?.json) return false

        const animator = this.node.addComponent(Animator)
        animator.enabled = this._animationsEnabled
        this._animator = animator
        await animator.parseJson(this._animation.json as Record<string, any>)
        if (!this.node.isValid) return false

        const bodyNode = animator.addAnimNode('body')
        const blinkNode = animator.addAnimNode('blink')
        if (this._bubbleNode?.isValid) {
            animator.insertExternalNode('CrazyDaveBubble', this._bubbleNode, CRAZY_DAVE_BUBBLE_Z)
            this._bubbleNode.setSiblingIndex(0)
        }
        if (bodyNode && blinkNode) {
            blinkNode.attach({ node: bodyNode, slot: 'Dave_eye' })
        }
        blinkNode?.stop()
        this._bodyNode = bodyNode
        this._blinkNode = blinkNode
        this._blinkCounter = this._randomBlinkCountdown()
        this.setAnimationsEnabled(this._animationsEnabled)
        return !!bodyNode
    }

    private _createBubble(options: CrazyDaveWidgetOptions) {
        if (!options.bubbleSprite) return

        this._bubbleNode = createSpriteNode({
            name: 'CrazyDaveBubble',
            spriteFrame: options.bubbleSprite,
            parent: this.node,
            layer: this._layer,
            x: this._bubbleX,
            y: -this._bubbleY,
        })
        this._bubbleNode.active = false

        const labelNode = createUINode('CrazyDaveBubbleText', {
            parent: this._bubbleNode,
            layer: this._layer,
            anchorX: 0,
            anchorY: 1,
            width: CRAZY_DAVE_BUBBLE_TEXT_WIDTH,
            height: CRAZY_DAVE_BUBBLE_TEXT_HEIGHT,
            x: CRAZY_DAVE_BUBBLE_TEXT_X - CRAZY_DAVE_BUBBLE_X,
            y: -(CRAZY_DAVE_BUBBLE_TEXT_Y - CRAZY_DAVE_BUBBLE_Y),
        })
        this._bubbleLabel = labelNode.addComponent(FontRenderer)
        if (options.daveFont) this._bubbleLabel.setFontAssets(options.daveFont)
        this._bubbleLabel.fontColor = Color.BLACK
        this._bubbleLabel.fontSize = CRAZY_DAVE_BUBBLE_FONT_SIZE
        this._bubbleLabel.maxWidth = CRAZY_DAVE_BUBBLE_TEXT_WIDTH
        this._bubbleLabel.textAlign = 2

        this._continueLabel = this._createBitmapText({
            name: 'CrazyDaveContinue',
            text: 'Click to continue',
            baselineX: CRAZY_DAVE_BUBBLE_CONTINUE_X - CRAZY_DAVE_BUBBLE_X,
            baselineY: CRAZY_DAVE_BUBBLE_CONTINUE_BASELINE_Y - CRAZY_DAVE_BUBBLE_Y,
            font: options.continueFont ?? null,
            parent: this._bubbleNode,
            align: 'center',
        })
        this._continueLabel.fontSize = CRAZY_DAVE_BUBBLE_CONTINUE_FONT_SIZE
        this._continueLabel.forceRebuild()
    }

    private _createBitmapText(args: {
        name: string
        text: string
        baselineX: number
        baselineY: number
        font: BitmapFontAssets | null
        parent: Node
        align: 'left' | 'center' | 'right'
    }) {
        const node = createUINode(args.name, {
            parent: args.parent,
            layer: this._layer,
            anchorX: 0,
            anchorY: 1,
        })
        const renderer = node.addComponent(FontRenderer)
        if (args.font) renderer.setFontAssets(args.font)
        renderer.fontColor = Color.BLACK
        renderer.string = args.text
        renderer.forceRebuild()

        const metrics = FontMetricsUtil.getMetrics(args.font?.config ?? null)
        const width = FontMetricsUtil.measureTextWidth(args.font?.config ?? null, args.text) || renderer.contentWidth
        let x = args.baselineX
        if (args.align === 'center') x -= Math.trunc(width / 2)
        if (args.align === 'right') x -= width
        node.setPosition(x, -(args.baselineY - metrics.ascent), 0)
        return renderer
    }

    private _positionBubbleText() {
        this._setBubbleTextPosition(0, 0)
    }

    private _setBubbleTextPosition(offsetX: number, offsetY: number) {
        const label = this._bubbleLabel
        if (!label?.node.isValid) return

        const textHeight = Math.max(1, label.contentHeight)
        const centeredOffset = Math.max(0, Math.round((CRAZY_DAVE_BUBBLE_TEXT_HEIGHT - textHeight) / 2))
        label.node.setPosition(
            CRAZY_DAVE_BUBBLE_TEXT_X - CRAZY_DAVE_BUBBLE_X + offsetX,
            -(CRAZY_DAVE_BUBBLE_TEXT_Y - CRAZY_DAVE_BUBBLE_Y + centeredOffset + offsetY),
            0,
        )
    }

    private _randomBubbleShakeOffset() {
        return Math.floor(Math.random() * (CRAZY_DAVE_BUBBLE_SHAKE_PIXELS + 1))
    }

    private _syncHandItem(rawText: string) {
        if (rawText.includes('{SHOW_WALLNUT}')) {
            this._showWallnut()
            return
        }
        if (!this._isHandingText(rawText)) {
            this.hideHandItem()
        }
    }

    private _showWallnut() {
        if (!this.node.isValid || !this._bodyNode) return
        if (this._handItemNode?.isValid) {
            this._handItemNode.active = true
            this.syncHandItemTransform()
            return
        }
        if (!this._wallnutAnimation?.json) return

        const node = createUINode('CrazyDaveWallnut', {
            parent: this.node,
            layer: this._layer,
            anchorX: 0,
            anchorY: 1,
            x: CRAZY_DAVE_HAND_WALLNUT_X,
            y: -CRAZY_DAVE_HAND_WALLNUT_Y,
        })
        node.setScale(CRAZY_DAVE_HAND_WALLNUT_SCALE, CRAZY_DAVE_HAND_WALLNUT_SCALE, 1)
        this._handItemNode = node
        this._animator?.insertExternalNode('Dave_handingitem', node, CRAZY_DAVE_HAND_WALLNUT_Z)

        const animator = node.addComponent(Animator)
        animator.enabled = this._animationsEnabled
        void animator.parseJson(this._wallnutAnimation.json as Record<string, any>).then(() => {
            if (!node.isValid || !this._bodyNode) return
            animator.enabled = this._animationsEnabled
            const view: PlantAnimationView = {
                plantType: 'wallnut',
                body: null,
                head: null,
                face: null,
                face2: null,
                glow: null,
                idleSpeed: 1,
            }
            wirePlantAnimation(animator, view, 'wallnut', { animated: true, staticAnimTime: 0 })
            this.syncHandItemTransform()
        })
    }

    private _setMouthOverride(rawText: string) {
        const animator = this._animator
        if (!animator?.isValid) return

        animator.setTrackImageOverride('Dave_mouths', this._mouthImage(rawText))
    }

    private _mouthImage(rawText: string) {
        if (rawText.includes('{MOUTH_BIG_SMILE}')) return 'crazydave_mouth1'
        if (rawText.includes('{MOUTH_SMALL_SMILE}')) return 'crazydave_mouth5'
        if (rawText.includes('{MOUTH_BIG_OH}')) return 'crazydave_mouth4'
        if (rawText.includes('{MOUTH_SMALL_OH}')) return 'crazydave_mouth6'
        return null
    }

    private _cleanText(text: string) {
        return text
            .replace(/\{[^}]*\}/g, '')
            .replace(/[ \t]+/g, ' ')
            .replace(/^\s+|\s+$/g, '')
    }

    private _playTalk(rawText: string, messageToken: number, options: CrazyDaveMessageOptions) {
        const bodyNode = this._bodyNode
        if (!bodyNode) return

        this._animator?.setTrackImageOverride('Dave_mouths', null)
        const doSound = !rawText.includes('{NO_SOUND}')
        if (!doSound && this._talking && options.restartNoSoundWhileTalking === false) return

        const preferredAnimation = this._talkAnimation(rawText)
        const animation = bodyNode.hasAnimation(preferredAnimation) ? preferredAnimation : 'anim_smalltalk'
        this._handing = this._isHandingText(rawText)
        this._talking = true
        this._pendingIdleRawText = null
        this._pendingIdleCallback = null
        bodyNode.play({
            name: animation,
            speed: getAnimationRateSpeed(bodyNode, animation, CRAZY_DAVE_TALK_RATE),
            blendTime: reanimBlendSeconds(CRAZY_DAVE_TALK_BLEND_TICKS),
            keepLastFrame: true,
            onFinish: () => {
                if (this._messageToken !== messageToken) return

                this._talking = false
                this._queuePendingIdle(rawText)
            },
        })
        this._playSound(rawText)
    }

    private _queuePendingIdle(rawText: string, callback: (() => void) | null = null) {
        this._pendingIdleRawText = rawText
        this._pendingIdleCallback = callback
    }

    private _playPendingIdle() {
        const rawText = this._pendingIdleRawText
        if (rawText == null) return
        const callback = this._pendingIdleCallback

        this.playIdle()
        this._setMouthOverride(rawText)
        callback?.()
    }

    private _talkAnimation(rawText: string) {
        if (this._isHandingText(rawText)) return 'anim_talk_handing'
        if (rawText.includes('{SHAKE}')) return 'anim_crazy'
        if (rawText.includes('{SCREAM2}')) return 'anim_mediumtalk'
        if (rawText.includes('{SCREAM}')) return 'anim_smalltalk'

        const charCount = this._spokenCharCount(rawText)
        if (charCount < 23) return 'anim_smalltalk'
        if (charCount < 52) return 'anim_mediumtalk'
        return 'anim_blahblah'
    }

    private _playSound(rawText: string) {
        if (rawText.includes('{NO_SOUND}')) return
        if (rawText.includes('{SHAKE}')) {
            void SoundLoader.playExclusive(SoundEffect.CrazyDaveCrazy, CRAZY_DAVE_SOUND_CHANNEL)
            return
        }
        if (rawText.includes('{SHOW_WALLNUT}')) {
            void SoundLoader.playExclusive(SoundEffect.CrazyDaveScream2, CRAZY_DAVE_SOUND_CHANNEL)
            return
        }
        if (rawText.includes('{SCREAM2}')) {
            void SoundLoader.playExclusive(SoundEffect.CrazyDaveScream2, CRAZY_DAVE_SOUND_CHANNEL)
            return
        }
        if (rawText.includes('{SCREAM}')) {
            void SoundLoader.playExclusive(SoundEffect.CrazyDaveScream, CRAZY_DAVE_SOUND_CHANNEL)
            return
        }

        const charCount = this._spokenCharCount(rawText)
        const sound = charCount < 23
            ? SoundEffect.CrazyDaveShort1
            : charCount < 52
                ? SoundEffect.CrazyDaveLong1
                : SoundEffect.CrazyDaveExtraLong1
        void SoundLoader.playFoleyExclusive(sound, CRAZY_DAVE_SOUND_CHANNEL, 0)
    }

    private _isHandingText(rawText: string) {
        return rawText.includes('{SHOW_WALLNUT}') || rawText.includes('{HANDING}')
    }

    private _spokenCharCount(rawText: string) {
        let count = 0
        let inToken = false
        for (const char of rawText) {
            if (char === '{') {
                inToken = true
                continue
            }
            if (char === '}') {
                inToken = false
                continue
            }
            if (!inToken) count++
        }
        return count
    }

    private _playBlink() {
        const blinkNode = this._blinkNode
        if (!blinkNode?.hasAnimation('anim_blink')) return

        this._blinking = true
        this._blinkCounter = this._randomBlinkCountdown()
        blinkNode.play({
            name: 'anim_blink',
            speed: getAnimationRateSpeed(blinkNode, 'anim_blink', CRAZY_DAVE_BLINK_RATE),
            keepLastFrame: true,
            onFinish: () => {
                this._stopBlink()
            },
        })
    }

    private _stopBlink() {
        this._blinking = false
        this._animator?.stopAnimNode(this._blinkNode)
    }

    private _randomBlinkCountdown() {
        return CRAZY_DAVE_BLINK_COUNTDOWN_MIN +
            Math.floor(Math.random() * (CRAZY_DAVE_BLINK_COUNTDOWN_MAX - CRAZY_DAVE_BLINK_COUNTDOWN_MIN + 1))
    }

    private _setNodeAnimatorsEnabled(node: Node, enabled: boolean) {
        const animator = node.getComponent(Animator)
        if (animator) animator.enabled = enabled
        for (const child of node.children) {
            this._setNodeAnimatorsEnabled(child, enabled)
        }
    }
}
