import { EventMouse, EventTouch, type EventKeyboard, input, Input, KeyCode, Node, Vec3 } from 'cc'
import { UIHoverManager } from '@/client/input/UIHoverManager'
import { gameClock } from '@/core/GameClock'
import { uiNode } from '@/client/view/uiNode'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { boardCell } from './LevelGeometry'
import type { LevelGame } from './LevelGame'
import { LevelView } from './LevelView'
import type { UIButton } from '@/client/ui/UIButton'

const WIDTH = 800
const HEIGHT = 600

export class LevelInputPresenter {
    private enabled = false
    private started = false
    private previousSpeed = 1
    private readonly buttons: UIButton[] = []

    constructor(
        private readonly node: Node,
        private readonly game: LevelGame,
        private readonly view: LevelView,
        private readonly onMenu: () => void = () => {},
    ) {}

    start(): void {
        if (this.started) {
            this.resume()
            return
        }
        this.started = true
        this.enabled = true
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this)
        this.node.on(Node.EventType.TOUCH_MOVE, this.onPointerMove, this, true)
        this.node.on(Node.EventType.MOUSE_DOWN, this.onMouseDown, this)
        this.node.on(Node.EventType.MOUSE_MOVE, this.onPointerMove, this)
        this.node.on(Node.EventType.MOUSE_LEAVE, this.onPointerLeave, this)
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this)
        this.buttons.push(...this.view.bindSeedPackets(seedId => this.selectSeedPacket(seedId)), this.view.bindMenu(() => {
            if (!this.enabled || !this.view.introComplete) return
            if (this.game.render().cursor.mode === 'seed') this.cancelPlanting()
            else this.onMenu()
        }))
        for (const button of this.buttons) {
            button.canInteract = () => {
                if (!this.enabled) return false
                const snapshot = this.game.render()
                return snapshot.result === 'playing' && snapshot.cursor.mode !== 'seed'
            }
        }
    }

    destroy(): void {
        this.enabled = false
        this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this)
        this.node.off(Node.EventType.TOUCH_MOVE, this.onPointerMove, this, true)
        this.node.off(Node.EventType.MOUSE_DOWN, this.onMouseDown, this)
        this.node.off(Node.EventType.MOUSE_MOVE, this.onPointerMove, this)
        this.node.off(Node.EventType.MOUSE_LEAVE, this.onPointerLeave, this)
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this)
        for (const button of this.buttons) if (button.isValid) button.enabled = false
        this.view.resetCursor()
    }

    suspend(): void {
        this.enabled = false
        for (const button of this.buttons) if (button.isValid) button.enabled = false
        this.view.setPointer()
        this.view.resetCursor()
    }

    resume(): void {
        if (this.started && this.node.isValid) {
            this.enabled = true
            for (const button of this.buttons) if (button.isValid) button.enabled = true
        }
    }

    private selectSeedPacket(seedId: string): void {
        if (!this.enabled || !this.view.introComplete) return
        const snapshot = this.game.render()
        if (snapshot.phase !== 'gameplay' || snapshot.result !== 'playing') return
        if (snapshot.cursor.mode === 'seed') {
            this.cancelPlanting()
            return
        }
        const packet = snapshot.seedPackets.find(value => value.seedId === seedId)
        this.view.audio.seedPacketSelected(
            packet?.cooldownRemaining ?? 0,
            !!packet && ((snapshot.extensions['pvz:debug'] as { sunCost?: boolean } | undefined)?.sunCost === false || snapshot.availableSun >= this.game.definitions.seeds[packet.seedId].sunCost),
        )
        this.game.command({ type: 'selectSeed', seedId })
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
        const point = this.boardPixel(event)
        this.view.setPointer(point)
        const snapshot = this.game.render()
        if ((snapshot.extensions['pvz:debug'] as { collect?: string } | undefined)?.collect === 'move'
            && snapshot.result === 'playing' && snapshot.cursor.mode === 'none') this.collectAt(point.x, point.y, false)
    }

    private onPointerLeave(event: EventMouse): void {
        if (!this.enabled) return
        // Changing the hovered child also emits leave events inside the board.
        const { x, y } = this.boardPixel(event)
        if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) return
        this.view.setPointer()
    }

    private onPointer(event: EventTouch | EventMouse): void {
        if (!this.view.introComplete) return
        const { x, y } = this.boardPixel(event)
        this.view.setPointer({ x, y })
        const snapshot = this.game.render()
        if (snapshot.phase !== 'gameplay' || snapshot.result !== 'playing') return
        if (snapshot.cursor.mode === 'seed') {
            const board = this.view.board
            const { row, column } = boardCell(board, x, y)
            if (x < board.origin.x || y < board.origin.y) this.cancelPlanting()
            else this.game.command({
                type: 'placePlant',
                row: Math.max(0, Math.min(board.rows - 1, row)),
                column: Math.max(0, Math.min(board.columns - 1, column)),
            })
            return
        }
        this.collectAt(x, y)
    }

    private collectAt(x: number, y: number, includeAward = true): void {
        const snapshot = this.game.render()
        for (let index = snapshot.items.length - 1; index >= 0; index--) {
            const item = snapshot.items[index]
            const definition = this.game.definitions.items[item.typeId]
            if (!includeAward && !definition) continue
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

    private onKeyDown(event: EventKeyboard): void {
        if (!this.enabled || !GameDebugSettings.hotkeysEnabled || UIHoverManager.isModalBlocked || !this.view.introComplete) return
        const packetIndex = event.keyCode - KeyCode.DIGIT_1
        if (packetIndex >= 0 && packetIndex < 9) {
            const packet = this.game.render().seedPackets[packetIndex]
            if (packet) this.selectSeedPacket(packet.seedId)
        }
        else if (event.keyCode === KeyCode.KEY_D) {
            if (gameClock.speed > 0) { this.previousSpeed = gameClock.speed; gameClock.setSpeed(0) }
            else gameClock.setSpeed(this.previousSpeed)
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
