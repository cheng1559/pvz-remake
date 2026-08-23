import type {
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
        this.previousValue = this.currentValue
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
        const t = Math.max(0, Math.min(1, alpha))
        return {
            ...current,
            plants: interpolate(current.plants, previous?.plants, t),
            zombies: interpolate(current.zombies, previous?.zombies, t),
            projectiles: interpolate(current.projectiles, previous?.projectiles, t),
            items: interpolateItems(current.items, previous?.items, t),
            lawnMowers: interpolate(current.lawnMowers, previous?.lawnMowers, t),
        }
    }
}

function interpolateItems(current: ItemSnapshot[], previous: ItemSnapshot[] | undefined, alpha: number): ItemSnapshot[] {
    const positions = interpolate(current, previous, alpha)
    const previousById = new Map(previous?.map(item => [item.entityId, item]))
    return positions.map(item => {
        const before = previousById.get(item.entityId)
        return before ? {
            ...item,
            scale: before.scale + (item.scale - before.scale) * alpha,
            alpha: Math.round(before.alpha + (item.alpha - before.alpha) * alpha),
        } : item
    })
}

function entityIds(snapshot: WorldSnapshot): Set<EntityId> {
    return new Set([
        ...snapshot.plants,
        ...snapshot.zombies,
        ...snapshot.projectiles,
        ...snapshot.items,
        ...snapshot.lawnMowers,
    ].map(entity => entity.entityId))
}

function interpolate<T extends Positioned>(
    current: T[],
    previous: T[] | undefined,
    alpha: number,
): T[] {
    const previousById = new Map(previous?.map(entity => [entity.entityId, entity]))
    return current.map(entity => {
        const before = previousById.get(entity.entityId)
        return before ? {
            ...entity,
            x: before.x + (entity.x - before.x) * alpha,
            y: before.y + (entity.y - before.y) * alpha,
        } : { ...entity }
    })
}
