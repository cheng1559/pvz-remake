import type { ServerEvent, WorldSnapshot } from '@/shared/protocol/index'

/**
 * A flash that fades one step per gameplay tick from `ticks` at gameplay tick `tick`, like Plant::mEatenFlashCountdown
 * and Zombie::mJustGotShotCounter.
 */
interface Flash { tick: number; ticks: number }

/** A zombie's shield's counters, each its own beside the body's: mShieldJustGotShotCounter and mShieldRecoilCounter. */
export type ZombieFlashPart = 'shield' | 'recoil'

/** An entity's flash, as the board keeps it across a save: a plant's or a zombie's body's, or `part` of its shield. */
export interface FlashSnapshot extends Flash { entityId: number; part?: ZombieFlashPart }

/** A zombie's counters in a frame: its body's highlight, its shield's and the shield's recoil. */
export interface ZombieFlash { body: number; shield: number; recoil: number }

/**
 * What a hit flashes of a zombie (the server's zombieHit), as Zombie::TakeDamage's parts set their counters: `body`
 * (TakeHelmDamage, TakeBodyDamage), `shield` (TakeShieldDamage) and `recoil` (TakeShieldDamage, but for a hit that
 * reaches the body as well). Each part runs on its own, so a hit on the shield leaves the body's flash as it is.
 */
export interface ZombieHitFlash { body?: boolean; shield?: boolean; recoil?: boolean }

/** Zombie::AnimateChewEffect and Zombie::TakeDamage start a 25-tick flash. */
const HIT_FLASH_TICKS = 25
/** Zombie::TakeShieldDamage: mShieldRecoilCounter = 12. */
const SHIELD_RECOIL_TICKS = 12
/** Plant::UpdateProductionPlant glows over the last 100 ticks before producing. */
const PRODUCTION_FLASH_TICKS = 100

const value = (flash: Flash | undefined, tick: number) => flash ? Math.max(0, flash.ticks - (tick - flash.tick)) : 0

/** A flash's handler of an event (a StageEvent): what it needs of the board is its flashes, at the frame's gameplay tick. */
export type FlashEvent = (stage: { readonly flashes: EntityFlashes }, event: ServerEvent, world: Pick<WorldSnapshot, 'gameplayTick'>) => void

/**
 * Plant and zombie flashes, the board's (LevelStage.flashes): raised by the server's events through the handlers below
 * (StageEventRegistry hears them before the frame's views draw it), and by the producers' countdowns. A Mod's handler
 * raises a flash for its own event by the same methods. The board keeps them across a save.
 */
export class EntityFlashes {
    /** Plants' flashes and zombies' bodies'. */
    private readonly flashes = new Map<number, Flash>()
    /** Zombies' shields' flashes and recoils. */
    private readonly parts: Record<ZombieFlashPart, Map<number, Flash>> = { shield: new Map(), recoil: new Map() }
    /** A producer's countdown when last seen; one that stopped running only fades, as UpdateProductionPlant skips it. */
    private readonly countdowns = new Map<number, { tick: number; produceTicks: number; held: boolean }>()

    /**
     * Plant::mEatenFlashCountdown of a plant bitten (Zombie::AnimateChewEffect) or hit by a hostile plant's shot
     * (Projectile::DoImpact for the zombie pea): 25 ticks, unless it already flashes longer.
     */
    hitPlant(plantId: number, tick: number): void {
        this.raise(plantId, { tick, ticks: HIT_FLASH_TICKS })
    }

    /** Plant::UpdateProductionPlant: a producer glows its full 100 ticks as it produces (or drains sun), fading from there. */
    glow(entityId: number, tick: number): void {
        this.raise(entityId, { tick, ticks: PRODUCTION_FLASH_TICKS })
    }

