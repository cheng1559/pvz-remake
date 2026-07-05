import { EventMouse, EventTouch } from 'cc'

export const MOBILE_TOUCH_SCROLL_SCALE = 1
const WHEEL_SCROLL_DELTA_PER_STEP = 120
const TOUCH_SCROLL_DECAY = 8
const TOUCH_SCROLL_MIN_VELOCITY = 8
const TOUCH_SCROLL_RELEASE_GRACE_MS = 100

export type ScrollGestureDirection = -1 | 1

export interface ScrollGestureOptions {
    direction?: ScrollGestureDirection
    scale?: number
}

export function getWheelScrollSteps(event: EventMouse) {
    const delta = event.getScrollY() / WHEEL_SCROLL_DELTA_PER_STEP
    return Math.max(-1, Math.min(1, delta))
}

export class TouchScrollGesture {
    private _dragging = false
    private _lastMoveTime = 0
    private _releaseVelocityY = 0
    private _inertiaVelocityY = 0

    constructor(private readonly _options: ScrollGestureOptions = {}) {}

    begin() {
        this._dragging = true
        this._lastMoveTime = this._now()
        this._releaseVelocityY = 0
        this._inertiaVelocityY = 0
    }

    beginTouch(event: EventTouch) {
        this.begin()
        event.propagationStopped = true
    }

    cancel() {
        this._dragging = false
        this._releaseVelocityY = 0
        this._inertiaVelocityY = 0
    }

    end(startInertia = true) {
        const wasDragging = this._dragging
        this._dragging = false
        const recentlyMoved = this._now() - this._lastMoveTime <= TOUCH_SCROLL_RELEASE_GRACE_MS
        this._inertiaVelocityY = wasDragging && startInertia && recentlyMoved ? this._releaseVelocityY : 0
        return wasDragging
    }

    endTouch(event: EventTouch, startInertia = true) {
        if (!this.end(startInertia)) return false
        event.propagationStopped = true
        return true
    }

    stopInertia() {
        this._inertiaVelocityY = 0
    }

    applyInertiaY(dt: number, getPosition: () => number, setPosition: (position: number) => void) {
        const delta = this._getInertiaDeltaY(dt)
        if (delta === 0) return false

        const before = getPosition()
        setPosition(before + delta)
        if (getPosition() === before) this.stopInertia()
        return true
    }

    private _getInertiaDeltaY(dt: number) {
        if (Math.abs(this._inertiaVelocityY) < TOUCH_SCROLL_MIN_VELOCITY) {
            this._inertiaVelocityY = 0
            return 0
        }

        const delta = this._inertiaVelocityY * dt
        this._inertiaVelocityY *= Math.exp(-TOUCH_SCROLL_DECAY * dt)
        return delta
    }

    private _getDeltaY(event: EventTouch) {
        if (!this._dragging) return 0

        const direction = this._options.direction ?? 1
        const scale = this._options.scale ?? MOBILE_TOUCH_SCROLL_SCALE
        const delta = this._getTouchDeltaY(event) * direction * scale
        const now = this._now()
        const seconds = Math.max(0.001, (now - this._lastMoveTime) / 1000)
        this._lastMoveTime = now
        this._releaseVelocityY = delta / seconds
        return delta
    }

    dragByTouchY(event: EventTouch, applyDelta: (delta: number) => void) {
        if (!this._dragging) return false

        const delta = this._getDeltaY(event)
        if (delta !== 0) applyDelta(delta)
        event.propagationStopped = true
        return true
    }

    private _now() {
        return globalThis.performance?.now?.() ?? Date.now()
    }

    private _getTouchDeltaY(event: EventTouch) {
        return event.getUIDelta().y
    }
}
