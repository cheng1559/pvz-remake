import type { EntityId, EntityRemover, Position, SystemContext, World } from '@/server/state/World'
import { cellPosition, type GameplayDefinitions, type PlantDefinition } from '@/shared/content/gameplay'
import { groundStep } from '@/shared/content/animation'
import { plantFacingRect, plantTeam, teamDirection, zombieFacingRect, zombieTeam } from '@/shared/content/teams'
import { nonNegativeInteger } from '@/shared/validate'
import { rectOverlap } from '../combat/collision'
import { hostilePlants } from '../combat/targets'
import type { DeterministicRng } from '../state/DeterministicRng'
import { LevelStateResource, RandomResource, TutorialResource } from '../state/resources'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { damageZombie, isTargetableZombie } from '../zombies/damage'
import { damagePlant, detonatePlant } from './damage'
import { Plant, type PlantConfig } from './Plant'
import { plantInPlay } from '../level/lawn'

/**
 * Plant::UpdateBowling moves the nut by its body's `_ground` track: the layer whose clip (with a pace of its own) it
 * rolls on, as a zombie walks on its walk's (groundStep).
 */
const ROLL_LAYER = 'body'

export interface BowlingNut {
    /** The way it slants, a row a time: -1 up, 1 down, 0 straight along its row. */
    direction: -1 | 0 | 1
    /** Plant::mLaunchCounter: its zombie impacts so far (for the coins and Roll Some Heads). */
    hits: number
}

/**
 * Wall-nut Bowling's nut (the definition's `bowling`, Plant::UpdateBowling): a moving plant, sharing no stationary
 * wall-nut's health or chewing. It rolls along its row, strikes the first hostile zombie or plant it meets (an
 * explode-o-nut, `deathExplosion`, blows up instead) and bounces off a row up or down, also once the level is won.
 */
export class BowlingNut extends Plant {
    static readonly config: readonly PlantConfig[] = ['bowling']

    /** It rolls on its body's clip, which has a pace of its own and the ground it rolls on. */
    static validate(definition: PlantDefinition, id: string): void {
        super.validate(definition, id)
        const clip = definition.animation?.clips[definition.animation.layers[ROLL_LAYER] ?? '']
        if (!clip?.ground || !clip.fps) throw new Error(`${id}: the animation's ${ROLL_LAYER} layer must start a clip with fps and the ground it rolls on`)
    }

    /** One comes rolling straight, having hit nothing. */
    constructor(typeId: string, definition: PlantDefinition, definitions: GameplayDefinitions) {
        super(typeId, definition, definitions)
        this.direction = 0
        this.hits = 0
    }

    private get rules(): NonNullable<PlantDefinition['bowling']> { return this.definition.bowling! }

    protected restoreOwn(fields: Record<string, unknown>, name: string): void {
        const { direction, hits, ...rest } = fields
        if (direction !== -1 && direction !== 0 && direction !== 1) throw new TypeError(`${name}.direction must be -1, 0 or 1`)
        this.direction = direction
        this.hits = nonNegativeInteger(hits, `${name}.hits`)
        super.restoreOwn(rest, name)
    }

