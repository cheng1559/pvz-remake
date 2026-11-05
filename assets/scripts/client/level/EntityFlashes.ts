import type { PlantSnapshot, ServerEvent } from '@/shared/protocol/index'

/**
 * A flash that fades one step per gameplay tick from `ticks` at gameplay tick `tick`, like Plant::mEatenFlashCountdown
 * and Zombie::mJustGotShotCounter. `through`: the hit reached the body behind a shield (DAMAGE_HITS_SHIELD_AND_BODY).
 */
export interface FlashSnapshot { tick: number; ticks: number; through?: true }

export interface ZombieFlash { flash: number; through: boolean }

/** Zombie::EatPlant and Zombie::TakeDamage start a 25-tick flash. */
const HIT_FLASH_TICKS = 25
/** Plant::UpdateProductionPlant glows over the last 100 ticks before producing. */
const PRODUCTION_FLASH_TICKS = 100

const value = (flash: FlashSnapshot | undefined, tick: number) => flash ? Math.max(0, flash.ticks - (tick - flash.tick)) : 0

/** Plant and zombie flashes, from the server's events and the producers' countdowns. */
export class EntityFlashes {
    private readonly flashes = new Map<number, FlashSnapshot>()
    /** A producer's countdown when last seen; one that stopped running only fades, as UpdateProductionPlant skips it. */
    private readonly countdowns = new Map<number, { tick: number; produceTicks: number; held: boolean }>()

    /** The frame's events, at its gameplay tick. */
    applyEvents(events: readonly ServerEvent[], tick: number): void {
        for (const { type, data } of events) {
            // A hostile plant's hit flashes like a bite (Projectile::DoImpact for the zombie pea).
            if ((type === 'zombieChewedPlant' || type === 'plantHit') && typeof data.plantId === 'number') this.raise(data.plantId, { tick, ticks: HIT_FLASH_TICKS })
            else if ((type === 'sunProduced' || type === 'sunDrained') && typeof data.entityId === 'number') this.raise(data.entityId, { tick, ticks: PRODUCTION_FLASH_TICKS })
            else if (type === 'zombieHit' && typeof data.entityId === 'number') {
                // An exact shield break ends the shield's flash, but a body flash from an earlier hit through it runs on
                // (TakeShieldDamage keeps mJustGotShotCounter).
                if (data.flash === false) {
                    if (!this.flashes.get(data.entityId)?.through) this.flashes.set(data.entityId, { tick, ticks: 0 })
                } else this.flashes.set(data.entityId, { tick, ticks: HIT_FLASH_TICKS, ...(data.through === true ? { through: true } : {}) })
            } else if (type === 'zombieBurned' && typeof data.entityId === 'number') this.flashes.set(data.entityId, { tick, ticks: 0 })
        }
    }

    plant(plant: PlantSnapshot, tick: number): number {
        const id = plant.entityId, ticks = plant.produceTicks
        if (ticks === undefined) return value(this.flashes.get(id), tick)
        const last = this.countdowns.get(id)
        const glow = Math.max(0, PRODUCTION_FLASH_TICKS - ticks)
        let held = last?.held ?? false
        if (!last || tick > last.tick) {
            held = !!last && ticks === last.produceTicks
            // A held countdown (stopped production, a growing sun-shroom, the dropped award) leaves its glow to fade.
            if (held && !last!.held) this.raise(id, { tick: last!.tick, ticks: glow })
            this.countdowns.set(id, { tick, produceTicks: ticks, held })
        }
        return Math.max(value(this.flashes.get(id), tick), held ? 0 : glow)
    }

    zombie(entityId: number, tick: number): ZombieFlash {
        const flash = this.flashes.get(entityId)
        return { flash: value(flash, tick), through: flash?.through === true }
    }

    remove(entityId: number): void {
        this.flashes.delete(entityId)
        this.countdowns.delete(entityId)
    }

    snapshot(entityId: number): FlashSnapshot | undefined {
        const flash = this.flashes.get(entityId)
        return flash && { ...flash }
    }

    restore(entityId: number, flash: FlashSnapshot | undefined): void {
        this.countdowns.delete(entityId)
        if (flash) this.flashes.set(entityId, { ...flash })
        else this.flashes.delete(entityId)
    }

    private raise(entityId: number, flash: FlashSnapshot): void {
        const current = this.flashes.get(entityId)
        if (value(current, flash.tick) <= flash.ticks) this.flashes.set(entityId, flash)
    }
}
