import {
    parseParticlePlayerSnapshot,
    type ParticlePlayerSnapshot,
} from '@/client/particle/ParticlePlayerSnapshot'
import {
    parseReanimPlaybackSnapshot,
    type ReanimPlaybackSnapshot,
} from '@/client/reanim/ReanimPlaybackSnapshot'
import {
    parseTodParticleSystemSnapshot,
    type TodParticleSystemSnapshot,
} from '@/core/Particle/TodParticleSnapshot'
import {
    parseMusicPlaybackSnapshot,
    type MusicPlaybackSnapshot,
} from '@/client/music/MusicPlaybackSnapshot'
import { assertJsonValue, jsonRoundTrip, type JsonValue } from '@/shared/protocol/index'
import { isQualifiedId } from '@/shared/mod/index'
import {
    parseAdviceWidgetSnapshot,
    type AdviceWidgetSnapshot,
} from '@/client/hud/advice/AdviceWidgetSnapshot'

const END_INACTIVE = -1
const END_COMPLETE = 600
const MAX_COORDINATE = 1_000_000
const MAX_PROGRESS_WIDTH = 150

export interface LevelFlowSnapshot {
    introCompletionSent: boolean
    completionStarted: boolean
}

export interface LevelIntroPreviewSnapshot {
    slot: number
    x: number
    y: number
    z: number
    hasTongue: boolean
    reanim: ReanimPlaybackSnapshot
}

export interface LevelIntroSnapshot {
    ticks: number
    previews: LevelIntroPreviewSnapshot[]
}

export interface LevelEndSnapshot {
    ticks: number
    finalWave: ReanimPlaybackSnapshot | null
    hugeWaveTicks?: number
}

export interface LevelAdviceSnapshot {
    lastStatusMessage: string
    lastSyncedTick: number
    widget: AdviceWidgetSnapshot | null
}

export interface LevelHudSnapshot {
    sunFlashTicks: number
    previousPacketCooldown: number | null
    progressWave: number
    progressCountdownStart: number
    progressMeterWidth: number
    progressTick: number
}

export interface LevelAudioSnapshot {
    music: MusicPlaybackSnapshot | null
    ownsMusic: boolean
    gameplayStarted: boolean
    firstWavePlayed: boolean
}

export type LevelEntitySnapshot =
    | {
        kind: 'plant'
        entityId: number
        animations: Record<string, ReanimPlaybackSnapshot>
        idleRate?: number
        blinkAtTick?: number
    }
    | {
        kind: 'zombie'
        entityId: number
        body: ReanimPlaybackSnapshot | null
        mowerDriver: ReanimPlaybackSnapshot | null
        flag?: ReanimPlaybackSnapshot
    }
    | {
        kind: 'mower'
        entityId: number
        animation: ReanimPlaybackSnapshot | null
    }
    | {
        kind: 'sun'
        entityId: number
        animation: ReanimPlaybackSnapshot | null
    }

export type LevelParticleOwnerSnapshot =
    | {
        kind: 'screen'
        slot: 'board' | 'entity-layer' | 'coin-layer' | 'hud' | 'seed-packet' | `seed-packet-${number}` | 'award-layer' | 'overlay-layer'
        x: number
        y: number
        z: number
    }
    | {
        kind: 'entity'
        entityId: number
        slot: 'root' | 'body' | 'head' | 'shadow' | 'award-back-effects'
        x: number
        y: number
        z: number
    }
    | {
        kind: 'intro-preview'
        slot: number
        x: number
        y: number
        z: number
    }

export type LevelParticleSnapshot =
    | {
        instanceId: number
        backend: 'particle'
        owner: LevelParticleOwnerSnapshot
        playback: ParticlePlayerSnapshot
    }
    | {
        instanceId: number
        backend: 'tod'
        owner: LevelParticleOwnerSnapshot
        playback: TodParticleSystemSnapshot
    }

export interface LevelPresentationSnapshot {
    schemaVersion: 2
    flow: LevelFlowSnapshot
    intro: LevelIntroSnapshot
    end: LevelEndSnapshot
    advice: LevelAdviceSnapshot
    hud: LevelHudSnapshot
    audio: LevelAudioSnapshot
    entities: LevelEntitySnapshot[]
    particles: LevelParticleSnapshot[]
    extensions: Record<string, JsonValue>
}

