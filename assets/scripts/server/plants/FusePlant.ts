import type { SystemContext, World } from '@/server/state/World'
import type { GameplayDefinitions, PlantDefinition } from '@/shared/content/gameplay'
import { type AnimationRandom, playLayers } from '@/shared/content/animation'
import { plantTeam } from '@/shared/content/teams'
import { nonNegativeInteger, trueFlag } from '@/shared/validate'
import { freezeFromPlant } from '../combat/freeze'
import { placeCrater } from '../gridItems/craters'
import { detonatePlant } from './damage'
import { Plant, type PlantConfig } from './Plant'
import { RandomResource } from '../state/resources'

export interface FusePlant {
    /** The ticks left of its fuse. */
    fuseTicks: number
    /** Its fuse is lit (Plant::UpdateDoomShroom's STATE_DOINGSPECIAL). */
    lit?: true
}

/**
 * A plant with a fuse (the definition's `fuse`: the cherry bomb, the ice-shroom, the doom-shroom; Plant::DoSpecial):
 * awake, its fuse is lit (its animation's `fuse` phase, Plant::UpdateDoomShroom's anim_explode): as it is put down, or
 * as it first acts once woken (the time turned to night), as Plant::UpdateDoomShroom lights one whenever it is awake.
 * It burns `ticks`, while zombies chew it without hurting it, and no board sends it to sleep; then it blows up
 * (`explosion`) or freezes the board (`freeze`) and is gone, leaving a crater in its cell if it says so (`crater`, the
 * doom-shroom's Board::AddACrater).
 */
export class FusePlant extends Plant {
    static readonly config: readonly PlantConfig[] = ['fuse']

    /** One comes with its whole fuse to burn. */
    constructor(typeId: string, definition: PlantDefinition, definitions: GameplayDefinitions) {
        super(typeId, definition, definitions)
        this.fuseTicks = this.fuse.ticks
    }

    private get fuse(): NonNullable<PlantDefinition['fuse']> { return this.definition.fuse! }

    protected restoreOwn(fields: Record<string, unknown>, name: string): void {
        const { fuseTicks, lit, ...rest } = fields
        this.fuseTicks = nonNegativeInteger(fuseTicks, `${name}.fuseTicks`)
        if (lit !== undefined) this.lit = trueFlag(lit, `${name}.lit`)
        super.restoreOwn(rest, name)
    }

    animationPhase(): string | undefined {
        return this.lit ? 'fuse' : undefined
    }

    protected keepsAwake(): boolean {
        return !!this.lit
    }

    /** An awake plant's fuse is lit as it goes down. */
    animationStarted(asleep: boolean, random: AnimationRandom): void {
        if (!asleep) this.light(random)
    }

    /** Its fuse is lit: its layers play its `fuse` phase's clips. */
    private light(random: AnimationRandom): void {
        this.lit = true
        const animation = this.definition.animation
        if (animation && this.animations) playLayers(animation, this, animation.phases?.fuse, random)
    }

    /** Its fuse lit, zombies chew it without hurting it; asleep (an ice-shroom by day), they eat it as any plant. */
    inedible(world: World): boolean {
        return !this.asleep(world)
    }

    act({ world, commands }: SystemContext): void {
        // Woken with its fuse unlit, it lights it as it first acts, and it burns from then (Plant::Update counts the
        // special down after UpdateDoomShroom lights it).
        if (!this.lit) this.light(world.resources.get(RandomResource))
        if (this.fuseTicks > 0) this.fuseTicks--
        if (this.fuseTicks > 0) return
        const { explosion, freeze, crater } = this.fuse, position = this.position
        if (explosion) detonatePlant(world, this.definitions, this.id, explosion, commands)
        else freezeFromPlant(world, this.definitions, this.id, freeze!, commands)
        if (crater) placeCrater(world, this.definitions, position.row, this.column, crater.ticks, plantTeam(this))
    }
}
