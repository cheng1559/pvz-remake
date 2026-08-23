import { isQualifiedId } from '@/shared/mod/index'

export type ReanimInterpolation = 'linear' | 'step'

export interface ReanimKeyframeV2 {
    timeSeconds: number
    x: number
    y: number
    scaleX: number
    scaleY: number
    skewX: number
    skewY: number
    alpha: number
    sprite: string | null
    interpolation: ReanimInterpolation
}

export interface ReanimTrackV2 {
    id: string
    zIndex: number
    keyframes: ReanimKeyframeV2[]
}

export interface ReanimV2 {
    schemaVersion: 2
    id: string
    durationSeconds: number
    tracks: ReanimTrackV2[]
}

export function sampleReanimTrack(track: ReanimTrackV2, timeSeconds: number): ReanimKeyframeV2 | null {
    const frames = track.keyframes
    if (timeSeconds < frames[0].timeSeconds) return null

    let index = 0
    while (index + 1 < frames.length && frames[index + 1].timeSeconds <= timeSeconds) index++
    const left = frames[index]
    const right = frames[index + 1]
    if (!right || left.interpolation === 'step') return left

    const ratio = (timeSeconds - left.timeSeconds) / (right.timeSeconds - left.timeSeconds)
    const lerp = (a: number, b: number) => a + (b - a) * ratio
    return {
        timeSeconds,
        x: lerp(left.x, right.x),
        y: lerp(left.y, right.y),
        scaleX: lerp(left.scaleX, right.scaleX),
        scaleY: lerp(left.scaleY, right.scaleY),
        skewX: lerp(left.skewX, right.skewX),
        skewY: lerp(left.skewY, right.skewY),
        alpha: lerp(left.alpha, right.alpha),
        sprite: left.sprite,
        interpolation: left.interpolation,
    }
}

export function attachReanimPose(
    pose: ReanimKeyframeV2,
    parentPose: ReanimKeyframeV2,
    parentBasePose: ReanimKeyframeV2,
): ReanimKeyframeV2 {
    const baseInverse = invertMatrix(poseMatrix(parentBasePose))
    const attached = multiplyMatrix(
        multiplyMatrix(poseMatrix(parentPose), baseInverse),
        poseMatrix(pose),
    )
    const determinant = attached.a * attached.d - attached.b * attached.c
    const scaleX = Math.hypot(attached.a, attached.b)
    let scaleY = Math.hypot(attached.c, attached.d)
    let skewY = -Math.atan2(-attached.c, attached.d) * 180 / Math.PI
    if (determinant < 0) {
        scaleY = -scaleY
        skewY += 180
    }
    return {
        ...pose,
        x: attached.tx,
        y: -attached.ty,
        scaleX,
        scaleY,
        skewX: -Math.atan2(attached.b, attached.a) * 180 / Math.PI,
        skewY,
    }
}

