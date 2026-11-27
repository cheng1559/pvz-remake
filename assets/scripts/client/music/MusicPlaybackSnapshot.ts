import { boolean, exact, finiteInRange, nonNegativeFinite } from '@/shared/validate'
import type { MusicStemName, MusicTuneId } from '@/shared/content/music'

export type { MusicTuneId } from '@/shared/content/music'
export type MusicBurstState = 'off' | 'starting' | 'on' | 'finishing'
export type MusicDrumsState = 'off' | 'on-queued' | 'on' | 'off-queued' | 'fading'

/** Music::UpdateMusicBurst's state for a module tune with a burst scheme. */
export interface MusicBurstSnapshot {
    mainVolume: number
    drumsVolume: number
    hihatsVolume: number
    state: MusicBurstState
    counter: number
    drumsState: MusicDrumsState
    drumsCounter: number
    /** The place a queued drums change waits to see the melody leave (Music::mQueuedDrumTrackPackedOrder); null with none queued. */
    queuedMark: number | null
}

export interface MusicPlaybackSnapshot {
    tuneId: MusicTuneId
    paused: boolean
    fadeOutCounter: number
    fadeOutDuration: number
    /** A file tune: how far into it, in seconds. */
    timeSec?: number
    /** A module tune: each part's order and row. */
    parts?: Partial<Record<MusicStemName, [number, number]>>
    burst?: MusicBurstSnapshot
}

const TUNES = new Set<MusicTuneId>([
    'day_grasswalk', 'night_moongrains', 'choose_seeds', 'title_theme', 'zen_garden',
    'puzzle', 'minigame', 'conveyer', 'final_boss',
])
const BURST_STATES = new Set<MusicBurstState>(['off', 'starting', 'on', 'finishing'])
const DRUMS_STATES = new Set<MusicDrumsState>(['off', 'on-queued', 'on', 'off-queued', 'fading'])
const STEMS = ['main', 'drums', 'hihats']

export function parseMusicPlaybackSnapshot(value: unknown): MusicPlaybackSnapshot | null {
    if (value === null) return null
    const source = exact(value, ['tuneId', 'paused', 'fadeOutCounter', 'fadeOutDuration'], 'music snapshot', ['timeSec', 'parts', 'burst'])
    const fadeOutCounter = nonNegativeFinite(source.fadeOutCounter, 'music snapshot.fadeOutCounter')
    const fadeOutDuration = nonNegativeFinite(source.fadeOutDuration, 'music snapshot.fadeOutDuration')
    if (fadeOutCounter > fadeOutDuration || (fadeOutCounter > 0) !== (fadeOutDuration > 0)) {
        throw new TypeError('music snapshot fade counters are inconsistent')
    }
    if ((source.timeSec === undefined) === (source.parts === undefined)) throw new TypeError('music snapshot needs either timeSec or parts')
    if (source.burst !== undefined && source.parts === undefined) throw new TypeError('music snapshot.burst is only for a module tune')
    return {
        tuneId: member(source.tuneId, TUNES, 'tuneId'),
        paused: boolean(source.paused, 'music snapshot.paused'),
        fadeOutCounter,
        fadeOutDuration,
        ...(source.timeSec === undefined ? {} : { timeSec: nonNegativeFinite(source.timeSec, 'music snapshot.timeSec') }),
        ...(source.parts === undefined ? {} : { parts: parts(source.parts) }),
        ...(source.burst === undefined ? {} : { burst: burst(source.burst) }),
    }
}

function parts(value: unknown): Partial<Record<MusicStemName, [number, number]>> {
    const source = exact(value, ['main'], 'music snapshot.parts', ['drums', 'hihats'])
    const result: Partial<Record<MusicStemName, [number, number]>> = {}
    for (const stem of STEMS) {
        const position = source[stem]
        if (position === undefined) continue
        if (!Array.isArray(position) || position.length !== 2 || !position.every(index)) {
            throw new TypeError(`music snapshot.parts.${stem} must be an order and a row`)
        }
        result[stem as MusicStemName] = [position[0], position[1]]
    }
    return result
}

function burst(value: unknown): MusicBurstSnapshot {
    const source = exact(value, ['mainVolume', 'drumsVolume', 'hihatsVolume', 'state', 'counter', 'drumsState', 'drumsCounter', 'queuedMark'], 'music snapshot.burst')
    const drumsState = member(source.drumsState, DRUMS_STATES, 'burst.drumsState')
    const queuedMark = source.queuedMark === null ? null : index(source.queuedMark) ? source.queuedMark as number : invalid('burst.queuedMark')
    if ((drumsState === 'on-queued' || drumsState === 'off-queued') !== (queuedMark !== null)) {
        throw new TypeError('music snapshot.burst.queuedMark is inconsistent with drumsState')
    }
    return {
        mainVolume: finiteInRange(source.mainVolume, 0, 1, 'music snapshot.burst.mainVolume'),
        drumsVolume: finiteInRange(source.drumsVolume, 0, 1, 'music snapshot.burst.drumsVolume'),
        hihatsVolume: finiteInRange(source.hihatsVolume, 0, 1, 'music snapshot.burst.hihatsVolume'),
        state: member(source.state, BURST_STATES, 'burst.state'),
        counter: nonNegativeFinite(source.counter, 'music snapshot.burst.counter'),
        drumsState,
        drumsCounter: nonNegativeFinite(source.drumsCounter, 'music snapshot.burst.drumsCounter'),
        queuedMark,
    }
}

function index(value: unknown): boolean {
    return Number.isInteger(value) && (value as number) >= 0
}

function invalid(name: string): never {
    throw new TypeError(`music snapshot.${name} is invalid`)
}

function member<T extends string>(value: unknown, allowed: Set<T>, name: string): T {
    if (typeof value !== 'string' || !allowed.has(value as T)) invalid(name)
    return value as T
}