export function parseLevelPresentationSnapshot(value: unknown): LevelPresentationSnapshot {
    assertJsonValue(value)
    const source = exact(value, [
        'schemaVersion', 'flow', 'intro', 'end', 'advice', 'hud',
        'audio', 'entities', 'particles', 'extensions',
    ], 'Level presentation')
    if (source.schemaVersion !== 2) throw new TypeError('Level presentation.schemaVersion must be 2')

    const flow = parseFlow(source.flow)
    const intro = parseIntro(source.intro)
    const end = parseEnd(source.end)
    const entities = parseEntities(source.entities)
    const particles = parseParticles(source.particles, intro)
    if (flow.introCompletionSent && intro.previews.length > 0) {
        throw new TypeError('Level presentation cannot send intro completion before the intro ends')
    }
    if (flow.completionStarted !== (end.ticks >= END_COMPLETE)) {
        throw new TypeError('Level presentation completion flow and end ticks are inconsistent')
    }

    return {
        schemaVersion: 2,
        flow,
        intro,
        end,
        advice: parseAdvice(source.advice),
        hud: parseHud(source.hud),
        audio: parseAudio(source.audio),
        entities,
        particles,
        extensions: parseExtensions(source.extensions),
    }
}

function parseFlow(value: unknown): LevelFlowSnapshot {
    const source = exact(value, ['introCompletionSent', 'completionStarted'], 'Level flow')
    return {
        introCompletionSent: boolean(source.introCompletionSent, 'Level flow.introCompletionSent'),
        completionStarted: boolean(source.completionStarted, 'Level flow.completionStarted'),
    }
}

function parseIntro(value: unknown): LevelIntroSnapshot {
    const source = exact(value, ['ticks', 'previews'], 'Level intro')
    const previews = array(source.previews, 'Level intro.previews').map((value, index) => {
        const name = `Level intro.previews[${index}]`
        const preview = exact(value, ['slot', 'x', 'y', 'z', 'hasTongue', 'reanim'], name)
        return {
            slot: nonNegativeInteger(preview.slot, `${name}.slot`),
            x: coordinate(preview.x, `${name}.x`),
            y: coordinate(preview.y, `${name}.y`),
            z: coordinate(preview.z, `${name}.z`),
            hasTongue: boolean(preview.hasTongue, `${name}.hasTongue`),
            reanim: parseReanimPlaybackSnapshot(preview.reanim),
        }
    })
    unique(previews.map(preview => preview.slot), 'Level intro preview slot')
    const ticks = finiteInRange(source.ticks, 0, MAX_COORDINATE, 'Level intro.ticks')
    return {
        ticks,
        previews,
    }
}

function parseEnd(value: unknown): LevelEndSnapshot {
    const source = exact(value, ['ticks', 'finalWave'], 'Level end', ['hugeWaveTicks'])
    return {
        ticks: finiteInRange(source.ticks, END_INACTIVE, END_COMPLETE, 'Level end.ticks'),
        finalWave: source.finalWave === null ? null : parseReanimPlaybackSnapshot(source.finalWave),
        ...(source.hugeWaveTicks === undefined ? {} : { hugeWaveTicks: finiteInRange(source.hugeWaveTicks, 0, 750, 'Level end.hugeWaveTicks') }),
    }
}

function parseAdvice(value: unknown): LevelAdviceSnapshot {
    const source = exact(
        value,
        ['lastStatusMessage', 'lastSyncedTick', 'widget'],
        'Level advice',
    )
    if (typeof source.lastStatusMessage !== 'string') {
        throw new TypeError('Level advice.lastStatusMessage must be a string')
    }
    return {
        lastStatusMessage: source.lastStatusMessage,
        lastSyncedTick: nonNegativeInteger(source.lastSyncedTick, 'Level advice.lastSyncedTick'),
        widget: parseAdviceWidgetSnapshot(source.widget),
    }
}

function parseHud(value: unknown): LevelHudSnapshot {
    const source = exact(value, [
        'sunFlashTicks', 'previousPacketCooldown', 'progressWave',
        'progressCountdownStart', 'progressMeterWidth', 'progressTick',
    ], 'Level HUD')
    return {
        sunFlashTicks: integerInRange(source.sunFlashTicks, 0, 70, 'Level HUD.sunFlashTicks'),
        previousPacketCooldown: source.previousPacketCooldown === null
            ? null
            : nonNegativeInteger(source.previousPacketCooldown, 'Level HUD.previousPacketCooldown'),
        progressWave: nonNegativeInteger(source.progressWave, 'Level HUD.progressWave'),
        progressCountdownStart: nonNegativeInteger(
            source.progressCountdownStart,
            'Level HUD.progressCountdownStart',
        ),
        progressMeterWidth: integerInRange(
            source.progressMeterWidth,
            0,
            MAX_PROGRESS_WIDTH,
            'Level HUD.progressMeterWidth',
        ),
        progressTick: nonNegativeInteger(source.progressTick, 'Level HUD.progressTick'),
    }
}

