import type { World } from '@/ecs/index'
import type { GameplayDefinitions, PlantDefinition } from '@/shared/content/gameplay'
import type { PlantBehavior } from './behaviors'
import {
    type EntityRemover, LevelStateResource, type Plant, PlantComponent, type Position, PositionComponent, RandomResource, ZombieComponent,
} from '../state/components'
import type { DeterministicRng } from '../state/DeterministicRng'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { damageZombie, isTargetableZombie } from '../zombies/damage'
import { zombieFacingRect, plantFacingRect, plantTeam, teamDirection, zombieTeam } from '@/shared/content/teams'
import { hostilePlants } from '../combat/targets'
import { damagePlant, detonatePlant } from './damage'
import { rectOverlap } from '../combat/collision'
import { TutorialResource } from '../state/levelState'
import { groundStep } from '@/shared/content/animation'
import { array, exact, finite, nonEmptyString, positiveFinite, positiveInteger } from '@/shared/validate'

/** `hits`: Plant::mLaunchCounter, the nut's zombie impacts so far. */
interface State { [key: string]: number; direction: number; hits: number }
/**
 * Plant::UpdateBowling moves the nut by its body's `_ground` track: the layer whose clip (with a pace of its own) it
 * rolls on, as a zombie walks on its walk's (groundStep).
 */
const ROLL_LAYER = 'body'
/**
 * A bowling plant's `behavior: {kind, attack, ...}`. `attack`: Plant::GetPlantAttackRect on Wall-nut Bowling, the
 * rect its blows land with; its body is GetPlantRect. `bounceSpeed`: how far it goes up or down a tick on a slant,
 * and how near its row it must be to strike or turn; `damage`, `helmDamage`, `shieldDamage`: its blow, and the blows a
 * helm and a shield take alone; `bouncedBreaks`: the shields (the screen door) a nut that has bounced strikes with its
 * full blow instead, none when omitted. A nut that blows up on contact (`deathExplosion`) strikes no blow.
 */
interface Rules {
    attack: { x: number; width: number }; bounceSpeed: number
    damage: number; helmDamage: number; shieldDamage: number; bouncedBreaks: string[]
}
/** Plant::UpdateBowling's own: mY goes 2 a tick on a slant; TakeDamage(1800), TakeHelmDamage(900), TakeShieldDamage(400). */
const DEFAULT_RULES = { bounceSpeed: 2, damage: 1800, helmDamage: 900, shieldDamage: 400 } as const

const parsed = new WeakMap<Readonly<PlantDefinition>, Rules>()

function parseRules(definition: Readonly<PlantDefinition>, name: string): Rules {
    const source = exact(definition.behavior, ['kind', 'attack'], name, [...Object.keys(DEFAULT_RULES), 'bouncedBreaks'])
    nonEmptyString(source.kind, `${name}.kind`)
    const attack = exact(source.attack, ['x', 'width'], `${name}.attack`)
    const clip = definition.animation?.clips[definition.animation.layers[ROLL_LAYER] ?? '']
    if (!clip?.ground || !clip.fps) throw new Error(`${name}: the animation's ${ROLL_LAYER} layer must start a clip with fps and the ground it rolls on`)
    const setting = (key: keyof typeof DEFAULT_RULES, parse: (value: unknown, name: string) => number) =>
        source[key] === undefined ? DEFAULT_RULES[key] : parse(source[key], `${name}.${key}`)
    return {
        attack: { x: finite(attack.x, `${name}.attack.x`), width: positiveFinite(attack.width, `${name}.attack.width`) },
        bounceSpeed: setting('bounceSpeed', positiveFinite),
        damage: setting('damage', positiveInteger), helmDamage: setting('helmDamage', positiveInteger), shieldDamage: setting('shieldDamage', positiveInteger),
        bouncedBreaks: source.bouncedBreaks === undefined ? []
            : array(source.bouncedBreaks, `${name}.bouncedBreaks`).map((type, index) => nonEmptyString(type, `${name}.bouncedBreaks[${index}]`)),
    }
}

