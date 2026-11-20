import type { SystemContext, World } from '@/server/state/World'
import type { GameplayDefinitions, PlantDefinition } from '@/shared/content/gameplay'
import { animateCurve } from '@/shared/content/animation'
import { plantFacingRect, plantTeam, zombieFacingRect, zombieTeam } from '@/shared/content/teams'
import type { JsonObject } from '@/shared/protocol'
import { nonNegativeInteger, oneOf } from '@/shared/validate'
import { POTATO_MINE_PHASES, type PotatoMinePhase } from '@/shared/content/plantKinds'
import { rectOverlap } from '../combat/collision'
import { RandomResource } from '../state/resources'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { isTargetableZombie } from '../zombies/damage'
import { detonatePlant } from './damage'
import { Plant, type PlantConfig } from './Plant'
import { findAbilityTarget } from './targeting'


export interface PotatoMine {
    /** Plant::mState of the mine. */
    phase: PotatoMinePhase
    /** The ticks left of its phase. */
    phaseTicks: number
}

/**
 * The potato mine (the definition's `mine`, Plant::UpdatePotato): it arms for `armingTicks`, rises out of the ground
 * for `riseTicks` (kept from the ice while it does) and, armed, blows up the first hostile thing its `attack` reaches.
 * Risen, zombies chew it without hurting it.
 */
export class PotatoMine extends Plant {
    static readonly config: readonly PlantConfig[] = ['mine']

    /** One comes arming, its `armingTicks` from rising. */
    constructor(typeId: string, definition: PlantDefinition, definitions: GameplayDefinitions) {
        super(typeId, definition, definitions)
        this.phase = 'arming'
        this.phaseTicks = this.mine.armingTicks
    }

    private get mine(): NonNullable<PlantDefinition['mine']> { return this.definition.mine! }

    protected restoreOwn(fields: Record<string, unknown>, name: string): void {
        const { phase, phaseTicks, ...rest } = fields
        this.phase = oneOf(phase, POTATO_MINE_PHASES, `${name}.phase`)
        this.phaseTicks = nonNegativeInteger(phaseTicks, `${name}.phaseTicks`)
        super.restoreOwn(rest, name)
    }

    animationPhase(): string {
        return this.phase
    }

    inedible(_world: World): boolean {
        return this.phase === 'rising' || this.phase === 'armed'
    }

    /** Rising out of the ground, no ice holds it. */
    keptFromIce(): boolean {
        return super.keptFromIce() || this.phase === 'rising'
    }

    act({ world, commands }: SystemContext): void {
        if (this.phaseTicks > 0) this.phaseTicks--
        const random = world.resources.get(RandomResource)
        const next = (phase: PotatoMinePhase, ticks: number) => {
            this.phase = phase
            this.phaseTicks = ticks
            this.playPhase(phase, random)
        }
        switch (this.phase) {
            case 'arming':
                if (this.phaseTicks > 0) break
                next('rising', this.mine.riseTicks)
                emitServerEvent(world.resources.get(EventQueueResource), 'mineRising', { entityId: this.id })
                break
            case 'rising':
                if (this.phaseTicks === 0) next('armed', 0)
                break
            case 'armed':
                if (findAbilityTarget(world, this.definitions, this, this.mine) !== undefined) {
                    detonatePlant(world, this.definitions, this.id, this.mine.explosion, commands)
                } else flashMineLight(world, this.definitions, this)
                break
        }
    }

    protected snapshotOwn(): JsonObject {
        return { phase: this.phase }
    }
}

/**
 * Plant::UpdatePotato: an armed mine's light, on its `light` layer, goes round at 2 frames a second under its body's
 * rate and is lit for the first frame of each round. A round is the clip's 10 frames with no zombie within 200 of the
 * mine's reach (Plant::DistanceToClosestZombie), down to 3 with one within 50, so the light flashes faster as one nears.
 */
const MINE_LIGHT = { layer: 'light', body: 'body', near: 50, far: 200, fast: 3, slower: 2 }
function flashMineLight(world: World, definitions: GameplayDefinitions, plant: Plant): void {
    const position = plant.position, light = plant.animations?.[MINE_LIGHT.layer], body = plant.animations?.[MINE_LIGHT.body]
    const definition = definitions.plants[plant.typeId]
    if (!light || !body) return
    const team = plantTeam(plant), reach = plantFacingRect(definition.mine!.attack, team)
    let distance = Infinity
    for (const zombie of world.zombies) {
        const at = zombie.position
        if (at.row !== position.row || !isTargetableZombie(zombie, team)) continue
        const rect = zombieFacingRect(definitions.zombies[zombie.typeId].body, zombieTeam(zombie))
        distance = Math.min(distance, Math.max(0, -rectOverlap({ x: position.x + reach.x, width: reach.width }, { x: at.x + rect.x, width: rect.width })))
    }
    const frames = definition.animation!.clips[light.clip].frames, { near, far, fast } = MINE_LIGHT
    const round = animateCurve(far, near, distance, frames, fast)
    // The round is that many frames in place of the clip's, so the clip goes round that much faster.
    light.rate = (body.rate - MINE_LIGHT.slower) * frames / round
    if (light.time % frames / frames * (round - 1) < 1) delete light.hidden
    else light.hidden = true
}
