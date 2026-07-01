import { EventMouse, EventTouch, Node, Vec2 } from 'cc'
import { CursorManager } from '@/ui/CursorManager'
import { GameDebugSettings } from '@/game/GameDebugSettings'

export interface UIHoverPointer {
    location: Vec2
    uiLocation: Vec2
    canHover: boolean
}

export interface UIHoverClient {
    clearHover(): void
    refreshHover(pointer: UIHoverPointer | null, activeModalRoot: Node | null): boolean
}

export class UIHoverManager {
    private static _clients: Set<UIHoverClient> = new Set()
    private static _modalRoots: Node[] = []
    private static _lastPointer: UIHoverPointer | null = null

    public static get isModalBlocked() {
        return !!this.activeModalRoot
    }

    public static get activeModalRoot() {
        for (let i = this._modalRoots.length - 1; i >= 0; i--) {
            const root = this._modalRoots[i]
            if (root?.isValid && root.activeInHierarchy) return root
            this._modalRoots.splice(i, 1)
        }
        return null
    }

    public static registerClient(client: UIHoverClient) {
        this._clients.add(client)
    }

    public static unregisterClient(client: UIHoverClient) {
        this._clients.delete(client)
    }

    public static beginModalBlock(root: Node) {
        this._removeModalRoot(root)
        this._modalRoots.push(root)
        this.clearHoverStates()
    }

    public static endModalBlock(root: Node) {
        this._removeModalRoot(root)
        this.refreshHoverStates()
    }

    public static rememberMouseEvent(event: EventMouse, refreshHover = true) {
        if (GameDebugSettings.isMobileMode()) {
            this._lastPointer = null
            if (refreshHover && !this.isModalBlocked) this.clearHoverStates()
            return
        }

        this._lastPointer = {
            location: event.getLocation().clone(),
            uiLocation: event.getUILocation().clone(),
            canHover: true,
        }
        if (refreshHover) {
            this.refreshHoverStates()
        }
    }

    public static rememberTouchEvent(event: EventTouch, refreshHover = true) {
        this._lastPointer = {
            location: (event.touch?.getLocation() ?? event.getUILocation()).clone(),
            uiLocation: event.getUILocation().clone(),
            canHover: false,
        }
        if (refreshHover && !this.isModalBlocked) {
            this.clearHoverStates()
        }
    }

    public static clearPointer() {
        this._lastPointer = null
        this.clearHoverStates()
    }

    public static refreshHoverStates() {
        const pointer = this._clonePointer(this._lastPointer)
        if (!pointer?.canHover) {
            this.clearHoverStates()
            return
        }
        const activeModalRoot = this.activeModalRoot
        let anyHovering = false
        for (const client of this._clients) {
            anyHovering = client.refreshHover(this._clonePointer(pointer), activeModalRoot) || anyHovering
        }
        this._setGlobalCursor(anyHovering ? 'pointer' : 'default')
    }

    public static clearHoverStates() {
        for (const client of this._clients) {
            client.clearHover()
        }
        this._setGlobalCursor('default')
    }

    private static _clonePointer(pointer: UIHoverPointer | null) {
        return pointer
            ? {
                location: pointer.location.clone(),
                uiLocation: pointer.uiLocation.clone(),
                canHover: pointer.canHover,
            }
            : null
    }

    private static _removeModalRoot(root: Node) {
        for (let i = this._modalRoots.length - 1; i >= 0; i--) {
            if (this._modalRoots[i] === root) this._modalRoots.splice(i, 1)
        }
    }

    private static _setGlobalCursor(style: string) {
        CursorManager.set(style)
    }
}