function parseAudio(value: unknown): LevelAudioSnapshot {
    const source = exact(value, [
        'music', 'ownsMusic', 'gameplayStarted', 'firstWavePlayed',
    ], 'Level audio')
    return {
        music: parseMusicPlaybackSnapshot(source.music),
        ownsMusic: boolean(source.ownsMusic, 'Level audio.ownsMusic'),
        gameplayStarted: boolean(source.gameplayStarted, 'Level audio.gameplayStarted'),
        firstWavePlayed: boolean(source.firstWavePlayed, 'Level audio.firstWavePlayed'),
    }
}

function parseEntities(value: unknown): LevelEntitySnapshot[] {
    const entities = array(value, 'Level entities').map((value, index) => parseEntity(value, index))
    unique(entities.map(entity => entity.entityId), 'Level entity ID')
    return entities.sort((left, right) => left.entityId - right.entityId)
}

function parseEntity(value: unknown, index: number): LevelEntitySnapshot {
    const name = `Level entities[${index}]`
    const tagged = taggedObject(value, name)
    const entityId = positiveInteger(tagged.entityId, `${name}.entityId`)
    switch (tagged.kind) {
        case 'plant': {
            const plant = exact(value, ['kind', 'entityId', 'animations'], name, ['idleRate', 'blinkAtTick'])
            const animations = plainObject(plant.animations, `${name}.animations`)
            if (!Object.hasOwn(animations, 'body')) throw new TypeError(`${name}.animations.body is required`)
            if (Object.hasOwn(animations, 'idleHead') && (!Object.hasOwn(animations, 'blink') || plant.blinkAtTick === undefined)) {
                throw new TypeError(`${name} is missing shooter blink state`)
            }
            return {
                kind: 'plant', entityId,
                animations: Object.fromEntries(Object.entries(animations).map(([slot, state]) => [slot, parseReanimPlaybackSnapshot(state)])),
                ...(plant.idleRate === undefined ? {} : { idleRate: positiveFinite(plant.idleRate, `${name}.idleRate`) }),
                ...(plant.blinkAtTick === undefined ? {} : { blinkAtTick: nonNegativeInteger(plant.blinkAtTick, `${name}.blinkAtTick`) }),
            }
        }
        case 'zombie': {
            const source = exact(value, [
                'kind', 'entityId', 'body', 'mowerDriver',
            ], name, ['flag'])
            return {
                kind: 'zombie', entityId,
                body: optionalReanim(source.body),
                mowerDriver: optionalReanim(source.mowerDriver),
                ...(source.flag === undefined ? {} : { flag: parseReanimPlaybackSnapshot(source.flag) }),
            }
        }
        case 'mower':
        case 'sun': {
            const source = exact(value, ['kind', 'entityId', 'animation'], name)
            return { kind: tagged.kind, entityId, animation: optionalReanim(source.animation) }
        }
        default: throw new TypeError(`${name}.kind is invalid`)
    }
}

function parseParticles(
    value: unknown,
    intro: LevelIntroSnapshot,
): LevelParticleSnapshot[] {
    const introSlots = new Set(intro.previews.map(preview => preview.slot))
    const particles = array(value, 'Level particles').map((value, index) => {
        const name = `Level particles[${index}]`
        const source = exact(value, ['instanceId', 'backend', 'owner', 'playback'], name)
        const instanceId = positiveInteger(source.instanceId, `${name}.instanceId`)
        const owner = parseParticleOwner(source.owner, name)
        if (owner.kind === 'intro-preview' && !introSlots.has(owner.slot)) {
            throw new TypeError(`${name}.owner references missing intro preview ${owner.slot}`)
        }
        if (source.backend === 'particle') {
            return { instanceId, backend: 'particle' as const, owner, playback: parseParticlePlayerSnapshot(source.playback) }
        }
        if (source.backend === 'tod') {
            return { instanceId, backend: 'tod' as const, owner, playback: parseTodParticleSystemSnapshot(source.playback) }
        }
        throw new TypeError(`${name}.backend is invalid`)
    })
    unique(particles.map(particle => particle.instanceId), 'Level particle instance ID')
    return particles.sort((left, right) => left.instanceId - right.instanceId)
}

