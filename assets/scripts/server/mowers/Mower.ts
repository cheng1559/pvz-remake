import type { World } from '@/server/state/World'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import type { MowerSnapshot } from '@/shared/protocol'
import { nonEmptyString } from '@/shared/validate'
import { STRAIGHT } from '../projectiles/motions'
import type { MowingProjectile, MowTarget } from '../projectiles/MowingProjectile'
import { launchProjectile } from '../projectiles/Projectile'
import type { Position } from '../state/components'
import type { EntityId } from '@/server/state/World'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { WaveResource } from '../state/levelState'

/** What a row's mower is: the fields its save has. */
export interface MowerFields {
    /** The projectile it sets off as, which also draws it: the level's `lawnMower`, of a kind that mows. */
    typeId: string
}

export interface Mower extends MowerFields {
    /** Its entity, and where it waits (World.mowers). */
    id: EntityId
    position: Position
}

/**
 * A row's lawn mower (the original's LawnMower, MOWER_READY), an entity of the world's `mowers`: from the level's start it
 * waits at its row's house end (MOWER_READY_X) until a zombie reaches it, or the level is won and it turns into gold
 * (updateMowerCoins). Set off, it is gone from its row, running on as a mowing projectile (MowingProjectile).
 */
export class Mower {
    constructor(typeId: string) {
        this.typeId = typeId
    }

    /** Its fields from its save. */
    restore(saved: MowerFields, name: string): void {
        this.typeId = nonEmptyString(saved.typeId, `${name}.typeId`)
    }

    /**
     * LawnMower::StartMower: it sets off from where it waits as its projectile, and is gone from its row: the projectile
     * crushes the zombie that reached it (`trigger`) first; `/lawnmower trigger` sets one off with none
     * (Board::mWaveRowGotLawnMowered: its row's zombies are picked less for a while). The projectile, by its entity.
     */
    setOff(world: World, definitions: GameplayDefinitions, trigger?: MowTarget): number {
        const { position } = this
        if (world.resources.has(WaveResource)) {
            const wave = world.resources.get(WaveResource)
            const picks = wave.rowPicks?.find(state => state.row === position.row)
            if (picks) picks.mowedAtWave = wave.index
        }
        world.destroyEntity(this.id)
        const running = launchProjectile(world, definitions, world, { typeId: this.typeId, position, motion: STRAIGHT })
        emitServerEvent(world.resources.get(EventQueueResource), 'mowerActivated', { entityId: running, row: position.row })
        if (trigger) (world.projectiles.get(running) as MowingProjectile).mowTrigger(world, definitions, running, trigger)
        return running
    }

    /** What the client is shown of it: where it waits. */
    snapshot(): MowerSnapshot {
        return { entityId: this.id, typeId: this.typeId, ...this.position }
    }
}
