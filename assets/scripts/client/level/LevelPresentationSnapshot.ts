import { record, exact, array, boolean, finiteInRange, nonNegativeInteger, positiveInteger, integerInRange } from '@/shared/validate'
import type { JsonObject } from '@/shared/protocol'
import {
    parseParticlePlayerSnapshot,
    type ParticlePlayerSnapshot,
} from '@/client/particle/ParticlePlayerSnapshot'
import {
    parseReanimPlaybackSnapshot,
    type ReanimPlaybackSnapshot,
} from '@/client/reanim/ReanimPlaybackSnapshot'
import {
    parseMusicPlaybackSnapshot,
    type MusicPlaybackSnapshot,
} from '@/client/music/MusicPlaybackSnapshot'
import { assertJsonValue, jsonRoundTrip, type JsonValue } from '@/shared/protocol/index'
import type { FlashSnapshot } from './EntityFlashes'
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
    typeId: string
    x: number
    y: number
    hasTongue: boolean
    /** What its view keeps (ZombieView.playbackSnapshot), read back by the view (restorePlayback). */
    view: JsonObject
}

export interface LevelIntroSnapshot {
    ticks: number
    /** The intro began with dialogue, so the house name stays hidden after Dave leaves. */
    hasOpeningDialog?: boolean
    previews: LevelIntroPreviewSnapshot[]
}

export interface LevelEndSnapshot {
    ticks: number
    finalWave: ReanimPlaybackSnapshot | null
}

export interface LevelAdviceSnapshot {
    lastStatusMessage: string
    lastSyncedTick: number
    widget: AdviceWidgetSnapshot | null
}

export interface LevelHudSnapshot {
    sunFlashTicks: number
    /** Board::mCoinBankFadeCount. */
    coinBankTicks: number
    progressWave: number
    progressCountdownStart: number
    progressMeterWidth: number
    progressTick: number
}

export interface LevelAudioSnapshot {
    music: MusicPlaybackSnapshot | null
    ownsMusic: boolean
    gameplayStarted: boolean
}

/**
 * What an entity's view keeps across a save (EntityView.snapshot): the entity's kind and ID, and `data` in the view's
 * own format, which the view reads back itself (EntityView.restore), with the helpers below.
 */
export interface LevelEntitySnapshot {
    kind: string
    entityId: number
    data: JsonObject
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
        /** `root`, or one of the entity's view's particle anchors. */
        slot: string
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

export interface LevelParticleSnapshot {
    instanceId: number
    owner: LevelParticleOwnerSnapshot
    playback: ParticlePlayerSnapshot
}

export interface LevelPresentationSnapshot {
    schemaVersion: 5
    flow: LevelFlowSnapshot
    intro: LevelIntroSnapshot
    end: LevelEndSnapshot
    advice: LevelAdviceSnapshot
    hud: LevelHudSnapshot
    audio: LevelAudioSnapshot
    entities: LevelEntitySnapshot[]
    /** The board's plant and zombie flashes (EntityFlashes), by entity. */
    flashes: FlashSnapshot[]
    particles: LevelParticleSnapshot[]
    extensions: Record<string, JsonValue>
}

export function parseLevelPresentationSnapshot(value: unknown): LevelPresentationSnapshot {
    assertJsonValue(value)
    const source = exact(value, [
        'schemaVersion', 'flow', 'intro', 'end', 'advice', 'hud',
        'audio', 'entities', 'flashes', 'particles', 'extensions',
    ], 'Level presentation')
    if (source.schemaVersion !== 5) throw new TypeError('Level presentation.schemaVersion must be 5')

    const flow = parseFlow(source.flow)
    const intro = parseIntro(source.intro)
    const end = parseEnd(source.end)
    const entities = parseEntities(source.entities)
    const particles = parseParticles(source.particles, intro)
    if (flow.introCompletionSent && intro.previews.length > 0) {
        throw new TypeError('Level presentation cannot send intro completion before the intro ends')
    }

    return {
        schemaVersion: 5,
        flow,
        intro,
        end,
        advice: parseAdvice(source.advice),
        hud: parseHud(source.hud),
        audio: parseAudio(source.audio),
        entities,
        flashes: parseFlashes(source.flashes),
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
    const source = exact(value, ['ticks', 'previews'], 'Level intro', ['hasOpeningDialog'])
    const previews = array(source.previews, 'Level intro.previews').map((value, index) => {
        const name = `Level intro.previews[${index}]`
        const preview = exact(value, ['slot', 'typeId', 'x', 'y', 'hasTongue', 'view'], name)
        if (!isQualifiedId(preview.typeId)) throw new TypeError(`${name}.typeId is invalid`)
        return {
            slot: nonNegativeInteger(preview.slot, `${name}.slot`),
            typeId: preview.typeId,
            x: coordinate(preview.x, `${name}.x`),
            y: coordinate(preview.y, `${name}.y`),
            hasTongue: boolean(preview.hasTongue, `${name}.hasTongue`),
            view: record(preview.view, `${name}.view`) as JsonObject,
        }
    })
    unique(previews.map(preview => preview.slot), 'Level intro preview slot')
    const ticks = finiteInRange(source.ticks, 0, MAX_COORDINATE, 'Level intro.ticks')
    return {
        ticks,
        ...(source.hasOpeningDialog === undefined ? {} : { hasOpeningDialog: boolean(source.hasOpeningDialog, 'Level intro.hasOpeningDialog') }),
        previews,
    }
}

function parseEnd(value: unknown): LevelEndSnapshot {
    const source = exact(value, ['ticks', 'finalWave'], 'Level end')
    return {
        ticks: finiteInRange(source.ticks, END_INACTIVE, END_COMPLETE, 'Level end.ticks'),
        finalWave: source.finalWave === null ? null : parseReanimPlaybackSnapshot(source.finalWave),
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
        'sunFlashTicks', 'coinBankTicks', 'progressWave',
        'progressCountdownStart', 'progressMeterWidth', 'progressTick',
    ], 'Level HUD')
    return {
        sunFlashTicks: integerInRange(source.sunFlashTicks, 0, 70, 'Level HUD.sunFlashTicks'),
        coinBankTicks: finiteInRange(source.coinBankTicks, 0, 1000, 'Level HUD.coinBankTicks'),
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
        'music', 'ownsMusic', 'gameplayStarted',
    ], 'Level audio')
    return {
        music: parseMusicPlaybackSnapshot(source.music),
        ownsMusic: boolean(source.ownsMusic, 'Level audio.ownsMusic'),
        gameplayStarted: boolean(source.gameplayStarted, 'Level audio.gameplayStarted'),
    }
}

