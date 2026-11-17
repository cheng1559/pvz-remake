import { BowlingNutView } from '@/client/plants/BowlingNutView'
import { ChomperView } from '@/client/plants/ChomperView'
import { FusePlantView } from '@/client/plants/FusePlantView'
import { GraveBusterView } from '@/client/plants/GraveBusterView'
import { PlantView } from '@/client/plants/PlantView'
import { PotatoMineView } from '@/client/plants/PotatoMineView'
import { ProducerView } from '@/client/plants/ProducerView'
import { ShooterView } from '@/client/plants/ShooterView'
import { SunShroomView } from '@/client/plants/SunShroomView'
import { MowerView } from '@/client/projectiles/MowerView'
import { ProjectileView } from '@/client/projectiles/ProjectileView'
import { AwardView } from '@/client/items/AwardView'
import { ItemView } from '@/client/items/ItemView'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { ZombieView } from '@/client/zombies/ZombieView'
import { DancerView } from '@/client/zombies/DancerView'
import { NewspaperView } from '@/client/zombies/NewspaperView'
import { PoleVaulterView } from '@/client/zombies/PoleVaulterView'
import { renderOrder } from '@/shared/content/renderOrder'
import { mirrorX, PLANT_WIDTH, ZOMBIE_WIDTH } from '@/shared/content/teams'
import { EntityFlashes } from './EntityFlashes'
import { boardToLayer, type StageEvent } from './LevelStage'

/**
 * Zombie::RemoveIceTrap: PARTICLE_ICE_TRAP_RELEASE where the ice of a plant or a zombie breaks off (the presentation's
 * `iceTrap`), one above it, turned round with one turned round. The event says where it stood, for one gone by now.
 */
const iceReleased: StageEvent = (stage, event) => {
    const { x, y, row, kind, typeId } = event.data
    if (typeof x !== 'number' || typeof y !== 'number' || typeof row !== 'number' || typeof typeId !== 'string') return
    const look = stage.content.presentation.iceTrap, zombie = kind === 'zombie', mirrored = event.data.mirrored === true
    const [releaseX, releaseY] = (zombie ? look.zombie : look.plant).releaseAt
    const order = (zombie ? stage.zombieOrder(row) : stage.plantOrder({ typeId, row, x })) + 1
    stage.particle(look.release, x + mirrorX(releaseX, zombie ? ZOMBIE_WIDTH : PLANT_WIDTH, mirrored), y + releaseY, order, undefined, mirrored)
}

/** Whether a handler hears of its event before the views draw the frame, or once it is drawn (before the entities gone from it go). */
export type StageEventTime = 'before' | 'after'

/**
 * Board::DoPlantingEffects: the dirt of a plant put down, over everything, and the sound of putting it down;
 * Challenge::IZombieMouseDownWithZombie puts a zombie down with FOLEY_PLANT too, and a grave seed goes down alike.
 */
const planted: StageEvent = (stage, event, world) => {
    void SoundSystem.playFoley(SoundEffect.Plant)
    if (event.type !== 'plantPlaced') return
    const plant = world.plants.find(candidate => candidate.entityId === event.data.entityId)
    if (plant) stage.spawnParticle(renderOrder('top'), { id: 'pvz:planting', ...boardToLayer(plant.x + 41, plant.y + 74) })
}

/**
 * Zombie::AnimateChewSound for the hypno-shroom: FOLEY_FLOOP as the plant goes, and StartMindControlled's
 * SOUND_MINDCONTROLLED with PARTICLE_MIND_CONTROL one above what it turned: at (60, 40) from a zombie, and from a plant
 * that swallowed it (not in the original) at its middle, (40, 40).
 */
const mindControlled: StageEvent = (stage, event, world) => {
    void SoundSystem.playFoley(SoundEffect.Floop)
    void SoundSystem.play(SoundEffect.MindControlled)
    const zombie = world.zombies.find(candidate => candidate.entityId === event.data.entityId)
    const plant = zombie ? undefined : world.plants.find(candidate => candidate.entityId === event.data.entityId)
    if (zombie) stage.particle('pvz:mindcontrol', zombie.x + 60, zombie.y + 40, stage.zombieOrder(zombie.row) + 1)
    else if (plant) stage.particle('pvz:mindcontrol', plant.x + 40, plant.y + 40, stage.plantOrder(plant) + 1)
}

/**
 * Who hears of an event of the server on the board: the views whose entity it is about (their static handlers), and the
 * board's own effects. A flash (EntityFlashes) is heard of `before` the views draw the frame, which shows it; the rest
 * once the frame is drawn, before the entities gone from it go, so what falls off a zombie leaves from where it is now,
 * or from where it last was. Mods add handlers for their own events or the base's.
 */
export class StageEventRegistry {
    private readonly handlers = new Map<string, Record<StageEventTime, StageEvent[]>>()
    private frozen = false

    constructor() {
        const before: Record<string, StageEvent> = {
            zombieChewedPlant: EntityFlashes.plantHit, plantHit: EntityFlashes.plantHit, sunProduced: EntityFlashes.produced, sunDrained: EntityFlashes.produced,
            zombieHit: EntityFlashes.zombieHit, zombieBurned: EntityFlashes.zombieBurned,
        }
        const after: Record<string, StageEvent> = {
            zombieHelmDropped: ZombieView.armorDropped, zombieShieldDropped: ZombieView.armorDropped, zombiePartDropped: ZombieView.partDropped,
            plantPlaced: planted, zombiePlaced: planted, gravePlaced: planted, craterPlaced: planted,
            plantFiring: ShooterView.fired, plantAreaAttack: ShooterView.areaAttack, mineRising: PotatoMineView.rose, plantExploded: PlantView.exploded,
            plantFroze: FusePlantView.froze, iceReleased,
            plantGrew: SunShroomView.grew, sunProduced: ProducerView.produced, plantChilled: PlantView.chilled, plantMowered: PlantView.mowered,
            bowlingImpact: BowlingNutView.bowled, chomperBit: ChomperView.bit, graveBusted: GraveBusterView.busted,
            projectileFired: ProjectileView.fired, projectileImpact: ProjectileView.impact, mowerActivated: MowerView.activated,
            zombieChewedPlant: ZombieView.chewed, zombieChewedZombie: ZombieView.chewed, plantEaten: ZombieView.ate, zombieAteZombie: ZombieView.ate,
            mindControlled,
            zombieRoseFromGrave: ZombieView.rose, zombieChilled: ZombieView.chilled, zombieVaultSound: PoleVaulterView.vaulted,
            dancerSnapped: DancerView.snapped, dancerCalledUp: DancerView.calledUp,
            zombieEnraged: NewspaperView.enraged, zombieGroaned: ZombieView.groaned, zombieDying: ZombieView.fell,
            zombieMowered: ZombieView.mowered, zombieCharred: ZombieView.charred, zombiePuffed: ZombieView.puffed,
            itemSpawned: ItemView.spawned, itemLanded: ItemView.landed, itemCollected: ItemView.collected, levelAwardDropped: AwardView.dropped, levelAwardCollected: AwardView.collected,
        }
        for (const [type, handler] of Object.entries(before)) this.register(type, handler, 'before')
        for (const [type, handler] of Object.entries(after)) this.register(type, handler)
        this.register('plantPlaced', PlantView.planted)
        this.register('projectileFired', ShooterView.shot)
        // Every frame, once its own events are heard (LevelEntityRenderer's FRAME_EVENT).
        this.register('frame', DancerView.danced)
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
