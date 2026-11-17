import { array, boolean, exact, integer, integerInRange, nonEmptyString, nonNegativeInteger, positiveFinite, positiveInteger } from '@/shared/validate'
import type { GameSystem, World } from '@/server/state/World'
import type { GameplayDefinitions, LevelRule } from '@/shared/content/gameplay'
import { type EntityRemover, EconomyStateResource, LevelStateResource, RandomResource } from '../state/components'
import { WaveResource } from '../state/levelState'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { startWalk } from '../zombies/animation'
import { animateCurve } from '@/shared/content/animation'
import { craterAt } from '@/shared/content/craters'
import { damageZombie, destroyZombie } from '../zombies/damage'
import { damagePlant } from '../plants/damage'
import { isHostile, plantFacingRect, plantTeam, zombieTeam } from '@/shared/content/teams'
import { isDeadOrDying } from '@/shared/content/zombieStates'
import type { Team } from '@/shared/protocol'
import { pickWeighted } from '@/shared/random'
import { circleRectOverlap } from '../combat/collision'
import { graves as lawnGraves, placeGrave, raiseZombieFromGrave } from '../gridItems/graves'
import { plantInPlay, plantsInPlay } from '../level/lawn'
import { gridItems } from '../gridItems/gridItems'
import { spawnLoot } from '../level/loot'
import { levelAwardDropped, tryDropLevelAward } from '../level/levelAward'
import { nextWaveComing } from '../level/waves'
import { clearCursor } from '../seeds/cursor'
import type { LevelRuleDefinition } from './registry'

type Parse = (value: unknown, name: string) => number

/**
 * The rule's numbers, each with its check and the original's value, which it keeps unless the level writes its own.
 * `graves` are placed from `firstGraveColumn` on at the start and topped up to `refillGraves` `refillTicks` before each
 * later wave; the first wave comes the level's `firstWaveTicks` in (Challenge::StartLevel) and the next ones `waveTicks`
 * apart. Groups rise while the next wave is at least `spawnCutoffTicks` away, each zombie over `riseTicks`, and the
 * final wave's group of `finalGroup` comes `finalGroupDelayTicks` into it; earlier waves' first groups come at once.
 * The mallet hits a circle of `hammerRadius` for `hammerDamage`.
 */
const NUMBERS = {
    // Board::InitLevel: WhackAZombiePlaceGraves(9); WhackAZombiePlaceGraves: from column 3.
    graves: [positiveInteger, 9], firstGraveColumn: [nonNegativeInteger, 3],
    // Challenge::WhackAZombieSpawning: at mZombieCountDown 100, 5 graves less those there (at least one).
    refillGraves: [positiveInteger, 5], refillTicks: [positiveInteger, 100],
    // Challenge::WhackAZombieSpawning: mZombieCountDown = 2000 for each wave; no group under 300.
    waveTicks: [positiveInteger, 2000], spawnCutoffTicks: [nonNegativeInteger, 300],
    // Challenge::WhackAZombieSpawning: the final wave's 20 zombies, mChallengeStateCounter = 300 ticks into it.
    finalGroup: [positiveInteger, 20], finalGroupDelayTicks: [positiveInteger, 300],
    // Challenge::WhackAZombieSpawning: mPhaseCounter = 50, Zombie::RiseFromGrave's 150-tick rise cut short.
    riseTicks: [positiveInteger, 50],
    // Challenge::MouseDownWhackAZombie: a circle of 45, 20 above the click; TakeHelmDamage(900).
    hammerRadius: [positiveFinite, 45], hammerDamage: [positiveInteger, 900],
} satisfies Record<string, readonly [Parse, number]>
type WhackNumber = keyof typeof NUMBERS

/** Challenge::WhackAZombieSpawning's chances out of 100 in each of its phases: a group of 2 or 3, and a pail or cone zombie. */
const CHANCES = {
    double: [0, 30, 10, 10, 15, 18], triple: [0, 0, 0, 0, 10, 13], pail: [0, 0, 0, 10, 15, 15], cone: [0, 0, 30, 30, 30, 30],
}
type WhackChance = keyof typeof CHANCES
/** Challenge::WhackAZombieSpawning's phases: aPhase is clamped to 0-5. */
const PHASES = 6