function parseEntities(value: unknown): LevelEntitySnapshot[] {
    const entities = array(value, 'Level entities').map((value, index) => parseEntity(value, index))
    unique(entities.map(entity => entity.entityId), 'Level entity ID')
    return entities
}

function parseEntity(value: unknown, index: number): LevelEntitySnapshot {
    const name = `Level entities[${index}]`
    const source = exact(value, ['kind', 'entityId', 'data'], name)
    if (typeof source.kind !== 'string' || !source.kind) throw new TypeError(`${name}.kind is invalid`)
    return { kind: source.kind, entityId: positiveInteger(source.entityId, `${name}.entityId`), data: record(source.data, `${name}.data`) as JsonObject }
}

/** A view's save data, with exactly the `keys` (and any of `optional`), for the view to read. */
export function viewSaveData(snapshot: LevelEntitySnapshot, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
    return exact(snapshot.data, keys, `${snapshot.kind} ${snapshot.entityId} view data`, optional)
}

/** A Reanim player's place in its clip, or none. */
export function parseSavedPlayback(value: unknown): ReanimPlaybackSnapshot | null {
    return value === null ? null : parseReanimPlaybackSnapshot(value)
}

function parseFlashes(value: unknown): FlashSnapshot[] {
    const flashes = array(value, 'Level flashes').map((value, index) => parseFlash(value, `Level flashes[${index}]`))
    unique(flashes.map(flash => flash.entityId), 'Level flash entity ID')
    return flashes
}

function parseFlash(value: unknown, name: string): FlashSnapshot {
    const flash = exact(value, ['entityId', 'tick', 'ticks'], name, ['through', 'past'])
    for (const key of ['through', 'past']) if (flash[key] !== undefined && flash[key] !== true) throw new TypeError(`${name}.${key} must be true`)
    return {
        entityId: positiveInteger(flash.entityId, `${name}.entityId`),
        tick: nonNegativeInteger(flash.tick, `${name}.tick`),
        ticks: nonNegativeInteger(flash.ticks, `${name}.ticks`),
        ...(flash.through ? { through: true as const } : {}),
        ...(flash.past ? { past: true as const } : {}),
    }
}

function parseParticles(
    value: unknown,
    intro: LevelIntroSnapshot,
): LevelParticleSnapshot[] {
    const introSlots = new Set(intro.previews.map(preview => preview.slot))
    const particles = array(value, 'Level particles').map((value, index) => {
        const name = `Level particles[${index}]`
        const source = exact(value, ['instanceId', 'owner', 'playback'], name)
        const instanceId = positiveInteger(source.instanceId, `${name}.instanceId`)
        const owner = parseParticleOwner(source.owner, name)
        if (owner.kind === 'intro-preview' && !introSlots.has(owner.slot)) {
            throw new TypeError(`${name}.owner references missing intro preview ${owner.slot}`)
        }
        return { instanceId, owner, playback: parseParticlePlayerSnapshot(source.playback) }
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
        if (typeof source.slot !== 'string' || !source.slot) throw new TypeError(`${name}.slot is invalid`)
        return {
            kind: 'entity',
            entityId: positiveInteger(source.entityId, `${name}.entityId`),
            slot: source.slot,
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
    const source = record(value, 'Level extensions')
    const result: Record<string, JsonValue> = {}
    for (const [id, extension] of Object.entries(source)) {
        if (!isQualifiedId(id)) throw new TypeError(`Level extension ID is invalid: ${id}`)
        assertJsonValue(extension)
        result[id] = jsonRoundTrip(extension)
    }
    return result
}

function taggedObject(value: unknown, name: string): Record<string, unknown> & { kind: string } {
    const source = record(value, name)
    if (typeof source.kind !== 'string') throw new TypeError(`${name}.kind must be a string`)
    return source as Record<string, unknown> & { kind: string }
}

function unique(values: Array<string | number>, name: string): void {
    if (new Set(values).size !== values.length) throw new TypeError(`${name} must be unique`)
}

function coordinate(value: unknown, name: string): number {
    return finiteInRange(value, -MAX_COORDINATE, MAX_COORDINATE, name)
}
