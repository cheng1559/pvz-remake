import { record, array, nonEmptyString, boolean, oneOf, finite, nonNegativeInteger } from '@/shared/validate'
import { ZOMBIE_STATES, type ZombieState } from '@/shared/content/zombieStates'
import { PLANT_ABILITY_STATES, type PlantAbilityState } from '@/shared/content/plantAbilities'
import { GRAVE, checkGraveRanges } from '@/shared/content/graves'
import type { JsonObject, JsonValue } from '@/shared/protocol/json'
import type { ServerTick } from '@/shared/protocol/packets'

/** What the server shows the client each frame (WorldSnapshot) and the events with it, and how a client checks them. */

export interface EntityBehaviorState { behaviorState?: JsonObject }

export type EntityId = number

export type EventId = number

export interface ServerEvent {
    eventId: EventId
    type: string
    data: JsonObject
}

export interface GraveSnapshot {
    entityId: EntityId
    typeId: typeof GRAVE
    column: number
    row: number
    variant: number
    riseDelay: number
    offsetX: number
    offsetY: number
    /** Board::PickSpecialGraveStone: one grave of a level draws the first stone row (GRIDITEM_STATE_GRAVESTONE_SPECIAL). */
    special?: true
    /** A grave added during play (/grave) rises from this gameplay tick; the level's own graves rise in the intro. */
    riseAtTick?: number
    /** A grave put down on the plants' side (a grave seed's packet of that side): its zombies rise on that side too. */
    team?: 'plants'
}

/**
 * What stands in a cell without being a plant or a zombie (the original's GridItem): an entity of its type in its cell,
 * with what else its type has. A grave; craters are to come.
 */
export type GridItemSnapshot = GraveSnapshot

/** The server's fixed step: one tick of the original's 10 ms Board::Update. Ticks in saves and snapshots count these. */
export const TICK_SECONDS = 0.01

/**
 * The level stands still: paused, or choosing its seeds again (`/repick`). Nothing on the lawn moves or takes the
 * pointer meanwhile, whichever it is. The two differ only in what else stops: a pause stops a seed chooser too and ends
 * with the player's resume, while a repick's chooser goes on and ends with its Let's Rock.
 */
export function levelStandsStill(snapshot: Pick<WorldSnapshot, 'paused' | 'seedChooser'>): boolean {
    return snapshot.paused || snapshot.seedChooser?.repick === true
}

export interface WorldSnapshot {
    levelId: string
    tick: ServerTick
    gameplayTick: number
    phase: 'intro' | 'gameplay'
    result: 'playing' | 'won' | 'lost'
    paused: boolean
    sun: number
    money: number
    wave: WaveSnapshot
    cursor: CursorSnapshot
    /** The bank's slots in order; `null` is an empty slot. */
    seedPackets: Array<SeedPacketSnapshot | null>
    /**
     * `availableSeeds` fill the catalog grid; `entries` are the cards Mods offer beyond it (seedChooser.entries).
     * `warnings` are shown one after another on confirm; each can be dismissed to repick. `repick`: chosen again in play
     * (`/repick`), the level standing still, for the bank's own size.
     */
    /** `cheatSeeds`: `/cheatseed` stands on, so the chooser turns its pages and Let's Rock takes any cards chosen. */
    seedChooser?: { availableSeeds: string[], entries?: ChooserEntry[], slots: number, choosing: boolean, warnings?: string[], repick?: true, cheatSeeds?: true }
    /** `team`: the side it puts down on, when not its seed's own (`/seed`). */
    conveyorPackets: Array<{ id: number; seedId: string; x: number; team?: Team; selected: boolean; availability: SeedAvailability }>
    gridItems?: GridItemSnapshot[]
    plants: PlantSnapshot[]
    zombies: ZombieSnapshot[]
    projectiles: ProjectileSnapshot[]
    items: ItemSnapshot[]
    /** The rows whose mower still waits at the house end; one set off is a mowing projectile. */
    mowerRows: number[]
    tutorial: TutorialSnapshot
    extensions: Record<string, JsonValue>
}

