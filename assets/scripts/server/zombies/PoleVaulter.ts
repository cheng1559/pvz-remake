import type { Position, SystemContext } from '@/server/state/World'
import { type AnimationClip, type GameplayDefinitions, ZOMBIE_CLIPS, type ZombieDefinition } from '@/shared/content/gameplay'
import { type AnimationRandom, passedMark } from '@/shared/content/animation'
import type { JsonObject } from '@/shared/protocol'
import { boolean } from '@/shared/validate'
import { PLANT_WIDTH, teamDirection, ZOMBIE_WIDTH, zombieFacingRect, zombieTeam } from '@/shared/content/teams'
import { vaultAttack } from '@/shared/content/hitRects'
import { RandomResource } from '../state/resources'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { TICKS_PER_SECOND, playZombie, stepZombie, zombieBody, zombiePace } from './animation'
import { type PlantFinder, Zombie, type ZombieConfig } from './Zombie'

const POLE_VAULT_STEP_TIME = 0.2

const POLE_VAULT_SOUND_TIME = 0.4

export interface PoleVaulter {
    /** PHASE_POLEVAULTER_PRE_VAULT: it still holds its pole, running to the first plant in its way. */
    hasPole: boolean
}

/**
 * The pole vaulter (the definition's `vault`, Zombie::UpdateZombiePolevaulter): it runs holding its pole, jumps over
 * the first plant in its way, in the air (`airborne`), and walks on without it. Holding its pole it runs at its own
 * speed, never eats, slips from a chomper's bite and is passed over by the targetings its `vault.evades` lists (the
 * potato mine's); it lets its pole go as it walks into the house.
 */
export class PoleVaulter extends Zombie {
    static readonly config: readonly ZombieConfig[] = ['vault']

    /** One comes on holding its pole. */
    constructor(typeId: string, definition: ZombieDefinition, definitions: GameplayDefinitions) {
        super(typeId, definition, definitions)
        this.hasPole = true
    }

    private get vault(): NonNullable<ZombieDefinition['vault']> { return this.definition.vault! }

    protected restoreOwn(fields: Record<string, unknown>, name: string): void {
        const { hasPole, ...rest } = fields
        this.hasPole = boolean(hasPole, `${name}.hasPole`)
        super.restoreOwn(rest, name)
    }

    protected speedRange(): { min: number, max: number } {
        return this.hasPole ? this.vault.runSpeedPerTick : super.speedRange()
    }

    setOffClip(): string {
        return this.hasPole ? ZOMBIE_CLIPS.run : super.setOffClip()
    }

    /**
     * In the air, a tick of its jump, landing it walking (StartWalkAnim(0)); holding its pole, with its head, it jumps
     * over the first plant its vault reaches, a rolling nut from much further and where it stands.
     */
    act(context: SystemContext, plants: PlantFinder): boolean {
        const { world } = context, random = world.resources.get(RandomResource)
        if (this.state === 'airborne') {
            if (this.updateVault(context)) this.walkAgain(random)
            return true
        }
        if (!this.hasPole || !this.hasHead || this.state !== 'walking') return false
        const team = zombieTeam(this), attack = this.attackRect()
        const target = plants(zombieFacingRect(attack, team), zombieFacingRect(this.vault.bowlingAttack ?? attack, team))
        if (!target) return false
        this.startVault(target.plant.position, random, target.rolling)
        return true
    }

    /** CheckIfPreyCaught: running with its pole, it never stops to eat. */
    eats(): boolean {
        return !this.hasPole && super.eats()
    }

    /** Its vault's attack rect as it is now (vaultAttack): what it vaults with, then what it eats with once down. */
    attackRect(): ZombieDefinition['attack'] {
        return vaultAttack(this.vault, this.state, this.hasPole)
    }

    /** Zombie::WalkIntoHouse: one that comes to the house still holding its pole lets it go (PHASE_POLEVAULTER_POST_VAULT). */
    intoHouse(random: AnimationRandom): void {
        if (!this.hasPole) return
        this.hasPole = false
        this.walkAgain(random)
    }

    /**
     * Plant::UpdateChomper's doMiss: a chomper's bite misses it while it holds its pole, unless it stands frozen
     * (IsImmobilizied). In the air no bite finds it at all (`airborne`).
     */
    dodgesBite(): boolean {
        return this.hasPole && this.frozenTicks === undefined
    }

    /** Plant::FindTargetZombie: a targeting it evades (`vault.evades`, the potato mine's) passes it over while it holds its pole. */
    evades(key: string): boolean {
        return this.hasPole && this.vault.evades?.includes(key) === true
    }

    /** Its pole: PoleVaulterView lands it on its walk at once. */
    protected snapshotOwn(): JsonObject {
        return { hasPole: this.hasPole }
    }

    /** In the air only in its jump, without its pole. */
    validSaved(body: AnimationClip): boolean {
        return this.state === 'airborne' ? !this.hasPole : super.validSaved(body)
    }

    private startVault(plantPosition: Position, random: AnimationRandom, inPlace: boolean): void {
        this.state = 'airborne'
        const jump = playZombie(this, this.definition.animation, ZOMBIE_CLIPS.jump, random)
        this.hasPole = false
        // Zombie::UpdateZombiePolevaulter spreads the jump over the animation; the landing adds the rest. The jump ends 80
        // past the plant's left edge (mX - aPlant->mX - 80); a zombie facing right mirrors that across both widths. One
        // put down on the plant's own cell does not jump back (the original's zombies never stand there). Over a
        // rolling nut it jumps where it stands.
        const durationTicks = this.definition.animation.clips[ZOMBIE_CLIPS.jump].frames / jump.rate * TICKS_PER_SECOND
        const x = Math.trunc(this.position.x)
        const distance = teamDirection(zombieTeam(this)) < 0 ? x - plantPosition.x - 80
            : plantPosition.x - x - (ZOMBIE_WIDTH - PLANT_WIDTH) - 80
        this.speedPerTick = inPlace ? 0 : Math.max(0, distance) / durationTicks
    }

    /** A tick of its jump, true once it has landed (PHASE_POLEVAULTER_POST_VAULT), walking again. */
    private updateVault({ world }: SystemContext): boolean {
        const position = this.position, pace = zombiePace(this)
        const jump = zombieBody(this), clip = this.definition.animation.clips[ZOMBIE_CLIPS.jump], previous = jump.time
        stepZombie(this, this.definition.animation, world.resources.get(RandomResource))
        // A zombie facing right vaults right.
        const direction = teamDirection(zombieTeam(this))
        position.x += direction * this.speedPerTick * pace
        const events = world.resources.get(EventQueueResource)
        if (passedMark(clip, previous, jump.time, POLE_VAULT_STEP_TIME)) emitServerEvent(events, 'zombieVaultSound', { entityId: this.id, sound: 'grassstep' })
        if (passedMark(clip, previous, jump.time, POLE_VAULT_SOUND_TIME)) emitServerEvent(events, 'zombieVaultSound', { entityId: this.id, sound: 'polevault' })
        if (jump.time < clip.frames) return false
        position.x += direction * this.vault.landingOffset
        this.state = 'walking'
        return true
    }
}
