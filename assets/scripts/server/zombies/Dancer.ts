import type { EntityId, SystemContext, World } from '@/ecs/index'
import { type AnimationClip, DANCE_BEAT, type DanceLead, type GameplayDefinitions, ZOMBIE_CLIPS, type ZombieDefinition } from '@/shared/content/gameplay'
import { zombieRowY } from '@/shared/content/levelHelpers'
import { teamDirection, zombieTeam } from '@/shared/content/teams'
import { DANCE_PHASES, type DancePhase, isSummoning } from '@/shared/content/zombieStates'
import type { AnimationRandom } from '@/shared/content/animation'
import type { JsonObject } from '@/shared/protocol'
import { array, nonNegativeInteger, oneOf, positiveInteger } from '@/shared/validate'
import { LevelStateResource, PositionComponent, RandomResource, ZombieComponent } from '../state/components'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { playZombie, startWalk, zombieBody } from './animation'
import { countZombiesOnScreen } from './damage'
import { spawnZombie } from './spawn'
import { type PlantFinder, Zombie, type ZombieConfig } from './Zombie'

/** Board::CountZombiesOnScreen: the leader's first snap starts the disco music only with no more zombies about. */
const MUSIC_MAX_ZOMBIES = 15

/** Zombie::GetDancerPhase: the phase of the lawn's beat at `tick`. */
export function beatPhase(tick: number): DancePhase {
    const beat = Math.floor(tick % (DANCE_BEAT.ticks * DANCE_BEAT.beats) / DANCE_BEAT.ticks)
    return beat < DANCE_BEAT.walk ? 'walk' : beat === DANCE_BEAT.walk ? 'armUp' : beat < DANCE_BEAT.raiseAgain ? 'raise' : 'raise2'
}

/** The phases a dancer walks on (moonwalking or dancing forward); on the others it stands (Zombie::ZombieNotWalking). */
export function danceWalks(phase: DancePhase): boolean {
    return phase === 'moonwalk' || phase === 'walk'
}

export interface Dancer {
    /** Its phase of the dance. */
    phase: DancePhase
    /** Zombie::mPhaseCounter: the ticks left of a leader's moonwalk or of its hold after calling up its troupe; 0 otherwise. */
    phaseTicks: number
    /** Zombie::mZombieAge: the ticks it has been on the lawn, which a leader's spotlight changes color by. */
    age: number
    /** A leader's troupe by place (DanceLead.troupe): the dancer there, or null (mFollowerZombieID). */
    troupe?: Array<EntityId | null>
    /** Zombie::mSummonCounter: missing some of its troupe, a leader calls them up again once this runs out. */
    summonTicks?: number
    /** One called up into a troupe: its leader (mRelatedZombieID), until it is mind-controlled itself (changedSides). */
    leader?: EntityId
}

/**
 * A dancer (the definition's `dance`; Zombie::UpdateZombieDancer and UpdateZombieBackupDancer). A leader moonwalks in,
 * snaps its fingers and calls up its troupe out of the ground around it, then every dancer goes by the lawn's beat
 * (DANCE_BEAT, by the level's ticks), walking on its first beats and standing with its arm up on the rest. A troupe
 * stands still while any of it eats or is frozen and goes slowed while any of it is chilled; a leader missing some of
 * its troupe calls them up again.
 */
export class Dancer extends Zombie {
    static readonly config: readonly ZombieConfig[] = ['dance']

    constructor(typeId: string, definition: ZombieDefinition, definitions: GameplayDefinitions) {
        super(typeId, definition, definitions)
        this.phase = 'walk'
        this.phaseTicks = 0
        this.age = 0
    }

    /** Its lead (DanceLead): it moonwalks in and calls up its troupe; none for one called up into a troupe. */
    private get lead(): DanceLead | undefined {
        return this.definition.dance!.lead
    }