export type CursorSnapshot =
    | { mode: 'none' }
    | { mode: 'tool', toolId: string }
    /** `team`: the held packet puts down this side's plant or zombie, which faces the other way from its seed's own. */
    | { mode: 'seed', seedId: string, team?: Team }

export interface SeedAvailability {
    reason?: 'seed-not-available' | 'seed-not-ready' | 'not-enough-sun'
    warningKey?: string
}

/** A card a chooser offers: a seed, on `team` when not its seed's own (it then faces the other way). */
export interface ChooserEntry {
    seedId: string
    team?: Team
}

/** One string per card: the same seed on the two sides is two cards. */
export const chooserEntryKey = (entry: ChooserEntry): string => `${entry.seedId}|${entry.team ?? ''}`

export interface SeedPacketSnapshot {
    seedId: string
    /** The side of what the packet puts down, when not its seed's own: it faces the other way. */
    team?: Team
    ready: boolean
    selected: boolean
    cooldownRemaining: number
    cooldownTotal: number
    availability: SeedAvailability
}

export interface PlantSnapshot extends EntityBehaviorState {
    entityId: EntityId
    typeId: string
    seedId: string
    x: number
    y: number
    row: number
    column: number
    health: number
    maxHealth: number
    /** Fuse, mine or chomper progress; drives the plant animation. */
    ability?: { state: PlantAbilityState, ticks: number, prey?: 'plant' }
    /** A nocturnal plant on a day board. */
    asleep?: true
    /** A producer's ticks until its next sun (Plant::mLaunchCounter); held while production is paused. */
    produceTicks?: number
    /** On the zombies' side: the plant faces left. */
    team?: Team
    /** Ticks left slowed by a hostile snow pea: the plant draws blue and animates at half speed. */
    chilledTicks?: number
    /** What each layer of the plant's animation plays, for a plant the server animates (PlantDefinition.animation). */
    animations?: Record<string, LayerSnapshot>
    /** A mower crushed it: no plant any more, it is squashed, `ticks` into it; `left` when the mower ran left. */
    mowered?: { ticks: number, left?: true }
}

/**
 * What a layer of an animation plays (a plant's or a zombie's `animation`): the clip, how far into it in frames, and
 * its frames a second. A loop's time counts on past its length, for a view to wrap by its own clip's.
 */
export interface LayerSnapshot {
    clip: string, time: number, rate: number
    /** There and going on, but not shown now (the potato mine's light between its flashes). */
    hidden?: true
}

/**
 * The two sides (docs/TEAMS.zh-CN.md): the player's `plants` and the `zombies`. Sides attack each other; a zombie on the
 * plants' side (the original's mind control) walks right.
 */
export type Team = 'plants' | 'zombies'

export const TEAMS: readonly Team[] = ['plants', 'zombies']

export interface ZombieSnapshot extends EntityBehaviorState {
    entityId: EntityId
    typeId: string
    state: ZombieState
    x: number
    y: number
    row: number
    health: number
    maxHealth: number
    /** What its body plays (ZombieDefinition.animation): its one layer, `body`. */
    animations: Record<string, LayerSnapshot>
    alpha: number
    hasHead: boolean
    hasTongue: boolean
    hasArm: boolean
    /** Remaining helm health; 0 without one or once it drops. */
    helmHealth: number
    /** Remaining shield health; 0 without one or once it drops. */
    shieldHealth: number
    chilled?: boolean
    /** A pole vaulter still carrying the pole. */
    hasPole?: boolean
    enraged?: boolean
    riseTicks?: number
    /** Only on the plants' side: it walks right, facing right. */
    team?: 'plants'
}

export interface ProjectileSnapshot {
    entityId: EntityId
    typeId: string
    x: number
    y: number
    row: number
    /** Fired by a plant on the zombies' side: it flies left. */
    team?: 'zombies'
    /** How far above the ground it flies, when it does: what it draws on the ground lies as far under it. */
    height?: number
    /** How far up it has been thrown from where it set off, when it is above there: its shadow shrinks the higher. */
    lift?: number
    /** The way it points, when its motion turns it: the angle of its flight from straight right, clockwise on screen. */
    facing?: number
}

