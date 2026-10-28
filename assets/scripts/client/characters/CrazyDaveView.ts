import { Color, Node } from 'cc'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { SpriteRepository, type ClientContentLoader } from '@/client/content/ClientContentLoader'
import type { ContentRegistry } from '@/client/content/ContentRegistry'
import { uiNode } from '@/client/view/uiNode'
import { UI } from '@/client/ui/UI'
import type { UILabel } from '@/client/ui/UILabel'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import type { PresentationDefinitions } from '@/shared/content/presentation'

/** Dave's original talk/idle/enter clips, token-controlled mouth, hand item and speech bubble. */
export class CrazyDaveView {
    private current?: ReanimPlayer
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

    static async create(parent: Node, content: {
        registry: ContentRegistry, loader: ClientContentLoader, presentation: Pick<PresentationDefinitions, 'dave'>,
    }, ui: UI, options: {
        position?: { x: number, y: number }, bubble?: Partial<PresentationDefinitions['dave']['bubble']>, clickToContinue?: boolean,
    } = {}): Promise<CrazyDaveView> {
        const root = uiNode({ name: 'CrazyDave', parent, position: options.position, anchor: { x: 0, y: 1 }, active: false }).node
        root.once(Node.EventType.NODE_DESTROYED, () => SoundSystem.stopExclusive('crazyDave'))
        const config = { ...content.presentation.dave, bubble: { ...content.presentation.dave.bubble, ...options.bubble } }
        const layout = config.bubble
        const sprites = new SpriteRepository(content.registry, content.loader)
        const bubble = ui.image(root, await sprites.load(layout.sprite), layout).node
        const label = ui.label(bubble, { text: '', font: 'profile', width: layout.textWidth, x: layout.textX, y: layout.textY, align: 'center', color: Color.BLACK })
        const hint = options.clickToContinue === false ? undefined : ui.label(bubble, {
            text: ui.text('CLICK_TO_CONTINUE'), font: 'packetCost', x: layout.continueX, y: layout.continueY,
            align: 'center', baseline: true, color: Color.BLACK,
        }).node
        bubble.active = false
        const entries = await Promise.all(Object.entries(config.clips).map(async ([name, id]) => {
            const node = uiNode({ name: name, parent: root, active: false }).node
            const player = node.addComponent(ReanimPlayer)
            await player.load(id, content.registry, content.loader)
            player.enabled = false
            return [name, player] as const
        }))
        const hand = uiNode({ name: 'HandItem', parent: root, position: config.hand }).node.addComponent(ReanimPlayer)
        await hand.load(config.hand.reanim, content.registry, content.loader)
        hand.node.setScale(config.hand.scale, config.hand.scale, 1)
        const players = new Map(entries)
        // Parenting the entire item applies hand motion to its offset and scale as well as its tracks.
        hand.node.setParent(players.get('idle_handing')!.getTrackNode(config.hand.track)!, true)
        hand.enabled = false
        hand.node.active = false
        hand.play({ loop: true })
        const mouths = await Promise.all(Object.entries(config.mouths).map(async ([token, id]) => [token, await sprites.load(id)] as const))
        root.active = false
        return new CrazyDaveView(root, bubble, label, players, hand, new Map(mouths), config, hint)
    }

    private constructor(readonly node: Node, private bubble: Node, private label: UILabel,
        private players: Map<string, ReanimPlayer>, private hand: ReanimPlayer,
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
            this.current?.setTrackSpriteOverride('Dave_mouths', mouth ? this.mouths.get(mouth)! : null)
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
        const next = this.players.get(name)!
        if (this.current && name !== 'enter') {
            next.blendFrom(this.current, name === 'leave' || name.startsWith('idle') ? this.config.idleBlend : this.config.talkBlend)
        }
        if (this.current && this.current !== next) this.current.node.active = false
        this.current = next
        next.node.active = true
        next.setTrackSpriteOverride('Dave_mouths', null)
        next.setTrackPrefixVisible('Dave_blink', false)
        const blink = this.players.get('blink')!
        next.getTrackNode('Dave_eye')!.active = !blink.node.active
        next.play({ loop, rate: fps / this.config.sourceFps, timeSeconds: 0, hideOnFinish: false, onFinish })
        if (blink.node.active) blink.attachToTrack(next, 'Dave_head')
        if (this.hand.node.active) this.hand.node.setParent(next.getTrackNode(this.config.hand.track)!)
    }

    update(dt: number): void {
        if (!this.node.active) return
        this.current?.advance(dt)
        const layout = this.config.bubble
        if (this.shaking && this.bubble.active) this.label.setPosition(layout.textX + Math.floor(Math.random() * layout.shake), this.textY + Math.floor(Math.random() * layout.shake))
        if (this.hand.node.active) this.hand.advance(dt)
        const blink = this.players.get('blink')!
        if (!this.entering && !this.leaving && (this.blinkSeconds -= dt) <= 0 && this.current) {
            const [min, max] = this.config.blinkSeconds
            this.blinkSeconds = min + Math.random() * (max - min)
            blink.attachToTrack(this.current, 'Dave_head')
            blink.node.active = true
            this.current.getTrackNode('Dave_eye')!.active = false
            blink.play({ loop: false, rate: this.config.blinkFps / this.config.sourceFps, timeSeconds: 0, onFinish: () => {
                blink.node.active = false
                if (this.current) this.current.getTrackNode('Dave_eye')!.active = true
            } })
        }
        if (blink.node.active) blink.advance(dt)
    }
}