    /**
     * Zombie::TakeHelmDamage and TakeBodyDamage: mJustGotShotCounter = 25. Zombie::TakeShieldDamage:
     * mShieldJustGotShotCounter = 25, and mShieldRecoilCounter = 12. Each part a hit flashes starts again; the others
     * run on. A hit with no parts given flashes the body.
     */
    hitZombie(entityId: number, tick: number, hit: ZombieHitFlash = { body: true }): void {
        if (hit.body) this.flashes.set(entityId, { tick, ticks: HIT_FLASH_TICKS })
        if (hit.shield) this.parts.shield.set(entityId, { tick, ticks: HIT_FLASH_TICKS })
        if (hit.recoil) this.parts.recoil.set(entityId, { tick, ticks: SHIELD_RECOIL_TICKS })
    }

    /** Zombie::ApplyBurn: mJustGotShotCounter = 0. */
    burnZombie(entityId: number, tick: number): void {
        this.flashes.set(entityId, { tick, ticks: 0 })
    }

    /** A plant's flash (Plant::mEatenFlashCountdown): bitten, hit, or glowing as it produced. */
    plant(entityId: number, tick: number): number {
        return value(this.flashes.get(entityId), tick)
    }

    /**
     * A producer's (ProducerView): its flash, or the glow of its countdown to its next sun (`ticks`, its snapshot's
     * produceTicks), which brightens over the last 100 ticks, whichever is brighter.
     */
    producer(id: number, tick: number, ticks: number): number {
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
        return {
            body: value(this.flashes.get(entityId), tick),
            shield: value(this.parts.shield.get(entityId), tick),
            recoil: value(this.parts.recoil.get(entityId), tick),
        }
    }

    remove(entityId: number): void {
        this.flashes.delete(entityId)
        this.parts.shield.delete(entityId)
        this.parts.recoil.delete(entityId)
        this.countdowns.delete(entityId)
    }

    /** The flashes of the entities `kept`, each with its entity (and part), for a save. */
    snapshot(kept: (entityId: number) => boolean): FlashSnapshot[] {
        const entries = (flashes: Map<number, Flash>, part?: ZombieFlashPart) => [...flashes]
            .filter(([entityId]) => kept(entityId)).map(([entityId, flash]): FlashSnapshot => ({ entityId, ...flash, ...(part ? { part } : {}) }))
        return [...entries(this.flashes), ...entries(this.parts.shield, 'shield'), ...entries(this.parts.recoil, 'recoil')]
    }

    /** A save's flashes in place of these; the producers' countdowns are seen anew from the next frame. */
    restore(flashes: readonly FlashSnapshot[]): void {
        this.flashes.clear()
        this.parts.shield.clear()
        this.parts.recoil.clear()
        this.countdowns.clear()
        for (const { entityId, part, ...flash } of flashes) (part ? this.parts[part] : this.flashes).set(entityId, flash)
    }

    private raise(entityId: number, flash: Flash): void {
        const current = this.flashes.get(entityId)
        if (value(current, flash.tick) <= flash.ticks) this.flashes.set(entityId, flash)
    }

    /** A plant bitten (zombieChewedPlant) or hit by a hostile plant's shot (plantHit). */
    static readonly plantHit: FlashEvent = (stage, event, world) => {
        if (typeof event.data.plantId === 'number') stage.flashes.hitPlant(event.data.plantId, world.gameplayTick)
    }

    /** A producer that made its sun (sunProduced), or on the zombies' side took the player's (sunDrained). */
    static readonly produced: FlashEvent = (stage, event, world) => {
        if (typeof event.data.entityId === 'number') stage.flashes.glow(event.data.entityId, world.gameplayTick)
    }

    static readonly zombieHit: FlashEvent = (stage, event, world) => {
        const { entityId, body, shield, recoil } = event.data
        if (typeof entityId === 'number') {
            stage.flashes.hitZombie(entityId, world.gameplayTick, { body: body === true, shield: shield === true, recoil: recoil === true })
        }
    }

    static readonly zombieBurned: FlashEvent = (stage, event, world) => {
        if (typeof event.data.entityId === 'number') stage.flashes.burnZombie(event.data.entityId, world.gameplayTick)
    }
}