export function parseReanimV2(value: unknown): ReanimV2 {
    const source = exactObject(value, ['schemaVersion', 'id', 'durationSeconds', 'tracks'], 'reanim')
    if (source.schemaVersion !== 2) throw new Error('reanim.schemaVersion must be 2')
    if (!isQualifiedId(source.id)) throw new Error('reanim.id must be a qualified ID')

    const durationSeconds = positiveNumber(source.durationSeconds, 'reanim.durationSeconds')
    if (!Array.isArray(source.tracks) || source.tracks.length === 0) {
        throw new Error('reanim.tracks must be a non-empty array')
    }

    const ids = new Set<string>()
    const tracks = source.tracks.map((track, index) => {
        const name = `reanim.tracks[${index}]`
        const record = exactObject(track, ['id', 'zIndex', 'keyframes'], name)
        const id = nonEmptyString(record.id, `${name}.id`)
        if (ids.has(id)) throw new Error(`duplicate reanim track: ${id}`)
        ids.add(id)
        if (!Number.isSafeInteger(record.zIndex)) throw new Error(`${name}.zIndex must be a safe integer`)
        if (!Array.isArray(record.keyframes) || record.keyframes.length === 0) {
            throw new Error(`${name}.keyframes must be a non-empty array`)
        }

        let previousTime = -1
        const keyframes = record.keyframes.map((keyframe, keyframeIndex) => {
            const keyframeName = `${name}.keyframes[${keyframeIndex}]`
            const frame = exactObject(
                keyframe,
                [
                    'timeSeconds', 'x', 'y', 'scaleX', 'scaleY', 'skewX', 'skewY',
                    'alpha', 'sprite', 'interpolation',
                ],
                keyframeName,
            )
            const timeSeconds = finiteNumber(frame.timeSeconds, `${keyframeName}.timeSeconds`)
            if (timeSeconds < 0 || timeSeconds > durationSeconds || timeSeconds <= previousTime) {
                throw new Error(`${keyframeName}.timeSeconds must increase within the animation duration`)
            }
            previousTime = timeSeconds
            const alpha = finiteNumber(frame.alpha, `${keyframeName}.alpha`)
            if (alpha < 0 || alpha > 1) throw new Error(`${keyframeName}.alpha must be between 0 and 1`)
            if (frame.sprite !== null && !isQualifiedId(frame.sprite)) {
                throw new Error(`${keyframeName}.sprite must be null or a qualified ID`)
            }
            if (frame.interpolation !== 'linear' && frame.interpolation !== 'step') {
                throw new Error(`${keyframeName}.interpolation must be linear or step`)
            }

            return {
                timeSeconds,
                x: finiteNumber(frame.x, `${keyframeName}.x`),
                y: finiteNumber(frame.y, `${keyframeName}.y`),
                scaleX: finiteNumber(frame.scaleX, `${keyframeName}.scaleX`),
                scaleY: finiteNumber(frame.scaleY, `${keyframeName}.scaleY`),
                skewX: finiteNumber(frame.skewX, `${keyframeName}.skewX`),
                skewY: finiteNumber(frame.skewY, `${keyframeName}.skewY`),
                alpha,
                sprite: frame.sprite,
                interpolation: frame.interpolation,
            } as ReanimKeyframeV2
        })

        return { id, zIndex: record.zIndex as number, keyframes }
    })

    return { schemaVersion: 2, id: source.id, durationSeconds, tracks } as ReanimV2
}

function exactObject(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error(`${name} must be an object`)
    }
    const record = value as Record<string, unknown>
    const expected = new Set(keys)
    for (const key of Object.keys(record)) {
        if (!expected.has(key)) throw new Error(`${name}.${key} is not supported`)
    }
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(record, key)) throw new Error(`${name}.${key} is required`)
    }
    return record
}

function nonEmptyString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string`)
    return value
}

function finiteNumber(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be a finite number`)
    return value
}

function positiveNumber(value: unknown, name: string): number {
    const number = finiteNumber(value, name)
    if (number <= 0) throw new Error(`${name} must be positive`)
    return number
}

interface PoseMatrix {
    a: number
    b: number
    c: number
    d: number
    tx: number
    ty: number
}

function poseMatrix(pose: ReanimKeyframeV2): PoseMatrix {
    const skewX = -pose.skewX * Math.PI / 180
    const skewY = -pose.skewY * Math.PI / 180
    return {
        a: pose.scaleX * Math.cos(skewX),
        b: pose.scaleX * Math.sin(skewX),
        c: -pose.scaleY * Math.sin(skewY),
        d: pose.scaleY * Math.cos(skewY),
        tx: pose.x,
        ty: -pose.y,
    }
}

function invertMatrix(matrix: PoseMatrix): PoseMatrix {
    const determinant = matrix.a * matrix.d - matrix.b * matrix.c
    if (Math.abs(determinant) < 1e-8) throw new Error('cannot attach to a singular reanim pose')
    return {
        a: matrix.d / determinant,
        b: -matrix.b / determinant,
        c: -matrix.c / determinant,
        d: matrix.a / determinant,
        tx: (matrix.c * matrix.ty - matrix.d * matrix.tx) / determinant,
        ty: (matrix.b * matrix.tx - matrix.a * matrix.ty) / determinant,
    }
}

function multiplyMatrix(left: PoseMatrix, right: PoseMatrix): PoseMatrix {
    return {
        a: left.a * right.a + left.c * right.b,
        b: left.b * right.a + left.d * right.b,
        c: left.a * right.c + left.c * right.d,
        d: left.b * right.c + left.d * right.d,
        tx: left.a * right.tx + left.c * right.ty + left.tx,
        ty: left.b * right.tx + left.d * right.ty + left.ty,
    }
}
