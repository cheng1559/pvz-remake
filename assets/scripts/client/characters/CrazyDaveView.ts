import { prepareReanims } from '@/client/reanim/ReanimAssets'
import { modResources } from '@/client/content/ModResources'
import { Color, Node } from 'cc'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { uiNode } from '@/client/view/uiNode'
import { UI } from '@/client/ui/UI'
import type { UILabel } from '@/client/ui/UILabel'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import type { PresentationDefinitions } from '@/shared/content/presentation'

/**
 * Dave's original talk/idle/enter clips, token-controlled mouth, hand item and speech bubble. His body is one player,
 * which changes between the clips in place; his blink plays over it.
 */
export class CrazyDaveView {
    /** Whether a clip has played: the first has nothing to blend from. */
    private started = false
    private message?: string
    private pending?: string
    private visible = false
    private entering = false
    private leaving = false
    private blinkSeconds: number
    private shaking = false
    private textY = 0
    private voicePending = false
    private voiceSequence = 0

    static async create(parent: Node, content: { presentation: Pick<PresentationDefinitions, 'dave'> }, ui: UI, options: {
        position?: { x: number, y: number }, bubble?: Partial<PresentationDefinitions['dave']['bubble']>, clickToContinue?: boolean,
    } = {}): Promise<CrazyDaveView> {
        const root = uiNode({ name: 'CrazyDave', parent, position: options.position, anchor: { x: 0, y: 1 }, active: false }).node
        root.once(Node.EventType.NODE_DESTROYED, () => SoundSystem.stopExclusive('crazyDave'))
        const config = { ...content.presentation.dave, bubble: { ...content.presentation.dave.bubble, ...options.bubble } }
        const layout = config.bubble
        const bubble = ui.image(root, await modResources.sprite(layout.sprite), layout).node
        const label = ui.label(bubble, { text: '', font: 'profile', width: layout.textWidth, x: layout.textX, y: layout.textY, align: 'center', color: Color.BLACK })
        const hint = options.clickToContinue === false ? undefined : ui.label(bubble, {
            text: ui.text('CLICK_TO_CONTINUE'), font: 'packetCost', x: layout.continueX, y: layout.continueY,
            align: 'center', baseline: true, color: Color.BLACK,
        }).node
        bubble.active = false
        // Every clip is in memory from here on: the body changes between them at once.
        await prepareReanims(Object.values(config.clips))
        const body = uiNode({ name: 'Body', parent: root }).node.addComponent(ReanimPlayer)
        const blink = uiNode({ name: 'blink', parent: root, active: false }).node.addComponent(ReanimPlayer)
        const hand = uiNode({ name: 'HandItem', parent: root, position: config.hand }).node.addComponent(ReanimPlayer)
        await hand.load(config.hand.reanim)
        hand.node.setScale(config.hand.scale, config.hand.scale, 1)
        body.change(config.clips.idle_handing)
        blink.change(config.clips.blink)
        // Parenting the entire item applies hand motion to its offset and scale as well as its tracks: it keeps the
        // place it has in the hand here, and waits on Dave himself while no clip holds it out.
        hand.node.setParent(body.getTrackNode(config.hand.track)!, true)
        hand.node.setParent(root)
        body.enabled = blink.enabled = hand.enabled = false
        hand.node.active = false
        hand.play({ loop: true })
        const mouths = await Promise.all(Object.entries(config.mouths).map(async ([token, id]) => [token, await modResources.sprite(id)] as const))
        root.active = false
        return new CrazyDaveView(root, bubble, label, body, blink, hand, new Map(mouths), config, hint)
    }

    private constructor(readonly node: Node, private bubble: Node, private label: UILabel,
        private body: ReanimPlayer, private blink: ReanimPlayer, private hand: ReanimPlayer,
        private mouths: Map<string, import('cc').SpriteFrame>, private config: PresentationDefinitions['dave'], private hint?: Node) {
        this.blinkSeconds = config.blinkSeconds[0]
    }

    get busy(): boolean { return this.node.active }
    get canAdvance(): boolean { return this.node.active && this.bubble.active && !this.entering && !this.leaving }
    get ready(): boolean { return this.node.active && !this.entering && !this.leaving }
    get isSpeaking(): boolean { return this.voicePending || SoundSystem.isExclusivePlaying('crazyDave') }

    enter(): void {
        this.visible = true
        if (this.node.active) return
        this.node.active = true
        this.entering = true
        this.play('enter', false, this.config.transitionFps, () => {
            this.entering = false
            if (!this.visible) this.leave()
            else if (this.pending !== undefined) this.show(this.pending)
            else this.play('idle', true, this.config.talkFps)
        })
    }

    say(message: string): void {
        if (message === this.message && this.node.active && !this.leaving) return
        this.pending = message
        this.enter()
        if (!this.entering && !this.leaving) this.show(message)
    }

