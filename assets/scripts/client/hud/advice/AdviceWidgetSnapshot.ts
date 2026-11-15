import { record, nonNegativeFinite } from '@/shared/validate'
/** MessageWidget's styles (MESSAGE_STYLE_*): where the advice shows and for how long. */
export const ADVICE_STYLES = [
    'hint', 'hint-stay', 'tutorial-level1', 'tutorial-level1-stay', 'tutorial-level2', 'tutorial-later', 'tutorial-later-stay', 'achievement',
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
}

export function parseAdviceWidgetSnapshot(value: unknown): AdviceWidgetSnapshot | null {
    if (value === null) return null
    const source = record(value, 'advice snapshot')
    exactKeys(source, ['message', 'style', 'durationTicks', 'pulseTick'], 'advice snapshot')
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
    }
}

function exactKeys(source: Record<string, unknown>, keys: string[], name: string) {
    const allowed = new Set(keys)
    for (const key of keys) if (!(key in source)) throw new TypeError(`${name}.${key} is required`)
    for (const key of Object.keys(source)) if (!allowed.has(key)) throw new TypeError(`${name}.${key} is not supported`)
}
