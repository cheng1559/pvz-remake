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

const INTRO_END = 855
const END_INACTIVE = -1
const END_COMPLETE = 600
const MAX_COORDINATE = 1_000_000
const MAX_PROGRESS_WIDTH = 150

export interface Adventure11FlowSnapshotV2 {
    introCompletionSent: boolean
    completionStarted: boolean
}

export interface Adventure11IntroPreviewSnapshotV2 {
    slot: number
    x: number
    y: number
    z: number
    reanim: ReanimPlaybackSnapshot
}

export interface Adventure11IntroSnapshotV2 {
    ticks: number
    previews: Adventure11IntroPreviewSnapshotV2[]
}

export interface Adventure11EndSnapshotV2 {
    ticks: number
    finalWave: ReanimPlaybackSnapshot | null
}

export interface Adventure11AdviceSnapshotV2 {
    lastStatusMessage: string
    lastSyncedTick: number
    widget: AdviceWidgetSnapshot | null
}

export interface Adventure11HudSnapshotV2 {
    sunFlashTicks: number
    previousPacketCooldown: number | null
    progressWave: number
    progressCountdownStart: number
    progressMeterWidth: number
    progressTick: number
}

export interface Adventure11AudioSnapshotV2 {
    music: MusicPlaybackSnapshot | null
    ownsMusic: boolean
    gameplayStarted: boolean
    firstWavePlayed: boolean
}

