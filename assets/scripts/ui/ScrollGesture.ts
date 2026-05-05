import { EventTouch } from 'cc'

export const MOBILE_TOUCH_SCROLL_SCALE = 0.5

export type ScrollGestureDirection = -1 | 1

export interface ScrollGestureOptions {
    direction?: ScrollGestureDirection
    scale?: number
}

export class TouchScrollGesture {
    private _dragging = false

    constructor(private readonly _options: ScrollGestureOptions = {}) {}

    get dragging() {
        return this._dragging
    }

    begin() {
        this._dragging = true
    }

    cancel() {
        this._dragging = false
    }

    end() {
        const wasDragging = this._dragging
        this._dragging = false
        return wasDragging
    }

    getDeltaY(event: EventTouch) {
        if (!this._dragging) return 0

        const direction = this._options.direction ?? 1
        const scale = this._options.scale ?? MOBILE_TOUCH_SCROLL_SCALE
        return event.getDelta().y * direction * scale
    }
}
