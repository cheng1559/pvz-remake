import { EventMouse, EventTouch, Node, Vec3 } from 'cc'
import { uiNode } from '@/client/view/uiNode'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import type { Adventure11Game } from './IntegratedAdventure11Showcase'
import { Adventure11View } from './Adventure11View'

const WIDTH = 800
const HEIGHT = 600

export class Adventure11InputPresenter {
    private enabled = false
    private started = false

    constructor(
        private readonly node: Node,
        private readonly game: Adventure11Game,
        private readonly view: Adventure11View,
    ) {}

    start(): void {
        if (this.started) {
            this.resume()
            return
        }
        this.started = true
        this.enabled = true
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this)
        this.node.on(Node.EventType.TOUCH_MOVE, this.onPointerMove, this)
        this.node.on(Node.EventType.MOUSE_DOWN, this.onMouseDown, this)
        this.node.on(Node.EventType.MOUSE_MOVE, this.onPointerMove, this)
        this.node.on(Node.EventType.MOUSE_LEAVE, this.onPointerLeave, this)
        this.view.bindSeedPacket(() => this.selectSeedPacket())
    }

    destroy(): void {
        this.enabled = false
        this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this)
        this.node.off(Node.EventType.TOUCH_MOVE, this.onPointerMove, this)
        this.node.off(Node.EventType.MOUSE_DOWN, this.onMouseDown, this)
        this.node.off(Node.EventType.MOUSE_MOVE, this.onPointerMove, this)
        this.node.off(Node.EventType.MOUSE_LEAVE, this.onPointerLeave, this)
        this.view.resetCursor()
    }

    suspend(): void {
        this.enabled = false
        this.view.setPointer()
        this.view.resetCursor()
    }

    resume(): void {
        if (this.started && this.node.isValid) this.enabled = true
    }

    private selectSeedPacket(): void {
        if (!this.enabled || !this.view.introComplete) return
        const snapshot = this.game.render()
        if (snapshot.phase !== 'gameplay' || snapshot.result !== 'playing') return
        if (snapshot.cursor.mode === 'seed') {
            this.cancelPlanting()
            return
        }
        const packet = snapshot.seedPackets.find(value => value.seedId === 'pvz:peashooter')
        this.view.audio.seedPacketSelected(
            packet?.cooldownRemaining ?? 0,
            !!packet && snapshot.availableSun >= this.game.definitions.seeds[packet.seedId].sunCost,
        )
        this.game.command({ type: 'selectSeed', seedId: 'pvz:peashooter' })
    }

    private onTouchStart(event: EventTouch): void {
        if (this.enabled && GameDebugSettings.isMobileMode()) this.onPointer(event)
    }

    private onMouseDown(event: EventMouse): void {
        if (!this.enabled || GameDebugSettings.isMobileMode()) return
        if (event.getButton() === 2) {
            this.cancelPlanting()
            return
        }
        if (event.getButton() === 0) this.onPointer(event)
    }

    private onPointerMove(event: EventTouch | EventMouse): void {
        if (!this.enabled || (event instanceof EventMouse
            ? GameDebugSettings.isMobileMode()
            : !GameDebugSettings.isMobileMode())) return
        this.view.setPointer(this.boardPixel(event))
    }

    private onPointerLeave(): void {
        if (!this.enabled) return
        this.view.setPointer()
    }

    private onPointer(event: EventTouch | EventMouse): void {
        if (!this.view.introComplete) return
        const { x, y } = this.boardPixel(event)
        this.view.setPointer({ x, y })
        const snapshot = this.game.render()
        if (snapshot.phase !== 'gameplay' || snapshot.result !== 'playing') return
        if (snapshot.cursor.mode === 'seed') {
            if (x < 40 || y < 80) this.cancelPlanting()
            else this.game.command({
                type: 'placePlant',
                row: Math.max(0, Math.min(4, Math.floor((y - 80) / 100))),
                column: Math.max(0, Math.min(8, Math.floor((x - 40) / 80))),
            })
            return
        }
        for (let index = snapshot.items.length - 1; index >= 0; index--) {
            const item = snapshot.items[index]
            const definition = this.game.definitions.items[item.typeId]
            const extra = definition ? 15 : 0
            const width = definition?.width ?? 50
            const height = definition?.height ?? 70
            if (item.state !== 'collecting' && x >= item.x - extra && x < item.x + width + extra &&
                y >= item.y - extra && y < item.y + height + extra) {
                this.game.command({ type: 'collectItemAt', itemId: item.entityId })
                return
            }
        }
    }

    private cancelPlanting(): void {
        if (this.game.render().cursor.mode !== 'seed') return
        this.game.command({ type: 'clearCursor' })
        this.view.audio.plantingCancelled()
    }

    private boardPixel(event: EventTouch | EventMouse): { x: number, y: number } {
        const ui = event.getUILocation()
        const local = uiNode({ node: this.node }).transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y))
        return { x: local.x + WIDTH / 2, y: HEIGHT / 2 - local.y }
    }
}
