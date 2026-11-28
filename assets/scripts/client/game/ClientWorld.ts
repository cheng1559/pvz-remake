import type {
    ProjectileSnapshot,
    EntityId,
    ItemSnapshot,
    MowerSnapshot,
    PlantSnapshot,
    ServerFramePacket,
    SessionStartedPacket,
    WorldSnapshot,
    ZombieSnapshot,
} from '@/shared/protocol/index'

/** The entities a frame brought and took away, as its lists have them (each kind's in slot order). */
export interface ClientWorldChanges {
    added: EntityId[]
    removed: EntityId[]
}

type SnapshotInput = SessionStartedPacket | ServerFramePacket | WorldSnapshot
type Positioned = { entityId: EntityId, x: number, y: number }

/**
 * An entity at another place: a copy, for the snapshot's own stays as it came. Each kind has a function of its own to
 * make it, though all read alike. A spread is quick while the place it is written at has met few shapes of object, and
 * one written once for every kind meets them all: V8 then copies a property at a time in its runtime, which took the
 * native builds ten times as long for every zombie every frame.
 */
type Moved<T> = (entity: T, x: number, y: number) => T
const movedPlant: Moved<PlantSnapshot> = (plant, x, y) => ({ ...plant, x, y })
const movedZombie: Moved<ZombieSnapshot> = (zombie, x, y) => ({ ...zombie, x, y })
const movedProjectile: Moved<ProjectileSnapshot> = (projectile, x, y) => ({ ...projectile, x, y })
const movedMower: Moved<MowerSnapshot> = (mower, x, y) => ({ ...mower, x, y })
const movedItem: Moved<ItemSnapshot> = (item, x, y) => ({ ...item, x, y })

export class ClientWorld {
    private previousValue?: WorldSnapshot
    private currentValue?: WorldSnapshot
    /** The current frame's entities (entityIds), once it has been accepted. */
    private currentIds?: Set<EntityId>
    /**
     * The last frame rendered: buttons ask for it over and over within one display frame (each one's canInteract on
     * every hover refresh), and interpolating every entity each time cost a fifth of a frame with a full lawn.
     */
    private rendered?: { current: WorldSnapshot, previous?: WorldSnapshot, t: number, frame: WorldSnapshot }

    get previous(): WorldSnapshot | undefined {
        return this.previousValue
    }

    get current(): WorldSnapshot | undefined {
        return this.currentValue
    }

    restore(previous: WorldSnapshot | null, current: WorldSnapshot): ClientWorldChanges {
        this.previousValue = previous ?? undefined
        this.currentValue = current
        this.currentIds = undefined
        return { added: [...entityIds(current)], removed: [] }
    }

    accept(input: SnapshotInput): ClientWorldChanges {
        const snapshot = 'snapshot' in input ? input.snapshot : input
        if (this.currentValue && snapshot.tick <= this.currentValue.tick) {
            throw new Error(`Cannot accept snapshot tick ${snapshot.tick}; current tick is ${this.currentValue.tick}`)
        }

        // The frame before was this one's `after`: its set is kept, not made again.
        const before = this.currentValue ? this.currentIds ?? entityIds(this.currentValue) : new Set<EntityId>()
        const after = this.currentIds = entityIds(snapshot)
        // Frames of the same gameplay tick (input, a pause) keep the same simulation positions and interpolation history.
        if (snapshot.gameplayTick !== this.currentValue?.gameplayTick) {
            this.previousValue = this.currentValue
        }
        this.currentValue = snapshot
        // Most frames nothing comes or goes: the lists are made of what did, in their lists' order.
        const added: EntityId[] = [], removed: EntityId[] = []
        for (const id of after) if (!before.has(id)) added.push(id)
        for (const id of before) if (!after.has(id)) removed.push(id)
        return { added, removed }
    }

