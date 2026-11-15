import { boolean, exact, integer, nonEmptyString, nonNegativeInteger, positiveInteger } from '@/shared/validate'
import type { GameSystem, World } from '@/ecs/index'
import type { GameplayDefinitions, LevelRule } from '@/shared/content/gameplay'
import { type EntityRemover, EconomyStateResource, LevelStateResource, PlantComponent, PositionComponent, RandomResource, ZombieComponent } from '../state/components'
import { WaveResource } from '../state/levelState'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { startWalk } from '../zombies/animation'
import { damageZombie, destroyZombie } from '../zombies/damage'
import { damagePlant } from '../plants/damage'
import { isHostile, plantFacingRect, plantTeam, zombieTeam } from '@/shared/content/teams'
import { isDeadOrDying } from '@/shared/content/zombieStates'
import type { Team } from '@/shared/protocol'
import { pickWeighted } from '@/shared/random'
import { circleRectOverlap } from '../combat/collision'
import { graves as lawnGraves, placeGrave, raiseZombieFromGrave } from '../level/graves'
import { spawnLoot } from '../level/loot'
import { levelAwardDropped, tryDropLevelAward } from '../level/levelAward'
import { nextWaveComing } from '../level/waves'
import { clearCursor } from '../seeds/cursor'
import type { LevelRuleDefinition } from './registry'

/**
 * `rules: {kind: "pvz:whack-a-zombie", count, ...}` (Challenge::WhackAZombieSpawning): zombies rise from graves,
 * `graves` of them placed from `firstGraveColumn` on at the start and topped up to `refillGraves` before each later
 * wave; the first wave comes the level's `firstWaveTicks` in (Challenge::StartLevel) and the next ones `waveTicks` apart. `zombies` are the plain, cone and
 * pail zombies the groups pick from, and `sun` the item a whacked zombie may drop three of.
 */