export type Adventure11EntitySnapshotV2 =
    | {
        kind: 'plant'
        entityId: number
        body: ReanimPlaybackSnapshot
        idleHead: ReanimPlaybackSnapshot
        shootHead: ReanimPlaybackSnapshot
        idleRate: number
    }
    | {
        kind: 'zombie'
        entityId: number
        body: ReanimPlaybackSnapshot | null
        mowerDriver: ReanimPlaybackSnapshot | null
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

export type Adventure11ParticleOwnerSnapshotV2 =
    | {
        kind: 'screen'
        slot: 'board' | 'entity-layer' | 'coin-layer' | 'hud' | 'seed-packet' | 'award-layer' | 'overlay-layer'
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

export type Adventure11ParticleSnapshotV2 =
    | {
        instanceId: number
        backend: 'v2'
        owner: Adventure11ParticleOwnerSnapshotV2
        playback: ParticlePlayerSnapshot
    }
    | {
        instanceId: number
        backend: 'tod'
        owner: Adventure11ParticleOwnerSnapshotV2
        playback: TodParticleSystemSnapshot
    }

export interface Adventure11PresentationSnapshotV2 {
    schemaVersion: 2
    flow: Adventure11FlowSnapshotV2
    intro: Adventure11IntroSnapshotV2
    end: Adventure11EndSnapshotV2
    advice: Adventure11AdviceSnapshotV2
    hud: Adventure11HudSnapshotV2
    audio: Adventure11AudioSnapshotV2
    entities: Adventure11EntitySnapshotV2[]
    particles: Adventure11ParticleSnapshotV2[]
    extensions: Record<string, JsonValue>
}

export function parseAdventure11PresentationSnapshotV2(value: unknown): Adventure11PresentationSnapshotV2 {
    assertJsonValue(value)
    const source = exact(value, [
        'schemaVersion', 'flow', 'intro', 'end', 'advice', 'hud',
        'audio', 'entities', 'particles', 'extensions',
    ], 'Adventure 1-1 presentation')
    if (source.schemaVersion !== 2) throw new TypeError('Adventure 1-1 presentation.schemaVersion must be 2')

    const flow = parseFlow(source.flow)
    const intro = parseIntro(source.intro)
    const end = parseEnd(source.end)
    const entities = parseEntities(source.entities)
    const particles = parseParticles(source.particles, intro)
    if (flow.introCompletionSent && intro.ticks < INTRO_END) {
        throw new TypeError('Adventure 1-1 presentation cannot send intro completion before the intro ends')
    }
    if (flow.completionStarted !== (end.ticks >= END_COMPLETE)) {
        throw new TypeError('Adventure 1-1 presentation completion flow and end ticks are inconsistent')
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

function parseFlow(value: unknown): Adventure11FlowSnapshotV2 {
    const source = exact(value, ['introCompletionSent', 'completionStarted'], 'Adventure 1-1 flow')
    return {
        introCompletionSent: boolean(source.introCompletionSent, 'Adventure 1-1 flow.introCompletionSent'),
        completionStarted: boolean(source.completionStarted, 'Adventure 1-1 flow.completionStarted'),
    }
}

function parseIntro(value: unknown): Adventure11IntroSnapshotV2 {
    const source = exact(value, ['ticks', 'previews'], 'Adventure 1-1 intro')
    const previews = array(source.previews, 'Adventure 1-1 intro.previews').map((value, index) => {
        const name = `Adventure 1-1 intro.previews[${index}]`
        const preview = exact(value, ['slot', 'x', 'y', 'z', 'reanim'], name)
        return {
            slot: integerInRange(preview.slot, 0, 4, `${name}.slot`),
            x: coordinate(preview.x, `${name}.x`),
            y: coordinate(preview.y, `${name}.y`),
            z: coordinate(preview.z, `${name}.z`),
            reanim: parseReanimPlaybackSnapshot(preview.reanim),
        }
    })
    unique(previews.map(preview => preview.slot), 'Adventure 1-1 intro preview slot')
    const ticks = finiteInRange(source.ticks, 0, INTRO_END, 'Adventure 1-1 intro.ticks')
    const expectedPreviews = ticks < INTRO_END ? 5 : 0
    if (previews.length !== expectedPreviews) {
        throw new TypeError(`Adventure 1-1 intro must contain ${expectedPreviews} previews at tick ${ticks}`)
    }
    return {
        ticks,
        previews,
    }
}

function parseEnd(value: unknown): Adventure11EndSnapshotV2 {
    const source = exact(value, ['ticks', 'finalWave'], 'Adventure 1-1 end')
    return {
        ticks: finiteInRange(source.ticks, END_INACTIVE, END_COMPLETE, 'Adventure 1-1 end.ticks'),
        finalWave: source.finalWave === null ? null : parseReanimPlaybackSnapshot(source.finalWave),
    }
}

function parseAdvice(value: unknown): Adventure11AdviceSnapshotV2 {
    const source = exact(
        value,
        ['lastStatusMessage', 'lastSyncedTick', 'widget'],
        'Adventure 1-1 advice',
    )
    if (typeof source.lastStatusMessage !== 'string') {
        throw new TypeError('Adventure 1-1 advice.lastStatusMessage must be a string')
    }
    return {
        lastStatusMessage: source.lastStatusMessage,
        lastSyncedTick: nonNegativeInteger(source.lastSyncedTick, 'Adventure 1-1 advice.lastSyncedTick'),
        widget: parseAdviceWidgetSnapshot(source.widget),
    }
}

function parseHud(value: unknown): Adventure11HudSnapshotV2 {
    const source = exact(value, [
        'sunFlashTicks', 'previousPacketCooldown', 'progressWave',
        'progressCountdownStart', 'progressMeterWidth', 'progressTick',
    ], 'Adventure 1-1 HUD')
    return {
        sunFlashTicks: integerInRange(source.sunFlashTicks, 0, 70, 'Adventure 1-1 HUD.sunFlashTicks'),
        previousPacketCooldown: source.previousPacketCooldown === null
            ? null
            : nonNegativeInteger(source.previousPacketCooldown, 'Adventure 1-1 HUD.previousPacketCooldown'),
        progressWave: nonNegativeInteger(source.progressWave, 'Adventure 1-1 HUD.progressWave'),
        progressCountdownStart: nonNegativeInteger(
            source.progressCountdownStart,
            'Adventure 1-1 HUD.progressCountdownStart',
        ),
        progressMeterWidth: integerInRange(
            source.progressMeterWidth,
            0,
            MAX_PROGRESS_WIDTH,
            'Adventure 1-1 HUD.progressMeterWidth',
        ),
        progressTick: nonNegativeInteger(source.progressTick, 'Adventure 1-1 HUD.progressTick'),
    }
}

function parseAudio(value: unknown): Adventure11AudioSnapshotV2 {
    const source = exact(value, [
        'music', 'ownsMusic', 'gameplayStarted', 'firstWavePlayed',
    ], 'Adventure 1-1 audio')
    return {
        music: parseMusicPlaybackSnapshot(source.music),
        ownsMusic: boolean(source.ownsMusic, 'Adventure 1-1 audio.ownsMusic'),
        gameplayStarted: boolean(source.gameplayStarted, 'Adventure 1-1 audio.gameplayStarted'),
        firstWavePlayed: boolean(source.firstWavePlayed, 'Adventure 1-1 audio.firstWavePlayed'),
    }
}

function parseEntities(value: unknown): Adventure11EntitySnapshotV2[] {
    const entities = array(value, 'Adventure 1-1 entities').map((value, index) => parseEntity(value, index))
    unique(entities.map(entity => entity.entityId), 'Adventure 1-1 entity ID')
    return entities.sort((left, right) => left.entityId - right.entityId)
}

function parseEntity(value: unknown, index: number): Adventure11EntitySnapshotV2 {
    const name = `Adventure 1-1 entities[${index}]`
    const tagged = taggedObject(value, name)
    const entityId = positiveInteger(tagged.entityId, `${name}.entityId`)
    switch (tagged.kind) {
        case 'plant': {
            const source = exact(value, [
                'kind', 'entityId', 'body', 'idleHead', 'shootHead', 'idleRate',
            ], name)
            const idleRate = positiveFinite(source.idleRate, `${name}.idleRate`)
            return {
                kind: 'plant', entityId,
                body: parseReanimPlaybackSnapshot(source.body),
                idleHead: parseReanimPlaybackSnapshot(source.idleHead),
                shootHead: parseReanimPlaybackSnapshot(source.shootHead),
                idleRate,
            }
        }
        case 'zombie': {
            const source = exact(value, [
                'kind', 'entityId', 'body', 'mowerDriver',
            ], name)
            return {
                kind: 'zombie', entityId,
                body: optionalReanim(source.body),
                mowerDriver: optionalReanim(source.mowerDriver),
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
    intro: Adventure11IntroSnapshotV2,
): Adventure11ParticleSnapshotV2[] {
    const introSlots = new Set(intro.previews.map(preview => preview.slot))
    const particles = array(value, 'Adventure 1-1 particles').map((value, index) => {
        const name = `Adventure 1-1 particles[${index}]`
        const source = exact(value, ['instanceId', 'backend', 'owner', 'playback'], name)
        const instanceId = positiveInteger(source.instanceId, `${name}.instanceId`)
        const owner = parseParticleOwner(source.owner, name)
        if (owner.kind === 'intro-preview' && !introSlots.has(owner.slot)) {
            throw new TypeError(`${name}.owner references missing intro preview ${owner.slot}`)
        }
        if (source.backend === 'v2') {
            return { instanceId, backend: 'v2' as const, owner, playback: parseParticlePlayerSnapshot(source.playback) }
        }
        if (source.backend === 'tod') {
            return { instanceId, backend: 'tod' as const, owner, playback: parseTodParticleSystemSnapshot(source.playback) }
        }
        throw new TypeError(`${name}.backend is invalid`)
    })
    unique(particles.map(particle => particle.instanceId), 'Adventure 1-1 particle instance ID')
    return particles.sort((left, right) => left.instanceId - right.instanceId)
}

function parseParticleOwner(value: unknown, particleName: string): Adventure11ParticleOwnerSnapshotV2 {
    const name = `${particleName}.owner`
    const tagged = taggedObject(value, name)
    if (tagged.kind === 'screen') {
        const source = exact(value, ['kind', 'slot', 'x', 'y', 'z'], name)
        const slots = new Set([
            'board', 'entity-layer', 'coin-layer', 'hud', 'seed-packet', 'award-layer', 'overlay-layer',
        ])
        if (typeof source.slot !== 'string' || !slots.has(source.slot)) throw new TypeError(`${name}.slot is invalid`)
        return {
            kind: 'screen',
            slot: source.slot as Extract<Adventure11ParticleOwnerSnapshotV2, { kind: 'screen' }>['slot'],
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
            slot: source.slot as Extract<Adventure11ParticleOwnerSnapshotV2, { kind: 'entity' }>['slot'],
            x: coordinate(source.x, `${name}.x`),
            y: coordinate(source.y, `${name}.y`),
            z: coordinate(source.z, `${name}.z`),
        }
    }
    if (tagged.kind === 'intro-preview') {
        const source = exact(value, ['kind', 'slot', 'x', 'y', 'z'], name)
        return {
            kind: 'intro-preview',
            slot: integerInRange(source.slot, 0, 4, `${name}.slot`),
            x: coordinate(source.x, `${name}.x`),
            y: coordinate(source.y, `${name}.y`),
            z: coordinate(source.z, `${name}.z`),
        }
    }
    throw new TypeError(`${name}.kind is invalid`)
}

function parseExtensions(value: unknown): Record<string, JsonValue> {
    const source = plainObject(value, 'Adventure 1-1 extensions')
    const result: Record<string, JsonValue> = {}
    for (const [id, extension] of Object.entries(source)) {
        if (!isQualifiedId(id)) throw new TypeError(`Adventure 1-1 extension ID is invalid: ${id}`)
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

function exact(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
    const source = plainObject(value, name)
    const allowed = new Set(keys)
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