    roll({ world, commands }: SystemContext, entity: EntityId): void {
        const definitions = this.definitions, definition = this.definition, rules = this.rules
        const board = world.resources.get(LevelStateResource).board
        const random = world.resources.get(RandomResource)
        const position = this.position
        const roll = this.animations?.[ROLL_LAYER]
        if (!roll) return
        // Plant::UpdateBowling: a clip with a `_ground` track rolls the nut as far as its ground goes at the clip's rate
        // (Reanimation::GetTrackVelocity), between the frames it is at before the animation system moves it on after the
        // plants have acted. A chilled nut is slowed by the ticks it sits out (chill.ts), not here. A nut on the zombies'
        // side rolls left.
        const clip = definition.animation!.clips[roll.clip], team = plantTeam(this), facing = teamDirection(team)
        if (clip?.ground) position.x += facing * groundStep(clip, roll)
        if (facing > 0 ? position.x > board.bounds.right : position.x + definition.body.x + definition.body.width < board.bounds.left) {
            commands.destroyEntity(entity)
            return
        }
        position.y += this.direction * rules.bounceSpeed
        if (Math.abs(cellPosition(board, position.row, 0).y - position.y) > rules.bounceSpeed) return
        let direction = this.direction
        if (direction < 0 && position.row === 0) direction = 1
        else if (direction > 0 && position.row === board.rows - 1) direction = -1
        const nutAttack = plantFacingRect(rules.attack, team)
        const nut = { x: position.x + nutAttack.x, width: nutAttack.width }
        const target = [...world.zombies].find(zombie => {
            const point = zombie.position, body = zombieFacingRect(definitions.zombies[zombie.typeId].body, zombieTeam(zombie))
            return point.row === position.row && isTargetableZombie(zombie, team) && rectOverlap(nut, { x: point.x + body.x, width: body.width }) > 0
        })?.id
        // A hostile plant takes the body blow; it is no zombie impact, so `hits` does not count it.
        const plantTarget = target === undefined
            ? hostilePlants(world, definitions, team, position.row).find(candidate => rectOverlap(nut, candidate.rect) > 0)?.entity : undefined
        if (target === undefined && plantTarget === undefined) {
            if (direction) { position.row += direction; this.direction = direction }
            return
        }
        const self: Rolling = { entity, nut: this, position }
        if (plantTarget !== undefined) {
            // Two hostile nuts meeting strike each other at once, both blows landing before either moves on, so the
            // outcome does not depend on which of them the run reaches first: each takes the other's blow and bounces,
            // and an explode-o-nut goes off. An explode-o-nut goes off first, so a plain nut's blow never lands on a
            // nut already blowing up.
            const other = rollingNut(world, plantTarget)
            const blows: [Rolling, number][] = other ? [[self, plantTarget], [other, entity]] : [[self, plantTarget]]
            blows.sort(([left], [right]) => Number(!!right.nut.definition.deathExplosion) - Number(!!left.nut.definition.deathExplosion))
            for (const [rolling, struck] of blows) rolling.nut.strike(world, commands, rolling, struck)
            for (const [rolling] of blows) if (world.hasEntity(rolling.entity)) rolling.nut.bounce(rolling.position, board.rows, random)
            return
        }
        if (definition.deathExplosion) {
            detonatePlant(world, definitions, entity, definition.deathExplosion, commands)
            return
        }
        const struck = target!
        const zombie = world.zombies.get(struck)!
        // Plant::UpdateBowling: a shield takes the shield blow alone (TakeShieldDamage), except a screen door met by a
        // nut that has bounced (mState != STATE_NOTREADY), which takes the full blow and passes the rest on
        // (TakeDamage); a helm without a shield in front takes the helm blow alone (TakeHelmDamage).
        const shieldType = zombie.shieldHealth > 0 ? definitions.zombies[zombie.typeId].shield!.type : undefined
        const shield = shieldType !== undefined && !(this.direction !== 0 && rules.bouncedBreaks.includes(shieldType))
        const helm = shieldType === undefined && zombie.helmHealth > 0
        damageZombie(world, definitions, struck, shield ? rules.shieldDamage : helm ? rules.helmDamage : rules.damage,
            shield ? { shieldOnly: true } : helm ? { helmOnly: true } : {})
        // Plant::UpdateBowling counts every impact (mLaunchCounter, for the coins and Roll Some Heads), except on a
        // first Adventure up to level 10 (1-5).
        const level = world.resources.get(LevelStateResource).definition
        if (!world.resources.get(TutorialResource).firstAdventure || level.adventureIndex > 10) this.hits++
        emitServerEvent(world.resources.get(EventQueueResource), 'bowlingImpact', {
            entityId: struck, typeId: zombie.typeId, helm, shield: shieldType !== undefined, plantId: entity, plantTypeId: this.typeId, hits: this.hits,
        })
        this.bounce(position, board.rows, random)
    }

    /** A nut's blow on a hostile plant: an explode-o-nut's blast, which takes the nut too, otherwise its damage. */
    private strike(world: World, remover: EntityRemover, rolling: Rolling, target: number): void {
        if (this.definition.deathExplosion) {
            detonatePlant(world, this.definitions, rolling.entity, this.definition.deathExplosion, remover)
            return
        }
        // A nut gone by the other's blast takes no blow.
        const typeId = plantInPlay(world, target)?.typeId
        if (typeId === undefined) return
        damagePlant(world, this.definitions, target, this.rules.damage, remover)
        emitServerEvent(world.resources.get(EventQueueResource), 'bowlingImpact', {
            entityId: target, typeId, target: 'plant', helm: false, shield: false, plantId: rolling.entity, plantTypeId: this.typeId, hits: this.hits,
        })
    }

    /** Plant::UpdateBowling: after an impact it turns back the way it slanted (and away from an edge row), or, rolling straight, picks a way. */
    private bounce(position: Position, rows: number, random: DeterministicRng): void {
        const direction = position.row === rows - 1 || this.direction > 0 ? -1
            : position.row === 0 || this.direction < 0 ? 1 : random.integer(0, 1) ? -1 : 1
        position.row += direction
        this.direction = direction
    }
}

/** A nut as it rolls: its entity, itself and where it is. */
interface Rolling { entity: EntityId; nut: BowlingNut; position: Position }

/** The plant at `entity` when it is a rolling nut too (a Mod's included). */
function rollingNut(world: World, entity: EntityId): Rolling | undefined {
    const plant = plantInPlay(world, entity)
    return plant instanceof BowlingNut ? { entity, nut: plant, position: plant.position } : undefined
}