interface WhackSettings {
    graves: number; refillGraves: number; firstGraveColumn: number; waveTicks: number
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
    const source = exact(rule.settings, ['graves', 'refillGraves', 'firstGraveColumn', 'waveTicks', 'zombies', 'sun'], name)
    const types = exact(source.zombies, ['plain', 'cone', 'pail'], `${name}.zombies`)
    return {
        graves: positiveInteger(source.graves, `${name}.graves`), refillGraves: positiveInteger(source.refillGraves, `${name}.refillGraves`),
        firstGraveColumn: nonNegativeInteger(source.firstGraveColumn, `${name}.firstGraveColumn`),
        waveTicks: positiveInteger(source.waveTicks, `${name}.waveTicks`),
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

/** Challenge::WhackAZombieSpawning's chances out of 100 per phase: 2 or 3 zombies, and a pail or cone zombie. */
const DOUBLE_CHANCE = [0, 30, 10, 10, 15, 18]
const TRIPLE_CHANCE = [0, 0, 0, 0, 10, 13]
const PAIL_CHANCE = [0, 0, 0, 10, 15, 15]
const CONE_CHANCE = [0, 0, 30, 30, 30, 30]
/** The final wave raises this many zombies at once, all cone or pail zombies at speed up to 2. */
const FINAL_GROUP = 20
/** The final wave's group comes this long after it starts; earlier waves start at once. */
const FINAL_GROUP_DELAY = 300
/** Groups only spawn while the next wave is at least this far away. */
const SPAWN_CUTOFF = 300
/** Zombie::RiseFromGrave's 150-tick rise, cut to 50 on this level. */
const RISE_TICKS = 50
/** Challenge::MouseDownWhackAZombie: the mallet hits a circle of this radius, 20 above the click. */
const HAMMER_RADIUS = 45
/** What a blow takes: off a helm (Zombie::TakeHelmDamage), and off a body or a plant that has more than it. */
const HAMMER_DAMAGE = 900
/** The mallet is the player's, on the plants' side: it only meets what is hostile to that. */
const HAMMER_TEAM: Team = 'plants'

/** PvzpAnimateCurve on ints: the clamped linear or quadratic ease-in curve, rounded half away from zero. */
function animateCurve(start: number, end: number, age: number, from: number, to: number, easeIn = false): number {
    let time = Math.min(1, Math.max(0, (age - start) / (end - start)))
    if (easeIn) time *= time
    const value = from + (to - from) * time
    return value > 0 ? Math.trunc(value + 0.5) : Math.trunc(value - 0.5)
}

/**
 * Challenge::WhackAZombiePlaceGraves: graves on random free cells from the level's first grave column, strongly
 * preferring empty ones, each put down as any grave is (placeGrave): the plant holding the cell dies and a rolling nut
 * rolls on, where the original kills every plant whose mPlantCol and row are the cell's. Graves added during play rise
 * from `riseAtTick`.
 */
function placeWhackGraves(world: World, definitions: GameplayDefinitions, count: number, riseAtTick?: number): void {
    const { definition, board } = world.resources.get(LevelStateResource)
    const graves = lawnGraves(world).map(({ grave }) => grave)
    const plants = [...world.query(PositionComponent, PlantComponent)]
    const plantsAt = (row: number, column: number) => plants.filter(entity =>
        world.get(entity, PositionComponent)!.row === row && world.get(entity, PlantComponent)!.column === column)
    const picks: Array<{ row: number; column: number; weight: number }> = []
    for (let column = whackSettings(definition.rules!).firstGraveColumn; column < board.columns; column++) {
        for (const row of definition.activeRows) {
            if (graves.some(grave => grave.row === row && grave.column === column)) continue
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
 * Challenge::WhackAZombieSpawning: each wave lasts `waveTicks`; groups of zombies rise from graves until 300 ticks
 * before the next, sooner and faster as the waves go on, and graves are topped up 100 ticks before a wave.
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
            if (countdown === 100 && waves.index > 0) {
                placeWhackGraves(world, definitions, Math.max(1, rules.refillGraves - lawnGraves(world).length), tick)
            }
            // Board::NextWaveComing, whose siren goes before the last wave here.
            if (countdown <= 5) nextWaveComing(world, waves.index === waves.plan.length - 1)
            if (countdown <= 0) {
                waves.nextWaveAtTick = tick + rules.waveTicks
                if (waves.index < waves.plan.length) waves.index++
                state.groupTicks = waves.index === waves.plan.length ? FINAL_GROUP_DELAY : 1
            } else if (countdown < SPAWN_CUTOFF) return
            if (--state.groupTicks !== 0) return
            raiseGroup(world, definitions, commands)
        },
    }
}

function raiseGroup(world: World, definitions: GameplayDefinitions, remover: EntityRemover): void {
    const { definition } = world.resources.get(LevelStateResource)
    const zombies = whackSettings(definition.rules!).zombies
    const waves = world.resources.get(WaveResource)
    const state = whackState(world)
    const random = world.resources.get(RandomResource)
    const wave = waves.index
    const final = wave === waves.plan.length
    const phase = Math.min(5, Math.max(0, Math.trunc((wave - 1) * 6 / 12)))
    const numberHit = random.integer(0, 99), typeHit = random.integer(0, 99)
    let count = final ? FINAL_GROUP : numberHit < TRIPLE_CHANCE[phase] ? 3 : numberHit < TRIPLE_CHANCE[phase] + DOUBLE_CHANCE[phase] ? 2 : 1
    let typeId = typeHit < PAIL_CHANCE[phase] && count < 3 ? zombies.pail
        : typeHit < PAIL_CHANCE[phase] + CONE_CHANCE[phase] ? zombies.cone : zombies.plain
    // A grave a grave buster is eating raises nothing.
    const plants = [...world.query(PositionComponent, PlantComponent)]
    const graves = lawnGraves(world).map(({ grave }) => grave).filter(grave => !plants.some(entity => world.get(entity, PositionComponent)!.row === grave.row
        && world.get(entity, PlantComponent)!.column === grave.column && definitions.plants[world.get(entity, PlantComponent)!.typeId].graveBuster))
    let maxSpeed = animateCurve(1, 12, wave, 1, 3, true)
    count = Math.min(count, graves.length)
    for (let index = 0; index < count; index++) {
        const [grave] = graves.splice(random.integer(0, graves.length - 1), 1)
        if (final) {
            typeId = random.integer(0, 1) === 0 ? zombies.cone : zombies.pail
            maxSpeed = 2
        }
        const zombie = world.get(raiseZombieFromGrave(world, definitions, grave, typeId, RISE_TICKS), ZombieComponent)!
        zombie.speedPerTick = 0.5 + random.nextFloat() * (maxSpeed - 0.5)
        startWalk(zombie, definitions.zombies[typeId].animation, zombie.walkClip, random)
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
 * passes over its own side's. A helm takes 900 damage and only the helm, as in the original, whatever shield is held.
 * A bare zombie with no more health than that dies at once with its loot (`killed`, the POW), and the cursor is
 * cleared (Board::ClearCursor): every zombie of the original, which kills any. One with more only takes the 900, past
 * its shield. A plant, which the original's mallet never meets, takes the 900 the same way.
 */
function whackAt(world: World, definitions: GameplayDefinitions, x: number, y: number, remover: EntityRemover): void {
    // Lower rows draw in front; within a row a zombie is over a plant, and the later of two alike over the earlier.
    let top: { entity: number; row: number; plant?: true } | undefined
    const reached = (position: { x: number; y: number }, body: { x: number; y: number; width: number; height: number }) =>
        circleRectOverlap(x, y - 20, HAMMER_RADIUS, { x: position.x + body.x, y: position.y + body.y, width: body.width, height: body.height })
    for (const entity of world.query(PositionComponent, PlantComponent)) {
        const plant = world.get(entity, PlantComponent)!, position = world.get(entity, PositionComponent)!
        if (!isHostile(plantTeam(plant), HAMMER_TEAM) || !reached(position, plantFacingRect(definitions.plants[plant.typeId].body, plantTeam(plant)))) continue
        if (!top || position.row >= top.row) top = { entity, row: position.row, plant: true }
    }
    for (const entity of world.query(PositionComponent, ZombieComponent)) {
        const zombie = world.get(entity, ZombieComponent)!
        if (isDeadOrDying(zombie) || !isHostile(zombieTeam(zombie), HAMMER_TEAM)) continue
        const position = world.get(entity, PositionComponent)!
        if (!reached(position, definitions.zombies[zombie.typeId].body)) continue
        if (!top || position.row >= top.row) top = { entity, row: position.row }
    }
    if (!top) return
    const events = world.resources.get(EventQueueResource)
    if (top.plant) {
        damagePlant(world, definitions, top.entity, HAMMER_DAMAGE, remover)
        // What is left says whether the blow ended it: a plant kept from harm (`/plantinvincible`) is not.
        const left = world.get(top.entity, PlantComponent), killed = !left || left.health === 0
        emitServerEvent(events, 'plantWhacked', { plantId: top.entity, x, y, ...(killed ? { killed } : {}) })
        return
    }
    const zombie = world.get(top.entity, ZombieComponent)!
    if (zombie.helmHealth > 0) {
        emitServerEvent(events, 'zombieWhacked', { entityId: top.entity, x, y, helm: definitions.zombies[zombie.typeId].helm?.type ?? 'cone' })
        damageZombie(world, definitions, top.entity, HAMMER_DAMAGE, { helmOnly: true }, remover)
        return
    }
    if (zombie.health > HAMMER_DAMAGE) {
        emitServerEvent(events, 'zombieWhacked', { entityId: top.entity, x, y })
        damageZombie(world, definitions, top.entity, HAMMER_DAMAGE, { bypassShield: true }, remover)
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
        if (settings.firstGraveColumn >= definitions.boards[level.board].columns || settings.waveTicks <= SPAWN_CUTOFF) {
            throw new Error(`${name} does not fit the lawn`)
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