function parseParticleOwner(value: unknown, particleName: string): LevelParticleOwnerSnapshot {
    const name = `${particleName}.owner`
    const tagged = taggedObject(value, name)
    if (tagged.kind === 'screen') {
        const source = exact(value, ['kind', 'slot', 'x', 'y', 'z'], name)
        const slots = new Set([
            'board', 'entity-layer', 'coin-layer', 'hud', 'seed-packet', 'award-layer', 'overlay-layer',
        ])
        if (typeof source.slot !== 'string' || !slots.has(source.slot) && !/^seed-packet-[1-9]\d*$/.test(source.slot)) throw new TypeError(`${name}.slot is invalid`)
        return {
            kind: 'screen',
            slot: source.slot as Extract<LevelParticleOwnerSnapshot, { kind: 'screen' }>['slot'],
            x: coordinate(source.x, `${name}.x`),
            y: coordinate(source.y, `${name}.y`),
            z: coordinate(source.z, `${name}.z`),
        }
    }
    if (tagged.kind === 'entity') {
        const source = exact(value, ['kind', 'entityId', 'slot', 'x', 'y', 'z'], name)
        const slots = new Set(['root', 'body', 'head', 'shadow', 'award-back-effects'])
        if (typeof source.slot !== 'string' || !slots.has(source.slot)) throw new TypeError(`${name}.slot is invalid`)
        return {
            kind: 'entity',
            entityId: positiveInteger(source.entityId, `${name}.entityId`),
            slot: source.slot as Extract<LevelParticleOwnerSnapshot, { kind: 'entity' }>['slot'],
            x: coordinate(source.x, `${name}.x`),
            y: coordinate(source.y, `${name}.y`),
            z: coordinate(source.z, `${name}.z`),
        }
    }
    if (tagged.kind === 'intro-preview') {
        const source = exact(value, ['kind', 'slot', 'x', 'y', 'z'], name)
        return {
            kind: 'intro-preview',
            slot: nonNegativeInteger(source.slot, `${name}.slot`),
            x: coordinate(source.x, `${name}.x`),
            y: coordinate(source.y, `${name}.y`),
            z: coordinate(source.z, `${name}.z`),
        }
    }
    throw new TypeError(`${name}.kind is invalid`)
}

function parseExtensions(value: unknown): Record<string, JsonValue> {
    const source = plainObject(value, 'Level extensions')
    const result: Record<string, JsonValue> = {}
    for (const [id, extension] of Object.entries(source)) {
        if (!isQualifiedId(id)) throw new TypeError(`Level extension ID is invalid: ${id}`)
        assertJsonValue(extension)
        result[id] = jsonRoundTrip(extension)
    }
    return result
}

function optionalReanim(value: unknown): ReanimPlaybackSnapshot | null {
    return value === null ? null : parseReanimPlaybackSnapshot(value)
}

function taggedObject(value: unknown, name: string): Record<string, unknown> & { kind: string } {
    const source = plainObject(value, name)
    if (typeof source.kind !== 'string') throw new TypeError(`${name}.kind must be a string`)
    return source as Record<string, unknown> & { kind: string }
}

function exact(value: unknown, keys: readonly string[], name: string, optional: readonly string[] = []): Record<string, unknown> {
    const source = plainObject(value, name)
    const allowed = new Set([...keys, ...optional])
    for (const key of Object.keys(source)) if (!allowed.has(key)) throw new TypeError(`${name}.${key} is not supported`)
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(source, key)) throw new TypeError(`${name}.${key} is required`)
    }
    return source
}

function plainObject(value: unknown, name: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)
        || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
        throw new TypeError(`${name} must be a plain object`)
    }
    return value as Record<string, unknown>
}

function array(value: unknown, name: string): unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`)
    return value
}

function unique(values: Array<string | number>, name: string): void {
    if (new Set(values).size !== values.length) throw new TypeError(`${name} must be unique`)
}

function boolean(value: unknown, name: string): boolean {
    if (typeof value !== 'boolean') throw new TypeError(`${name} must be boolean`)
    return value
}

function finite(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`)
    return value
}

function finiteInRange(value: unknown, min: number, max: number, name: string): number {
    const result = finite(value, name)
    if (result < min || result > max) throw new TypeError(`${name} must be between ${min} and ${max}`)
    return result
}

function coordinate(value: unknown, name: string): number {
    return finiteInRange(value, -MAX_COORDINATE, MAX_COORDINATE, name)
}

function positiveFinite(value: unknown, name: string): number {
    const result = finite(value, name)
    if (result <= 0) throw new TypeError(`${name} must be positive`)
    return result
}

function nonNegativeInteger(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
        throw new TypeError(`${name} must be a non-negative safe integer`)
    }
    return value
}

function positiveInteger(value: unknown, name: string): number {
    const result = nonNegativeInteger(value, name)
    if (result === 0) throw new TypeError(`${name} must be positive`)
    return result
}

function integerInRange(value: unknown, min: number, max: number, name: string): number {
    const result = nonNegativeInteger(value, name)
    if (result < min || result > max) throw new TypeError(`${name} must be between ${min} and ${max}`)
    return result
}
