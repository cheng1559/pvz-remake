import type { ReanimKeyframeV2, ReanimV2 } from '@/shared/content/reanim'
import { isQualifiedId } from '@/shared/mod/index'

export interface ReanimPlaybackSnapshot {
    id: string
    timeSeconds: number
    playing: boolean
    loop: boolean
    rate: number
    visible: boolean
    hideOnFinish: boolean
    extraAdditive: boolean
    extraAdditiveColor: { r: number, g: number, b: number, a: number }
    blend: {
        durationSeconds: number
        elapsedSeconds: number
        fromPoses: Array<{ trackId: string, pose: ReanimKeyframeV2 }>
    } | null
    attachmentTrackId: string | null
}

export function parseReanimPlaybackSnapshot(value: unknown): ReanimPlaybackSnapshot {
    const source = exactObject(value, [
        'id', 'timeSeconds', 'playing', 'loop', 'rate', 'visible', 'hideOnFinish',
        'extraAdditive', 'extraAdditiveColor', 'blend', 'attachmentTrackId',
    ], 'reanim snapshot')
    if (!isQualifiedId(source.id)) throw new Error('reanim snapshot.id must be a qualified ID')

    const loop = boolean(source.loop, 'reanim snapshot.loop')
    const timeSeconds = finite(source.timeSeconds, 'reanim snapshot.timeSeconds')
    if (timeSeconds < 0) throw new Error('reanim snapshot.timeSeconds must be non-negative')
    const rate = finite(source.rate, 'reanim snapshot.rate')
    if (rate <= 0) throw new Error('reanim snapshot.rate must be positive')

    const colorSource = exactObject(
        source.extraAdditiveColor,
        ['r', 'g', 'b', 'a'],
        'reanim snapshot.extraAdditiveColor',
    )
    const extraAdditiveColor = {
        r: colorByte(colorSource.r, 'reanim snapshot.extraAdditiveColor.r'),
        g: colorByte(colorSource.g, 'reanim snapshot.extraAdditiveColor.g'),
        b: colorByte(colorSource.b, 'reanim snapshot.extraAdditiveColor.b'),
        a: colorByte(colorSource.a, 'reanim snapshot.extraAdditiveColor.a'),
    }

    let blend: ReanimPlaybackSnapshot['blend'] = null
    if (source.blend !== null) {
        const blendSource = exactObject(
            source.blend,
            ['durationSeconds', 'elapsedSeconds', 'fromPoses'],
            'reanim snapshot.blend',
        )
        const durationSeconds = finite(blendSource.durationSeconds, 'reanim snapshot.blend.durationSeconds')
        const elapsedSeconds = finite(blendSource.elapsedSeconds, 'reanim snapshot.blend.elapsedSeconds')
        if (durationSeconds <= 0) throw new Error('reanim snapshot.blend.durationSeconds must be positive')
        if (elapsedSeconds < 0 || elapsedSeconds >= durationSeconds) {
            throw new Error('reanim snapshot.blend.elapsedSeconds must be within the blend duration')
        }
        if (!Array.isArray(blendSource.fromPoses)) {
            throw new Error('reanim snapshot.blend.fromPoses must be an array')
        }
        const seen = new Set<string>()
        const fromPoses = blendSource.fromPoses.map((entry, index) => {
            const name = `reanim snapshot.blend.fromPoses[${index}]`
            const record = exactObject(entry, ['trackId', 'pose'], name)
            const trackId = nonEmptyString(record.trackId, `${name}.trackId`)
            if (seen.has(trackId)) throw new Error(`duplicate reanim snapshot blend track: ${trackId}`)
            seen.add(trackId)
            return { trackId, pose: parsePose(record.pose, `${name}.pose`) }
        })
        blend = { durationSeconds, elapsedSeconds, fromPoses }
    }

    const attachmentTrackId = source.attachmentTrackId === null
        ? null
        : nonEmptyString(source.attachmentTrackId, 'reanim snapshot.attachmentTrackId')
    return {
        id: source.id,
        timeSeconds,
        playing: boolean(source.playing, 'reanim snapshot.playing'),
        loop,
        rate,
        visible: boolean(source.visible, 'reanim snapshot.visible'),
        hideOnFinish: boolean(source.hideOnFinish, 'reanim snapshot.hideOnFinish'),
        extraAdditive: boolean(source.extraAdditive, 'reanim snapshot.extraAdditive'),
        extraAdditiveColor,
        blend,
        attachmentTrackId,
    }
}

export function validateReanimPlaybackSnapshotContent(
    snapshot: ReanimPlaybackSnapshot,
    data: ReanimV2,
): ReanimPlaybackSnapshot {
    if (snapshot.id !== data.id) throw new Error(`cannot restore ${snapshot.id} into ${data.id}`)
    if (snapshot.loop
        ? snapshot.timeSeconds >= data.durationSeconds
        : snapshot.timeSeconds > data.durationSeconds) {
        throw new Error('reanim snapshot.timeSeconds is outside the animation duration')
    }
    const trackIds = new Set(data.tracks.map(track => track.id))
    for (const [index, entry] of (snapshot.blend?.fromPoses ?? []).entries()) {
        if (!trackIds.has(entry.trackId)) {
            throw new Error(`reanim snapshot.blend.fromPoses[${index}].trackId is not in ${data.id}`)
        }
    }
    return snapshot
}

function parsePose(value: unknown, name: string): ReanimKeyframeV2 {
    const source = exactObject(value, [
        'timeSeconds', 'x', 'y', 'scaleX', 'scaleY', 'skewX', 'skewY',
        'alpha', 'sprite', 'interpolation',
    ], name)
    const timeSeconds = finite(source.timeSeconds, `${name}.timeSeconds`)
    if (timeSeconds < 0) throw new Error(`${name}.timeSeconds must be non-negative`)
    const alpha = finite(source.alpha, `${name}.alpha`)
    if (alpha < 0 || alpha > 1) throw new Error(`${name}.alpha must be between 0 and 1`)
    if (source.sprite !== null && !isQualifiedId(source.sprite)) {
        throw new Error(`${name}.sprite must be null or a qualified ID`)
    }
    if (source.interpolation !== 'linear' && source.interpolation !== 'step') {
        throw new Error(`${name}.interpolation must be linear or step`)
    }
    return {
        timeSeconds,
        x: finite(source.x, `${name}.x`),
        y: finite(source.y, `${name}.y`),
        scaleX: finite(source.scaleX, `${name}.scaleX`),
        scaleY: finite(source.scaleY, `${name}.scaleY`),
        skewX: finite(source.skewX, `${name}.skewX`),
        skewY: finite(source.skewY, `${name}.skewY`),
        alpha,
        sprite: source.sprite,
        interpolation: source.interpolation,
    } as ReanimKeyframeV2
}

function exactObject(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)
        || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
        throw new Error(`${name} must be a plain object`)
    }
    const record = value as Record<string, unknown>
    const expected = new Set(keys)
    for (const key of Object.keys(record)) if (!expected.has(key)) throw new Error(`${name}.${key} is not supported`)
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(record, key)) throw new Error(`${name}.${key} is required`)
    }
    return record
}

function nonEmptyString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string`)
    return value
}

function boolean(value: unknown, name: string): boolean {
    if (typeof value !== 'boolean') throw new Error(`${name} must be a boolean`)
    return value
}

function finite(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be finite`)
    return value
}

function colorByte(value: unknown, name: string): number {
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 255) {
        throw new Error(`${name} must be an integer between 0 and 255`)
    }
    return value as number
}
