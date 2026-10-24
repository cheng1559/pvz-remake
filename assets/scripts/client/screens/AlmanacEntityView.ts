import { _decorator, Component, isValid, Mask, Node, Sprite, type SpriteFrame } from 'cc'
import { SpriteRepository } from '@/client/content/ClientContentLoader'
import { ReanimPlayer } from '@/client/reanim/ReanimPlayer'
import { drawBungeeCord, loadDisplayParts, loadEntityDisplayAssets, type EntityDisplay, type EntityKind } from '@/client/reanim/EntityDisplay'
import { uiNode } from '@/client/view/uiNode'
import { gameClock } from '@/core/GameClock'
import { randomAnimationRate, type ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'

const { ccclass } = _decorator

/** Almanac animation instances only; they do not create or update game entities. */
@ccclass('AlmanacEntityView')
export class AlmanacEntityView extends Component {
    ready: Promise<void> = Promise.resolve()
    private readonly blinks: Array<{ slot: string, player: ReanimPlayer, parent?: ReanimPlayer, rate: number }> = []
    private nutBlink = false
    private animations!: ClientAnimationRegistry
    private blinkCountdown = 0
    private readonly sockets: Array<{ node: Node, sprite: Sprite }> = []
    private motion?: { node: Node, y: number, kind: 'pogo' | 'bungee' }
    private pogo?: { player: ReanimPlayer, rate: number, counter: number, ticks: number, poseTicks: number | null }
    private cord?: { node: Node, body: ReanimPlayer, track: string }
    private elapsed = 0

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
        this.animations = content.animations
        const sprites = new SpriteRepository(content.registry, content.loader)
        const shadow = await sprites.load('pvz:plantshadow')
        const config = this.animations.definitions.almanac
        const cordDefinition = kind === 'zombies' ? config.cords[id] : undefined
        const cord = cordDefinition ? await sprites.load(cordDefinition.sprite) : null
        this.elapsed = Math.random() * config.bungee.periodSeconds
        if (!isValid(this.node, true)) return
        const definition = catalog[kind][id]
        if (!definition) throw new Error(`Almanac animation is not installed: ${kind} ${id}`)
        this.nutBlink = definition.nutBlink ?? false
        this.blinkCountdown = this.animations.nextPlantBlinkTicks(this.nutBlink) / 100
        this.node.setPosition(this.node.position.x + definition.offset[0], this.node.position.y - definition.offset[1])
        if (definition.shadow) this.drawShadow(shadow, kind, definition)
        const scale = definition.scale ?? 1
        const [drawX, drawY] = definition.drawOffset ?? [0, 0]
        const { offset, scaleOffset } = config.zombieOrigin
        const group = uiNode({
            name: 'Animation', parent: this.node, active: false,
            position: { x: drawX + (kind === 'zombies' ? offset[0] + scaleOffset[0] * (1 - scale) : 0), y: -drawY + (kind === 'zombies' ? offset[1] + scaleOffset[1] * (1 - scale) : 0) },
        }).node
        group.setScale(scale, scale, 1)
        if (definition.motion) this.motion = { node: group, y: group.position.y, kind: definition.motion }
        // Original LoadReanim chooses the idle once when the UI instance is created.
        const parts = definition.parts.map(part => part.idle2Id && Math.random() < this.animations.zombieIdle2Chance
            ? { ...part, id: part.idle2Id, rate: randomAnimationRate(this.animations.rates.zombieIdle2), rateScale: part.idle2RateScale ?? 1 }
            : part)
        const players = await loadDisplayParts(group, parts, content)
        if (!players) return
        if (cord && cordDefinition) {
            const node = drawBungeeCord(group, cord, cordDefinition.x - group.position.x, 0, cordDefinition.height)
            this.cord = { node, body: players.get('body')!, track: cordDefinition.track }
        }
        const rate = randomAnimationRate(definition.rate)
        for (const part of parts) {
            const player = players.get(part.name)!
            if (part.socket) {
                const sprite = players.get(part.parent!)!.getTrackNode(part.track!)!.getComponent(Sprite)!
                player.node.active = sprite.enabled
                this.sockets.push({ node: player.node, sprite })
            }
            if (part.blink) {
                this.blinks.push({ slot: part.name, player, parent: players.get(part.parent!), rate: 15 / part.fps * (part.rateScale ?? 1) })
            } else if (definition.motion === 'pogo' && part.name === 'body') {
                // ZombieInitialize holds the last pose until the first landing animation.
                player.pause()
                player.seek(player.lastFrameTimeSeconds)
                this.pogo = { player, rate: config.pogo.rate / part.fps, counter: 1 + Math.floor(Math.random() * config.pogo.bounceTicks), ticks: 0, poseTicks: null }
            } else player.play({
                loop: true, rate: (part.rate ?? rate) / part.fps * (part.rateScale ?? 1),
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
        if (!this.animations) return
        const delta = gameClock.delta(dt)
        const config = this.animations.definitions.almanac
        this.elapsed += delta
        if (this.motion?.kind === 'pogo' && this.pogo) {
            const { node, y } = this.motion
            const pogo = this.pogo
            pogo.ticks += delta * 100
            while (pogo.ticks >= 1) {
                pogo.ticks--
                pogo.counter--
                if (pogo.counter === config.pogo.restartCounter) pogo.poseTicks = 0
                if (pogo.poseTicks !== null) pogo.poseTicks++
                if (pogo.counter === 0) pogo.counter = config.pogo.bounceTicks
            }
            const phase = 1 - pogo.counter / config.pogo.bounceTicks
            const bounce = 1 - Math.abs(2 * phase - 1)
            node.setPosition(node.position.x, y + config.pogo.offset + config.pogo.height * (2 * bounce - bounce * bounce))
            if (pogo.poseTicks !== null) {
                // Native play-once time spans all frames, with the final frame held.
                const progress = Math.min(1, pogo.poseTicks * 0.01 * pogo.rate / pogo.player.durationSeconds)
                pogo.player.seek(progress * pogo.player.lastFrameTimeSeconds)
            }
        } else if (this.motion?.kind === 'bungee') {
            const { node, y } = this.motion
            node.setPosition(node.position.x, y + config.bungee.height * (1 - Math.sin(2 * Math.PI * this.elapsed / config.bungee.periodSeconds)))
        }
        for (const socket of this.sockets) socket.node.active = socket.sprite.enabled
        if (this.blinks.length && (this.blinkCountdown -= delta) <= 0) {
            const slot = this.nutBlink ? this.animations.pickNutBlinkSlot() : null
            const blink = slot ? this.blinks.find(blink => blink.slot === slot)! : this.blinks[Math.floor(Math.random() * this.blinks.length)]
            blink.parent?.setTrackPrefixVisible('anim_eye', false)
            blink.player.play({ loop: false, rate: blink.rate, timeSeconds: 0,
                onFinish: () => blink.parent?.setTrackPrefixVisible('anim_eye', true) })
            this.blinkCountdown = this.animations.nextPlantBlinkTicks(this.nutBlink) / 100
        }
    }

    protected lateUpdate(): void {
        if (this.cord) this.cord.node.setPosition(this.cord.node.position.x, this.cord.body.getTrackNode(this.cord.track)!.position.y)
    }
}
