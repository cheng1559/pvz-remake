import { ParticlePlayer } from '@/client/particle/ParticlePlayer'
import { GraveBusterView } from '@/client/plants/GraveBusterView'
import { ChomperView } from '@/client/plants/ChomperView'
import { PlantView } from '@/client/plants/PlantView'
import { MowerView } from '@/client/projectiles/MowerView'
import { ProjectileView } from '@/client/projectiles/ProjectileView'
import { AwardView } from '@/client/items/AwardView'
import { ItemView } from '@/client/items/ItemView'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { ZombieView } from '@/client/zombies/ZombieView'
import { renderOrder } from '@/shared/content/renderOrder'
import { boardToLayer, type StageEvent } from './LevelStage'

/** Whether a handler hears of its event before the frame's entities go, or once the frame is drawn. */
export type StageEventTime = 'before' | 'after'

/**
 * Board::DoPlantingEffects: the dirt of a plant put down, over everything, and the sound of putting it down;
 * Challenge::IZombieMouseDownWithZombie puts a zombie down with FOLEY_PLANT too, and a grave seed goes down alike.
 */
const planted: StageEvent = (stage, event, world) => {
    void SoundSystem.playFoley(SoundEffect.Plant)
    if (event.type !== 'plantPlaced') return
    const plant = world.plants.find(candidate => candidate.entityId === event.data.entityId)
    if (plant) ParticlePlayer.spawn({ parent: stage.layer, id: 'pvz:planting', ...boardToLayer(plant.x + 41, plant.y + 74), renderOrder: renderOrder('top') })
}

/**
 * Who hears of an event of the server on the board: the views whose entity it is about (their static handlers), and the
 * board's own effects. What falls off a zombie is heard of `before` the frame's entities go, so it leaves from the
 * zombie as it was; the rest once the frame is drawn. Mods add handlers for their own events or the base's.
 */
export class StageEventRegistry {
    private readonly handlers = new Map<string, Record<StageEventTime, StageEvent[]>>()
    private frozen = false

    constructor() {
        const before: Record<string, StageEvent> = {
            zombieHelmDropped: ZombieView.armorDropped, zombieShieldDropped: ZombieView.armorDropped, zombiePartDropped: ZombieView.partDropped,
        }
        const after: Record<string, StageEvent> = {
            plantPlaced: planted, zombiePlaced: planted, gravePlaced: planted,
            plantFiring: PlantView.fired, plantAreaAttack: PlantView.areaAttack, mineRising: PlantView.rose, plantExploded: PlantView.exploded,
            plantGrew: PlantView.grew, sunProduced: PlantView.produced, plantChilled: PlantView.chilled, plantMowered: PlantView.mowered,
            bowlingImpact: PlantView.bowled, chomperBit: ChomperView.bit, graveBusted: GraveBusterView.busted,
            projectileFired: ProjectileView.fired, projectileImpact: ProjectileView.impact, mowerActivated: MowerView.activated,
            zombieChewedPlant: ZombieView.chewed, zombieChewedZombie: ZombieView.chewed, plantEaten: ZombieView.ate, zombieAteZombie: ZombieView.ate,
            zombieRoseFromGrave: ZombieView.rose, zombieChilled: ZombieView.chilled, zombieVaultSound: ZombieView.vaulted,
            zombieEnraged: ZombieView.enraged, zombieGroaned: ZombieView.groaned, zombieDying: ZombieView.fell,
            zombieMowered: ZombieView.mowered, zombieCharred: ZombieView.charred, zombiePuffed: ZombieView.puffed,
            itemSpawned: ItemView.spawned, itemLanded: ItemView.landed, itemCollected: ItemView.collected, levelAwardDropped: AwardView.dropped,
        }
        for (const [type, handler] of Object.entries(before)) this.register(type, handler, 'before')
        for (const [type, handler] of Object.entries(after)) this.register(type, handler)
        this.register('plantPlaced', PlantView.planted)
    }

    register(type: string, handler: StageEvent, time: StageEventTime = 'after'): void {
        if (this.frozen) throw new Error('registry is frozen')
        if (typeof handler !== 'function') throw new Error(`Invalid stage event handler: ${type}`)
        let handlers = this.handlers.get(type)
        if (!handlers) this.handlers.set(type, handlers = { before: [], after: [] })
        handlers[time].push(handler)
    }

    /** The handlers of an event at a time, in the order they were registered. */
    of(type: string, time: StageEventTime): readonly StageEvent[] {
        return this.handlers.get(type)?.[time] ?? []
    }

    checkpoint(): () => void {
        const lengths = new Map([...this.handlers].map(([type, handlers]) => [type, { before: handlers.before.length, after: handlers.after.length }]))
        const frozen = this.frozen
        return () => {
            for (const [type, handlers] of this.handlers) {
                const kept = lengths.get(type)
                if (!kept) { this.handlers.delete(type); continue }
                handlers.before.length = kept.before
                handlers.after.length = kept.after
            }
            this.frozen = frozen
        }
    }

    freeze(): void {
        this.frozen = true
    }
}
