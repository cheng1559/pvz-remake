import type { EntityId, SystemContext, World } from '@/server/state/World'
import type { GameplayDefinitions, PlantDefinition } from '@/shared/content/gameplay'
import { isHostile, plantFacingX, plantTeam, zombieFacingRect, zombieTeam } from '@/shared/content/teams'
import { isDeadOrDying } from '@/shared/content/zombieStates'
import type { JsonObject } from '@/shared/protocol'
import { nonNegativeInteger, oneOf } from '@/shared/validate'
import { circleRectOverlap } from '../combat/collision'
import { type Position, RandomResource } from '../state/components'
import type { Plant, PlantConfig } from './Plant'
import { Shooter } from './Shooter'

const PHASES = ['calm', 'lowering', 'scared', 'raising'] as const
type FrightPhase = typeof PHASES[number]

export interface ScaredyShroom {
    /** Plant::mState of its fright. */
    phase: FrightPhase
    /** The ticks left of its phase. */
    phaseTicks: number
}

/**
 * The scaredy-shroom (the definition's `fright`, Plant::UpdateScaredyShroom): a shooter that goes down while a hostile
 * zombie is near, its shots held until it is up again. A plant in the middle of a shot (Plant::mShootingCounter, its
 * burst and then its firing clip) waits for it to end. While it is not calm its next shot is a whole cadence away
 * (mLaunchCounter = mLaunchRate, which UpdateShooter then counts down this tick), so it shoots that long after it is up.
 */
export class ScaredyShroom extends Shooter {
    static readonly config: readonly PlantConfig[] = ['shooter', 'fright']

    /** One comes calm. */
    constructor(typeId: string, definition: PlantDefinition, definitions: GameplayDefinitions) {
        super(typeId, definition, definitions)
        this.phase = 'calm'
        this.phaseTicks = 0
    }

    private get fright(): NonNullable<PlantDefinition['fright']> { return this.definition.fright! }

    protected restoreOwn(fields: Record<string, unknown>, name: string): void {
        const { phase, phaseTicks, ...rest } = fields
        this.phase = oneOf(phase, PHASES, `${name}.phase`)
        this.phaseTicks = nonNegativeInteger(phaseTicks, `${name}.phaseTicks`)
        super.restoreOwn(rest, name)
    }

    animationPhase(): string {
        return this.phase
    }

    act({ world, tick }: SystemContext, entity: EntityId): void {
        if (this.phaseTicks > 0) this.phaseTicks--
        const random = world.resources.get(RandomResource), fright = this.fright, shooter = this.definition.shooter!
        const firing = Object.entries(this.definition.animation?.fire ?? {}).some(([layer, clip]) => this.animations?.[layer]?.clip === clip)
        if (this.burst || firing) return
        const near = zombieNear(world, this.definitions, this.position, this, fright)
        const next = (phase: FrightPhase, ticks: number) => {
            this.phase = phase
            this.phaseTicks = ticks
            this.playPhase(phase, random)
        }
        switch (this.phase) {
            case 'calm':
                if (near) next('lowering', fright.lowerTicks)
                break
            case 'lowering':
                if (this.phaseTicks === 0) next('scared', 0)
                break
            case 'scared':
                if (!near) next('raising', random.integer(fright.raiseTicks.min, fright.raiseTicks.max))
                break
            case 'raising':
                if (this.phaseTicks === 0) next('calm', 0)
                break
        }
        if (this.phase !== 'calm') this.readyAtTick = tick + shooter.cadenceTicks.max - 1
    }

    protected snapshotOwn(tick?: number): JsonObject {
        return { ...super.snapshotOwn(tick), phase: this.phase }
    }
}

/**
 * A hostile zombie not dead or dying with its body within the fright's circle, on the plant's row or the rows beside
 * it. The circle's center is from the plant's corner, mirrored for a plant facing left.
 */
function zombieNear(world: World, definitions: GameplayDefinitions, position: Position, plant: Plant,
    fright: NonNullable<PlantDefinition['fright']>): boolean {
    const team = plantTeam(plant), x = position.x + plantFacingX(fright.center.x, team), y = position.y + fright.center.y
    for (const zombie of world.zombies) {
        const at = zombie.position
        if (Math.abs(at.row - position.row) > fright.rowRange || isDeadOrDying(zombie) || !isHostile(zombieTeam(zombie), team)) continue
        const body = zombieFacingRect(definitions.zombies[zombie.typeId].body, zombieTeam(zombie))
        if (circleRectOverlap(x, y, fright.radius, { x: at.x + body.x, y: at.y + body.y, width: body.width, height: body.height })) return true
    }
    return false
}
