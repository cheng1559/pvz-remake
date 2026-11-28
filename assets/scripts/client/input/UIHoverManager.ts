import { input, Input, Node, screen, type EventMouse, type EventTouch, type Vec2 } from 'cc'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { CursorManager } from './CursorManager'

export interface UIHoverPointer { location: Vec2, uiLocation: Vec2, windowId: number, canHover: boolean }
export interface UIHoverClient {
    cursor?: 'pointer' | 'text' | 'grabbing'
    clearHover(): void
    refreshHover(pointer: UIHoverPointer, modalRoot: Node | null): boolean
    handleTouch?(event: EventTouch): void
}

const TOUCH_EVENTS = [Input.EventType.TOUCH_START, Input.EventType.TOUCH_MOVE, Input.EventType.TOUCH_END, Input.EventType.TOUCH_CANCEL] as const
/** In mobile mode a touch that starts this close to the screen's left or right edge, in points, is the hand holding the device. */
const EDGE_GUARD_POINTS = 24

/** Shared hover/cursor ownership, following the reference UIHoverManager. */
export class UIHoverManager {
    private static readonly clients = new Set<UIHoverClient>()
    private static readonly modalRoots: Node[] = []
    private static root: Node | null = null
    private static pointer: UIHoverPointer | null = null
    private static blocks = 0
    /** The touches turned away at the edges (turnsAway), by ID, until they end. */
    private static readonly guarded = new Set<number>()
    /** The cursor while nothing is hovered. */
    private static idleCursor: 'default' | 'none' = 'default'
    static hasHover = false

    static get isInputBlocked(): boolean { return this.blocks > 0 }
    static get activeModalRoot(): Node | null {
        let active: Node | null = null
        for (let i = 0; i < this.modalRoots.length;) {
            const root = this.modalRoots[i]
            if (!root.isValid || !root.activeInHierarchy) { this.modalRoots.splice(i, 1); continue }
            // A dialog remains above its page even if the page scope was registered later.
            if (!active || !active.isChildOf(root)) active = root
            i++
        }
        return active
    }
    static get isModalBlocked(): boolean { return this.activeModalRoot !== null || this.isInputBlocked }

    static start(root: Node): void {
        this.stop()
        this.root = root
        for (const event of [Input.EventType.MOUSE_DOWN, Input.EventType.MOUSE_MOVE, Input.EventType.MOUSE_UP] as const) {
            root.on(event, this.trackMouse, this, true)
            input.on(event, this.trackMouse, this)
        }
        for (const event of TOUCH_EVENTS) {
            // First, so a touch turned away reaches neither the root's other listeners nor any node under it.
            root.on(event, this.guardEdges, this, true)
            root.on(event, this.rememberTouchEvent, this, true)
            input.on(event, this.inputTouch, this)
        }
        root.on(Input.EventType.TOUCH_START, this.beginTouch, this)
    }

    static stop(): void {
        for (const event of [Input.EventType.MOUSE_DOWN, Input.EventType.MOUSE_MOVE, Input.EventType.MOUSE_UP] as const) {
            this.root?.off(event, this.trackMouse, this, true)
            input.off(event, this.trackMouse, this)
        }
        for (const event of TOUCH_EVENTS) {
            this.root?.off(event, this.guardEdges, this, true)
            this.root?.off(event, this.rememberTouchEvent, this, true)
            input.off(event, this.inputTouch, this)
        }
        this.root?.off(Input.EventType.TOUCH_START, this.beginTouch, this)
        this.guarded.clear()
        this.root = null
        this.pointer = null
        this.blocks = 0
        this.modalRoots.length = 0
        this.idleCursor = 'default'
        this.clearHoverStates()
    }

    /** Board::UpdateCursor: the system cursor hides while the game draws its own (the Whack-a-Zombie mallet) and nothing is hovered. */
    static setIdleCursor(cursor: 'default' | 'none'): void {
        if (cursor === this.idleCursor) return
        this.idleCursor = cursor
        this.refreshHoverStates()
    }

    static registerClient(client: UIHoverClient): void { this.clients.add(client) }
    static unregisterClient(client: UIHoverClient): void { this.clients.delete(client) }