    protected restoreOwn(fields: Record<string, unknown>, name: string): void {
        const { phase, phaseTicks, age, troupe, summonTicks, leader, ...rest } = fields
        this.phase = oneOf(phase, DANCE_PHASES, `${name}.phase`)
        this.phaseTicks = nonNegativeInteger(phaseTicks, `${name}.phaseTicks`)
        this.age = nonNegativeInteger(age, `${name}.age`)
        if (troupe !== undefined) this.troupe = array(troupe, `${name}.troupe`).map((id, index) => id === null ? null : positiveInteger(id, `${name}.troupe[${index}]`))
        if (summonTicks !== undefined) this.summonTicks = positiveInteger(summonTicks, `${name}.summonTicks`)
        if (leader !== undefined) this.leader = positiveInteger(leader, `${name}.leader`)
        super.restoreOwn(rest, name)
    }

    /**
     * Zombie::ZombieInitialize for a dancer coming on: a leader moonwalks in (PHASE_DANCER_DANCING_IN) for its
     * `moonwalkTicks`, with its troupe's places empty; one without a lead dances from the beat (PHASE_DANCER_DANCING_LEFT).
     * Its mVelX = 0.5 goes nowhere: the moonwalk's ground runs backwards, so UpdateAnimSpeed sets it no rate from it.
     */
    start(random: AnimationRandom): void {
        const lead = this.lead
        if (!lead) return
        this.phaseTicks = random.integer(lead.moonwalkTicks.min, lead.moonwalkTicks.max)
        this.troupe = lead.troupe.map(() => null)
        this.playPhase('moonwalk', random)
    }

    /** Zombie::IsMovingAtChilledSpeed, as the zombies' tick starts: one of its troupe is chilled. */
    beforeTick(world: World, _entity: EntityId): void {
        if (this.troupeOf(world).some(member => member.chilledTicks > 0)) this.slowed = true
        else delete this.slowed
    }

    /**
     * Zombie::ApplyAnimRate halves a chilled one's rate, but UpdateAnimSpeed sets its moonwalk none (its ground runs
     * backwards): moonwalking, it goes on at its own pace, chilled or not (only tinted).
     */
    chillSlows(): boolean {
        return this.phase !== 'moonwalk' && super.chillSlows()
    }

    /**
     * Zombie::Update: its age, and the ticks of its phase counting down unless it is frozen (IsImmobilizied). Frozen as it
     * moonwalks, its rate is stopped (HitIceTrap's ApplyAnimRate(0)) and RemoveIceTrap's UpdateAnimSpeed sets it none
     * again: thawed, it stands in its moonwalk, its body still, until the moonwalk is through and it snaps its fingers.
     */
    count(): void {
        this.age++
        if (this.frozenTicks !== undefined && this.phase === 'moonwalk') zombieBody(this).rate = 0
        if (this.phaseTicks > 0 && this.frozenTicks === undefined) this.phaseTicks--
    }

    /** Zombie::UpdateActions: a tick of its dance, which stands while it eats. */
    act({ world, tick }: SystemContext, entity: EntityId, _plants: PlantFinder): boolean {
        if (this.state !== 'eating') this.updateDance(world, entity, tick)
        return false
    }

    /** CheckIfPreyCaught: a leader snapping its fingers does not eat. */
    eats(): boolean {
        return !isSummoning(this.phase) && super.eats()
    }

    /** Zombie::EatPlant: a plant in its way ends a leader's moonwalk, unbitten; it snaps its fingers next. */
    passesPlant(): boolean {
        if (this.phase !== 'moonwalk') return false
        this.phaseTicks = 1
        return true
    }

    /** A dancer that stops eating takes up its phase again where the dance is, at a speed picked anew (Zombie::StopEating). */
    stopEating(random: AnimationRandom): void {
        this.speedPerTick = this.pickSpeed(random)
        this.playPhase(this.phase, random)
    }

    /** Zombie::ZombieNotWalking: it walks on its walking phases alone, while none of its troupe stands still. */
    walks(world: World, _entity: EntityId): boolean {
        return danceWalks(this.phase) && !this.troupeOf(world).some(member => member.state === 'eating' || member.frozenTicks !== undefined)
    }

    /**
     * Zombie::WalkIntoHouse for a dancer: it walks in on its walk, whatever phase of the dance it was on (one called up past
     * the house's edge may come to it standing with its arm up, and the original's would stand at the door).
     */
    intoHouse(random: AnimationRandom): void {
        if (this.phase !== 'walk') this.playPhase('walk', random)
    }

