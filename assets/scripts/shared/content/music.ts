import { isQualifiedId } from '@/shared/mod/index'

export interface MusicV2 {
    schemaVersion: 2
    id: string
    durationSeconds: number
    loopStartSeconds: number
    loopEndSeconds: number
    stems: {
        main: string
        drums: string | null
        hihats: string | null
    }
}

export function parseMusicV2(value: unknown): MusicV2 {
    const source = exactObject(value, [
        'schemaVersion', 'id', 'durationSeconds', 'loopStartSeconds', 'loopEndSeconds', 'stems',
    ], 'music')
    if (source.schemaVersion !== 2) throw new Error('music.schemaVersion must be 2')
    if (!isQualifiedId(source.id)) throw new Error('music.id must be a qualified ID')

    const durationSeconds = finiteNumber(source.durationSeconds, 'music.durationSeconds')
    const loopStartSeconds = finiteNumber(source.loopStartSeconds, 'music.loopStartSeconds')
    const loopEndSeconds = finiteNumber(source.loopEndSeconds, 'music.loopEndSeconds')
    if (durationSeconds <= 0 || durationSeconds > 3600) {
        throw new Error('music.durationSeconds must be positive and at most 3600')
    }
    if (loopStartSeconds < 0 || loopStartSeconds >= loopEndSeconds || loopEndSeconds > durationSeconds) {
        throw new Error('music loop must satisfy 0 <= loopStartSeconds < loopEndSeconds <= durationSeconds')
    }

    const stems = exactObject(source.stems, ['main', 'drums', 'hihats'], 'music.stems')
    return {
        schemaVersion: 2,
        id: source.id,
        durationSeconds,
        loopStartSeconds,
        loopEndSeconds,
        stems: {
            main: relativePath(stems.main, 'music.stems.main'),
            drums: nullableRelativePath(stems.drums, 'music.stems.drums'),
            hihats: nullableRelativePath(stems.hihats, 'music.stems.hihats'),
        },
    }
}

function nullableRelativePath(value: unknown, name: string): string | null {
    return value === null ? null : relativePath(value, name)
}

function relativePath(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string`)
    let decoded = value
    try {
        for (let i = 0; i < 3; i++) {
            const next = decodeURIComponent(decoded)
            if (next === decoded) break
            decoded = next
        }
    } catch {
        throw new Error(`${name} must be a bundle-relative path`)
    }
    if (
        /^(?:[A-Za-z]:|[\\/]|[a-z][a-z0-9+.-]*:)/i.test(decoded) ||
        decoded.split(/[\\/]/).includes('..')
    ) {
        throw new Error(`${name} must be a bundle-relative path`)
    }
    return value
}

function exactObject(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`)
    const record = value as Record<string, unknown>
    const expected = new Set(keys)
    for (const key of Object.keys(record)) if (!expected.has(key)) throw new Error(`${name}.${key} is not supported`)
    for (const key of keys) if (!Object.prototype.hasOwnProperty.call(record, key)) throw new Error(`${name}.${key} is required`)
    return record
}

function finiteNumber(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be a finite number`)
    return value
}
