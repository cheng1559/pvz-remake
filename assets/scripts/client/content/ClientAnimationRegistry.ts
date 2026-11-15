import type { AnimationDefinition, ClientAnimationClip, PresentationDefinitions } from '@/shared/content/presentation'
export type { ClientAnimationClip } from '@/shared/content/presentation'

export class ClientAnimationRegistry {
    private readonly values = new Map<string, AnimationDefinition>()
    private frozen = false

    constructor(readonly definitions: PresentationDefinitions) {
        const { plants, zombies } = definitions
        const defaults = Object.fromEntries(Object.entries({ ...plants, ...zombies })
            .filter(([, definition]) => definition.clips).map(([id, definition]) => [id, definition.clips!]))
        for (const [target, value] of Object.entries(defaults)) {
            const copy = cloneDefinition(value)
            for (const [slot, clip] of Object.entries(copy)) validateClip(target, slot, clip)
            this.values.set(target, copy)
        }
    }

    /** A plant's or a zombie's clips, by its id. */
    resolve(target: string): AnimationDefinition {
        const value = this.values.get(target)
        if (!value) throw new Error(`unknown client animation target: ${target}`)
        return value
    }

    freeze(): void {
        if (this.frozen) return
        this.frozen = true
        for (const definition of this.values.values()) {
            for (const value of Object.values(definition)) Object.freeze(value)
            Object.freeze(definition)
        }
    }
}

/** A copy of the clips with what they leave out filled in (rateScale 1). */
function cloneDefinition<T extends object>(value: T): T {
    return Object.fromEntries(Object.entries(value).map(([slot, animation]) => [slot, { rateScale: 1, ...animation }])) as T
}

function validateClip(target: string, slot: string, value: ClientAnimationClip): void {
    if (!value || typeof value !== 'object') throw new TypeError(`${target}.${slot} must be an object`)
    const fields = new Set(['reanimId', 'rateScale', 'x', 'y', 'attachmentTrackId', 'attachmentBase', 'onlyTracks', 'blend', 'fps', 'fullLastFrame'])
    const unknown = Object.keys(value).find(key => !fields.has(key))
    if (unknown) throw new TypeError(`unknown ${target}.${slot} field: ${unknown}`)
    if (typeof value.reanimId !== 'string' || value.reanimId.length === 0) {
        throw new TypeError(`${target}.${slot}.reanimId must be a non-empty string`)
    }
    for (const key of ['x', 'y'] as const) {
        if (!Number.isFinite(value[key])) throw new TypeError(`${target}.${slot}.${key} must be finite`)
    }
    if (value.rateScale !== undefined && (!Number.isFinite(value.rateScale) || value.rateScale <= 0)) throw new TypeError(`${target}.${slot}.rateScale must be positive`)
    if (value.fps !== undefined && (!Number.isFinite(value.fps) || value.fps <= 0)) throw new TypeError(`${target}.${slot}.fps must be positive`)
    if (value.attachmentTrackId !== undefined &&
        (typeof value.attachmentTrackId !== 'string' || value.attachmentTrackId.length === 0)) {
        throw new TypeError(`${target}.${slot}.attachmentTrackId must be a non-empty string`)
    }
    if (value.attachmentBase !== undefined && (typeof value.attachmentBase !== 'string' || value.attachmentBase.length === 0)) {
        throw new TypeError(`${target}.${slot}.attachmentBase must be a non-empty string`)
    }
    if (value.onlyTracks !== undefined && (!Array.isArray(value.onlyTracks) || value.onlyTracks.some(track => typeof track !== 'string' || track.length === 0))) {
        throw new TypeError(`${target}.${slot}.onlyTracks must be non-empty strings`)
    }
    if (value.blend !== undefined && (!Number.isFinite(value.blend) || value.blend < 0)) throw new TypeError(`${target}.${slot}.blend must not be negative`)
    if (value.fullLastFrame !== undefined && value.fullLastFrame !== true) throw new TypeError(`${target}.${slot}.fullLastFrame must be true`)
}
