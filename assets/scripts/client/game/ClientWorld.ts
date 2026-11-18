import type {
    ProjectileSnapshot,
    EntityId,
    ItemSnapshot,
    ServerFramePacket,
    SessionStartedPacket,
    WorldSnapshot,
} from '@/shared/protocol/index'

export interface ClientWorldChanges {
    added: EntityId[]
    removed: EntityId[]
}

type SnapshotInput = SessionStartedPacket | ServerFramePacket | WorldSnapshot
type Positioned = { entityId: EntityId, x: number, y: number }

export class ClientWorld {
    private previousValue?: WorldSnapshot
    private currentValue?: WorldSnapshot
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
        return { added: [...entityIds(current)].sort((a, b) => a - b), removed: [] }
    }

    accept(input: SnapshotInput): ClientWorldChanges {
        const snapshot = 'snapshot' in input ? input.snapshot : input
        if (this.currentValue && snapshot.tick <= this.currentValue.tick) {
            throw new Error(`Cannot accept snapshot tick ${snapshot.tick}; current tick is ${this.currentValue.tick}`)
        }

        const before = this.currentValue ? entityIds(this.currentValue) : new Set<EntityId>()
        const after = entityIds(snapshot)
        // Input-only frames keep the same simulation positions and interpolation history.
        if (snapshot.gameplayTick !== this.currentValue?.gameplayTick || snapshot.paused !== this.currentValue?.paused) {
            this.previousValue = this.currentValue
        }
        this.currentValue = snapshot
        return {
            added: [...after].filter(id => !before.has(id)).sort((a, b) => a - b),
            removed: [...before].filter(id => !after.has(id)).sort((a, b) => a - b),
        }
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
            plants: interpolate(current.plants, previous?.plants, t),
            // Coming down from the air (a pole vaulter's landing) changes the animation's origin; its pose and position
            // must switch together.
            zombies: interpolate(current.zombies, previous?.zombies, t,
                (before, after) => before.state !== 'airborne' || after.state === 'airborne'),
            projectiles: interpolateProjectiles(current.projectiles, previous?.projectiles, t),
            // A mower set off runs as a projectile (one waiting stays put).
            mowers: interpolateProjectiles(current.mowers, previous?.mowers, t),
            items: interpolateItems(current.items, previous?.items, t),
        }
        this.rendered = { current, previous, t, frame }
        return frame
    }
}

/** A projectile's height goes with its position: what lies on the ground under it stays there as it rises and falls. */
function interpolateProjectiles<T extends ProjectileSnapshot>(current: T[], previous: T[] | undefined, alpha: number): T[] {
    const previousById = byId(previous)
    return interpolate(current, previous, alpha).map(projectile => {
        const before = previousById.get(projectile.entityId), from = before?.height ?? 0, to = projectile.height ?? 0
        return before && from !== to ? { ...projectile, height: from + (to - from) * alpha } : projectile
    })
}

function interpolateItems(current: ItemSnapshot[], previous: ItemSnapshot[] | undefined, alpha: number): ItemSnapshot[] {
    const positions = interpolate(current, previous, alpha)
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
    return new Set([
        ...snapshot.plants,
        ...snapshot.zombies,
        ...snapshot.projectiles,
        ...snapshot.mowers,
        ...snapshot.items,
        ...snapshot.gridItems ?? [],
    ].map(entity => entity.entityId))
}

/** By entity, for a frame's list: the previous frame stays the same for every display frame until the next tick. */
const indexes = new WeakMap<readonly Positioned[], Map<EntityId, Positioned>>()
function byId<T extends Positioned>(entities: readonly T[] | undefined): Map<EntityId, T> {
    if (!entities) return new Map()
    let index = indexes.get(entities)
    if (!index) indexes.set(entities, index = new Map(entities.map(entity => [entity.entityId, entity])))
    return index as Map<EntityId, T>
}

function interpolate<T extends Positioned>(
    current: T[],
    previous: T[] | undefined,
    alpha: number,
    canInterpolate?: (before: T, after: T) => boolean,
): T[] {
    const previousById = byId(previous)
    // Every display frame: one that stood still (most plants) is the snapshot's own; only one that moved is copied.
    return current.map(entity => {
        const before = previousById.get(entity.entityId)
        if (!before || before.x === entity.x && before.y === entity.y || canInterpolate && !canInterpolate(before, entity)) return entity
        return { ...entity, x: before.x + (entity.x - before.x) * alpha, y: before.y + (entity.y - before.y) * alpha }
    })
}