    /**
     * Zombie::StartMindControlled for a dancer: a leader empties its troupe's places (mFollowerZombieID) and calls up
     * one of its own side later; those it let go keep it as their leader (mRelatedZombieID), so they still stand while
     * it or its new troupe eats or is frozen and go slowed while any of them is chilled. One of a troupe leaves its
     * leader's place and has no leader again.
     */
    changedSides(world: World, entity: EntityId): void {
        if (this.troupe) this.troupe = this.troupe.map(() => null)
        if (this.leader !== undefined) {
            const leader = world.get(this.leader, ZombieComponent), places = leader instanceof Dancer ? leader.troupe : undefined
            const index = places?.indexOf(entity) ?? -1
            if (index >= 0) places![index] = null
            delete this.leader
        }
    }

    /** Its phase and age: DancerView draws a moonwalking one turned round, a leader past its first snap under its spotlight. */
    protected snapshotOwn(): JsonObject {
        return { phase: this.phase, age: this.age }
    }

    /**
     * Its dance as it was saved: a leader has its troupe's places and its own phases, one without a lead a leader of its
     * own and the phase of coming up out of the ground. Its phases stand on clips of their own, with no ground.
     */
    validSaved(_body: AnimationClip): boolean {
        const leads = ['moonwalk', 'summon', 'resummon', 'hold'].includes(this.phase), lead = this.lead
        if (this.state === 'airborne') return false
        return lead ? this.troupe?.length === lead.troupe.length && this.leader === undefined && this.phase !== 'rise'
            : this.troupe === undefined && this.summonTicks === undefined && !leads
    }

    /** Its troupe as it stands: its leader (itself, if it leads) and those in the leader's places; none for one on its own. */
    private troupeOf(world: World): Dancer[] {
        const leader = this.troupe ? this : this.leader === undefined ? undefined : world.get(this.leader, ZombieComponent)
        if (!(leader instanceof Dancer) || !leader.troupe) return []
        return [leader, ...leader.troupe.flatMap(id => {
            const member = id === null ? undefined : world.get(id, ZombieComponent)
            return member instanceof Dancer ? [member] : []
        })]
    }

    /**
     * Zombie::UpdateZombieDancer and UpdateZombieBackupDancer: a tick of its dance. A leader's moonwalk ends in a snap
     * of its fingers, which calls up its troupe as it ends (with the disco music the first time, with few zombies
     * about) and is held; then it goes by the beat. Missing some of its troupe, with its head, it waits its
     * `summonTicks`, then snaps again on the beat its arm goes up if it is far enough in.
     */
    private updateDance(world: World, entity: EntityId, tick: number): void {
        const definition = this.definition, lead = this.lead
        const random = world.resources.get(RandomResource)
        if (lead && this.summonTicks !== undefined && --this.summonTicks <= 0) {
            // Zombie::GetDancerFrame's beat 12, on which its arm goes up.
            if (beatPhase(tick) === 'armUp' && this.hasHead && farEnoughIn(world, entity, lead.summonBeforeX)) {
                delete this.summonTicks
                this.phase = 'resummon'
                playZombie(this, definition.animation, ZOMBIE_CLIPS.point, random)
            } else this.summonTicks = 1
        }
        if (this.phase === 'moonwalk') {
            if (!this.hasHead || this.phaseTicks > 0) return
            this.phase = 'summon'
            playZombie(this, definition.animation, ZOMBIE_CLIPS.point, random)
            this.speedPerTick = this.pickSpeed(random)
            return
        }
        if (this.phase === 'summon' || this.phase === 'resummon') {
            const point = zombieBody(this)
            if (point.time < definition.animation.clips[point.clip].frames) return
            if (this.phase === 'summon') {
                emitServerEvent(world.resources.get(EventQueueResource), 'dancerSnapped', {
                    entityId: entity, typeId: this.typeId, music: countZombiesOnScreen(world) <= MUSIC_MAX_ZOMBIES,
                })
            }
            this.summonTroupe(world, entity)
            this.phase = 'hold'
            this.phaseTicks = lead!.holdTicks
            return
        }
        if (this.phase === 'hold') {
            if (this.phaseTicks > 0) return
            this.playPhase('walk', random)
        }
        const phase = beatPhase(tick)
        if (phase !== this.phase) this.playPhase(phase, random)
        if (lead && this.hasHead && this.summonTicks === undefined && this.missingTroupe(world, entity)) this.summonTicks = lead.summonTicks
    }

