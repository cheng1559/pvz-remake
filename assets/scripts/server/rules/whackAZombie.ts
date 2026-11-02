import type { GameSystem, World } from '@/ecs/index'
import type { GameplayDefinitions, LevelRule } from '@/shared/content/gameplay'
import { type EntityRemover, EconomyStateResource, LevelStateResource, PlantComponent, PositionComponent, RandomResource, ZombieComponent } from '../state/components'
import { ItemComponent, WaveResource } from '../state/levelState'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { spawnZombie } from '../zombies/spawn'
import { walkAnimationSpeed, zombieGait } from '../zombies/animation'
import { damageZombie, destroyZombie } from '../zombies/damage'
import { circleRectOverlap } from '../combat/collision'
import { createGrave } from '../level/graves'
import { spawnLoot } from '../level/loot'
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

/** mZombieCountDown to the next wave, mChallengeStateCounter to the next group, and whether the empty cursor is the mallet. */
interface WhackState { countdown: number; groupTicks: number; hammer: boolean }

const parsed = new WeakMap<LevelRule, WhackSettings>()

function parseSettings(rule: LevelRule, name: string): WhackSettings {
    const source = rule.settings
    const keys = ['graves', 'refillGraves', 'firstGraveColumn', 'waveTicks', 'zombies', 'sun']
    for (const key of Object.keys(source)) if (!keys.includes(key)) throw new Error(`${name}.${key} is not supported`)
    const integer = (key: string, minimum: number) => {
        const value = source[key]
        if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new Error(`${name}.${key} must be an integer of at least ${minimum}`)
        return value
    }
    const id = (value: unknown, field: string) => {
        if (typeof value !== 'string' || !value) throw new Error(`${field} must be an ID`)
        return value
    }
    const zombies = source.zombies
    if (typeof zombies !== 'object' || zombies === null || Array.isArray(zombies)) throw new Error(`${name}.zombies must be an object`)
    const types = zombies as Record<string, unknown>
    if (Object.keys(types).sort().join() !== 'cone,pail,plain') throw new Error(`${name}.zombies needs plain, cone and pail`)
    return {
        graves: integer('graves', 1), refillGraves: integer('refillGraves', 1), firstGraveColumn: integer('firstGraveColumn', 0),
        waveTicks: integer('waveTicks', 1),
        zombies: { plain: id(types.plain, `${name}.zombies.plain`), cone: id(types.cone, `${name}.zombies.cone`), pail: id(types.pail, `${name}.zombies.pail`) },
        sun: id(source.sun, `${name}.sun`),
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
    const level = world.resources.get(LevelStateResource)
    return level.result !== 'playing' ||
        [...world.query(ItemComponent)].some(entity => world.get(entity, ItemComponent)!.typeId === level.definition.award.id)
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
const HAMMER_HELM_DAMAGE = 900

/** PvzpAnimateCurve on ints: the clamped linear or quadratic ease-in curve, rounded half away from zero. */
function animateCurve(start: number, end: number, age: number, from: number, to: number, easeIn = false): number {
    let time = Math.min(1, Math.max(0, (age - start) / (end - start)))
    if (easeIn) time *= time
    const value = from + (to - from) * time
    return value > 0 ? Math.trunc(value + 0.5) : Math.trunc(value - 0.5)
}

/**
 * Challenge::WhackAZombiePlaceGraves: graves on random free cells from the level's first grave column, strongly
 * preferring empty ones; a plant on a picked cell dies. Graves added during play rise from `riseAtTick`.
 */
function placeWhackGraves(world: World, count: number, riseAtTick?: number): void {
    const { definition, board } = world.resources.get(LevelStateResource)
    const waves = world.resources.get(WaveResource)
    const graves = waves.graves ??= []
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
        let roll = random.integer(0, picks.reduce((sum, pick) => sum + pick.weight, 0) - 1)
        const pick = picks.find(entry => (roll -= entry.weight) < 0)!
        for (const entity of plantsAt(pick.row, pick.column)) if (world.hasEntity(entity)) world.destroyEntity(entity)
        graves.push({ ...createGrave(world, pick.row, pick.column), ...(riseAtTick === undefined ? {} : { riseAtTick }) })
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
        run({ world, tick }) {
            const level = world.resources.get(LevelStateResource)
            if (level.result !== 'playing' || level.paused) return
            const rules = whackSettings(level.definition.rules!)
            const waves = world.resources.get(WaveResource)
            const state = whackState(world)
            if (waves.index === waves.plan.length && state.countdown === 0) return
            const events = world.resources.get(EventQueueResource)
            state.countdown--
            if (state.countdown === 100 && waves.index > 0) {
                placeWhackGraves(world, Math.max(1, rules.refillGraves - (waves.graves?.length ?? 0)), tick)
            }
            if (state.countdown === 5) {
                // Board::NextWaveComing: the final wave's banner; the awooga first, the siren before the last wave.
                if (waves.index + 1 === waves.plan.length) {
                    waves.finalWaveAnnounced = true
                    emitServerEvent(events, 'finalWave', {})
                }
                emitServerEvent(events, 'nextWaveComing', {
                    ...(waves.index === 0 ? { first: true } : {}),
                    ...(waves.index === waves.plan.length - 1 ? { siren: true } : {}),
                })
            }
            if (state.countdown === 0) {
                state.countdown = rules.waveTicks
                if (waves.index < waves.plan.length) waves.index++
                state.groupTicks = waves.index === waves.plan.length ? FINAL_GROUP_DELAY : 1
            } else if (state.countdown < SPAWN_CUTOFF) return
            if (--state.groupTicks !== 0) return
            raiseGroup(world, definitions)
        },
    }
}

function raiseGroup(world: World, definitions: GameplayDefinitions): void {
    const { definition, board } = world.resources.get(LevelStateResource)
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
    const graves = (waves.graves ?? []).filter(grave => !plants.some(entity => world.get(entity, PositionComponent)!.row === grave.row
        && world.get(entity, PlantComponent)!.column === grave.column && definitions.plants[world.get(entity, PlantComponent)!.typeId].graveBuster))
    let maxSpeed = animateCurve(1, 12, wave, 1, 3, true)
    count = Math.min(count, graves.length)
    const events = world.resources.get(EventQueueResource)
    for (let index = 0; index < count; index++) {
        const [grave] = graves.splice(random.integer(0, graves.length - 1), 1)
        if (final) {
            typeId = random.integer(0, 1) === 0 ? zombies.cone : zombies.pail
            maxSpeed = 2
        }
        const entityId = spawnZombie(world, definitions, typeId, grave.row,
            board.origin.x + grave.column * board.cell.width - 25,
            board.origin.y + grave.row * board.cell.height - 30)
        const zombie = world.get(entityId, ZombieComponent)!
        zombie.riseTicks = RISE_TICKS
        zombie.speedPerTick = 0.5 + random.nextFloat() * (maxSpeed - 0.5)
        zombie.animationSpeed = walkAnimationSpeed(zombie.speedPerTick, zombieGait(definitions.zombies[typeId], definitions).walkGround)
        emitServerEvent(events, 'zombieRoseFromGrave', { entityId, row: grave.row })
    }
    state.groupTicks = random.integer(animateCurve(1, 12, wave, 100, 30), animateCurve(1, 12, wave, 200, 60))
    if (final) {
        state.countdown = 0
        state.groupTicks = 0
    }
}

/**
 * Challenge::MouseDownWhackAZombie: the mallet hits the front zombie under it. A helm takes 900 damage and only the
 * helm; a bare zombie dies at once with its loot, and the cursor is cleared (Board::ClearCursor).
 */
function whackAt(world: World, definitions: GameplayDefinitions, x: number, y: number, remover: EntityRemover): void {
    let top: { entity: number; row: number } | undefined
    for (const entity of world.query(PositionComponent, ZombieComponent)) {
        const zombie = world.get(entity, ZombieComponent)!
        if (zombie.state === 'dying' || zombie.state === 'burned' || zombie.state === 'mowered') continue
        const position = world.get(entity, PositionComponent)!
        const body = definitions.zombies[zombie.typeId].body
        if (!circleRectOverlap(x, y - 20, HAMMER_RADIUS, { x: position.x + body.x, y: position.y + body.y, width: body.width, height: body.height })) continue
        // Lower rows draw in front; within a row the later zombie does.
        if (!top || position.row >= top.row) top = { entity, row: position.row }
    }
    if (!top) return
    const zombie = world.get(top.entity, ZombieComponent)!
    const events = world.resources.get(EventQueueResource)
    if (zombie.helmHealth > 0) {
        emitServerEvent(events, 'zombieWhacked', { entityId: top.entity, x, y, helm: definitions.zombies[zombie.typeId].helm?.type ?? 'cone' })
        damageZombie(world, definitions, top.entity, HAMMER_HELM_DAMAGE, { helmOnly: true }, remover)
        return
    }
    emitServerEvent(events, 'zombieWhacked', { entityId: top.entity, x, y })
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
    /** Board::InitLevel and Challenge::StartLevel: the opening graves, and the first wave's countdown. */
    initialize(world) {
        const level = world.resources.get(LevelStateResource).definition
        const waves = world.resources.get(WaveResource)
        waves.graves = []
        placeWhackGraves(world, whackSettings(level.rules!).graves)
        // The rule counts mZombieCountDown itself; the wave system's countdown stays unset.
        waves.nextWaveAtTick = undefined
        const state: WhackState = { countdown: level.firstWaveTicks!, groupTicks: 0, hammer: true }
        waves.ruleState = { ...state }
    },
    parseState(value) {
        const { countdown, groupTicks, hammer, ...rest } = value
        if (Object.keys(rest).length || !Number.isSafeInteger(countdown) || (countdown as number) < 0 || !Number.isSafeInteger(groupTicks) ||
            typeof hammer !== 'boolean') throw new Error('Invalid Whack-a-Zombie state')
        return { countdown, groupTicks, hammer }
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
    /** Not before the final group has risen (mZombieCountDown back at 0). */
    holdsAward(world) { return whackState(world).countdown > 0 },
}
