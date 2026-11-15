export function todCurveS(t: number) {
    return 3 * t * t - 2 * t * t * t
}

export function lerp(start: number, end: number, t: number) {
    return start + (end - start) * t
}

export function linearFloat(startTick: number, endTick: number, tick: number, start: number, end: number) {
    const t = Math.max(0, Math.min(1, (tick - startTick) / (endTick - startTick)))
    return lerp(start, end, t)
}

export function linear(startTick: number, endTick: number, tick: number, start: number, end: number) {
    return Math.round(linearFloat(startTick, endTick, tick, start, end))
}

/** TodAnimateCurve's CURVE_EASE_IN_OUT of a progress from 0 to 1: the S curve of the S curve. */
export function easeInOutCurve(t: number): number {
    return todCurveS(todCurveS(t))
}

export function easeInOut(startTick: number, endTick: number, tick: number, start: number, end: number) {
    const t = Math.max(0, Math.min(1, (tick - startTick) / (endTick - startTick)))
    return Math.round(lerp(start, end, easeInOutCurve(t)))
}
