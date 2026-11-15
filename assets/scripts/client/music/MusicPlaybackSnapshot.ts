import { boolean, exact, finiteInRange, nonNegativeFinite } from '@/shared/validate'
import type { MusicTuneId } from '@/shared/content/music'
export type { MusicTuneId } from '@/shared/content/music'

export type MusicBurstState = 'off' | 'starting' | 'on' | 'finishing'
export type MusicDrumsState = 'off' | 'on-queued' | 'on' | 'off-queued' | 'fading'

export interface MusicPlaybackSnapshot {
    tuneId: MusicTuneId
    drumsPhaseSec?: number
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
    'day_grasswalk', 'night_moongrains', 'choose_seeds', 'title_theme', 'zen_garden',
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
    const source = exact(value, KEYS, 'music snapshot', ['drumsPhaseSec'])
    const tuneId = member(source.tuneId, TUNES, 'tuneId')
    const burstState = member(source.burstState, BURST_STATES, 'burstState')
    const drumsState = member(source.drumsState, DRUMS_STATES, 'drumsState')
    const fadeOutCounter = nonNegativeFinite(source.fadeOutCounter, 'music snapshot.fadeOutCounter')
    const fadeOutDuration = nonNegativeFinite(source.fadeOutDuration, 'music snapshot.fadeOutDuration')
    if (fadeOutCounter > fadeOutDuration || (fadeOutCounter > 0) !== (fadeOutDuration > 0)) {
        throw new TypeError('music snapshot fade counters are inconsistent')
    }
    const queuedDrumsBoundarySec = source.queuedDrumsBoundarySec === null
        ? null
        : nonNegativeFinite(source.queuedDrumsBoundarySec, 'music snapshot.queuedDrumsBoundarySec')
    const queued = drumsState === 'on-queued' || drumsState === 'off-queued'
    if (queued !== (queuedDrumsBoundarySec !== null)) {
        throw new TypeError('music snapshot queued drums boundary is inconsistent with drumsState')
    }
    return {
        tuneId,
        ...(source.drumsPhaseSec === undefined ? {} : { drumsPhaseSec: nonNegativeFinite(source.drumsPhaseSec, 'music snapshot.drumsPhaseSec') }),
        timeSec: nonNegativeFinite(source.timeSec, 'music snapshot.timeSec'),
        paused: boolean(source.paused, 'music snapshot.paused'),
        mainVolume: finiteInRange(source.mainVolume, 0, 1, 'music snapshot.mainVolume'),
        drumsVolume: finiteInRange(source.drumsVolume, 0, 1, 'music snapshot.drumsVolume'),
        hihatsVolume: finiteInRange(source.hihatsVolume, 0, 1, 'music snapshot.hihatsVolume'),
        fadeOutCounter,
        fadeOutDuration,
        syncCounter: nonNegativeFinite(source.syncCounter, 'music snapshot.syncCounter'),
        burstState,
        burstCounter: nonNegativeFinite(source.burstCounter, 'music snapshot.burstCounter'),
        drumsState,
        drumsCounter: nonNegativeFinite(source.drumsCounter, 'music snapshot.drumsCounter'),
        queuedDrumsBoundarySec,
        queuedDrumsAtSec: nonNegativeFinite(source.queuedDrumsAtSec, 'music snapshot.queuedDrumsAtSec'),
        queuedDrumsBoundaryWrapped: boolean(source.queuedDrumsBoundaryWrapped, 'music snapshot.queuedDrumsBoundaryWrapped'),
    }
}

function member<T extends string>(value: unknown, allowed: Set<T>, name: string): T {
    if (typeof value !== 'string' || !allowed.has(value as T)) throw new TypeError(`music snapshot.${name} is invalid`)
    return value as T
}
