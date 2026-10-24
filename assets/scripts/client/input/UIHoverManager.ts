import { input, Input, Node, type EventMouse, type EventTouch, type Vec2 } from 'cc'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import { CursorManager } from './CursorManager'

export interface UIHoverPointer { location: Vec2, uiLocation: Vec2, windowId: number, canHover: boolean }
export interface UIHoverClient {
    cursor?: 'pointer' | 'text' | 'grabbing'
    clearHover(): void
    refreshHover(pointer: UIHoverPointer, modalRoot: Node | null): boolean
}

/** Shared hover/cursor ownership, following the reference UIHoverManager. */
export class UIHoverManager {
    private static readonly clients = new Set<UIHoverClient>()
    private static readonly modalRoots: Node[] = []
    private static root: Node | null = null
    private static pointer: UIHoverPointer | null = null
    private static blocks = 0
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
        for (const event of [Input.EventType.TOUCH_START, Input.EventType.TOUCH_MOVE, Input.EventType.TOUCH_END, Input.EventType.TOUCH_CANCEL] as const) {
            root.on(event, this.rememberTouchEvent, this, true)
            input.on(event, this.rememberTouchEvent, this)
        }
    }

    static stop(): void {
        for (const event of [Input.EventType.MOUSE_DOWN, Input.EventType.MOUSE_MOVE, Input.EventType.MOUSE_UP] as const) {
            this.root?.off(event, this.trackMouse, this, true)
            input.off(event, this.trackMouse, this)
        }
        for (const event of [Input.EventType.TOUCH_START, Input.EventType.TOUCH_MOVE, Input.EventType.TOUCH_END, Input.EventType.TOUCH_CANCEL] as const) {
            this.root?.off(event, this.rememberTouchEvent, this, true)
            input.off(event, this.rememberTouchEvent, this)
        }
        this.root = null
        this.pointer = null
        this.blocks = 0
        this.modalRoots.length = 0
        this.clearHoverStates()
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
        // A touch move must not cancel the button which owns that touch.
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
        let cursor = 'default'
        for (const client of this.clients) {
            if (client.refreshHover(this.pointer, this.activeModalRoot) && cursor !== 'grabbing') cursor = client.cursor ?? 'pointer'
        }
        this.hasHover = cursor !== 'default'
        CursorManager.set(cursor)
    }

    private static clearHoverStates(): void {
        for (const client of this.clients) client.clearHover()
        this.hasHover = false
        CursorManager.set('default')
    }

    private static removeModal(root: Node): void {
        const index = this.modalRoots.indexOf(root)
        if (index >= 0) this.modalRoots.splice(index, 1)
    }
}
