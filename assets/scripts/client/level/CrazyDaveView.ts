import { Color, Node } from 'cc'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { SpriteRepository } from '@/client/content/ClientContentLoader'
import { uiNode } from '@/client/view/uiNode'
import { UI } from '@/client/ui/UI'
import type { UILabel } from '@/client/ui/UILabel'
import { SoundEffect, SoundLoader } from '@/client/sound/LegacySoundSystem'
import type { LoadedContent } from './LevelView'
import type { PresentationDefinitions } from '@/shared/content/presentation'

/** Dave's original talk/idle/enter clips, token-controlled mouth, hand item and speech bubble. */
export class CrazyDaveView {
    private current?: ReanimPlayer
    private index?: number
    private pending?: number
    private entering = false
    private leaving = false
    private blinkSeconds: number
    private shaking = false
    private textY = 0

    static async create(parent: Node, content: LoadedContent, ui: UI): Promise<CrazyDaveView> {
        const root = uiNode({ name: 'CrazyDave', parent, anchor: { x: 0, y: 1 } }).node
        const config = content.presentation.dave
        const layout = config.bubble
        const sprites = new SpriteRepository(content.registry, content.loader)
        const bubble = ui.image(root, await sprites.load(layout.sprite), layout).node
        const label = ui.label(bubble, { text: '', font: 'profile', width: layout.textWidth, x: layout.textX, y: layout.textY, align: 'center', color: Color.BLACK })
        ui.label(bubble, { text: ui.text('CLICK_TO_CONTINUE'), font: 'packetCost', x: layout.continueX, y: layout.continueY, align: 'center', baseline: true, color: Color.BLACK })
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
        return new CrazyDaveView(root, bubble, label, players, hand, new Map(mouths), ui, config)
    }

    private constructor(readonly node: Node, private bubble: Node, private label: UILabel,
        private players: Map<string, ReanimPlayer>, private hand: ReanimPlayer,
        private mouths: Map<string, import('cc').SpriteFrame>, private ui: UI, private config: PresentationDefinitions['dave']) {
        this.blinkSeconds = config.blinkSeconds[0]
    }

    get busy(): boolean { return this.node.active }
    get canAdvance(): boolean { return this.node.active && this.bubble.active && !this.entering && !this.leaving }

    sync(index?: number): void {
        if (index === this.index && !this.entering && (index !== undefined || !this.node.active || this.leaving)) return
        this.pending = index
        if (this.entering || this.leaving) return
        if (index === undefined) {
            if (this.node.active && !this.leaving) {
                this.index = undefined
                this.bubble.active = false
                this.hand.node.active = false
                this.leaving = true
                SoundLoader.stopExclusive('crazyDave')
                this.play('leave', false, this.config.transitionFps, () => {
                    this.node.active = false
                    this.leaving = false
                    if (this.pending !== undefined) this.sync(this.pending)
                })
            }
            return
        }
        if (!this.node.active) {
            this.node.active = true
            this.entering = true
            this.play('enter', false, this.config.transitionFps, () => { this.entering = false; this.show(this.pending) })
        } else this.show(index)
    }

    private show(index?: number): void {
        if (index === undefined) { this.sync(); return }
        this.index = index
        const raw = this.ui.text(`CRAZY_DAVE_${index}`)
        const text = raw.replace(/\{[^}]*\}/g, '').trim()
        this.label.text = text
        const layout = this.config.bubble
        this.textY = layout.textY + Math.trunc((layout.textHeight - this.label.renderer.contentHeight) / 2)
        this.label.setPosition(layout.textX, this.textY)
        this.shaking = raw.includes('{SHAKE}')
        this.bubble.active = true
        const handing = raw.includes('{SHOW_WALLNUT}')
        this.hand.node.active = handing
        const animation = handing ? 'talk_handing' : raw.includes('{SHAKE}') ? 'crazy'
            : raw.includes('{SCREAM}') || text.length < this.config.talkLengths[0] ? 'smalltalk' : text.length < this.config.talkLengths[1] ? 'mediumtalk' : 'blahblah'
        this.play(animation, false, this.config.talkFps, () => {
            this.play(handing ? 'idle_handing' : 'idle', true, this.config.talkFps)
            const mouth = [...this.mouths.keys()].find(token => raw.includes(`{${token}}`))
            this.current?.setTrackSpriteOverride('Dave_mouths', mouth ? this.mouths.get(mouth)! : null)
        })
        const effect = raw.includes('{SHAKE}') ? SoundEffect.CrazyDaveCrazy : handing ? SoundEffect.CrazyDaveScream2
            : raw.includes('{SCREAM}') ? SoundEffect.CrazyDaveScream : text.length < this.config.talkLengths[0] ? SoundEffect.CrazyDaveShort1
                : text.length < this.config.talkLengths[1] ? SoundEffect.CrazyDaveLong1 : SoundEffect.CrazyDaveExtraLong1
        void SoundLoader.playFoleyExclusive(effect, 'crazyDave', 0)
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
        next.setTrackPrefixVisible('Dave_eye', !blink.node.active)
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
            this.current.setTrackPrefixVisible('Dave_eye', false)
            blink.play({ loop: false, rate: this.config.blinkFps / this.config.sourceFps, timeSeconds: 0, onFinish: () => {
                blink.node.active = false
                this.current?.setTrackPrefixVisible('Dave_eye', true)
            } })
        }
        if (blink.node.active) blink.advance(dt)
    }
}