    stopTalking(): void {
        this.voiceSequence++
        this.voicePending = false
        this.message = this.pending = undefined
        this.shaking = false
        this.bubble.active = this.hand.node.active = false
        SoundSystem.stopExclusive('crazyDave')
        if (this.node.active && !this.entering && !this.leaving) this.play('idle', true, this.config.talkFps)
    }

    leave(): void {
        this.visible = false
        const leaving = this.node.active && !this.entering && !this.leaving
        if (leaving) this.leaving = true
        this.stopTalking()
        if (!leaving) return
        this.play('leave', false, this.config.transitionFps, () => {
            this.node.active = false
            this.leaving = false
            if (this.visible) this.enter()
        })
    }

    private show(raw: string): void {
        this.message = raw
        const text = raw.replace(/\{[^}]*\}/g, '').trim()
        this.label.text = text
        const layout = this.config.bubble
        this.textY = layout.textY + Math.trunc((layout.textHeight - this.label.renderer.contentHeight) / 2)
        this.label.setPosition(layout.textX, this.textY)
        this.shaking = raw.includes('{SHAKE}')
        this.bubble.active = true
        if (this.hint) this.hint.active = !raw.includes('{NO_CLICK}')
        const handing = raw.includes('{SHOW_WALLNUT}')
        this.hand.node.active = handing
        const animation = handing ? 'talk_handing' : raw.includes('{SHAKE}') ? 'crazy'
            : raw.includes('{SCREAM2}') ? 'mediumtalk' : raw.includes('{SCREAM}') || text.length < this.config.talkLengths[0] ? 'smalltalk' : text.length < this.config.talkLengths[1] ? 'mediumtalk' : 'blahblah'
        this.play(animation, false, this.config.talkFps, () => {
            this.play(handing ? 'idle_handing' : 'idle', true, this.config.talkFps)
            const mouth = [...this.mouths.keys()].find(token => raw.includes(`{${token}}`))
            this.body.setTrackSpriteOverride(this.config.parts.mouth, mouth ? this.mouths.get(mouth)! : null)
        })
        const effect = raw.includes('{SHAKE}') ? SoundEffect.CrazyDaveCrazy : handing || raw.includes('{SCREAM2}') ? SoundEffect.CrazyDaveScream2
            : raw.includes('{SCREAM}') ? SoundEffect.CrazyDaveScream : text.length < this.config.talkLengths[0] ? SoundEffect.CrazyDaveShort1
                : text.length < this.config.talkLengths[1] ? SoundEffect.CrazyDaveLong1 : SoundEffect.CrazyDaveExtraLong1
        if (!raw.includes('{NO_SOUND}')) {
            const sequence = ++this.voiceSequence
            this.voicePending = true
            void SoundSystem.playFoleyExclusive(effect, 'crazyDave', 0).catch(error => console.error('[CrazyDave]', error))
                .finally(() => { if (sequence === this.voiceSequence) this.voicePending = false })
        }
    }

    private play(name: string, loop: boolean, fps: number, onFinish?: () => void): void {
        const { body, blink } = this, parts = this.config.parts
        // The hand item leaves the hand's track first: a clip without that track takes the track's node away.
        this.hand.node.setParent(this.node)
        body.change(this.config.clips[name],
            !this.started || name === 'enter' ? 0 : name === 'leave' || name.startsWith('idle') ? this.config.idleBlend : this.config.talkBlend)
        this.started = true
        body.setTrackSpriteOverride(parts.mouth, null)
        body.setTracksVisible(parts.eyes, !blink.node.active)
        body.play({ loop, rate: fps / this.config.sourceFps, timeSeconds: 0, hideOnFinish: false, onFinish })
        if (blink.node.active) blink.attachToTrack(body, parts.head)
        if (this.hand.node.active) this.hand.node.setParent(body.getTrackNode(this.config.hand.track)!)
    }

    update(dt: number): void {
        if (!this.node.active) return
        if (this.started) this.body.advance(dt)
        const layout = this.config.bubble
        if (this.shaking && this.bubble.active) this.label.setPosition(layout.textX + Math.floor(Math.random() * layout.shake), this.textY + Math.floor(Math.random() * layout.shake))
        if (this.hand.node.active) this.hand.advance(dt)
        const { body, blink } = this
        if (!this.entering && !this.leaving && (this.blinkSeconds -= dt) <= 0 && this.started) {
            const [min, max] = this.config.blinkSeconds
            this.blinkSeconds = min + Math.random() * (max - min)
            const parts = this.config.parts
            blink.attachToTrack(body, parts.head)
            blink.node.active = true
            body.setTracksVisible(parts.eyes, false)
            blink.play({ loop: false, rate: this.config.blinkFps / this.config.sourceFps, timeSeconds: 0, onFinish: () => {
                blink.node.active = false
                body.setTracksVisible(parts.eyes, true)
            } })
        }
        if (blink.node.active) blink.advance(dt)
    }
}