export interface ItemSnapshot {
    entityId: EntityId
    typeId: string
    state: 'available' | 'collecting' | 'fading'
    x: number
    y: number
    scale: number
    alpha: number
    /** On the ground at least once: silver and gold coins switch from the flat dollar to the spinning coin. */
    landed?: true
    /** Shows the bouncy pickup arrow once landed (2-1's first coin). */
    arrow?: true
}

export interface WaveSnapshot {
    index: number
    total: number
    /** Indexes (from 0) of the flag waves. */
    flagWaves: number[]
    countdown: number
    previewZombies?: Record<string, number>
}

export interface TutorialSnapshot {
    id: string
    step: string
    /** The level's script brings Crazy Dave for the intro. */
    dave?: true
    /** The level's script shows the shovel during the intro. */
    toolsInIntro?: true
}

export const validateWorldSnapshot = (value: unknown): Record<string, JsonValue> => {
    const snapshot = record(value, 'snapshot')
    nonEmptyString(snapshot.levelId, 'snapshot.levelId')
    nonNegativeInteger(snapshot.tick, 'snapshot.tick')
    nonNegativeInteger(snapshot.gameplayTick, 'snapshot.gameplayTick')
    if ((snapshot.gameplayTick as number) > (snapshot.tick as number)) {
        throw new TypeError('snapshot.gameplayTick must not exceed tick')
    }
    if (snapshot.phase !== 'intro' && snapshot.phase !== 'gameplay') {
        throw new TypeError('snapshot.phase is unknown')
    }
    if (snapshot.result !== 'playing' && snapshot.result !== 'won' && snapshot.result !== 'lost') {
        throw new TypeError('snapshot.result is unknown')
    }
    boolean(snapshot.paused, 'snapshot.paused')
    nonNegativeInteger(snapshot.sun, 'snapshot.sun')
    nonNegativeInteger(snapshot.money, 'snapshot.money')
    const wave = record(snapshot.wave, 'snapshot.wave')
    nonNegativeInteger(wave.index, 'snapshot.wave.index')
    nonNegativeInteger(wave.total, 'snapshot.wave.total')
    array(wave.flagWaves, 'snapshot.wave.flagWaves').forEach(index => {
        if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= (wave.total as number)) throw new TypeError('snapshot.wave.flagWaves holds a wave outside the level')
    })
    nonNegativeInteger(wave.countdown, 'snapshot.wave.countdown')
    if (wave.previewZombies !== undefined) for (const count of Object.values(record(wave.previewZombies, 'snapshot.wave.previewZombies'))) {
        nonNegativeInteger(count, 'snapshot.wave.previewZombies count')
    }
    if ((wave.index as number) > (wave.total as number)) {
        throw new TypeError('snapshot.wave.index must not exceed total')
    }
    const tutorial = record(snapshot.tutorial, 'snapshot.tutorial')
    nonEmptyString(tutorial.id, 'snapshot.tutorial.id')
    nonEmptyString(tutorial.step, 'snapshot.tutorial.step')
    for (const key of ['dave', 'toolsInIntro']) if (tutorial[key] !== undefined && tutorial[key] !== true) throw new TypeError(`snapshot.tutorial.${key} must be true`)
    record(snapshot.extensions, 'snapshot.extensions')
    const cursor = record(snapshot.cursor, 'snapshot.cursor')
    if (cursor.mode === 'seed') nonEmptyString(cursor.seedId, 'snapshot.cursor.seedId')
    else if (cursor.mode === 'tool') nonEmptyString(cursor.toolId, 'snapshot.cursor.toolId')
    else if (cursor.mode !== 'none') throw new TypeError('snapshot.cursor.mode is unknown')
    const seedPackets = array(snapshot.seedPackets, 'snapshot.seedPackets').flatMap((entry, index) => {
        if (entry === null) return []
        const name = `snapshot.seedPackets[${index}]`
        const packet = record(entry, name)
        nonEmptyString(packet.seedId, `${name}.seedId`)
        boolean(packet.ready, `${name}.ready`)
        boolean(packet.selected, `${name}.selected`)
        validateSeedAvailability(packet.availability, name)
        nonNegativeInteger(packet.cooldownRemaining, `${name}.cooldownRemaining`)
        nonNegativeInteger(packet.cooldownTotal, `${name}.cooldownTotal`)
        if ((packet.cooldownRemaining as number) > (packet.cooldownTotal as number)) {
            throw new TypeError(`${name}.cooldownRemaining must not exceed cooldownTotal`)
        }
        const shouldBeReady = packet.cooldownRemaining === 0 && packet.selected === false
        if (packet.ready !== shouldBeReady) throw new TypeError(`${name}.ready is inconsistent`)
        return [packet]
    })
    const conveyorPackets = array(snapshot.conveyorPackets, 'snapshot.conveyorPackets').map(value => record(value, 'conveyor packet'))
    const selectedPackets = [...seedPackets, ...conveyorPackets].filter(packet => packet.selected === true)
    if (selectedPackets.length > 1) throw new TypeError('snapshot.seedPackets has multiple selected packets')
    if (cursor.mode === 'seed' && selectedPackets[0]?.seedId !== cursor.seedId) {
        throw new TypeError('snapshot.cursor does not match the selected seed packet')
    }
    if (cursor.mode !== 'seed' && selectedPackets.length !== 0) {
        throw new TypeError('snapshot.cursor does not match the selected seed packet')
    }
    if (snapshot.seedChooser !== undefined) {
        const chooser = record(snapshot.seedChooser, 'snapshot.seedChooser')
        const available = array(chooser.availableSeeds, 'snapshot.seedChooser.availableSeeds')
        available.forEach((id, index) => nonEmptyString(id, `snapshot.seedChooser.availableSeeds[${index}]`))
        const entries = chooser.entries === undefined ? [] : array(chooser.entries, 'snapshot.seedChooser.entries')
        entries.forEach((value, index) => {
            const name = `snapshot.seedChooser.entries[${index}]`, entry = record(value, name)
            nonEmptyString(entry.seedId, `${name}.seedId`)
            if (entry.team !== undefined) oneOf(entry.team, TEAMS, `${name}.team`)
        })
        nonNegativeInteger(chooser.slots, 'snapshot.seedChooser.slots')
        const slots = chooser.slots as number
        boolean(chooser.choosing, 'snapshot.seedChooser.choosing')
        // An open bank may hold a card no longer offered (a saved hidden card whose Mod is gone); it can still go back.
        // A repick keeps the bank's size, which a level's fixed bank may make larger than what the chooser offers.
        if (chooser.repick !== undefined && chooser.repick !== true) throw new TypeError('snapshot.seedChooser.repick must be true')
        if (slots < 1 || slots > 10 || slots > available.length + entries.length && chooser.repick === undefined || new Set(available).size !== available.length ||
            seedPackets.length > slots) throw new TypeError('Invalid seed chooser bank')
        if (chooser.warnings !== undefined) array(chooser.warnings, 'snapshot.seedChooser.warnings').forEach(value => nonEmptyString(value, 'snapshot.seedChooser.warnings[]'))
    }
    if (snapshot.gridItems !== undefined) array(snapshot.gridItems, 'snapshot.gridItems').forEach((value, index) => {
        const name = `snapshot.gridItems[${index}]`, grave = record(value, name)
        nonNegativeInteger(grave.entityId, `${name}.entityId`)
        if (grave.typeId !== GRAVE) throw new TypeError(`${name}.typeId is not a grid item's`)
        for (const key of ['column', 'row', 'variant', 'riseDelay']) nonNegativeInteger(grave[key], `${name}.${key}`)
        checkGraveRanges(grave as unknown as GraveSnapshot, name)
        finite(grave.offsetX, `${name}.offsetX`); finite(grave.offsetY, `${name}.offsetY`)
        if (grave.special !== undefined && grave.special !== true) throw new TypeError(`${name}.special must be true`)
        if (grave.riseAtTick !== undefined) nonNegativeInteger(grave.riseAtTick, `${name}.riseAtTick`)
        if (grave.team !== undefined && grave.team !== 'plants') throw new TypeError(`${name}.team must be plants`)
    })
    array(snapshot.plants, 'snapshot.plants').forEach((entry, index) => {
        const name = `snapshot.plants[${index}]`
        const plant = record(entry, name)
        nonNegativeInteger(plant.entityId, `${name}.entityId`)
        nonEmptyString(plant.typeId, `${name}.typeId`)
        nonEmptyString(plant.seedId, `${name}.seedId`)
        finite(plant.x, `${name}.x`)
        finite(plant.y, `${name}.y`)
        nonNegativeInteger(plant.row, `${name}.row`)
        nonNegativeInteger(plant.column, `${name}.column`)
        nonNegativeInteger(plant.health, `${name}.health`)
        nonNegativeInteger(plant.maxHealth, `${name}.maxHealth`)
        if ((plant.maxHealth as number) === 0 || (plant.health as number) > (plant.maxHealth as number)) {
            throw new TypeError(`${name}.health must not exceed a positive maxHealth`)
        }
        if (plant.asleep !== undefined && plant.asleep !== true) throw new TypeError(`${name}.asleep must be true when present`)
        if (plant.produceTicks !== undefined) nonNegativeInteger(plant.produceTicks, `${name}.produceTicks`)
        if (plant.behaviorState !== undefined) record(plant.behaviorState, `${name}.behaviorState`)
        if (plant.ability !== undefined) {
            const ability = record(plant.ability, `${name}.ability`)
            if (!PLANT_ABILITY_STATES.includes(ability.state as PlantAbilityState)) throw new TypeError(`${name}.ability.state is unknown`)
            nonNegativeInteger(ability.ticks, `${name}.ability.ticks`)
        }
        if (plant.animations !== undefined) validateLayers(plant.animations, `${name}.animations`)
        if (plant.mowered !== undefined) {
            const mowered = record(plant.mowered, `${name}.mowered`)
            nonNegativeInteger(mowered.ticks, `${name}.mowered.ticks`)
            if (mowered.left !== undefined && mowered.left !== true) throw new TypeError(`${name}.mowered.left must be true`)
        }
    })
    array(snapshot.zombies, 'snapshot.zombies').forEach((entry, index) => {
        const name = `snapshot.zombies[${index}]`
        const zombie = validateLivingEntity(entry, name)
        if (zombie.behaviorState !== undefined) record(zombie.behaviorState, `${name}.behaviorState`)
        if (!ZOMBIE_STATES.includes(zombie.state as ZombieState)) throw new TypeError(`${name}.state is unknown`)
        validateLayers(zombie.animations, `${name}.animations`)
        nonNegativeInteger(zombie.alpha, `${name}.alpha`)
        if ((zombie.alpha as number) < 0 || (zombie.alpha as number) > 255) {
            throw new TypeError(`${name}.alpha must be between 0 and 255`)
        }
        boolean(zombie.hasHead, `${name}.hasHead`)
        boolean(zombie.hasTongue, `${name}.hasTongue`)
        boolean(zombie.hasArm, `${name}.hasArm`)
        for (const key of ['helmHealth', 'shieldHealth'] as const) {
            nonNegativeInteger(zombie[key], `${name}.${key}`)
            if ((zombie[key] as number) < 0) throw new TypeError(`${name}.${key} must be non-negative`)
        }
        if (zombie.chilled !== undefined) boolean(zombie.chilled, `${name}.chilled`)
        if (zombie.enraged !== undefined) boolean(zombie.enraged, `${name}.enraged`)
        if (zombie.riseTicks !== undefined) nonNegativeInteger(zombie.riseTicks, `${name}.riseTicks`)
        if (zombie.hasPole !== undefined) boolean(zombie.hasPole, `${name}.hasPole`)
    })
    array(snapshot.projectiles, 'snapshot.projectiles').forEach((entry, index) => {
        const name = `snapshot.projectiles[${index}]`
        const projectile = record(entry, name)
        nonNegativeInteger(projectile.entityId, `${name}.entityId`)
        nonEmptyString(projectile.typeId, `${name}.typeId`)
        finite(projectile.x, `${name}.x`)
        finite(projectile.y, `${name}.y`)
        nonNegativeInteger(projectile.row, `${name}.row`)
        if (projectile.height !== undefined) finite(projectile.height, `${name}.height`)
        if (projectile.lift !== undefined) finite(projectile.lift, `${name}.lift`)
        if (projectile.facing !== undefined) finite(projectile.facing, `${name}.facing`)
    })
    array(snapshot.conveyorPackets, 'snapshot.conveyorPackets').forEach((entry, index) => {
        const name = `snapshot.conveyorPackets[${index}]`, packet = record(entry, name)
        nonNegativeInteger(packet.id, `${name}.id`); nonEmptyString(packet.seedId, `${name}.seedId`)
        finite(packet.x, `${name}.x`); boolean(packet.selected, `${name}.selected`)
        if (packet.team !== undefined) oneOf(packet.team, TEAMS, `${name}.team`)
        validateSeedAvailability(packet.availability, name)
    })
    array(snapshot.items, 'snapshot.items').forEach((entry, index) => {
        const name = `snapshot.items[${index}]`
        const item = record(entry, name)
        nonNegativeInteger(item.entityId, `${name}.entityId`)
        nonEmptyString(item.typeId, `${name}.typeId`)
        if (item.state !== 'available' && item.state !== 'collecting' && item.state !== 'fading') {
            throw new TypeError(`${name}.state is unknown`)
        }
        finite(item.x, `${name}.x`)
        finite(item.y, `${name}.y`)
        finite(item.scale, `${name}.scale`)
        if (item.landed !== undefined && item.landed !== true) throw new TypeError(`${name}.landed must be true`)
        if (item.arrow !== undefined && item.arrow !== true) throw new TypeError(`${name}.arrow must be true`)
        if ((item.scale as number) < 0) throw new TypeError(`${name}.scale must not be negative`)
        nonNegativeInteger(item.alpha, `${name}.alpha`)
        if ((item.alpha as number) > 255) throw new TypeError(`${name}.alpha must not exceed 255`)
    })
    array(snapshot.mowerRows, 'snapshot.mowerRows').forEach(row => nonNegativeInteger(row, 'snapshot.mowerRows[]'))
    return snapshot as Record<string, JsonValue>
}