/**
 * `rules: {kind: "pvz:whack-a-zombie", count, zombies, sun, ...}` (Challenge::WhackAZombieSpawning): zombies rise from
 * graves. `zombies` are the plain, cone and pail zombies the groups pick from, and `sun` the item a whacked zombie may
 * drop three of; the level may also write any of NUMBERS and of the `chances` (CHANCES), each a list of the phases'.
 */
interface WhackSettings extends Record<WhackNumber, number> {
    chances: Record<WhackChance, number[]>
    zombies: { plain: string; cone: string; pail: string }
    sun: string
}

/**
 * mChallengeStateCounter to the next group, and whether the empty cursor is the mallet. mZombieCountDown is the waves'
 * own `nextWaveAtTick`, unset once the final group has risen.
 */
interface WhackState { groupTicks: number; hammer: boolean }

const parsed = new WeakMap<LevelRule, WhackSettings>()

function parseSettings(rule: LevelRule, name: string): WhackSettings {
    const numbers = Object.keys(NUMBERS) as WhackNumber[], chanceKeys = Object.keys(CHANCES) as WhackChance[]
    const source = exact(rule.settings, ['zombies', 'sun'], name, [...numbers, 'chances'])
    const types = exact(source.zombies, ['plain', 'cone', 'pail'], `${name}.zombies`)
    const written = source.chances === undefined ? {} : exact(source.chances, [], `${name}.chances`, chanceKeys)
    const chances = Object.fromEntries(chanceKeys.map(key => {
        if (written[key] === undefined) return [key, CHANCES[key]]
        const phases = array(written[key], `${name}.chances.${key}`)
        if (phases.length !== PHASES) throw new TypeError(`${name}.chances.${key} must have a chance for each of the ${PHASES} phases`)
        return [key, phases.map((chance, phase) => integerInRange(chance, 0, 100, `${name}.chances.${key}[${phase}]`))]
    })) as WhackSettings['chances']
    for (let phase = 0; phase < PHASES; phase++) {
        if (chances.triple[phase] + chances.double[phase] > 100 || chances.pail[phase] + chances.cone[phase] > 100) {
            throw new TypeError(`${name}.chances must add up to at most 100 in phase ${phase}`)
        }
    }
    return {
        ...Object.fromEntries(numbers.map(key => {
            const [parse, original] = NUMBERS[key]
            return [key, source[key] === undefined ? original : parse(source[key], `${name}.${key}`)]
        })) as Record<WhackNumber, number>,
        chances,
        zombies: Object.fromEntries((['plain', 'cone', 'pail'] as const).map(key => [key, nonEmptyString(types[key], `${name}.zombies.${key}`)])) as WhackSettings['zombies'],
        sun: nonEmptyString(source.sun, `${name}.sun`),
    }
}

function whackSettings(rule: LevelRule): WhackSettings {
    let settings = parsed.get(rule)
    if (!settings) parsed.set(rule, settings = parseSettings(rule, 'rules'))
    return settings
}

function whackState(world: World): WhackState {
    return world.resources.get(WaveResource).ruleState as unknown as WhackState
}

function awardDropped(world: World): boolean {
    return world.resources.get(LevelStateResource).result !== 'playing' || levelAwardDropped(world)
}

/** The mallet is the player's, on the plants' side: it only meets what is hostile to that. */
const HAMMER_TEAM: Team = 'plants'

/**
 * Challenge::WhackAZombiePlaceGraves: graves on random free cells from the level's first grave column, strongly
 * preferring empty ones, each put down as any grave is (placeGrave): the plant holding the cell dies and a rolling nut
 * rolls on, where the original kills every plant whose mPlantCol and row are the cell's. Graves added during play rise
 * from `riseAtTick`.
 */
