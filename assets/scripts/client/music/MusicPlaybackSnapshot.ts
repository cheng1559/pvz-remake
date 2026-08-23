export type MusicTuneId =
    | 'day_grasswalk'
    | 'choose_seeds'
    | 'title_theme'
    | 'zen_garden'
    | 'puzzle'
    | 'minigame'
    | 'conveyer'
    | 'final_boss'

export type MusicBurstState = 'off' | 'starting' | 'on' | 'finishing'
export type MusicDrumsState = 'off' | 'on-queued' | 'on' | 'off-queued' | 'fading'

export interface MusicPlaybackSnapshot {
    tuneId: MusicTuneId
    timeSec: number
    paused: boolean
    mainVolume: number
    drumsVolume: number
    hihatsVolume: number
    fadeOutCounter: number
    fadeOutDuration: number
    syncCounter: number
    burstState: MusicBurstState
    burstCounter: number
    drumsState: MusicDrumsState
    drumsCounter: number
    queuedDrumsBoundarySec: number | null
    queuedDrumsAtSec: number
    queuedDrumsBoundaryWrapped: boolean
}

const TUNES = new Set<MusicTuneId>([
    'day_grasswalk', 'choose_seeds', 'title_theme', 'zen_garden',
    'puzzle', 'minigame', 'conveyer', 'final_boss',
])
const BURST_STATES = new Set<MusicBurstState>(['off', 'starting', 'on', 'finishing'])
const DRUMS_STATES = new Set<MusicDrumsState>(['off', 'on-queued', 'on', 'off-queued', 'fading'])
const KEYS: (keyof MusicPlaybackSnapshot)[] = [
    'tuneId', 'timeSec', 'paused', 'mainVolume', 'drumsVolume', 'hihatsVolume',
    'fadeOutCounter', 'fadeOutDuration', 'syncCounter', 'burstState', 'burstCounter',
    'drumsState', 'drumsCounter', 'queuedDrumsBoundarySec', 'queuedDrumsAtSec',
    'queuedDrumsBoundaryWrapped',
]

export function parseMusicPlaybackSnapshot(value: unknown): MusicPlaybackSnapshot | null {
    if (value === null) return null
    const source = record(value)
    exactKeys(source)
    const tuneId = member(source.tuneId, TUNES, 'tuneId')
    const burstState = member(source.burstState, BURST_STATES, 'burstState')
    const drumsState = member(source.drumsState, DRUMS_STATES, 'drumsState')
    const fadeOutCounter = nonNegative(source.fadeOutCounter, 'fadeOutCounter')
    const fadeOutDuration = nonNegative(source.fadeOutDuration, 'fadeOutDuration')
    if (fadeOutCounter > fadeOutDuration || (fadeOutCounter > 0) !== (fadeOutDuration > 0)) {
        throw new TypeError('music snapshot fade counters are inconsistent')
    }
    const queuedDrumsBoundarySec = source.queuedDrumsBoundarySec === null
        ? null
        : nonNegative(source.queuedDrumsBoundarySec, 'queuedDrumsBoundarySec')
    const queued = drumsState === 'on-queued' || drumsState === 'off-queued'
    if (queued !== (queuedDrumsBoundarySec !== null)) {
        throw new TypeError('music snapshot queued drums boundary is inconsistent with drumsState')
    }
    return {
        tuneId,
        timeSec: nonNegative(source.timeSec, 'timeSec'),
        paused: boolean(source.paused, 'paused'),
        mainVolume: volume(source.mainVolume, 'mainVolume'),
        drumsVolume: volume(source.drumsVolume, 'drumsVolume'),
        hihatsVolume: volume(source.hihatsVolume, 'hihatsVolume'),
        fadeOutCounter,
        fadeOutDuration,
        syncCounter: nonNegative(source.syncCounter, 'syncCounter'),
        burstState,
        burstCounter: nonNegative(source.burstCounter, 'burstCounter'),
        drumsState,
        drumsCounter: nonNegative(source.drumsCounter, 'drumsCounter'),
        queuedDrumsBoundarySec,
        queuedDrumsAtSec: nonNegative(source.queuedDrumsAtSec, 'queuedDrumsAtSec'),
        queuedDrumsBoundaryWrapped: boolean(source.queuedDrumsBoundaryWrapped, 'queuedDrumsBoundaryWrapped'),
    }
}

function record(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('music snapshot must be an object')
    return value as Record<string, unknown>
}

function exactKeys(source: Record<string, unknown>) {
    const allowed = new Set<string>(KEYS)
    for (const key of KEYS) if (!(key in source)) throw new TypeError(`music snapshot.${key} is required`)
    for (const key of Object.keys(source)) if (!allowed.has(key)) throw new TypeError(`music snapshot.${key} is not supported`)
}

function member<T extends string>(value: unknown, allowed: Set<T>, name: string): T {
    if (typeof value !== 'string' || !allowed.has(value as T)) throw new TypeError(`music snapshot.${name} is invalid`)
    return value as T
}

function nonNegative(value: unknown, name: string) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new TypeError(`music snapshot.${name} must be a non-negative finite number`)
    }
    return value
}

function volume(value: unknown, name: string) {
    const parsed = nonNegative(value, name)
    if (parsed > 1) throw new TypeError(`music snapshot.${name} must be at most 1`)
    return parsed
}

function boolean(value: unknown, name: string) {
    if (typeof value !== 'boolean') throw new TypeError(`music snapshot.${name} must be boolean`)
    return value
}