/** The nut's rules, as validateConfig accepted them when the content was loaded. */
function bowlingRules(definition: Readonly<PlantDefinition>): Rules {
    let rules = parsed.get(definition)
    if (!rules) parsed.set(definition, rules = parseRules(definition, 'behavior'))
    return rules
}

/** A separate moving plant; it shares no stationary wall-nut health or chewing behavior. */
export const bowlingBehavior: PlantBehavior<State> = {
    tickAfterWin: true,
    createState: () => ({ direction: 0, hits: 0 }),
    validateConfig(definition, _definitions, name) { parsed.set(definition, parseRules(definition, name)) },
    validateState(state) {
        if (![-1, 0, 1].includes(state.direction) || !Number.isSafeInteger(state.hits) || state.hits < 0) throw new Error('Invalid bowling plant state')
    },
    tick({ world, commands, definitions, entity, plant, definition, position, state }) {
        const rules = bowlingRules(definition)
        const board = world.resources.get(LevelStateResource).board
        const random = world.resources.get(RandomResource)
        const roll = plant.animations?.[ROLL_LAYER]
        if (!roll) return
        // Plant::UpdateBowling: a clip with a `_ground` track rolls the nut as far as its ground goes at the clip's rate
        // (Reanimation::GetTrackVelocity), between the frames it is at before the animation system moves it on after the
        // plants have acted. A chilled nut is slowed by the ticks it sits out (chill.ts), not here. A nut on the zombies'
        // side rolls left.
        const clip = definition.animation!.clips[roll.clip], team = plantTeam(plant), facing = teamDirection(team)
        if (clip?.ground) position.x += facing * groundStep(clip, roll)
        if (facing > 0 ? position.x > board.bounds.right : position.x + definition.body.x + definition.body.width < board.bounds.left) {
            commands.destroyEntity(entity)
            return
        }
        position.y += state.direction * rules.bounceSpeed
        if (Math.abs(board.origin.y + position.row * board.cell.height - position.y) > rules.bounceSpeed) return
        let direction = state.direction
        if (direction < 0 && position.row === 0) direction = 1
        else if (direction > 0 && position.row === board.rows - 1) direction = -1
        const nutAttack = plantFacingRect(rules.attack, team)
        const nut = { x: position.x + nutAttack.x, width: nutAttack.width }
        const target = [...world.query(ZombieComponent, PositionComponent)].find(id => {
            const zombie = world.get(id, ZombieComponent)!, point = world.get(id, PositionComponent)!
            const body = zombieFacingRect(definitions.zombies[zombie.typeId].body, zombieTeam(zombie))
            return point.row === position.row && isTargetableZombie(zombie, team) && rectOverlap(nut, { x: point.x + body.x, width: body.width }) > 0
        })
        // A hostile plant takes the body blow; it is no zombie impact, so `hits` does not count it.
        const plantTarget = target === undefined
            ? hostilePlants(world, definitions, team, position.row).find(candidate => rectOverlap(nut, candidate.rect) > 0)?.entity : undefined
        if (target === undefined && plantTarget === undefined) {
            if (direction) { position.row += direction; state.direction = direction }
            return
        }
        const self: Nut = { entity, plant, definition, position, state }
        if (plantTarget !== undefined) {
            // Two hostile nuts meeting strike each other at once, both blows landing before either moves on, so the
            // outcome does not depend on which of them the run reaches first: each takes the other's blow and
            // bounces, and an explode-o-nut goes off.
            // An explode-o-nut goes off first, so a plain nut's blow never lands on a nut already blowing up.
            const other = rollingNut(world, definitions, plantTarget, definition)
            const blows: [Nut, number][] = other ? [[self, plantTarget], [other, entity]] : [[self, plantTarget]]
            blows.sort(([left], [right]) => Number(!!right.definition.deathExplosion) - Number(!!left.definition.deathExplosion))
            for (const [nut, struck] of blows) strike(world, definitions, commands, nut, struck)
            for (const [nut] of blows) if (world.hasEntity(nut.entity)) bounce(nut, board.rows, random)
            return
        }
        if (definition.deathExplosion) {
            detonatePlant(world, definitions, entity, definition.deathExplosion, commands)
            return
        }
        const struck = target!
        const zombie = world.get(struck, ZombieComponent)!
        // Plant::UpdateBowling: a shield takes the shield blow alone (TakeShieldDamage), except a screen door met by a
        // nut that has bounced (mState != STATE_NOTREADY), which takes the full blow and passes the rest on
        // (TakeDamage); a helm without a shield in front takes the helm blow alone (TakeHelmDamage).
        const shieldType = zombie.shieldHealth > 0 ? definitions.zombies[zombie.typeId].shield!.type : undefined
        const shield = shieldType !== undefined && !(state.direction !== 0 && rules.bouncedBreaks.includes(shieldType))
        const helm = shieldType === undefined && zombie.helmHealth > 0
        damageZombie(world, definitions, struck, shield ? rules.shieldDamage : helm ? rules.helmDamage : rules.damage,
            shield ? { shieldOnly: true } : helm ? { helmOnly: true } : {})
        // Plant::UpdateBowling counts every impact (mLaunchCounter, for the coins and Roll Some Heads), except on a
        // first Adventure up to level 10 (1-5).
        const level = world.resources.get(LevelStateResource).definition
        if (!world.resources.get(TutorialResource).firstAdventure || level.adventureIndex > 10) state.hits++
        emitServerEvent(world.resources.get(EventQueueResource), 'bowlingImpact', {
            entityId: struck, typeId: zombie.typeId, helm, shield: shieldType !== undefined, plantId: entity, plantTypeId: plant.typeId, hits: state.hits,
        })
        bounce(self, board.rows, random)
    },
}