function placeWhackGraves(world: World, definitions: GameplayDefinitions, count: number, riseAtTick?: number): void {
    const { definition, board } = world.resources.get(LevelStateResource)
    const graves = lawnGraves(world).map(({ grave }) => grave)
    const plants = [...plantsInPlay(world)]
    const plantsAt = (row: number, column: number) => plants.filter(plant => plant.position.row === row && plant.column === column).map(plant => plant.id)
    const picks: Array<{ row: number; column: number; weight: number }> = []
    for (let column = whackSettings(definition.rules!).firstGraveColumn; column < board.columns; column++) {
        for (const row of definition.activeRows) {
            // Board::CanAddGraveStoneAt: not on a grave nor a crater.
            if (graves.some(grave => grave.row === row && grave.column === column) || craterAt(gridItems(world), row, column)) continue
            picks.push({ row, column, weight: plantsAt(row, column).length ? 1 : 100000 })
        }
    }
    const random = world.resources.get(RandomResource)
    for (let index = Math.min(count, picks.length); index > 0; index--) {
        const pick = pickWeighted(picks, random)
        placeGrave(world, definitions, pick.row, pick.column, riseAtTick)
        pick.weight = 0
    }
}

/**
 * Challenge::WhackAZombieSpawning: each wave lasts `waveTicks`; groups of zombies rise from graves until `spawnCutoffTicks`
 * before the next, sooner and faster as the waves go on, and graves are topped up `refillTicks` before a wave.
 */
function createWhackSystem(definitions: GameplayDefinitions): GameSystem {
    return {
        id: 'pvz:whack-a-zombie',
        run({ world, tick, commands }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result !== 'playing' || level.paused) return
            const rules = whackSettings(level.definition.rules!)
            const waves = world.resources.get(WaveResource)
            const state = whackState(world)
            // The waves' mZombieCountDown, counted down by the gameplay ticks: none once the final group has risen.
            if (waves.nextWaveAtTick === undefined) return
            const countdown = waves.nextWaveAtTick - tick
            if (countdown === rules.refillTicks && waves.index > 0) {
                placeWhackGraves(world, definitions, Math.max(1, rules.refillGraves - lawnGraves(world).length), tick)
            }
            // Board::NextWaveComing, whose siren goes before the last wave here.
            if (countdown <= 5) nextWaveComing(world, waves.index === waves.plan.length - 1)
            if (countdown <= 0) {
                waves.nextWaveAtTick = tick + rules.waveTicks
                if (waves.index < waves.plan.length) waves.index++
                state.groupTicks = waves.index === waves.plan.length ? rules.finalGroupDelayTicks : 1
            } else if (countdown < rules.spawnCutoffTicks) return
            if (--state.groupTicks !== 0) return
            raiseGroup(world, definitions, commands)
        },
    }
}

function raiseGroup(world: World, definitions: GameplayDefinitions, remover: EntityRemover): void {
    const { definition } = world.resources.get(LevelStateResource)
    const { zombies, chances, finalGroup, riseTicks } = whackSettings(definition.rules!)
    const waves = world.resources.get(WaveResource)
    const state = whackState(world)
    const random = world.resources.get(RandomResource)
    const wave = waves.index
    const final = wave === waves.plan.length
    const phase = Math.min(PHASES - 1, Math.max(0, Math.trunc((wave - 1) * 6 / 12)))
    const numberHit = random.integer(0, 99), typeHit = random.integer(0, 99)
    let count = final ? finalGroup : numberHit < chances.triple[phase] ? 3 : numberHit < chances.triple[phase] + chances.double[phase] ? 2 : 1
    let typeId = typeHit < chances.pail[phase] && count < 3 ? zombies.pail
        : typeHit < chances.pail[phase] + chances.cone[phase] ? zombies.cone : zombies.plain
    // A grave a grave buster is eating raises nothing.
    const plants = [...plantsInPlay(world)]
    const graves = lawnGraves(world).map(({ grave }) => grave).filter(grave => !plants.some(plant => plant.position.row === grave.row
        && plant.column === grave.column && definitions.plants[plant.typeId].graveBuster))
    let maxSpeed = animateCurve(1, 12, wave, 1, 3, 'ease-in')
    count = Math.min(count, graves.length)
    for (let index = 0; index < count; index++) {
        const [grave] = graves.splice(random.integer(0, graves.length - 1), 1)
        if (final) {
            typeId = random.integer(0, 1) === 0 ? zombies.cone : zombies.pail
            maxSpeed = 2
        }
        const zombie = world.zombies.get(raiseZombieFromGrave(world, definitions, grave, typeId, riseTicks))!
        zombie.speedPerTick = 0.5 + random.nextFloat() * (maxSpeed - 0.5)
        startWalk(zombie, definitions.zombies[typeId], zombie.walkClip, random)
    }
    state.groupTicks = random.integer(animateCurve(1, 12, wave, 100, 30), animateCurve(1, 12, wave, 200, 60))
    if (final) {
        waves.nextWaveAtTick = undefined
        state.groupTicks = 0
        // The award comes from the last zombie to go. With every grave being eaten no zombie rose, and with none left
        // on the lawn either there is none to go: the award drops now, which the original never does (it stays stuck).
        tryDropLevelAward(world, definitions, remover)
    }
}

