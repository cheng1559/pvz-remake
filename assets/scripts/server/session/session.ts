import { Schedule, World } from '@/server/state/World'
import type { GameplayDefinitions, GameplayLevels } from '@/shared/content/gameplay'
import type { DebugCliResult } from '@/shared/debug/DebugCli'
import type { EnabledMod, GameCommand, StartSessionPacket } from '@/shared/protocol/index'
import { DeterministicRng } from '../state/DeterministicRng'
import type { GameplayRegistry } from '../registry/GameplayRegistry'
import { processCommandPhase } from './commands'
import { EconomyStateResource, LevelStateResource, PacketUpgradeOfferResource, RandomResource, SeedBankResource } from '../state/components'
import { createConveyorSystem } from '../level/conveyor'
import { EventQueueResource, createEventQueue } from '../state/events'
import { createItemSystem } from '../level/items'
import { createLevelProgressSystem, initializeLevel } from '../level/level'
import { chooserOffer, seedBankStart } from '../seeds/seedChooser'
import { levelTutorial, TutorialsResource } from '../tutorials'
import { createMower, createMowerSystem } from '../level/mowers'
import { planting } from '../seeds/planting'
import { createPlantAbilitySystem } from '../plants/abilities'
import { createPlantChillSystem } from '../plants/chill'
import { createBoardIceSystem } from '../combat/freeze'
import { createCraterSystem } from '../level/craters'
import { createPlantAnimationSystem } from '../plants/animation'
import { createProductionSystem } from '../plants/production'
import { createPlantAttackSystem } from '../plants/attacks'
import { createPlantRollSystem } from '../plants/rolls'
import { PlantFactoryResource } from '../plants/Plant'
import { createProjectileSystem } from '../combat/projectiles'
import { ProjectileMotionsResource } from '../combat/motions'
import { ProjectileFactoryResource } from '../combat/Projectile'
import { createWaveSystem } from '../level/waves'
import { LevelRuleResource } from '../rules/registry'
import { createZombieGroanSystem } from '../zombies/groans'
import { ZombieBehaviorsResource } from '../zombies/behaviors'
import { ZombieFactoryResource } from '../zombies/Zombie'
import { AchievementsResource, observeAchievements } from '../achievements/achievements'
import { createZombieSystem } from '../zombies/system'
import { openingCooldown } from '../seeds/seedBank'

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
    /** A crater holds the cell (PLANTING_NOT_ON_CRATER), or a grave or crater seed's cell has one already. */
    | 'cell-has-crater'
    | 'cell-needs-grave'
    /** A grave buster's cell has a grave of its own side, which it does not eat. */
    | 'cell-has-own-grave'
    | 'item-not-found'
    | 'intro-not-complete'
    | 'intro-already-complete'
    | 'unsupported-command'
    | 'not-choosing-seeds'
    | 'seed-bank-full'
    | 'seed-choice-incomplete'
    /** `/repick` is choosing the bank again; the level waits for Let's Rock. */
    | 'choosing-seeds'

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
    /** What goes on in an intro whose plants live (TutorialScript.plantsLiveInIntro): their animation. */
    introSchedule: Schedule
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
    world.resources.set(ZombieFactoryResource, content.gameplay.zombies.factory(content.definitions))
    world.resources.set(PlantFactoryResource, content.gameplay.plants.factory(content.definitions))
    world.resources.set(ProjectileMotionsResource, content.gameplay.projectileMotions)
    world.resources.set(ProjectileFactoryResource, content.gameplay.projectiles.factory(content.definitions))
    world.resources.set(TutorialsResource, content.gameplay.tutorials)
    world.resources.set(AchievementsResource, {
        definitions: content.definitions.achievements, earned: new Set<string>(), progress: {},
    })
    return world
}

