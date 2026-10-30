import { Schedule, World } from '@/ecs/index'
import type { GameplayDefinitions, GameplayLevels } from '@/shared/content/gameplay'
import type { DebugCliResult } from '@/shared/debug/DebugCli'
import type { EnabledMod, GameCommand, StartSessionPacket } from '@/shared/protocol/index'
import { DeterministicRng } from '../state/DeterministicRng'
import type { GameplayRegistry } from '../registry/GameplayRegistry'
import { processCommandPhase } from './commands'
import { EconomyStateResource, LawnMowerComponent, LevelStateResource, MAX_SUN, PositionComponent, RandomResource, SeedBankResource } from '../state/components'
import { createConveyorSystem } from '../level/conveyor'
import { EventQueueResource, createEventQueue } from '../state/events'
import { createItemSystem } from '../level/items'
import { createLevelProgressSystem, initializeLevel } from '../level/level'
import { TutorialResource } from '../state/levelState'
import { createMowerSystem } from '../level/mower'
import { planting } from '../seeds/planting'
import { createPlantAbilitySystem } from '../plants/abilities'
import { createProductionSystem } from '../plants/production'
import { createPeashooterSystem } from '../plants/shooter'
import { createProjectileSystem } from '../combat/projectiles'
import { createWaveSystem } from '../level/waves'
import { createZombieGroanSystem } from '../zombies/groans'
import { ZombieBehaviorsResource } from '../zombies/behaviors'
import { createZombieSystem } from '../zombies/system'

export type CommandRejectionCode =
    | 'game-not-playing'
    | 'game-paused'
    | 'seed-not-available'
    | 'seed-not-ready'
    | 'not-enough-sun'
    | 'no-seed-selected'
    | 'row-not-active'
    | 'column-out-of-range'
    | 'cell-occupied'
    | 'cell-has-grave'
    | 'cell-needs-grave'
    | 'item-not-found'
    | 'intro-not-complete'
    | 'intro-already-complete'
    | 'unsupported-command'
    | 'not-choosing-seeds'
    | 'seed-bank-full'
    | 'seed-choice-incomplete'

export type QueuedCommand = GameCommand | { type: 'debug'; command: string }
export interface CommandResult { sequence: number, rejection?: CommandRejectionCode, debug?: DebugCliResult }

/** The content a server runs every game with. */
export interface ServerContent {
    definitions: GameplayDefinitions
    levels: GameplayLevels
    gameplay: GameplayRegistry
}

/** One running game. The rule modules (planting, tools, items, commands, snapshot) take it first. */
export interface Session extends ServerContent {
    world: World
    schedule: Schedule
    tick: number
    gameplayTick: number
    mods: EnabledMod[]
    commands: Array<{ sequence: number, command: QueuedCommand }>
    commandResults: CommandResult[]
    /** Grave advice on screen now; the next successful planting clears it once (Board::ClearAdvice). Not saved. */
    graveAdvice?: string
}

export function createWorld(content: ServerContent): World {
    const world = new World()
    world.resources.set(ZombieBehaviorsResource, content.gameplay.zombieBehaviors)
    return world
}

/** Wraps a prepared world with its clock, command queue and system schedule. */
export function createSession(content: ServerContent, world: World, clock: { tick: number, gameplayTick: number }, mods: readonly EnabledMod[]): Session {
    const session: Session = {
        ...content,
        world,
        schedule: new Schedule(),
        tick: clock.tick,
        gameplayTick: clock.gameplayTick,
        mods: mods.map(mod => ({ ...mod })),
        commands: [],
        commandResults: [],
    }
    const { definitions, gameplay } = content
    const systems = [
        { phase: 'command', system: { id: 'pvz:commands', run: () => processCommandPhase(session) } },
        { phase: 'tutorial', system: createLevelProgressSystem(definitions) },
        { phase: 'spawn', system: createWaveSystem(definitions) },
        { phase: 'plant', system: createPeashooterSystem(definitions) },
        { phase: 'plant', system: createProductionSystem(definitions) },
        { phase: 'plant', system: createPlantAbilitySystem(definitions) },
        { phase: 'plant', system: createConveyorSystem() },
        { phase: 'plant', system: gameplay.plantBehaviors.system(definitions) },
        { phase: 'zombie', system: createZombieGroanSystem() },
        { phase: 'zombie', system: createZombieSystem(definitions) },
        { phase: 'zombie', system: gameplay.zombieBehaviors.system(definitions) },
        { phase: 'projectile', system: createProjectileSystem(definitions) },
        { phase: 'mower', system: createMowerSystem(definitions) },
        { phase: 'cleanup', system: createItemSystem(definitions) },
    ]
    for (const { phase, system } of systems) session.schedule.add(phase as Parameters<Schedule['add']>[0], system)
    return session
}

/** A new game of `packet.levelId`: resources, mowers and any plants the level starts with. */
export function startSession(content: ServerContent, packet: StartSessionPacket): Session {
    const { definitions } = content
    const level = content.levels.levels[packet.levelId]
    if (!level) throw new Error(`Unknown level: ${packet.levelId}`)

    const board = definitions.boards[level.board]
    const world = createWorld(content)
    world.resources.set(LevelStateResource, {
        id: packet.levelId,
        definition: level,
        board,
        phase: 'intro',
        result: 'playing',
        paused: false,
    })
    world.resources.set(EconomyStateResource, {
        sun: Math.min(MAX_SUN, level.startingSun),
        money: packet.initialMoney,
        pendingSunSpend: 0,
        ...(packet.packetUpgrades ? { diamonds: true as const } : {}),
    })
    world.resources.set(RandomResource, new DeterministicRng(packet.randomSeed))
    world.resources.set(SeedBankResource, {
        selection: { mode: 'none' },
        packets: level.seedBankSlots === undefined ? level.seedPackets.map(seedId => ({ seedId,
            readyAtTick: definitions.seeds[seedId].initialCooldownTicks ?? 0,
            cooldownTotal: definitions.seeds[seedId].initialCooldownTicks ?? 0 })) : [],
        ...(level.seedBankSlots === undefined ? {} : { choosing: true }),
    })
    world.resources.set(EventQueueResource, createEventQueue())
    initializeLevel(world, packet.firstAdventure)

    for (const row of level.activeRows) {
        const entity = world.createEntity()
        world.add(entity, PositionComponent, {
            x: -21,
            y: board.origin.y + row * board.cell.height + 23,
            row,
        })
        world.add(entity, LawnMowerComponent, { typeId: level.lawnMower, state: 'ready', chompCounter: 0 })
    }

    const session = createSession(content, world, { tick: 0, gameplayTick: 0 }, packet.mods)
    if (level.conveyor) {
        world.resources.get(SeedBankResource).packets = []
        world.resources.get(SeedBankResource).conveyor = { nextId: 1, spawnAtTick: level.conveyor.spawnDelay[0].ticks, moveTicks: 0, packets: [] }
        world.resources.get(TutorialResource).sunAtTick = undefined
    }
    for (const plant of level.initialPlants ?? []) planting.createPlant(session, plant.seedId, plant.row, plant.column)
    if (packet.firstAdventure) for (const plant of level.shovelTutorial?.introPlants ?? []) planting.createPlant(session, plant.seedId, plant.row, plant.column)
    return session
}