/**
 * Challenge::MouseDownWhackAZombie: the mallet hits the front one under it of the other side's zombies and plants, and
 * passes over its own side's. A helm takes `hammerDamage` (900) and only the helm, as in the original, whatever shield
 * is held. A bare zombie with no more health than that dies at once with its loot (`killed`, the POW), and the cursor is
 * cleared (Board::ClearCursor): every zombie of the original, which kills any. One with more only takes the blow, past
 * its shield. A plant, which the original's mallet never meets, takes the blow the same way.
 */
function whackAt(world: World, definitions: GameplayDefinitions, x: number, y: number, remover: EntityRemover): void {
    const { hammerRadius, hammerDamage } = whackSettings(world.resources.get(LevelStateResource).definition.rules!)
    // Lower rows draw in front; within a row a zombie is over a plant, and the later of two alike over the earlier.
    let top: { entity: number; row: number; plant?: true } | undefined
    const reached = (position: { x: number; y: number }, body: { x: number; y: number; width: number; height: number }) =>
        circleRectOverlap(x, y - 20, hammerRadius, { x: position.x + body.x, y: position.y + body.y, width: body.width, height: body.height })
    for (const plant of plantsInPlay(world)) {
        const { id: entity, position } = plant
        if (!isHostile(plantTeam(plant), HAMMER_TEAM) || !reached(position, plantFacingRect(definitions.plants[plant.typeId].body, plantTeam(plant)))) continue
        if (!top || position.row >= top.row) top = { entity, row: position.row, plant: true }
    }
    for (const zombie of world.zombies) {
        if (isDeadOrDying(zombie) || !isHostile(zombieTeam(zombie), HAMMER_TEAM)) continue
        const { id: entity, position } = zombie
        if (!reached(position, definitions.zombies[zombie.typeId].body)) continue
        if (!top || position.row >= top.row) top = { entity, row: position.row }
    }
    if (!top) return
    const events = world.resources.get(EventQueueResource)
    if (top.plant) {
        damagePlant(world, definitions, top.entity, hammerDamage, remover)
        // What is left says whether the blow ended it: a plant kept from harm (`/plantinvincible`) is not.
        const left = plantInPlay(world, top.entity), killed = !left || left.health === 0
        emitServerEvent(events, 'plantWhacked', { plantId: top.entity, x, y, ...(killed ? { killed } : {}) })
        return
    }
    const zombie = world.zombies.get(top.entity)!
    if (zombie.helmHealth > 0) {
        emitServerEvent(events, 'zombieWhacked', { entityId: top.entity, x, y, helm: definitions.zombies[zombie.typeId].helm!.type })
        damageZombie(world, definitions, top.entity, hammerDamage, { helmOnly: true }, remover)
        return
    }
    if (zombie.health > hammerDamage) {
        emitServerEvent(events, 'zombieWhacked', { entityId: top.entity, x, y })
        damageZombie(world, definitions, top.entity, hammerDamage, { bypassShield: true }, remover)
        return
    }
    emitServerEvent(events, 'zombieWhacked', { entityId: top.entity, x, y, killed: true })
    destroyZombie(world, definitions, top.entity, remover)
    // Challenge::ClearCursor puts the mallet away for good once this blow has dropped the award.
    clearCursor(world)
}

