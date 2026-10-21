import { _decorator, Component, isValid, Mask, Node, Sprite, type SpriteFrame } from 'cc'
import { SpriteRepository } from '@/client/content/ClientContentLoader'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { drawBungeeCord, loadDisplayParts, loadEntityDisplayAssets, type EntityDisplay, type EntityKind } from '@/client/reanim/EntityDisplay'
import { uiNode } from '@/client/view/uiNode'
import { gameClock } from '@/core/GameClock'

const { ccclass } = _decorator
const POGO_BOUNCE_TICKS = 80
const POGO_RESTART_COUNTER = 7

/** Almanac animation instances only; they do not create or update game entities. */
@ccclass('AlmanacEntityView')
export class AlmanacEntityView extends Component {
    ready: Promise<void> = Promise.resolve()
    private readonly blinks: Array<{ player: ReanimPlayer, rate: number }> = []
    private blinkCountdown = 4 + Math.random() * 4
    private readonly sockets: Array<{ node: Node, sprite: Sprite }> = []
    private motion?: { node: Node, y: number, kind: 'pogo' | 'bungee' }
    private pogo?: { player: ReanimPlayer, rate: number, counter: number, ticks: number, poseTicks: number | null }
    private cord?: { node: Node, body: ReanimPlayer }
    private elapsed = Math.random() * 2

    static create(parent: Node, kind: EntityKind, id: number, x: number, y: number, clip?: { x: number, y: number, width: number, height: number }): Node {
        const container = clip ? uiNode({
            name: 'AlmanacPortraitClip', parent, position: { x: clip.x, y: -clip.y }, anchor: { x: 0, y: 1 },
            size: clip, mask: Mask.Type.GRAPHICS_RECT,
        }).node : parent
        const root = uiNode({ name: `Almanac-${kind}-${id}`, parent: container, position: { x: x - (clip?.x ?? 0), y: -y + (clip?.y ?? 0) } }).node
        const view = root.addComponent(AlmanacEntityView)
        view.ready = view.load(kind, id)
        void view.ready.catch(error => {
            if (isValid(root, true)) console.error('[Almanac] Failed to load entity animation', kind, id, error)
        })
        return root
    }

    private async load(kind: EntityKind, id: number): Promise<void> {
        const { content, catalog } = await loadEntityDisplayAssets()
        const sprites = new SpriteRepository(content.registry, content.loader)
        const shadow = await sprites.load('pvz:plantshadow')
        const cord = kind === 'zombies' && id === 20 ? await sprites.load('pvz:bungeecord') : null
        if (!isValid(this.node, true)) return
        const definition = catalog[kind][id]
        if (!definition) throw new Error(`Almanac animation is not installed: ${kind} ${id}`)
        this.node.setPosition(this.node.position.x + definition.offset[0], this.node.position.y - definition.offset[1])
        if (definition.shadow) this.drawShadow(shadow, kind, definition)
        const scale = definition.scale ?? 1
        const [drawX, drawY] = definition.drawOffset ?? [0, 0]
        const group = uiNode({
            name: 'Animation', parent: this.node, active: false,
            position: { x: drawX + (kind === 'zombies' ? 15 + 30 * (1 - scale) : 0), y: -drawY + (kind === 'zombies' ? 8 - 120 * (1 - scale) : 0) },
        }).node
        group.setScale(scale, scale, 1)
        if (definition.motion) this.motion = { node: group, y: group.position.y, kind: definition.motion }
        // Original LoadReanim chooses the idle once when the UI instance is created.
        const parts = definition.parts.map(part => part.idle2Id && Math.random() < 0.75
            ? { ...part, id: part.idle2Id, rate: 12 + Math.random() * 12 }
            : part)
        const players = await loadDisplayParts(group, parts, content)
        if (!players) return
        if (cord) {
            const node = drawBungeeCord(group, cord, 35 - group.position.x)
            this.cord = { node, body: players.get('body')! }
        }
        const rate = definition.rate[0] + Math.random() * (definition.rate[1] - definition.rate[0])
        for (const part of parts) {
            const player = players.get(part.name)!
            if (part.socket) {
                const sprite = players.get(part.parent!)!.getTrackNode(part.track!)!.getComponent(Sprite)!
                player.node.active = sprite.enabled
                this.sockets.push({ node: player.node, sprite })
            }
            if (part.blink) {
                this.blinks.push({ player, rate: 15 / part.fps })
            } else if (definition.motion === 'pogo' && part.name === 'body') {
                // ZombieInitialize holds the last pose until the first landing animation.
                player.pause()
                player.seek(player.lastFrameTimeSeconds)
                this.pogo = { player, rate: 40 / part.fps, counter: 1 + Math.floor(Math.random() * POGO_BOUNCE_TICKS), ticks: 0, poseTicks: null }
            } else player.play({
                loop: true, rate: (part.rate ?? rate) / part.fps,
                timeSeconds: part.idle2Id ? Math.random() * 0.99 * player.lastFrameTimeSeconds : 0,
            })
        }
        this.update(0)
        group.active = true
    }