    private static trackMouse(event: EventMouse): void {
        this.rememberMouseEvent(event, event.type === Input.EventType.MOUSE_MOVE)
    }

    static rememberMouseEvent(event: EventMouse, refresh = true): void {
        if (GameDebugSettings.isMobileMode()) return
        this.pointer = { location: event.getLocation().clone(), uiLocation: event.getUILocation().clone(), windowId: event.windowId, canHover: true }
        if (refresh) this.refreshHoverStates()
    }

    static rememberTouchEvent(event: EventTouch): void {
        if (!GameDebugSettings.isMobileMode()) return
        this.pointer = { location: event.touch!.getLocation().clone(), uiLocation: event.getUILocation().clone(), windowId: event.windowId, canHover: false }
        if (event.type !== Input.EventType.TOUCH_START) {
            for (const client of this.clients) client.handleTouch?.(event)
        }
        this.refreshHoverStates()
    }

    /**
     * Whether a touch is the hand holding the device: in mobile mode one that starts within EDGE_GUARD_POINTS of the
     * screen's left or right edge, and each later event of it until it ends. One that starts further in may move to the
     * edge. A touch's location is in the screen's pixels, as the debug console's corner reads it (GameApp).
     */
    private static turnsAway(event: EventTouch): boolean {
        const touch = event.touch!, id = touch.getID()
        if (event.type === Input.EventType.TOUCH_START) {
            // A new touch may take the ID of one whose end never came.
            this.guarded.delete(id)
            const band = EDGE_GUARD_POINTS * screen.devicePixelRatio, x = touch.getLocation().x
            if (!GameDebugSettings.isMobileMode() || (x >= band && x <= screen.windowSize.width - band)) return false
            this.guarded.add(id)
            return true
        }
        if (!this.guarded.has(id)) return false
        if (event.type === Input.EventType.TOUCH_END || event.type === Input.EventType.TOUCH_CANCEL) this.guarded.delete(id)
        return true
    }

    /** On the root, before its other listeners: a touch turned away goes no further, to no node under it. */
    private static guardEdges(event: EventTouch): void {
        if (this.turnsAway(event)) event.propagationStopped = event.propagationImmediateStopped = true
    }

    /** A touch no node took, from the input itself: turned away as on the root, else remembered, and begun as it starts. */
    private static inputTouch(event: EventTouch): void {
        if (this.turnsAway(event)) return
        this.rememberTouchEvent(event)
        if (event.type === Input.EventType.TOUCH_START) this.beginTouch(event)
    }

    private static beginTouch(event: EventTouch): void {
        if (!GameDebugSettings.isMobileMode() || this.isInputBlocked) return
        // Only unclaimed background touches reach here; controls keep their own drag gestures.
        for (const client of this.clients) client.handleTouch?.(event)
        this.refreshHoverStates()
    }

    static beginModalBlock(root: Node): void {
        this.removeModal(root)
        this.modalRoots.push(root)
        this.clearHoverStates()
        this.refreshHoverStates()
    }

    static endModalBlock(root: Node): void {
        this.removeModal(root)
        this.refreshHoverStates()
    }

    static beginInputBlock(): void { this.blocks++; this.clearHoverStates() }
    static endInputBlock(): void { this.blocks = Math.max(0, this.blocks - 1); this.refreshHoverStates() }

    static refreshHoverStates(): void {
        if (this.isInputBlocked || !this.pointer) { this.clearHoverStates(); return }
        let cursor: string | undefined
        for (const client of this.clients) {
            if (client.refreshHover(this.pointer, this.activeModalRoot) && cursor !== 'grabbing') cursor = client.cursor ?? 'pointer'
        }
        this.hasHover = cursor !== undefined
        CursorManager.set(cursor ?? this.idleCursor)
    }

    private static clearHoverStates(): void {
        for (const client of this.clients) client.clearHover()
        this.hasHover = false
        CursorManager.set(this.idleCursor)
    }

    private static removeModal(root: Node): void {
        const index = this.modalRoots.indexOf(root)
        if (index >= 0) this.modalRoots.splice(index, 1)
    }
}