/** Whack-a-Zombie (LawnApp::IsWhackAZombieLevel): zombies rise from graves and the mallet is the cursor. */
export const whackAZombieRule: LevelRuleDefinition = {
    validate(rule, level, definitions, name) {
        const settings = parseSettings(rule, name)
        for (const [key, id] of Object.entries(settings.zombies)) {
            if (!definitions.zombies[id]) throw new Error(`${name}.zombies.${key}: unknown zombie ${id}`)
        }
        if (!definitions.items[settings.sun]) throw new Error(`${name}.sun: unknown item ${settings.sun}`)
        if (level.firstWaveTicks === undefined) throw new Error(`${name} needs the level's firstWaveTicks`)
        if (settings.firstGraveColumn >= definitions.boards[level.board].columns) throw new Error(`${name} does not fit the lawn`)
        // A wave has room for groups, its refill comes within it, and the final group rises before the cutoff (else the
        // level never ends).
        const { waveTicks, spawnCutoffTicks, refillTicks, finalGroupDelayTicks } = settings
        if (waveTicks <= spawnCutoffTicks || refillTicks >= waveTicks || finalGroupDelayTicks > waveTicks - spawnCutoffTicks + 1) {
            throw new Error(`${name} does not fit its waves`)
        }
    },
    /** Board::InitZombieWaves sets 8 waves, each without planned zombies: the groups rise while the wave runs. */
    draft(rule) { return Array.from({ length: rule.count }, () => ({ zombies: [], points: 0 })) },
    systems: definitions => [{ phase: 'spawn', system: createWhackSystem(definitions) }],
    spawnsZombies: true,
    /**
     * Board::InitLevel and Challenge::StartLevel: the opening graves. The first wave's countdown is the level's
     * `firstWaveTicks`, as the waves have it.
     */
    initialize(world, definitions) {
        const level = world.resources.get(LevelStateResource).definition
        for (const { entity } of lawnGraves(world)) world.destroyEntity(entity)
        placeWhackGraves(world, definitions, whackSettings(level.rules!).graves)
        const state: WhackState = { groupTicks: 0, hammer: true }
        world.resources.get(WaveResource).ruleState = { ...state }
    },
    parseState(value) {
        const state = exact(value, ['groupTicks', 'hammer'], 'Whack-a-Zombie state')
        return { groupTicks: integer(state.groupTicks, 'Whack-a-Zombie state.groupTicks'), hammer: boolean(state.hammer, 'Whack-a-Zombie state.hammer') }
    },
    snapshot(world) { return { hammer: whackState(world).hammer } },
    boardClick(session, x, y) {
        if (!whackState(session.world).hammer) return 'unsupported-command'
        whackAt(session.world, session.definitions, x, y, session.world)
        return undefined
    },
    /** Challenge::ClearCursor: the emptied cursor is the mallet again only until the level award has dropped. */
    cursorCleared(world) { if (awardDropped(world)) whackState(world).hammer = false },
    dropsRefusedSeeds: true,
    /** Board::DropLootPiece: a roll just past the silver coins drops three suns instead, less often the more sun there is. */
    dropLoot(world, definitions, x, y, roll, factor) {
        const sun = world.resources.get(EconomyStateResource).sun, maximum = sun > 500 ? 2800 : sun > 350 ? 3100 : sun > 200 ? 3700 : 5000
        if (roll < 2500 * factor || roll > maximum * factor) return false
        emitServerEvent(world.resources.get(EventQueueResource), 'sunDropped', {})
        const item = whackSettings(world.resources.get(LevelStateResource).definition.rules!).sun
        for (const offset of [20, 40, 60]) spawnLoot(world, definitions, world, item, x - offset, y)
        return true
    },
    /** Not before the final group has risen (mZombieCountDown back at 0, the waves' countdown unset). */
    holdsAward(world) { return world.resources.get(WaveResource).nextWaveAtTick !== undefined },
}