/** Wraps a prepared world with its clock, command queue and system schedule. */
export function createSession(content: ServerContent, world: World, clock: { tick: number, gameplayTick: number }, mods: readonly EnabledMod[]): Session {
    const session: Session = {
        ...content,
        world,
        schedule: new Schedule(),
        introSchedule: new Schedule(),
        tick: clock.tick,
        gameplayTick: clock.gameplayTick,
        mods: mods.map(mod => ({ ...mod })),
        commands: [],
        commandResults: [],
    }
    const { definitions, gameplay } = content
    // The achievements see every event as it is emitted; the gameplay only reports what happens.
    world.resources.get(EventQueueResource).observer = event => observeAchievements(world, definitions, gameplay.achievementTriggers, event)
    // The level's rules hook in wherever they take part; their systems run after the wave system.
    const rule = gameplay.levelRules.get(world.resources.get(LevelStateResource).definition)
    world.resources.set(LevelRuleResource, rule)
    const plantAnimation = createPlantAnimationSystem(definitions)
    session.introSchedule.add('plant', plantAnimation)
    const systems = [
        { phase: 'command', system: { id: 'pvz:commands', run: () => processCommandPhase(session) } },
        { phase: 'tutorial', system: createLevelProgressSystem(definitions) },
        { phase: 'spawn', system: createWaveSystem(definitions) },
        { phase: 'spawn', system: createBoardIceSystem() },
        { phase: 'spawn', system: createCraterSystem() },
        ...rule?.systems?.(definitions) ?? [],
        { phase: 'plant', system: createPlantChillSystem() },
        { phase: 'plant', system: createPlantAttackSystem(definitions) },
        { phase: 'plant', system: createProductionSystem(definitions) },
        { phase: 'plant', system: createPlantAbilitySystem(definitions) },
        { phase: 'plant', system: createConveyorSystem() },
        { phase: 'plant', system: createPlantRollSystem() },
        { phase: 'plant', system: gameplay.plantBehaviors.system(definitions) },
        { phase: 'plant', system: plantAnimation },
        { phase: 'zombie', system: createZombieGroanSystem() },
        { phase: 'zombie', system: createZombieSystem(definitions) },
        { phase: 'zombie', system: gameplay.zombieBehaviors.system(definitions) },
        { phase: 'projectile', system: createProjectileSystem(definitions) },
        { phase: 'mower', system: createMowerSystem(definitions) },
        { phase: 'item', system: createItemSystem(definitions) },
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
        sun: Math.min(definitions.economy.maxSun, level.startingSun),
        money: packet.initialMoney,
        pendingSunSpend: 0,
        packetUpgrades: packet.packetUpgrades ?? 0,
        ownedUpgrades: packet.packetUpgrades ?? 0,
    })
    if (packet.packetUpgradeOffer) world.resources.set(PacketUpgradeOfferResource, { ...packet.packetUpgradeOffer })
    world.resources.set(RandomResource, new DeterministicRng(packet.randomSeed))
    const bank = seedBankStart(definitions, level, chooserOffer(definitions, packet.ownedSeeds, packet.cheatSeeds === true), packet.packetUpgrades)
    world.resources.set(SeedBankResource, {
        selection: { mode: 'none' },
        packets: 'seeds' in bank ? bank.seeds.map(({ seedId, team }) => {
            const cooldown = openingCooldown(world, definitions, seedId)
            return { seedId, readyAtTick: cooldown, cooldownTotal: cooldown, ...(team ? { team } : {}) }
        }) : [],
        ...('chooser' in bank ? { choosing: true } : {}),
        ...(packet.ownedSeeds ? { owned: [...packet.ownedSeeds] } : {}),
    })
    world.resources.set(EventQueueResource, createEventQueue())
    initializeLevel(world, packet.firstAdventure, definitions, content.gameplay.levelRules)

    const session = createSession(content, world, { tick: 0, gameplayTick: 0 }, packet.mods)
    if (level.conveyor) {
        world.resources.get(SeedBankResource).packets = []
        world.resources.get(SeedBankResource).conveyor = { nextId: 1, spawnAtTick: level.conveyor.spawnDelay[0].ticks, moveTicks: 0, packets: [] }
    }
    for (const plant of level.initialPlants ?? []) planting.createPlant(session, plant.seedId, plant.row, plant.column, plant.team)
    if (packet.firstAdventure) for (const plant of levelTutorial(world)?.introPlants ?? []) planting.createPlant(session, plant.seedId, plant.row, plant.column)
    // CutScene::PlaceLawnItems: a mower for every row in play (Board::InitLawnMowers), which the intro rolls in.
    for (const row of level.activeRows) createMower(world, row)
    return session
}
