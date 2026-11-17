import type { World } from '@/server/state/World'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import type { MowerSnapshot } from '@/shared/protocol'
import { nonEmptyString } from '@/shared/validate'
import { STRAIGHT } from '../combat/motions'
import type { MowingProjectile, MowTarget } from '../combat/MowingProjectile'
import { launchProjectile } from '../combat/Projectile'
import { PositionComponent, ProjectileComponent } from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { WaveResource } from '../state/levelState'

/** What a row's mower is: the fields its save has. */
export interface MowerFields {
    /** The projectile it sets off as, which also draws it: the level's `lawnMower`, of a kind that mows. */
    typeId: string
}

export interface Mower extends MowerFields {}

/**
 * A row's lawn mower (the original's LawnMower, MOWER_READY), the mower component itself: from the level's start it
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
     * LawnMower::StartMower: it sets off from where it waits, `entity`, as its projectile, and is gone from its row: the
     * projectile crushes the zombie that reached it (`trigger`) first; `/lawnmower trigger` sets one off with none
     * (Board::mWaveRowGotLawnMowered: its row's zombies are picked less for a while). The projectile, by its entity.
     */
    setOff(world: World, definitions: GameplayDefinitions, entity: number, trigger?: MowTarget): number {
        const position = world.get(entity, PositionComponent)!
        if (world.resources.has(WaveResource)) {
            const wave = world.resources.get(WaveResource)
            const picks = wave.rowPicks?.find(state => state.row === position.row)
            if (picks) picks.mowedAtWave = wave.index
        }
        world.destroyEntity(entity)
        const running = launchProjectile(world, definitions, world, { typeId: this.typeId, position, motion: STRAIGHT })
        emitServerEvent(world.resources.get(EventQueueResource), 'mowerActivated', { entityId: running, row: position.row })
        if (trigger) (world.get(running, ProjectileComponent) as MowingProjectile).mowTrigger(world, definitions, running, trigger)
        return running
    }

    /** What the client is shown of it, `entity`: where it waits. */
    snapshot(world: World, entity: number): MowerSnapshot {
        return { entityId: entity, typeId: this.typeId, ...world.get(entity, PositionComponent)! }
    }
}
