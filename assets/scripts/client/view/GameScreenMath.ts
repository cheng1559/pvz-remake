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

export function easeInOut(startTick: number, endTick: number, tick: number, start: number, end: number) {
    const t = Math.max(0, Math.min(1, (tick - startTick) / (endTick - startTick)))
    const eased = todCurveS(todCurveS(t))
    return Math.round(lerp(start, end, eased))
}