    render(alpha: number): WorldSnapshot {
        if (!this.currentValue) throw new Error('ClientWorld has no snapshot')
        if (!Number.isFinite(alpha)) throw new Error('render alpha must be finite')

        const current = this.currentValue
        const previous = this.previousValue
        // Loss and a repick stand the simulation still, but the host's interpolation clock keeps cycling (through house
        // entry, or the choice): going on between the last two frames would twitch everything moving back each tick.
        const t = current.result === 'lost' || current.seedChooser?.repick ? 1 : Math.max(0, Math.min(1, alpha))
        const rendered = this.rendered
        if (rendered && rendered.current === current && rendered.previous === previous && rendered.t === t) return rendered.frame
        const frame: WorldSnapshot = {
            ...current,
            plants: interpolate(current.plants, previous?.plants, t, movedPlant),
            // Coming down from the air (a pole vaulter's landing) changes the animation's origin; its pose and position
            // must switch together.
            zombies: interpolate(current.zombies, previous?.zombies, t, movedZombie,
                (before, after) => before.state !== 'airborne' || after.state === 'airborne'),
            projectiles: interpolateProjectiles(current.projectiles, previous?.projectiles, t, movedProjectile),
            // A mower set off runs as a projectile (one waiting stays put).
            mowers: interpolateProjectiles(current.mowers, previous?.mowers, t, movedMower),
            items: interpolateItems(current.items, previous?.items, t),
        }
        this.rendered = { current, previous, t, frame }
        return frame
    }
}

/** A projectile's height goes with its position: what lies on the ground under it stays there as it rises and falls. */
function interpolateProjectiles<T extends ProjectileSnapshot>(current: T[], previous: T[] | undefined, alpha: number, moved: Moved<T>): T[] {
    const previousById = byId(previous)
    return interpolate(current, previous, alpha, moved).map(projectile => {
        const before = previousById.get(projectile.entityId), from = before?.height ?? 0, to = projectile.height ?? 0
        return before && from !== to ? { ...projectile, height: from + (to - from) * alpha } : projectile
    })
}

function interpolateItems(current: ItemSnapshot[], previous: ItemSnapshot[] | undefined, alpha: number): ItemSnapshot[] {
    const positions = interpolate(current, previous, alpha, movedItem)
    const previousById = byId(previous)
    return positions.map(item => {
        const before = previousById.get(item.entityId)
        return before ? {
            ...item,
            scale: before.scale + (item.scale - before.scale) * alpha,
            alpha: Math.round(before.alpha + (item.alpha - before.alpha) * alpha),
        } : item
    })
}

/** Every entity a frame shows, of every kind: what a client's views and its saved presentation are of. */
export function entityIds(snapshot: WorldSnapshot): Set<EntityId> {
    const ids = new Set<EntityId>()
    for (const list of [snapshot.plants, snapshot.zombies, snapshot.projectiles, snapshot.mowers, snapshot.items, snapshot.gridItems ?? []]) {
        for (const entity of list) ids.add(entity.entityId)
    }
    return ids
}

/** By entity, for a frame's list: the previous frame stays the same for every display frame until the next tick. */
const indexes = new WeakMap<readonly Positioned[], Map<EntityId, Positioned>>()
function byId<T extends Positioned>(entities: readonly T[] | undefined): Map<EntityId, T> {
    if (!entities) return new Map()
    let index = indexes.get(entities)
    if (!index) {
        indexes.set(entities, index = new Map())
        for (const entity of entities) index.set(entity.entityId, entity)
    }
    return index as Map<EntityId, T>
}

/** How far on from where the one before was found the next is looked for, before the list is looked up by entity. */
const GONE_BETWEEN = 4

function interpolate<T extends Positioned>(
    current: T[],
    previous: T[] | undefined,
    alpha: number,
    moved: Moved<T>,
    canInterpolate?: (before: T, after: T) => boolean,
): T[] {
    // Both frames list their entities in the same order, less those gone and plus those come between: each is mostly
    // found where the last one's follower is, or a few on, and the earlier frame is looked up by entity only for one
    // that is at neither.
    let at = 0, previousById: Map<EntityId, T> | undefined
    // Every display frame: one that stood still (most plants) is the snapshot's own; only one that moved is copied.
    return current.map(entity => {
        const id = entity.entityId
        let before: T | undefined
        if (previous) {
            const end = Math.min(previous.length, at + 1 + GONE_BETWEEN)
            for (let index = at; index < end; index++) {
                if (previous[index].entityId !== id) continue
                before = previous[index]
                at = index + 1
                break
            }
            before ??= (previousById ??= byId(previous)).get(id)
        }
        if (!before || before.x === entity.x && before.y === entity.y || canInterpolate && !canInterpolate(before, entity)) return entity
        return moved(entity, before.x + (entity.x - before.x) * alpha, before.y + (entity.y - before.y) * alpha)
    })
}