interface Nut { entity: number; plant: Plant; definition: PlantDefinition; position: Position; state: State }

/** The plant at `entity` when it rolls by the same behavior as `like` (another nut, a Mod's included). */
function rollingNut(world: World, definitions: GameplayDefinitions, entity: number, like: PlantDefinition): Nut | undefined {
    const plant = world.get(entity, PlantComponent), position = world.get(entity, PositionComponent)
    if (!plant?.behaviorState || !position) return undefined
    const definition = definitions.plants[plant.typeId]
    const kind = (value: PlantDefinition) => (value.behavior as { kind?: unknown } | undefined)?.kind
    return kind(definition) === kind(like) ? { entity, plant, definition, position, state: plant.behaviorState as unknown as State } : undefined
}

/** A nut's blow on a hostile plant: an explode-o-nut's blast, which takes the nut too, otherwise its damage. */
function strike(world: World, definitions: GameplayDefinitions, remover: EntityRemover, nut: Nut, target: number): void {
    if (nut.definition.deathExplosion) {
        detonatePlant(world, definitions, nut.entity, nut.definition.deathExplosion, remover)
        return
    }
    // A nut gone by the other's blast takes no blow.
    const typeId = world.get(target, PlantComponent)?.typeId
    if (typeId === undefined) return
    damagePlant(world, definitions, target, bowlingRules(nut.definition).damage, remover)
    emitServerEvent(world.resources.get(EventQueueResource), 'bowlingImpact', {
        entityId: target, typeId, target: 'plant', helm: false, shield: false, plantId: nut.entity, plantTypeId: nut.plant.typeId, hits: nut.state.hits,
    })
}

/** Plant::UpdateBowling: after an impact the nut turns back the way it slanted (and away from an edge row), or, rolling straight, picks a way. */
function bounce(nut: Nut, rows: number, random: DeterministicRng): void {
    const { position, state } = nut
    const direction = position.row === rows - 1 || state.direction > 0 ? -1
        : position.row === 0 || state.direction < 0 ? 1 : random.integer(0, 1) ? -1 : 1
    position.row += direction
    state.direction = direction
}
