import { isQualifiedId } from '@/shared/mod/index'

/** The base game's tunes; each is the music resource `pvz:<tune>`, which a Mod replaces by registering the same ID. */
export const MUSIC_TUNE_IDS = ['day_grasswalk', 'night_moongrains', 'choose_seeds', 'title_theme', 'zen_garden', 'puzzle',
    'minigame', 'conveyer', 'final_boss'] as const
export type MusicTuneId = typeof MUSIC_TUNE_IDS[number]
export type MusicStemName = 'main' | 'drums' | 'hihats'

/** One tune: its loop, its stems (audio resource IDs) and, for the in-level tunes, the original's burst timing. */
export interface Music {
    schemaVersion: 3
    id: string
    durationSec: number
    loopStartSec: number
    loopEndSec: number
    stems: Partial<Record<MusicStemName, string>> & { main: string }
    /** Music::UpdateMusicBurst: day layers drums and hi-hats in; night swaps the melody for its drum part. */
    burstScheme?: 'day' | 'night'
    /** Order boundaries where a burst may start or end. */
    burstBoundariesSec?: number[]
    /** Night: where the separate drum part restarts at each boundary. */
    burstDrumsOffsetsSec?: number[]
    /** Night: the drum part's own loop length. */
    drumsLoopEndSec?: number
    /** Converter notes (MO3 order, channels, original length); not used for playback. */
    source?: Record<string, unknown>
}

export function musicResourceId(tune: MusicTuneId): string {
    return `pvz:${tune}`
}

export function parseMusic(value: unknown): Music {
    const source = exactObject(value, ['schemaVersion', 'id', 'durationSec', 'loopStartSec', 'loopEndSec', 'stems'],
        ['burstScheme', 'burstBoundariesSec', 'burstDrumsOffsetsSec', 'drumsLoopEndSec', 'source'], 'music')
    if (source.schemaVersion !== 3) throw new Error('music.schemaVersion must be 3')
    if (!isQualifiedId(source.id)) throw new Error('music.id must be a qualified ID')
    const durationSec = finiteNumber(source.durationSec, 'music.durationSec')
    const loopStartSec = finiteNumber(source.loopStartSec, 'music.loopStartSec')
    const loopEndSec = finiteNumber(source.loopEndSec, 'music.loopEndSec')
    if (durationSec <= 0 || durationSec > 3600) throw new Error('music.durationSec must be positive and at most 3600')
    if (loopStartSec < 0 || loopStartSec >= loopEndSec || loopEndSec > durationSec) {
        throw new Error('music loop must satisfy 0 <= loopStartSec < loopEndSec <= durationSec')
    }
    const stemSource = exactObject(source.stems, ['main'], ['drums', 'hihats'], 'music.stems')
    const stems: Music['stems'] = { main: audioId(stemSource.main, 'music.stems.main') }
    for (const stem of ['drums', 'hihats'] as const) if (stemSource[stem] !== undefined) stems[stem] = audioId(stemSource[stem], `music.stems.${stem}`)
    const music: Music = { schemaVersion: 3, id: source.id, durationSec, loopStartSec, loopEndSec, stems }
    if (source.burstScheme !== undefined) {
        if (source.burstScheme !== 'day' && source.burstScheme !== 'night') throw new Error('music.burstScheme must be day or night')
        music.burstScheme = source.burstScheme
        music.burstBoundariesSec = numbers(source.burstBoundariesSec, 'music.burstBoundariesSec')
        if (source.burstScheme === 'night') {
            if (!stems.drums) throw new Error('a night burst needs music.stems.drums')
            music.drumsLoopEndSec = finiteNumber(source.drumsLoopEndSec, 'music.drumsLoopEndSec')
            if (source.burstDrumsOffsetsSec !== undefined) music.burstDrumsOffsetsSec = numbers(source.burstDrumsOffsetsSec, 'music.burstDrumsOffsetsSec')
        }
    }
    if (source.source !== undefined) music.source = exactObject(source.source, [], null, 'music.source')
    return music
}

function audioId(value: unknown, name: string): string {
    if (!isQualifiedId(value)) throw new Error(`${name} must be an audio resource ID`)
    return value
}

function numbers(value: unknown, name: string): number[] {
    if (!Array.isArray(value)) throw new Error(`${name} must be an array`)
    return value.map((entry, index) => finiteNumber(entry, `${name}[${index}]`))
}

/** `optional` null allows any further keys. */
function exactObject(value: unknown, required: readonly string[], optional: readonly string[] | null, name: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`)
    const record = value as Record<string, unknown>
    if (optional) {
        const expected = new Set([...required, ...optional])
        for (const key of Object.keys(record)) if (!expected.has(key)) throw new Error(`${name}.${key} is not supported`)
    }
    for (const key of required) if (!Object.prototype.hasOwnProperty.call(record, key)) throw new Error(`${name}.${key} is required`)
    return record
}

function finiteNumber(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be a finite number`)
    return value
}
