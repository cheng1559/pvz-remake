import type { EventMouse } from 'cc'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'

/** One wheel notch (WHEEL_SCROLL_DELTA_PER_STEP); a touchpad's smaller steps add up to one before a page turns. */
const WHEEL_STEP = 120

/**
 * Pages turned by the mouse wheel as their buttons turn them: down to the next page, up to the one before, one notch a
 * page, with a tap (the seed chooser's and the plants' almanac's).
 */
export class WheelPageTurner {
    /** The wheel's travel towards the next turn. */
    private travel = 0

    constructor(private readonly turn: (step: 1 | -1) => void) {}

    /** Takes a wheel event over the pages, while they can turn. */
    wheel(event: EventMouse, canTurn: boolean): void {
        const delta = event.getScrollY()
        if (!delta || !canTurn) return
        event.propagationStopped = true
        if (Math.sign(delta) !== Math.sign(this.travel)) this.travel = 0
        this.travel += delta
        if (Math.abs(this.travel) < WHEEL_STEP) return
        this.travel = 0
        void SoundSystem.play(SoundEffect.Tap)
        this.turn(delta < 0 ? 1 : -1)
    }
}