    /**
     * It comes to a phase and its clip: walking on its walk at its speed's rate, its arm going up on its `raise` from
     * DANCE_BEAT.armUpFrom of the way, standing with it up on its `raise` from the start; moonwalking and snapping on
     * their own. Holding the pose keeps the snap's last frame; one coming up out of the ground stands as it came.
     */
    private playPhase(phase: DancePhase, random: AnimationRandom): void {
        this.phase = phase
        const animation = this.definition.animation
        if (phase === 'walk') startWalk(this, this.definition, ZOMBIE_CLIPS.walk, random)
        else if (phase === 'moonwalk') playZombie(this, animation, ZOMBIE_CLIPS.moonwalk, random)
        else if (phase === 'summon' || phase === 'resummon') playZombie(this, animation, ZOMBIE_CLIPS.point, random)
        else if (phase === 'armUp') playZombie(this, animation, ZOMBIE_CLIPS.raise, random).time = animation.clips[ZOMBIE_CLIPS.raise].frames * DANCE_BEAT.armUpFrom
        else if (phase === 'raise' || phase === 'raise2') playZombie(this, animation, ZOMBIE_CLIPS.raise, random)
    }

    /** Where a place of its troupe is (DanceLead.troupe): its row, and its x, turned round on the plants' side. */
    private troupePlace(world: World, entity: EntityId, index: number): { row: number, x: number } | undefined {
        const at = world.get(entity, PositionComponent)!
        const place = this.lead!.troupe[index], row = at.row + place.row
        // Board::RowCanHaveZombieType: only a row zombies walk.
        if (!world.resources.get(LevelStateResource).definition.activeRows.includes(row)) return undefined
        return { row, x: Math.trunc(at.x) + (teamDirection(zombieTeam(this)) > 0 ? -place.x : place.x) }
    }

    /** Zombie::NeedsMoreBackupDancers: an empty place of its troupe in a row zombies walk. */
    private missingTroupe(world: World, entity: EntityId): boolean {
        return this.troupe!.some((id, index) => (id === null || !world.hasEntity(id)) && this.troupePlace(world, entity, index) !== undefined)
    }

    /**
     * Zombie::SummonBackupDancers: with its head, a leader calls up its `backup` into each empty place of its troupe in a
     * row zombies walk (SummonBackupDancer), on its side and mind-controlled as it is. Each comes up out of the ground
     * over the lead's `riseTicks`, standing as it came (its body still), and is heard and seen as it starts
     * (`dancerCalledUp`: PARTICLE_DANCER_RISE and FOLEY_GRAVESTONE_RUMBLE). It counts against no wave
     * (Board::TotalZombiesHealthInWave leaves out one with a leader).
     */
    private summonTroupe(world: World, entity: EntityId): void {
        if (!this.hasHead) return
        const lead = this.lead!, places = this.troupe!
        const board = world.resources.get(LevelStateResource).board
        for (let index = 0; index < places.length; index++) {
            const id = places[index]
            if (id !== null && world.hasEntity(id)) continue
            const place = this.troupePlace(world, entity, index)
            places[index] = null
            if (!place) continue
            const backupId = spawnZombie(world, this.definitions, lead.backup, place.row, place.x, zombieRowY(board, place.row))
            const backup = world.get(backupId, ZombieComponent) as Dancer
            if (this.team) backup.team = this.team
            if (this.mindControlled) backup.mindControlled = true
            backup.riseTicks = lead.riseTicks
            backup.phase = 'rise'
            backup.leader = entity
            zombieBody(backup).rate = 0
            places[index] = backupId
            emitServerEvent(world.resources.get(EventQueueResource), 'dancerCalledUp', { entityId: backupId, typeId: lead.backup, row: place.row, leaderId: entity })
        }
    }
}

/** Left of `x` going the zombies' way; on the plants' side, as far from the right. */
function farEnoughIn(world: World, entity: EntityId, x: number): boolean {
    const zombie = world.get(entity, ZombieComponent)!, at = world.get(entity, PositionComponent)!.x
    return teamDirection(zombieTeam(zombie)) < 0 ? at < x : at > 800 - x
}
