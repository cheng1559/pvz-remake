import { EventMouse, EventTouch, type EventKeyboard, input, Input, KeyCode, Node, UITransform, type Vec2, Vec3 } from 'cc'
import { UIHoverManager } from '@/client/input/UIHoverManager'
import { gameClock } from '@/core/GameClock'
import { uiNode } from '@/client/view/uiNode'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { boardCell, levelAwardSize } from './LevelGeometry'
import type { LevelGame } from './LevelGame'
import { LevelView } from './LevelView'
import type { UIButton } from '@/client/ui/UIButton'
import type { WorldSnapshot } from '@/shared/protocol'

const WIDTH = 800
const HEIGHT = 600
const MOBILE_SWIPE_STEP = 24

interface MobilePress {
    id: number
    point: { x: number, y: number }
    location: Vec2
    windowId: number
    source?: Node
    leftSource: boolean
    cancelInside: boolean
}

export class LevelInputPresenter {
    private enabled = false
    private started = false
    private previousSpeed = 1
    private readonly buttons: UIButton[] = []
    private seedButtons: UIButton[] = []
    private toolButtons: Array<{ toolId: string; button: UIButton }> = []
    private mobilePress?: MobilePress

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
        this.node.on(Node.EventType.TOUCH_START, this.onTouchStart, this, true)
        this.node.on(Node.EventType.TOUCH_MOVE, this.onPointerMove, this, true)
        this.node.on(Node.EventType.TOUCH_END, this.onTouchEnd, this, true)
        this.node.on(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this, true)
        this.node.on(Node.EventType.MOUSE_DOWN, this.onMouseDown, this)
        this.node.on(Node.EventType.MOUSE_MOVE, this.onPointerMove, this)
        this.node.on(Node.EventType.MOUSE_LEAVE, this.onPointerLeave, this)
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this)
        input.on(Input.EventType.KEY_PRESSING, this.onKeyPressing, this)
        this.seedButtons = this.view.bindSeedPackets(index => this.selectSeedPacket(index))
        this.toolButtons = this.view.bindTools(id => this.selectTool(id))
        for (const button of [...this.seedButtons, ...this.toolButtons.map(entry => entry.button)]) button.hapticsEnabled = false
        this.buttons.push(...this.seedButtons, ...this.toolButtons.map(entry => entry.button), this.view.bindMenu(() => {
            if (!this.enabled || !this.view.canOpenMenu) return
            if (this.game.render().cursor.mode !== 'none') this.cancelPlanting()
            else this.onMenu()
        }))
        for (const button of this.buttons) {
            button.canInteract = () => {
                if (!this.enabled) return false
                const snapshot = this.game.render()
                return snapshot.result === 'playing' && snapshot.cursor.mode === 'none'
            }
        }
    }

    destroy(): void {
        this.enabled = false
        this.mobilePress = undefined
        this.node.off(Node.EventType.TOUCH_START, this.onTouchStart, this, true)
        this.node.off(Node.EventType.TOUCH_MOVE, this.onPointerMove, this, true)
        this.node.off(Node.EventType.TOUCH_END, this.onTouchEnd, this, true)
        this.node.off(Node.EventType.TOUCH_CANCEL, this.onTouchEnd, this, true)
        this.node.off(Node.EventType.MOUSE_DOWN, this.onMouseDown, this)
        this.node.off(Node.EventType.MOUSE_MOVE, this.onPointerMove, this)
        this.node.off(Node.EventType.MOUSE_LEAVE, this.onPointerLeave, this)
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this)
        input.off(Input.EventType.KEY_PRESSING, this.onKeyPressing, this)
        for (const button of this.buttons) if (button.isValid) button.enabled = false
        this.view.resetCursor()
    }

    suspend(): void {
        this.enabled = false
        this.mobilePress = undefined
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

    private selectSeedPacket(index: number, replace = false): void {
        if (!this.enabled || !this.view.introComplete) return
        const snapshot = this.game.render()
        if (snapshot.paused || snapshot.phase !== 'gameplay' || snapshot.result !== 'playing') return
        const packet = this.view.seedPacketAt(snapshot, index)
        if (!packet) return
        if (snapshot.cursor.mode !== 'none' && !replace) {
            this.cancelPlanting()
            return
        }
        this.view.audio.seedPacketSelected(packet.availability)
        this.game.command(packet.command)
    }

    private onTouchStart(event: EventTouch): void {
        if (!this.enabled || !GameDebugSettings.isMobileMode()) return
        if (this.mobilePress) { event.propagationStopped = true; return }
        if (this.view.dialogReady) {
            this.game.command({ type: 'advanceDialog' }); event.propagationStopped = true; return
        }
        const snapshot = this.game.render()
        if (snapshot.paused || snapshot.result !== 'playing') return
        const location = event.getLocation()
        const hit = (button: UIButton) => button.node.activeInHierarchy && button.interactable &&
            button.node.getComponent(UITransform)!.hitTest(location, event.windowId)
        const index = this.seedButtons.findIndex(hit)
        const tool = this.toolButtons.find(entry => hit(entry.button))
        if (!tool && !this.canUseCursor(snapshot)) return
        const packet = this.view.seedPacketAt(snapshot, index)
        const held = snapshot.cursor.mode !== 'none'
        // Let Menu keep its normal button capture when no plant is held.
        if (!held && !tool && index < 0 && hit(this.buttons[this.buttons.length - 1])) return
        const pickable = packet && !packet.selected && packet.ready && !packet.availability.reason
        if (packet && (!held || pickable)) {
            // Selection replaces the server's held packet atomically; a queued clear is not visible here yet.
            this.selectSeedPacket(index, true)
        }
        if (tool && !held) this.selectTool(tool.toolId)
        const press = this.mobilePress = {
            id: event.touch!.getID(), point: this.boardPixel(event), location, windowId: event.windowId,
            source: packet ? this.seedButtons[index].node : tool?.button.node,
            leftSource: !packet && !tool, cancelInside: held && !pickable,
        }
        this.view.setPointer(this.mobilePressReady(press) ? press.point : undefined)
        if (!held && !packet && !tool) this.collectAt(press.point.x, press.point.y)
        event.propagationStopped = true
    }

    private mobilePressReady(press: MobilePress): boolean {
        return !press.source || !press.source.getComponent(UITransform)!.hitTest(press.location, press.windowId)
    }

    private onTouchEnd(event: EventTouch): void {
        const press = this.mobilePress
        if (!this.enabled || !GameDebugSettings.isMobileMode() || !press || event.touch!.getID() !== press.id) return
        this.mobilePress = undefined
        this.view.setPointer()
        const snapshot = this.game.render()
        if (!this.canUseCursor(snapshot)) return
        this.collectAt(press.point.x, press.point.y, false)
        if (snapshot.cursor.mode === 'none') return
        event.propagationStopped = true
        // Native cancellation can have a different end position; resolve at the last tracked point, as before.
        if (this.mobilePressReady(press)) {
            this.useCursor(press.point)
            if (this.game.render().cursor.mode !== 'none') this.game.command({ type: 'clearCursor' })
        } else if (press.cancelInside || press.leftSource) this.game.command({ type: 'clearCursor' })
    }

    private onMouseDown(event: EventMouse): void {
        if (!this.enabled || GameDebugSettings.isMobileMode()) return
        if (this.view.dialogReady) { this.game.command({ type: 'advanceDialog' }); return }
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
        if (GameDebugSettings.isMobileMode()) {
            const press = this.mobilePress
            if (!press || (event as EventTouch).touch!.getID() !== press.id) return
            const snapshot = this.game.render()
            if (!this.canUseCursor(snapshot)) {
                this.mobilePress = undefined
                this.view.setPointer()
                return
            }
            const previous = press.point
            press.point = point
            press.location = event.getLocation()
            press.windowId = event.windowId
            const ready = this.mobilePressReady(press)
            press.leftSource ||= ready
            this.view.setPointer(ready ? point : undefined)
            const steps = Math.max(1, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / MOBILE_SWIPE_STEP))
            for (let step = 0; step <= steps; step++) {
                this.collectAt(previous.x + (point.x - previous.x) * step / steps,
                    previous.y + (point.y - previous.y) * step / steps, false)
            }
            return
        }
        this.view.setPointer(point)
        const snapshot = this.game.render()
        if ((snapshot.extensions['pvz:debug'] as { collect?: string } | undefined)?.collect === 'move'
            && snapshot.result === 'playing' && snapshot.cursor.mode === 'none') this.collectAt(point.x, point.y, false)
    }

    private onPointerLeave(event: EventMouse): void {
        if (!this.enabled || GameDebugSettings.isMobileMode()) return
        // Changing the hovered child also emits leave events inside the board.
        const { x, y } = this.boardPixel(event)
        if (x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT) return
        this.view.setPointer()
    }

    private onPointer(event: EventTouch | EventMouse): void {
        const { x, y } = this.boardPixel(event)
        this.view.setPointer({ x, y })
        const snapshot = this.game.render()
        if (!this.canUseCursor(snapshot)) return
        if (snapshot.cursor.mode !== 'none') this.useCursor({ x, y })
        else this.collectAt(x, y)
    }

    private selectTool(toolId: string): void {
        if (!this.enabled) return
        if (this.game.render().cursor.mode !== 'none') { this.cancelPlanting(); return }
        this.game.command({ type: 'selectTool', toolId })
        // A touch move can arrive before the next frame; confirm selection at the input boundary.
        this.game.update(0)
    }

    private canUseCursor(snapshot: WorldSnapshot): boolean {
        return !snapshot.paused && snapshot.result === 'playing' &&
            (snapshot.phase === 'gameplay' && this.view.introComplete || snapshot.cursor.mode === 'tool')
    }

    private useCursor(point: { x: number; y: number }): void {
        if (this.game.render().cursor.mode === 'tool') {
            const { row, column, inBounds } = boardCell(this.view.board, point.x, point.y)
            if (inBounds) this.game.command({ type: 'useToolAt', row, column })
            else this.cancelPlanting()
        } else this.placePlant(point)
    }

    private placePlant({ x, y }: { x: number, y: number }): void {
        const board = this.view.board
        const { row, column } = boardCell(board, x, y)
        if (x < board.origin.x || y < board.origin.y) this.cancelPlanting()
        else this.game.command({
            type: 'placePlant', row: Math.max(0, Math.min(board.rows - 1, row)),
            column: Math.max(0, Math.min(board.columns - 1, column)),
        })
    }

    private collectAt(x: number, y: number, includeAward = true): void {
        const snapshot = this.game.render()
        for (let index = snapshot.items.length - 1; index >= 0; index--) {
            const item = snapshot.items[index]
            const definition = this.game.definitions.items[item.typeId]
            if (!includeAward && !definition) continue
            const extra = definition ? 15 : 0
            const award = levelAwardSize(this.view.level.award)
            const width = definition?.width ?? award.width
            const height = definition?.height ?? award.height
            if (item.state !== 'collecting' && x >= item.x - extra && x < item.x + width + extra &&
                y >= item.y - extra && y < item.y + height + extra) {
                this.game.command({ type: 'collectItemAt', itemId: item.entityId })
                return
            }
        }
    }

    private onKeyPressing(event: EventKeyboard): void {
        // Only dialogue consumes system key repeats; board shortcuts remain single-press actions.
        if (this.view.dialogReady && (event.keyCode === KeyCode.SPACE || event.keyCode === KeyCode.ENTER)) this.onKeyDown(event)
    }

    private onKeyDown(event: EventKeyboard): void {
        const modal = UIHoverManager.activeModalRoot
        if (!this.enabled || UIHoverManager.isInputBlocked || modal && modal !== this.node && !this.node.isChildOf(modal)) return
        if (this.view.dialogReady && (event.keyCode === KeyCode.SPACE || event.keyCode === KeyCode.ENTER)) {
            this.game.command({ type: 'advanceDialog' })
            return
        }
        if (!GameDebugSettings.hotkeysEnabled) return
        if (event.keyCode === KeyCode.KEY_F) {
            const shovel = this.toolButtons.find(entry => entry.toolId === 'pvz:shovel')
            if (shovel?.button.node.activeInHierarchy && shovel.button.interactable) this.selectTool(shovel.toolId)
            return
        }
        if (!this.view.introComplete) return
        const packetIndex = event.keyCode === KeyCode.DIGIT_0 ? 9 : event.keyCode - KeyCode.DIGIT_1
        if (packetIndex >= 0 && packetIndex < 10) {
            const snapshot = this.game.render()
            if (snapshot.paused || snapshot.phase !== 'gameplay' || snapshot.result !== 'playing') return
            this.selectSeedPacket(packetIndex)
        }
        else if (event.keyCode === KeyCode.KEY_D) {
            if (gameClock.speed > 0) { this.previousSpeed = gameClock.speed; gameClock.setSpeed(0) }
            else gameClock.setSpeed(this.previousSpeed)
        }
    }

    private cancelPlanting(): void {
        if (this.game.render().cursor.mode === 'none') return
        this.game.command({ type: 'clearCursor' })
        this.view.audio.plantingCancelled()
    }

    private boardPixel(event: EventTouch | EventMouse): { x: number, y: number } {
        const ui = event.getUILocation()
        const local = uiNode({ node: this.node }).transform.convertToNodeSpaceAR(new Vec3(ui.x, ui.y))
        return { x: local.x + WIDTH / 2, y: HEIGHT / 2 - local.y }
    }
}
