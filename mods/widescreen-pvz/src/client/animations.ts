interface Frame {
    timeSeconds: number
    x: number
    y: number
    alpha: number
    scaleX: number
    scaleY: number
    skewX: number
    skewY: number
    sprite: string | null
}

interface Animation {
    durationSeconds: number
    tracks: Array<{ id: string, keyframes: Frame[] }>
}

/** Cover the added left margin within Dave's original transition timing. */
export function extendDave<T extends Animation>(source: T, width: number, entering: boolean): T {
    const data: T = JSON.parse(JSON.stringify(source))
    const distance = Math.max(0, (width - 800) / 2)
    if (!distance) return data
    // The lower body carries the entrance/exit motion; the head adds its own follow-through.
    const frames = source.tracks.find(track => track.id === 'Dave_innerpants')!.keyframes
    const start = frames[0].x
    const travel = frames[frames.length - 1].x - start
    for (const track of data.tracks) {
        for (const [index, frame] of track.keyframes.entries()) {
            const progress = (frames[index].x - start) / travel
            frame.x -= distance * (entering ? 1 - progress : progress)
        }
    }
    return data
}

/** Extend each cloud at its original speed until its entire image leaves the viewport. */
export function extendCloud<T extends Animation>(source: T, width: number, height: number,
    spriteSize: (id: string) => { width: number, height: number }): T {
    const data: T = JSON.parse(JSON.stringify(source))
    const bounds = { left: 400 - width / 2, right: 400 + width / 2, top: 300 - height / 2, bottom: 300 + height / 2 }
    let lead = 0
    const extensions = new Map<string, { before: Frame[], after: Frame[] }>()
    for (const track of data.tracks) {
        const frames = track.keyframes.filter(frame => frame.sprite)
        if (frames.length < 2) continue
        const first = frames[0], last = frames[frames.length - 1]
        const size = spriteSize(first.sprite!)
        const radius = Math.hypot(size.width, size.height) * Math.max(...frames.map(frame => Math.max(Math.abs(frame.scaleX), Math.abs(frame.scaleY))))
        const extrapolate = (from: Frame, neighbor: Frame, direction: number): Frame[] => {
            const dt = from.timeSeconds - neighbor.timeSeconds
            const vx = (from.x - neighbor.x) / dt * direction, vy = (from.y - neighbor.y) / dt * direction
            const tx = vx > 0 ? (bounds.right + radius - from.x) / vx : vx < 0 ? (bounds.left - radius - from.x) / vx : Infinity
            const ty = vy > 0 ? (bounds.bottom + radius - from.y) / vy : vy < 0 ? (bounds.top - radius - from.y) / vy : Infinity
            const seconds = Math.max(0, Math.min(tx, ty))
            const steps = Math.ceil(seconds / Math.abs(dt))
            // Match the original turn rate at the join, then ease toward at most 8 extra degrees.
            const turn = (angle: number, previous: number, elapsed: number) =>
                angle + 8 * Math.tanh((angle - previous) / dt * direction * elapsed / 8)
            const poses = Array.from({ length: steps }, (_, index): Frame => {
                const elapsed = seconds * (index + 1) / steps
                return {
                    ...from, timeSeconds: from.timeSeconds + direction * elapsed,
                    x: from.x + vx * elapsed, y: from.y + vy * elapsed,
                    skewX: turn(from.skewX, neighbor.skewX, elapsed),
                    skewY: turn(from.skewY, neighbor.skewY, elapsed),
                }
            })
            return direction < 0 ? poses.reverse() : poses
        }
        const before = extrapolate(first, frames[1], -1)
        const after = extrapolate(last, frames[frames.length - 2], 1)
        lead = Math.max(lead, -(before[0]?.timeSeconds ?? first.timeSeconds))
        extensions.set(track.id, { before, after })
    }
    for (const track of data.tracks) {
        const extension = extensions.get(track.id)
        if (extension) {
            // Remove the old terminal blank frame; the cloud now disappears outside the new edge.
            track.keyframes = [...extension.before, ...track.keyframes.filter(frame => frame.sprite), ...extension.after]
            const end = track.keyframes[track.keyframes.length - 1]
            track.keyframes.push({ ...end, sprite: null, timeSeconds: end.timeSeconds + 0.05 })
        }
        for (const frame of track.keyframes) frame.timeSeconds += lead
    }
    data.durationSeconds = Math.max(data.durationSeconds + lead,
        ...data.tracks.map(track => track.keyframes[track.keyframes.length - 1].timeSeconds))
    return data
}

export function extendFlower<T extends Animation>(source: T): T {
    const data: T = JSON.parse(JSON.stringify(source))
    for (const track of data.tracks) {
        const frames = track.keyframes.filter(frame => frame.sprite)
        if (frames.length < 2) continue
        const last = frames[frames.length - 1], previous = frames[frames.length - 2]
        const dt = last.timeSeconds - previous.timeSeconds
        const vx = (last.x - previous.x) / dt, vy = (last.y - previous.y) / dt
        const flight = 180 / Math.hypot(vx, vy)
        const project = (seconds: number, alpha: number): Frame => ({
            ...last, timeSeconds: last.timeSeconds + seconds,
            x: last.x + vx * seconds, y: last.y + vy * seconds, alpha,
            skewX: last.skewX + (last.skewX - previous.skewX) / dt * seconds,
            skewY: last.skewY + (last.skewY - previous.skewY) / dt * seconds,
        })
        // Continue the original flight for another 180px, then fade while still moving.
        const faded = project(flight + 0.25, 0)
        track.keyframes.push(project(flight, last.alpha), faded)
        data.durationSeconds = Math.max(data.durationSeconds, faded.timeSeconds)
    }
    return data
}