    private drawShadow(frame: SpriteFrame, kind: EntityKind, definition: EntityDisplay): void {
        const [x, y] = definition.shadowOffset ?? (kind === 'plants' ? [-3, 51] : [23, 92])
        const shadow = uiNode({ name: 'Shadow', parent: this.node, position: { x: x + frame.originalSize.width / 2, y: -y - frame.originalSize.height / 2 },
            anchor: { x: 0.5, y: 0.5 }, sprite: { frame, sizeMode: Sprite.SizeMode.RAW, trim: false } }).node
        const scale = definition.shadowScale ?? 1
        shadow.setScale(scale, scale, 1)
    }

    protected update(dt: number): void {
        const delta = gameClock.delta(dt)
        this.elapsed += delta
        if (this.motion?.kind === 'pogo' && this.pogo) {
            const { node, y } = this.motion
            const pogo = this.pogo
            pogo.ticks += delta * 100
            while (pogo.ticks >= 1) {
                pogo.ticks--
                pogo.counter--
                if (pogo.counter === POGO_RESTART_COUNTER) pogo.poseTicks = 0
                if (pogo.poseTicks !== null) pogo.poseTicks++
                if (pogo.counter === 0) pogo.counter = POGO_BOUNCE_TICKS
            }
            const phase = 1 - pogo.counter / POGO_BOUNCE_TICKS
            const bounce = 1 - Math.abs(2 * phase - 1)
            node.setPosition(node.position.x, y + 9 + 40 * (2 * bounce - bounce * bounce))
            if (pogo.poseTicks !== null) {
                // Native play-once time spans all frames, with the final frame held.
                const progress = Math.min(1, pogo.poseTicks * 0.01 * pogo.rate / pogo.player.durationSeconds)
                pogo.player.seek(progress * pogo.player.lastFrameTimeSeconds)
            }
        } else if (this.motion?.kind === 'bungee') {
            const { node, y } = this.motion
            node.setPosition(node.position.x, y + 40 * (1 - Math.sin(2 * Math.PI * (this.elapsed % 2) / 2)))
        }
        for (const socket of this.sockets) socket.node.active = socket.sprite.enabled
        if (this.blinks.length && (this.blinkCountdown -= delta) <= 0) {
            const blink = this.blinks[Math.floor(Math.random() * this.blinks.length)]
            blink.player.play({ loop: false, rate: blink.rate, timeSeconds: 0 })
            this.blinkCountdown = 4 + Math.random() * 4
        }
    }

    protected lateUpdate(): void {
        if (this.cord) this.cord.node.setPosition(this.cord.node.position.x, this.cord.body.getTrackNode('Zombie_bungi_body')!.position.y)
    }
}
