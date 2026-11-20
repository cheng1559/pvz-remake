import { record, nonNegativeFinite } from '@/shared/validate'
/** MessageWidget's styles (MESSAGE_STYLE_*): where the advice shows and for how long. */
export const ADVICE_STYLES = [
    'hint', 'hint-stay', 'tutorial-level1', 'tutorial-level1-stay', 'tutorial-level2', 'tutorial-later', 'tutorial-later-stay', 'achievement',
    'huge-wave',
] as const

export type AdviceWidgetStyle = typeof ADVICE_STYLES[number]

export function isAdviceStyle(value: unknown): value is AdviceWidgetStyle {
    return ADVICE_STYLES.includes(value as AdviceWidgetStyle)
}

export interface AdviceWidgetSnapshot {
    message: string
    style: AdviceWidgetStyle
    durationTicks: number
    pulseTick: number
    /** Ticks since it came up. */
    shownTicks: number
    /** A message waiting for the huge wave's to leave. */
    next?: { message: string, style: AdviceWidgetStyle }
}

export function parseAdviceWidgetSnapshot(value: unknown): AdviceWidgetSnapshot | null {
    if (value === null) return null
    const source = record(value, 'advice snapshot')
    exactKeys(source, ['message', 'style', 'durationTicks', 'pulseTick', 'shownTicks'], 'advice snapshot', ['next'])
    if (typeof source.message !== 'string' || source.message.length === 0) {
        throw new TypeError('advice snapshot.message must be a non-empty string')
    }
    if (!isAdviceStyle(source.style)) {
        throw new TypeError('advice snapshot.style is invalid')
    }
    return {
        message: source.message,
        style: source.style,
        durationTicks: nonNegativeFinite(source.durationTicks, 'advice snapshot.durationTicks'),
        pulseTick: nonNegativeFinite(source.pulseTick, 'advice snapshot.pulseTick'),
        shownTicks: nonNegativeFinite(source.shownTicks, 'advice snapshot.shownTicks'),
        ...(source.next === undefined ? {} : { next: parseNext(source.next) }),
    }
}

function parseNext(value: unknown): { message: string, style: AdviceWidgetStyle } {
    const next = record(value, 'advice snapshot.next')
    exactKeys(next, ['message', 'style'], 'advice snapshot.next')
    if (typeof next.message !== 'string' || !next.message) throw new TypeError('advice snapshot.next.message must be a non-empty string')
    if (!isAdviceStyle(next.style)) throw new TypeError('advice snapshot.next.style is invalid')
    return { message: next.message, style: next.style }
}

function exactKeys(source: Record<string, unknown>, keys: string[], name: string, optional: string[] = []) {
    const allowed = new Set([...keys, ...optional])
    for (const key of keys) if (!(key in source)) throw new TypeError(`${name}.${key} is required`)
    for (const key of Object.keys(source)) if (!allowed.has(key)) throw new TypeError(`${name}.${key} is not supported`)
}