const validateLivingEntity = (value: unknown, name: string): Record<string, JsonValue> => {
    const entity = record(value, name)
    nonNegativeInteger(entity.entityId, `${name}.entityId`)
    nonEmptyString(entity.typeId, `${name}.typeId`)
    finite(entity.x, `${name}.x`)
    finite(entity.y, `${name}.y`)
    nonNegativeInteger(entity.row, `${name}.row`)
    nonNegativeInteger(entity.health, `${name}.health`)
    nonNegativeInteger(entity.maxHealth, `${name}.maxHealth`)
    if ((entity.maxHealth as number) === 0 || (entity.health as number) > (entity.maxHealth as number)) {
        throw new TypeError(`${name}.health must not exceed a positive maxHealth`)
    }
    return entity as Record<string, JsonValue>
}

export const validateServerEvent = (value: unknown, index: number): number => {
    const event = record(value, `frame.events[${index}]`)
    nonNegativeInteger(event.eventId, `frame.events[${index}].eventId`)
    if (event.eventId === 0) throw new TypeError(`frame.events[${index}].eventId must be positive`)
    nonEmptyString(event.type, `frame.events[${index}].type`)
    record(event.data, `frame.events[${index}].data`)
    return event.eventId as number
}

/** What the layers of an animation play (LayerSnapshot), by layer. */
function validateLayers(value: unknown, name: string): void {
    for (const [layer, entry] of Object.entries(record(value, name))) {
        const state = record(entry, `${name}.${layer}`)
        nonEmptyString(state.clip, `${name}.${layer}.clip`)
        finite(state.time, `${name}.${layer}.time`)
        finite(state.rate, `${name}.${layer}.rate`)
        if (state.hidden !== undefined && state.hidden !== true) throw new TypeError(`${name}.${layer}.hidden must be true`)
    }
}

function validateSeedAvailability(value: unknown, name: string): void {
    const state = record(value, name + '.availability')
    if (state.reason !== undefined && !['seed-not-available', 'seed-not-ready', 'not-enough-sun'].includes(String(state.reason))) throw new TypeError(name + '.availability.reason is invalid')
    if (state.warningKey !== undefined) nonEmptyString(state.warningKey, name + '.availability.warningKey')
}
