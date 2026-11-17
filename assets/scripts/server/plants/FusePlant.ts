import type { EntityId, SystemContext, World } from '@/server/state/World'
import type { GameplayDefinitions, PlantDefinition } from '@/shared/content/gameplay'
import { type AnimationRandom, playLayers } from '@/shared/content/animation'
import { plantTeam } from '@/shared/content/teams'
import { nonNegativeInteger } from '@/shared/validate'
import { freezeFromPlant } from '../combat/freeze'
import { placeCrater } from '../gridItems/craters'
import { detonatePlant } from './damage'
import { Plant, type PlantConfig } from './Plant'

export interface FusePlant {
    /** The ticks left of its fuse. */
    fuseTicks: number
}

/**
 * A plant with a fuse (the definition's `fuse`: the cherry bomb, the ice-shroom, the doom-shroom; Plant::DoSpecial):
 * awake, its fuse is lit as it is put down (its animation's `fuse` phase, Plant::UpdateDoomShroom's anim_explode) and
 * burns `ticks`, while zombies chew it without hurting it; then it blows up (`explosion`) or freezes the board (`freeze`)
 * and is gone, leaving a crater in its cell if it says so (`crater`, the doom-shroom's Board::AddACrater).
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
        const { fuseTicks, ...rest } = fields
        this.fuseTicks = nonNegativeInteger(fuseTicks, `${name}.fuseTicks`)
        super.restoreOwn(rest, name)
    }

    animationPhase(): string {
        return 'fuse'
    }

    /** An awake plant's fuse is lit as it goes down: its layers play its `fuse` phase's clips. */
    animationStarted(asleep: boolean, random: AnimationRandom): void {
        const animation = this.definition.animation
        if (!asleep && animation) playLayers(animation, this, animation.phases?.fuse, random)
    }

    /** Its fuse lit, zombies chew it without hurting it; asleep (an ice-shroom by day), they eat it as any plant. */
    inedible(world: World): boolean {
        return !this.asleep(world)
    }

    act({ world, commands }: SystemContext, entity: EntityId): void {
        if (this.fuseTicks > 0) this.fuseTicks--
        if (this.fuseTicks > 0) return
        const { explosion, freeze, crater } = this.fuse, position = this.position
        if (explosion) detonatePlant(world, this.definitions, entity, explosion, commands)
        else freezeFromPlant(world, this.definitions, entity, freeze!, commands)
        if (crater) placeCrater(world, this.definitions, position.row, this.column, crater.ticks, plantTeam(this))
    }
}
