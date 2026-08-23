export type AdviceWidgetStyle =
    | 'hint'
    | 'hint-stay'
    | 'tutorial-level1'
    | 'tutorial-level1-stay'
    | 'tutorial-level2'
    | 'tutorial-later'
    | 'tutorial-later-stay'

export interface AdviceWidgetSnapshot {
    message: string
    style: AdviceWidgetStyle
    durationTicks: number
    pulseTick: number
}

const STYLES = new Set<AdviceWidgetStyle>([
    'hint',
    'hint-stay',
    'tutorial-level1',
    'tutorial-level1-stay',
    'tutorial-level2',
    'tutorial-later',
    'tutorial-later-stay',
])

export function parseAdviceWidgetSnapshot(value: unknown): AdviceWidgetSnapshot | null {
    if (value === null) return null
    const source = record(value, 'advice snapshot')
    exactKeys(source, ['message', 'style', 'durationTicks', 'pulseTick'], 'advice snapshot')
    if (typeof source.message !== 'string' || source.message.length === 0) {
        throw new TypeError('advice snapshot.message must be a non-empty string')
    }
    if (typeof source.style !== 'string' || !STYLES.has(source.style as AdviceWidgetStyle)) {
        throw new TypeError('advice snapshot.style is invalid')
    }
    return {
        message: source.message,
        style: source.style as AdviceWidgetStyle,
        durationTicks: nonNegativeNumber(source.durationTicks, 'advice snapshot.durationTicks'),
        pulseTick: nonNegativeNumber(source.pulseTick, 'advice snapshot.pulseTick'),
    }
}

function record(value: unknown, name: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`)
    return value as Record<string, unknown>
}

function exactKeys(source: Record<string, unknown>, keys: string[], name: string) {
    const allowed = new Set(keys)
    for (const key of keys) if (!(key in source)) throw new TypeError(`${name}.${key} is required`)
    for (const key of Object.keys(source)) if (!allowed.has(key)) throw new TypeError(`${name}.${key} is not supported`)
}

function nonNegativeNumber(value: unknown, name: string) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new TypeError(`${name} must be a non-negative finite number`)
    }
    return value
}
