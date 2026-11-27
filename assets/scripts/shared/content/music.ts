import { isQualifiedId } from '@/shared/mod/index'

/** The base game's tunes; each is the music resource `pvz:<tune>`, which a Mod replaces by registering the same ID. */
export const MUSIC_TUNE_IDS = ['day_grasswalk', 'night_moongrains', 'choose_seeds', 'title_theme', 'zen_garden', 'puzzle',
    'minigame', 'conveyer', 'final_boss'] as const
export type MusicTuneId = typeof MUSIC_TUNE_IDS[number]
export type MusicStemName = 'main' | 'drums' | 'hihats'
export const MUSIC_STEMS: readonly MusicStemName[] = ['main', 'drums', 'hihats']
/** Music::UpdateMusicBurst: day layers drums and hi-hats in; night swaps the melody for its drum part. */
export type MusicBurstScheme = 'day' | 'night'

/** A tune recorded as an audio file (`audio`, an audio resource ID), looping whole. */
export interface FileMusic {
    schemaVersion: 4
    id: string
    audio: string
    durationSec: number
}

/** One of a module tune's parts: Music::PlayFromOffset of a module from an order, with only `channels` heard. */
export interface ModuleMusicPart {
    /** A tracker module resource ID. */
    module: string
    order: number
    row: number
    /** The channels heard, as inclusive ranges; all of them when absent (Music::SetupMusicFileForTune). */
    channels?: [number, number][]
}

/**
 * A tune played from tracker modules, as the original plays mainmusic.mo3: each part an instance of its module, all in
 * step, looping by the module's own jumps.
 */
export interface ModuleMusic {
    schemaVersion: 4
    id: string
    parts: Partial<Record<MusicStemName, ModuleMusicPart>> & { main: ModuleMusicPart }
    burstScheme?: MusicBurstScheme
    /** Night: the drum part's order when a burst brings it in on an even order of the melody, and on an odd one. */
    drumsJumpOrders?: [number, number]
}

export type Music = FileMusic | ModuleMusic

export function musicResourceId(tune: MusicTuneId): string {
    return `pvz:${tune}`
}

/** A module tune has `parts`, a recording `audio`; one or the other. */
export function parseMusic(value: unknown): Music {
    const record = exactObject(value, ['schemaVersion', 'id'], null, 'music')
    if (record.schemaVersion !== 4) throw new Error('music.schemaVersion must be 4')
    if (!isQualifiedId(record.id)) throw new Error('music.id must be a qualified ID')
    if ((record.parts === undefined) === (record.audio === undefined)) throw new Error('music needs either parts or audio')
    return record.parts === undefined ? parseFileMusic(value) : parseModuleMusic(value)
}

function parseFileMusic(value: unknown): FileMusic {
    const source = exactObject(value, ['schemaVersion', 'id', 'audio', 'durationSec'], [], 'music')
    const durationSec = finiteNumber(source.durationSec, 'music.durationSec')
    if (durationSec <= 0 || durationSec > 3600) throw new Error('music.durationSec must be positive and at most 3600')
    return { schemaVersion: 4, id: source.id as string, audio: qualifiedId(source.audio, 'music.audio', 'an audio resource ID'), durationSec }
}

function parseModuleMusic(value: unknown): ModuleMusic {
    const source = exactObject(value, ['schemaVersion', 'id', 'parts'], ['burstScheme', 'drumsJumpOrders'], 'music')
    const partSource = exactObject(source.parts, ['main'], ['drums', 'hihats'], 'music.parts')
    const parts = { main: modulePart(partSource.main, 'music.parts.main') } as ModuleMusic['parts']
    for (const stem of ['drums', 'hihats'] as const) if (partSource[stem] !== undefined) parts[stem] = modulePart(partSource[stem], `music.parts.${stem}`)
    const music: ModuleMusic = { schemaVersion: 4, id: source.id as string, parts }
    if (source.burstScheme !== undefined) {
        music.burstScheme = burstScheme(source.burstScheme)
        if (music.burstScheme === 'night') {
            if (!parts.drums) throw new Error('a night burst needs music.parts.drums')
            const orders = numbers(source.drumsJumpOrders, 'music.drumsJumpOrders')
            if (orders.length !== 2 || !orders.every(order => Number.isInteger(order) && order >= 0)) {
                throw new Error('music.drumsJumpOrders must be two orders')
            }
            music.drumsJumpOrders = [orders[0], orders[1]]
        }
    }
    if (music.burstScheme !== 'night' && source.drumsJumpOrders !== undefined) throw new Error('music.drumsJumpOrders is only for a night burst')
    return music
}

function modulePart(value: unknown, name: string): ModuleMusicPart {
    const source = exactObject(value, ['module', 'order'], ['row', 'channels'], name)
    const part: ModuleMusicPart = {
        module: qualifiedId(source.module, `${name}.module`, 'a tracker resource ID'),
        order: index(source.order, `${name}.order`),
        row: source.row === undefined ? 0 : index(source.row, `${name}.row`),
    }
    if (source.channels !== undefined) {
        if (!Array.isArray(source.channels)) throw new Error(`${name}.channels must be an array`)
        part.channels = source.channels.map((range, at) => {
            const pair = Array.isArray(range) && range.length === 2 ? range.map(channel => index(channel, `${name}.channels[${at}]`)) : null
            if (!pair || pair[0] > pair[1]) throw new Error(`${name}.channels[${at}] must be a range [first, last]`)
            return [pair[0], pair[1]] as [number, number]
        })
    }
    return part
}

function burstScheme(value: unknown): MusicBurstScheme {
    if (value !== 'day' && value !== 'night') throw new Error('music.burstScheme must be day or night')
    return value
}

function qualifiedId(value: unknown, name: string, what: string): string {
    if (!isQualifiedId(value)) throw new Error(`${name} must be ${what}`)
    return value
}

function index(value: unknown, name: string): number {
    if (!Number.isInteger(value) || (value as number) < 0) throw new Error(`${name} must be a whole number of at least 0`)
    return value as number
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
