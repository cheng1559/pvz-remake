import {
    Schedule,
    World,
} from '@/ecs/index'
import type {
    GameplayDefinitions,
    GameplayLevels,
} from '@/shared/content/gameplay'
import type { EnabledMod, ServerEvent, StartSessionPacket, WorldSnapshot } from '@/shared/protocol/index'
import type { GameCommand, SeedAvailability } from '@/shared/protocol/index'
import { jsonRoundTrip } from '@/shared/protocol/index'
import { DeterministicRng } from './DeterministicRng'
import { GameplayRegistry } from './GameplayRegistry'
import {
    EconomyStateResource,
    LawnMowerComponent,
    LevelStateResource,
    PlantAttackComponent,
    PlantComponent,
    PositionComponent,
    ProjectileComponent,
    RandomResource,
    SeedBankResource,
    ZombieComponent,
} from './components'
import { createPeashooterSystem } from './plants/shooter'
import { createPlantAbilitySystem, initialPlantAbility } from './plants/abilities'
import { createProjectileSystem } from './projectiles'
import { createZombieSystem } from './zombies/system'
import { ZombieBehaviorsResource } from './zombies/behaviors'
import {
    EventQueueResource,
    createEventQueue,
    drainServerEvents,
    emitServerEvent,
} from './events'
import { ItemComponent, TutorialResource, WaveResource } from './levelState'
import { initializeLevel, createLevelProgressSystem } from './level'
import { createItemSystem, getAvailableSun } from './items'
import { createWaveSystem } from './waves'
import { createZombieGroanSystem } from './zombieGroans'
import { getActiveTutorial } from './tutorials'
import { createProductionSystem } from './plants/production'
import { createMowerSystem } from './mower'
import { debugSuccess, parseDebugCliCommand, type DebugCliResult } from '@/shared/debug/DebugCli'
import { executeDebugGameCommand } from './debug/DebugCommands'
import { DebugRulesResource, getDebugRules } from './debug/DebugRules'
import { applySeedChoice, seedChooserSnapshot } from './seedChooser'
import { selectedSeedId } from './seedBank'
import { canPlantConveyorAt, createConveyorSystem, startConveyor } from './conveyor'
import {
    parseServerSaveSnapshot,
    type SavedEntity,
    type ServerSaveSnapshot,
} from './save'

const CANT_AFFORD_ADVICE = 'ADVICE_CANT_AFFORD_PLANT'

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
    | 'item-not-found'
    | 'intro-not-complete'
    | 'intro-already-complete'
    | 'unsupported-command'
    | 'not-choosing-seeds'
    | 'seed-bank-full'
    | 'seed-choice-incomplete'

type QueuedCommand = GameCommand | { type: 'debug'; command: string }
interface CommandResult { sequence: number, rejection?: CommandRejectionCode, debug?: DebugCliResult }
interface Session {
    world: World
    schedule: Schedule
    tick: number
    gameplayTick: number
    mods: EnabledMod[]
    commands: Array<{ sequence: number, command: QueuedCommand }>
    commandResults: CommandResult[]
}

export class IntegratedGameServer {
    private session?: Session

    constructor(
        private readonly definitions: GameplayDefinitions,
        private readonly levels: GameplayLevels,
        private readonly gameplay = new GameplayRegistry(),
    ) {
        if (definitions.tickSeconds !== 0.01) {
            throw new Error('IntegratedGameServer requires a 0.01 second fixed tick')
        }
        this.gameplay.freeze(definitions)
    }

    start(packet: StartSessionPacket): WorldSnapshot {
        if (packet.save !== undefined) return this.restore(packet.save, packet.levelId, packet.mods)
        const level = this.levels.levels[packet.levelId]
        if (!level) throw new Error(`Unknown level: ${packet.levelId}`)

        const board = this.definitions.boards[level.board]
        const world = this.createWorld()
        world.resources.set(LevelStateResource, {
            id: packet.levelId,
            definition: level,
            board,
            phase: 'intro',
            result: 'playing',
            paused: false,
        })
        world.resources.set(EconomyStateResource, {
            sun: level.startingSun,
            money: packet.initialMoney,
            pendingSunSpend: 0,
        })
        world.resources.set(RandomResource, new DeterministicRng(packet.randomSeed))
        world.resources.set(SeedBankResource, {
            selection: { mode: 'none' },
            packets: level.seedBankSlots === undefined ? level.seedPackets.map(seedId => ({ seedId,
                readyAtTick: this.definitions.seeds[seedId].initialCooldownTicks ?? 0,
                cooldownTotal: this.definitions.seeds[seedId].initialCooldownTicks ?? 0 })) : [],
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

        this.session = {
            world,
            schedule: this.createSchedule(),
            tick: 0,
            gameplayTick: 0,
            mods: packet.mods.map(mod => ({ ...mod })),
            commands: [],
            commandResults: [],
        }
        if (level.conveyor) {
            world.resources.get(SeedBankResource).packets = []
            world.resources.get(SeedBankResource).conveyor = { nextId: 1, spawnAtTick: level.conveyor.spawnDelay[0].ticks, moveTicks: 0, packets: [] }
            world.resources.get(TutorialResource).sunAtTick = undefined
        }
        if (packet.firstAdventure) for (const plant of level.shovelTutorial?.introPlants ?? []) this.createPlant(this.session, plant.seedId, plant.row, plant.column)
        return this.snapshot()
    }

    save(): ServerSaveSnapshot {
        const { world, tick, gameplayTick, mods } = this.requireSession()
        const level = world.resources.get(LevelStateResource)
        const entities = world.queryableEntities().map(entityId => {
            const extensions = this.gameplay.components.capture(world, entityId)
            const entity: SavedEntity = { entityId, ...(Object.keys(extensions).length ? { extensions } : {}) }
            const position = world.get(entityId, PositionComponent)
            const lawnMower = world.get(entityId, LawnMowerComponent)
            const plant = world.get(entityId, PlantComponent)
            const plantAttack = world.get(entityId, PlantAttackComponent)
            const zombie = world.get(entityId, ZombieComponent)
            const projectile = world.get(entityId, ProjectileComponent)
            const item = world.get(entityId, ItemComponent)
            if (position) entity.position = { ...position }
            if (lawnMower) entity.lawnMower = { ...lawnMower }
            if (plant) {
                this.gameplay.plantBehaviors.validateState(plant, this.definitions.plants[plant.typeId])
                entity.plant = { ...plant, ...(plant.ability ? { ability: { ...plant.ability } } : {}) }
            }
            if (plantAttack) entity.plantAttack = {
                readyAtTick: plantAttack.readyAtTick,
                ...(plantAttack.fireAtTick === undefined ? {} : { fireAtTick: plantAttack.fireAtTick }),
                ...(plantAttack.shotsRemaining === undefined ? {} : { shotsRemaining: plantAttack.shotsRemaining }),
            }
            if (zombie) {
                this.gameplay.zombieBehaviors.validateState(zombie, this.definitions.zombies[zombie.typeId])
                entity.zombie = { ...zombie }
            }
            if (projectile) entity.projectile = { ...projectile }
            if (item) entity.item = { ...item }
            return entity
        })
        const seedBank = world.resources.get(SeedBankResource)
        const tutorial = world.resources.get(TutorialResource)
        const wave = world.resources.get(WaveResource)
        const eventQueue = world.resources.get(EventQueueResource)
        return parseServerSaveSnapshot({
            schemaVersion: 2,
            levelId: level.id,
            mods: mods.map(mod => ({ ...mod })),
            tick,
            gameplayTick,
            allocator: world.snapshotEntityAllocator(),
            random: world.resources.get(RandomResource).snapshot(),
            level: { phase: level.phase, result: level.result, paused: level.paused },
            economy: { ...world.resources.get(EconomyStateResource) },
            seedBank: {
                selection: { ...seedBank.selection },
                ...(seedBank.conveyor === undefined ? {} : { conveyor: jsonRoundTrip(seedBank.conveyor) }),
                ...(seedBank.choosing === undefined ? {} : { choosing: seedBank.choosing }),
                packets: seedBank.packets.map(packet => ({ ...packet })),
            },
            tutorial: {
                ...(tutorial.dialogIndex === undefined ? {} : { dialogIndex: tutorial.dialogIndex }),
                firstAdventure: tutorial.firstAdventure,
                step: tutorial.step,
                ...(tutorial.zombieWarningShown === undefined ? {} : { zombieWarningShown: tutorial.zombieWarningShown }),
                ...(tutorial.sunsFallen === undefined ? {} : { sunsFallen: tutorial.sunsFallen }),
                ...(tutorial.sunAtTick === undefined ? {} : { sunAtTick: tutorial.sunAtTick }),
                ...(tutorial.promptAtTick === undefined ? {} : { promptAtTick: tutorial.promptAtTick }),
                ...(tutorial.cantAffordAdviceShown === undefined
                    ? {}
                    : { cantAffordAdviceShown: tutorial.cantAffordAdviceShown }),
                ...(tutorial.seedRefreshAdviceShown === undefined
                    ? {}
                    : { seedRefreshAdviceShown: tutorial.seedRefreshAdviceShown }),
                ...(tutorial.displayedAdvice === undefined ? {} : { displayedAdvice: [...tutorial.displayedAdvice] }),
            },
            wave: {
                index: wave.index,
                ...(wave.zombiesByWave === undefined ? {} : { zombiesByWave: wave.zombiesByWave.map(zombies => [...zombies]) }),
                ...(wave.rowPicks === undefined ? {} : { rowPicks: wave.rowPicks.map(row => ({ ...row })) }),
                ...(wave.hugeWaveAnnounced === undefined ? {} : { hugeWaveAnnounced: wave.hugeWaveAnnounced }),
                ...(wave.nextWaveAtTick === undefined ? {} : { nextWaveAtTick: wave.nextWaveAtTick }),
                ...(wave.accelerateAtTick === undefined ? {} : { accelerateAtTick: wave.accelerateAtTick }),
                ...(wave.zombieIds === undefined ? {} : {
                    zombieIds: wave.zombieIds.filter(entity => world.get(entity, ZombieComponent) !== undefined),
                }),
                ...(wave.healthToNextWave === undefined ? {} : { healthToNextWave: wave.healthToNextWave }),
                ...(wave.finalWaveAnnounced === undefined ? {} : { finalWaveAnnounced: wave.finalWaveAnnounced }),
            },
            eventQueue: {
                nextEventId: eventQueue.nextEventId,
                events: eventQueue.events.map(event => ({ ...event, data: { ...event.data } })),
            },
            entities,
        })
    }

    restore(
        value: unknown,
        expectedLevelId?: string,
        expectedMods?: readonly EnabledMod[],
    ): WorldSnapshot {
        const save = parseServerSaveSnapshot(value)
        if (expectedLevelId !== undefined && save.levelId !== expectedLevelId) {
            throw new Error(`Save level ${save.levelId} does not match requested level ${expectedLevelId}`)
        }
        if (expectedMods !== undefined && !sameMods(save.mods, expectedMods)) {
            throw new Error('Save enabled mods do not match the requested content set')
        }
        const definition = this.levels.levels[save.levelId]
        if (!definition) throw new Error(`Unknown saved level: ${save.levelId}`)
        if (save.wave.index > definition.waves.length) throw new Error('Saved wave index is outside the level')
        if (definition.zombiePool && (!save.wave.zombiesByWave || save.wave.zombiesByWave.length !== definition.waves.length ||
            save.wave.zombiesByWave.some(wave => wave.some(id => !this.definitions.zombies[id])))) {
            throw new Error('Saved zombie waves do not match the level')
        }
        if (definition.activeRows.length > 1 && (!save.wave.rowPicks ||
            save.wave.rowPicks.length !== definition.activeRows.length ||
            save.wave.rowPicks.some(row => !definition.activeRows.includes(row.row)))) {
            throw new Error('Saved wave row history does not match the level')
        }
        const slots = definition.conveyor ? 0 : definition.seedBankSlots ?? definition.seedPackets.length
        if (!!save.seedBank.conveyor !== !!definition.conveyor || save.seedBank.conveyor?.packets.some(packet => !definition.conveyor!.seeds.some(seed => seed.id === packet.seedId))) {
            throw new Error('Saved conveyor does not match the level')
        }
        if (save.seedBank.conveyor && save.seedBank.conveyor.packets.length > definition.conveyor!.capacity) throw new Error('Saved conveyor exceeds capacity')
        if (save.seedBank.selection.mode === 'tool' && !definition.tools?.includes(save.seedBank.selection.toolId)) throw new Error('Saved tool is unavailable in this level')
        if (save.seedBank.choosing ? !definition.seedBankSlots || save.level.phase !== 'intro' || save.seedBank.packets.length > slots
            : save.seedBank.packets.length !== slots) throw new Error('Saved seed bank size does not match the level')
        if (definition.seedBankSlots && (save.seedBank.choosing === undefined || save.seedBank.choosing && save.seedBank.packets.some(packet => !definition.seedPackets.includes(packet.seedId)))) {
            throw new Error('Saved seed choice does not match the level')
        }
        for (const packet of save.seedBank.packets) {
            if (!this.definitions.seeds[packet.seedId]) throw new Error(`Unknown saved seed: ${packet.seedId}`)
        }
        const selection = save.seedBank.selection
        if (selection.mode === 'seed' && !save.seedBank.packets.some(packet => packet.seedId === selection.seedId) ||
            selection.mode === 'conveyor' && !save.seedBank.conveyor?.packets.some(packet => packet.id === selection.packetId)) {
            throw new Error('Saved selected seed is not in the seed bank')
        }

        const world = this.createWorld()
        world.resources.set(LevelStateResource, {
            id: save.levelId,
            definition,
            board: this.definitions.boards[definition.board],
            ...save.level,
        })
        world.resources.set(EconomyStateResource, { ...save.economy })
        world.resources.set(RandomResource, DeterministicRng.restore(save.random))
        world.resources.set(SeedBankResource, {
            selection: { ...save.seedBank.selection },
            ...(save.seedBank.conveyor === undefined ? {} : { conveyor: jsonRoundTrip(save.seedBank.conveyor) }),
            ...(save.seedBank.choosing === undefined ? {} : { choosing: save.seedBank.choosing }),
            packets: save.seedBank.packets.map(packet => ({ ...packet })),
        })
        world.resources.set(TutorialResource, { ...save.tutorial })
        world.resources.set(WaveResource, { ...save.wave })
        world.resources.set(EventQueueResource, {
            nextEventId: save.eventQueue.nextEventId,
            events: save.eventQueue.events.map(event => ({ ...event, data: { ...event.data } })),
        })
        for (const saved of save.entities) this.restoreEntity(world, saved)
        const waveZombieIds = save.wave.zombieIds ?? []
        if (new Set(waveZombieIds).size !== waveZombieIds.length) {
            throw new Error('Saved wave zombie IDs must be unique')
        }
        for (const entity of waveZombieIds) {
            if (!world.get(entity, ZombieComponent)) throw new Error(`Saved wave zombie ${entity} is invalid`)
        }
        const collectingSun = [...world.query(ItemComponent)].reduce((total, entity) => {
            const item = world.get(entity, ItemComponent)!
            return total + (item.state === 'collecting' && this.definitions.items[item.typeId] ? item.value : 0)
        }, 0)
        if (save.economy.pendingSunSpend > collectingSun) {
            throw new Error('Saved pending sun spend exceeds collecting sun')
        }
        world.restoreEntityAllocator(save.allocator)
        this.session = {
            world,
            schedule: this.createSchedule(),
            tick: save.tick,
            gameplayTick: save.gameplayTick,
            mods: save.mods.map(mod => ({ ...mod })),
            commands: [],
            commandResults: [],
        }
        return this.snapshot()
    }

    enqueueCommand(sequence: number, command: GameCommand): void {
        this.requireSession().commands.push({ sequence, command })
    }

    enqueueDebugCommand(sequence: number, command: string): void {
        this.requireSession().commands.push({ sequence, command: { type: 'debug', command } })
    }

    hasPendingCommands(): boolean {
        return this.requireSession().commands.length > 0
    }

    drainCommandResults(): CommandResult[] {
        return this.requireSession().commandResults.splice(0)
    }

    processBoundaryCommands(processInput = false): boolean {
        const session = this.requireSession()
        let changed = false
        while (session.commands.length > 0) {
            const command = session.commands[0].command
            const level = session.world.resources.get(LevelStateResource)
            const playing = level.phase === 'gameplay' && !level.paused && level.result === 'playing'
            const inputCommand = processInput && playing && (
                command.type === 'selectSeed' || command.type === 'clearCursor' || command.type === 'placePlant' || command.type === 'mod'
                || command.type === 'selectConveyorPacket' || command.type === 'selectTool' || command.type === 'useToolAt'
            )
            if (!isSessionCommand(command) && !inputCommand && playing) {
                break
            }
            const previousPhase = level.phase
            const previousPaused = level.paused
            const rejection = this.processNextCommand(session)
            const introInput = previousPhase === 'intro' && (command.type === 'advanceDialog' || command.type === 'selectTool' || command.type === 'useToolAt' || command.type === 'clearCursor')
            if (inputCommand || (rejection === undefined && (introInput || isSessionCommand(command)
                && (command.type === 'debug' || command.type === 'chooseSeed' || command.type === 'confirmSeeds' || level.phase !== previousPhase || level.paused !== previousPaused)))) {
                session.tick++
                changed = true
            }
        }
        return changed
    }

    processCommandPhase(): void {
        const session = this.requireSession()
        while (session.commands.length > 0 && !isSessionCommand(session.commands[0].command)) {
            this.processNextCommand(session)
        }
    }

    private executeCommand(command: GameCommand): CommandRejectionCode | undefined {
        const session = this.requireSession()
        const level = session.world.resources.get(LevelStateResource)
        if (level.result !== 'playing' && command.type !== 'pause' && command.type !== 'resume') return 'game-not-playing'
        if (command.type === 'completeIntro') {
            if (level.phase !== 'intro') return 'intro-already-complete'
            if (session.world.resources.get(SeedBankResource).choosing) return 'seed-choice-incomplete'
            if (getActiveTutorial(session.world)?.blocksIntro && session.world.resources.get(TutorialResource).step !== 'complete') return 'intro-not-complete'
            level.phase = 'gameplay'
            startConveyor(session.world)
            return
        }
        if (command.type === 'pause') {
            level.paused = true
            return
        }
        if (command.type === 'resume') {
            level.paused = false
            return
        }
        if (command.type === 'chooseSeed' || command.type === 'confirmSeeds') {
            return applySeedChoice(session.world, this.definitions, command)
        }
        if (level.paused) return 'game-paused'
        if (command.type === 'advanceDialog') {
            if (level.phase !== 'intro') return 'unsupported-command'
            getActiveTutorial(session.world)?.advanceDialog?.(session.world)
            return
        }
        if (command.type === 'selectTool') return this.selectTool(session, command.toolId)
        if (command.type === 'useToolAt') return this.useTool(session, command.row, command.column)
        if (command.type === 'clearCursor') {
            const bank = session.world.resources.get(SeedBankResource)
            if (bank.selection.mode !== 'none') getActiveTutorial(session.world)?.seedCanceled?.(session.world, session.gameplayTick)
            bank.selection = { mode: 'none' }
            return
        }
        if (level.phase !== 'gameplay') return 'intro-not-complete'
        if (level.paused) return 'game-paused'

        switch (command.type) {
            case 'selectConveyorPacket': {
                const bank = session.world.resources.get(SeedBankResource)
                const packet = bank.conveyor?.packets.find(packet => packet.id === command.packetId)
                if (!packet) return 'seed-not-available'
                const availability = this.seedAvailability(session, packet.seedId, packet.id)
                if (availability.reason) return this.rejectSeed(session, packet.seedId, availability)
                bank.selection = { mode: 'conveyor', packetId: packet.id }
                return
            }
            case 'selectSeed': return this.selectSeed(session, command.seedId)
            case 'placePlant': return this.placePlant(session, command.row, command.column)
            case 'collectItemAt': return this.collectItem(session, command.itemId)
            default: return 'unsupported-command'
        }
    }

    tick(): WorldSnapshot {
        const session = this.requireSession()
        if (this.processBoundaryCommands()) return this.snapshot()
        const level = session.world.resources.get(LevelStateResource)
        if (level.phase !== 'gameplay' || level.paused || level.result === 'lost') return this.snapshot()
        session.tick++
        session.gameplayTick++
        session.schedule.run(session.world, session.gameplayTick)
        if (getDebugRules(session.world).collect === 'auto') {
            for (const entity of session.world.query(ItemComponent)) {
                const item = session.world.get(entity, ItemComponent)!
                if (this.definitions.items[item.typeId] && item.state === 'available') this.collectItem(session, entity)
            }
        }
        return this.snapshot()
    }

    snapshot(): WorldSnapshot {
        const session = this.requireSession()
        const { world, tick, gameplayTick } = session
        const level = world.resources.get(LevelStateResource)
        const economy = world.resources.get(EconomyStateResource)
        const seedBank = world.resources.get(SeedBankResource)
        const waves = world.resources.get(WaveResource)
        const tutorial = world.resources.get(TutorialResource)
        const seedPackets = seedBank.packets.map(packet => {
            const cooldownRemaining = Math.max(0, packet.readyAtTick - gameplayTick)
            const selected = seedBank.selection.mode === 'seed' && seedBank.selection.seedId === packet.seedId
            return {
                seedId: packet.seedId,
                ready: cooldownRemaining === 0 && !selected,
                selected,
                cooldownRemaining,
                availability: this.seedAvailability(session, packet.seedId),
                cooldownTotal: cooldownRemaining === 0
                    ? 0
                    : packet.cooldownTotal ?? this.definitions.seeds[packet.seedId].cooldownTicks,
            }
        })
        const plants = [...world.query(PositionComponent, PlantComponent)].map(entity => {
            const position = world.get(entity, PositionComponent)!
            const plant = world.get(entity, PlantComponent)!
            return {
                entityId: entity, ...plant, ...position,
                ...(plant.ability ? { ability: { ...plant.ability } } : {}),
                ...(plant.behaviorState ? { behaviorState: jsonRoundTrip(plant.behaviorState) } : {}),
            }
        })
        const zombies = [...world.query(PositionComponent, ZombieComponent)].map(entity => {
            const position = world.get(entity, PositionComponent)!
            const zombie = world.get(entity, ZombieComponent)!
            return {
                entityId: entity,
                typeId: zombie.typeId,
                state: zombie.state,
                health: zombie.health,
                maxHealth: zombie.maxHealth,
                animation: zombie.animation,
                animationTime: zombie.animationTime,
                animationSpeed: zombie.animationSpeed,
                moweredTicksRemaining: zombie.moweredTicksRemaining,
                alpha: zombie.state === 'dying' ? Math.min(255, Math.trunc(255 * zombie.deathTicksRemaining / 10)) : 255,
                hasHead: zombie.hasHead,
                hasTongue: zombie.hasTongue,
                hasArm: zombie.hasArm,
                hitFlashCounter: zombie.hitFlashCounter,
                helmHealth: zombie.helmHealth,
                chilled: zombie.chilledTicks > 0,
                hasPole: zombie.hasPole,
                ...(zombie.behaviorState ? { behaviorState: jsonRoundTrip(zombie.behaviorState) } : {}),
                ...position,
            }
        })
        const projectiles = [...world.query(PositionComponent, ProjectileComponent)].map(entity => {
            const position = world.get(entity, PositionComponent)!
            const projectile = world.get(entity, ProjectileComponent)!
            return { entityId: entity, typeId: projectile.typeId, ...position }
        })
        const lawnMowers = [...world.query(PositionComponent, LawnMowerComponent)].map(entity => {
            const position = world.get(entity, PositionComponent)!
            const mower = world.get(entity, LawnMowerComponent)!
            return { entityId: entity, typeId: mower.typeId, state: mower.state, ...position }
        })
        const items = [...world.query(PositionComponent, ItemComponent)].map(entity => {
            const position = world.get(entity, PositionComponent)!
            const item = world.get(entity, ItemComponent)!
            return {
                entityId: entity,
                typeId: item.typeId,
                state: item.state,
                x: position.x,
                y: position.y,
                scale: item.scale,
                alpha: item.alpha,
            }
        })

        return {
            levelId: level.id,
            tick,
            gameplayTick,
            phase: level.phase,
            result: level.result,
            paused: level.paused,
            sun: economy.sun,
            availableSun: this.availableSun(world),
            money: economy.money,
            wave: {
                index: waves.index,
                total: level.definition.waves.length,
                countdown: Math.max(0, (waves.nextWaveAtTick ?? gameplayTick) - gameplayTick),
                ...(level.phase === 'intro' ? { previewZombies: (waves.zombiesByWave ?? level.definition.waves.map(wave => wave.zombies))
                    .flat().reduce<Record<string, number>>((counts, id) => { counts[id] = (counts[id] ?? 0) + 1; return counts }, {}) } : {}),
            },
            cursor: seedBank.selection.mode === 'tool' ? { ...seedBank.selection } : selectedSeedId(seedBank)
                ? { mode: 'seed', seedId: selectedSeedId(seedBank)! } : { mode: 'none' },
            seedPackets,
            ...(level.definition.seedBankSlots === undefined ? {} : { seedChooser: seedChooserSnapshot(world, this.definitions) }),
            conveyorPackets: seedBank.conveyor?.packets.map(packet => ({ ...packet, selected: seedBank.selection.mode === 'conveyor' && packet.id === seedBank.selection.packetId,
                availability: this.seedAvailability(session, packet.seedId, packet.id) })) ?? [],
            plants,
            zombies,
            projectiles,
            items,
            lawnMowers,
            tutorial: { id: level.definition.tutorial, step: tutorial.step },
            extensions: { ...this.gameplay.components.snapshot(world),
                ...(level.definition.tools ? { 'pvz:tools': { available: level.definition.tools.filter(id => this.toolAvailable(session, id)) } } : {}),
                ...(seedBank.conveyor ? { 'pvz:conveyor': { ticks: seedBank.conveyor.moveTicks } } : {}),
                ...(tutorial.dialogIndex === undefined ? {} : { 'pvz:dialog': { index: tutorial.dialogIndex } }),
                ...(world.resources.has(DebugRulesResource) ? { 'pvz:debug': { ...getDebugRules(world) } } : {}) },
        }
    }

    drainEvents(): ServerEvent[] {
        return drainServerEvents(this.requireSession().world.resources.get(EventQueueResource))
    }

    private requireSession(): Session {
        if (!this.session) throw new Error('No active game session')
        return this.session
    }

    private createSchedule(): Schedule {
        const schedule = new Schedule()
        const systems = [
            { phase: 'command', system: { id: 'pvz:commands', run: () => this.processCommandPhase() } },
            { phase: 'tutorial', system: createLevelProgressSystem(this.definitions) },
            { phase: 'spawn', system: createWaveSystem(this.definitions) },
            { phase: 'plant', system: createPeashooterSystem(this.definitions) },
            { phase: 'plant', system: createProductionSystem(this.definitions) },
            { phase: 'plant', system: createPlantAbilitySystem(this.definitions) },
            { phase: 'plant', system: createConveyorSystem() },
            { phase: 'plant', system: this.gameplay.plantBehaviors.system(this.definitions) },
            { phase: 'zombie', system: createZombieGroanSystem() },
            { phase: 'zombie', system: createZombieSystem(this.definitions) },
            { phase: 'zombie', system: this.gameplay.zombieBehaviors.system(this.definitions) },
            { phase: 'projectile', system: createProjectileSystem(this.definitions) },
            { phase: 'mower', system: createMowerSystem(this.definitions) },
            { phase: 'cleanup', system: createItemSystem() },
        ]
        for (const { phase, system } of systems) schedule.add(phase as Parameters<Schedule['add']>[0], system)
        return schedule
    }

    private processNextCommand(session: Session): CommandRejectionCode | undefined {
        const queued = session.commands.shift()!
        if (queued.command.type === 'debug') {
            const command = queued.command.command
            const parsed = parseDebugCliCommand(command)
            const debug = command === 'catalog' ? {
                ...debugSuccess('Installed debug content'),
                catalog: {
                    plants: Object.keys(this.definitions.seeds).map(id => id.replace(/^pvz:/, '')),
                    zombies: Object.keys(this.definitions.zombies).map(id => id.replace(/^pvz:/, '')),
                    items: [...Object.keys(this.definitions.items).map(id => id.replace(/^pvz:/, '')), 'award'],
                    levels: Object.keys(this.levels.levels).map(id => id.replace(/^pvz:adventure-/, '')),
                },
            } : 'name' in parsed ? executeDebugGameCommand(session.world, this.definitions, session.gameplayTick, parsed,
                (seedId, row, column) => this.createPlant(session, seedId, row, column)) : parsed
            session.commandResults.push({ sequence: queued.sequence, debug })
            return
        }
        const rejection = this.executeCommand(queued.command)
        session.commandResults.push({
            sequence: queued.sequence,
            ...(rejection === undefined ? {} : { rejection }),
        })
        return rejection
    }

    private restoreEntity(world: World, saved: SavedEntity): void {
        if (!saved.position) throw new Error(`Saved entity ${saved.entityId} has no position`)
        const kinds = [saved.lawnMower, saved.plant, saved.zombie, saved.projectile, saved.item]
            .filter(value => value !== undefined).length
        if (kinds !== 1 && !(kinds === 0 && saved.extensions && Object.keys(saved.extensions).length)) throw new Error(`Saved entity ${saved.entityId} must have exactly one domain component`)
        const savedPlantDefinition = saved.plant ? this.definitions.plants[saved.plant.typeId] : undefined
        const hasAttack = !!(savedPlantDefinition?.shooter || savedPlantDefinition?.producer)
        if (saved.plantAttack !== undefined && !hasAttack ||
            saved.plant !== undefined && savedPlantDefinition !== undefined && hasAttack !== (saved.plantAttack !== undefined)) {
            throw new Error(`Saved entity ${saved.entityId} has an invalid plant attack component`)
        }
        const level = world.resources.get(LevelStateResource)
        const activeRow = level.definition.activeRows.includes(saved.position.row)
        const boardRow = saved.position.row >= 0 && saved.position.row < level.board.rows
        if (saved.lawnMower && !this.definitions.lawnMowers[saved.lawnMower.typeId]) {
            throw new Error(`Unknown saved mower: ${saved.lawnMower.typeId}`)
        }
        if (saved.lawnMower && (!activeRow || saved.lawnMower.typeId !== level.definition.lawnMower)) {
            throw new Error(`Saved mower ${saved.entityId} is invalid for the level`)
        }
        if (saved.plant) {
            const plant = this.definitions.plants[saved.plant.typeId]
            const seed = this.definitions.seeds[saved.plant.seedId]
            if (!plant || !seed || seed.plant !== saved.plant.typeId) {
                throw new Error(`Unknown saved plant: ${saved.plant.typeId}`)
            }
            this.gameplay.plantBehaviors.validateState(saved.plant, plant)
            if (!boardRow || saved.plant.column >= level.board.columns ||
                saved.plant.maxHealth !== plant.maxHealth) {
                throw new Error(`Saved plant ${saved.entityId} is invalid for the level`)
            }
            if (saved.plantAttack?.shotsRemaining !== undefined &&
                saved.plantAttack.shotsRemaining > (plant.shooter?.shotsPerBurst ?? 0)) {
                throw new Error(`Saved plant ${saved.entityId} has invalid burst state`)
            }
            if ((saved.plant.ability === undefined) !== (initialPlantAbility(plant) === undefined) ||
                saved.plant.ability && !abilityMatches(plant, saved.plant.ability.state)) {
                throw new Error(`Saved plant ${saved.entityId} has an invalid ability state`)
            }
        }
        if (saved.zombie) {
            const zombie = this.definitions.zombies[saved.zombie.typeId]
            if (!zombie) throw new Error(`Unknown saved zombie: ${saved.zombie.typeId}`)
            this.gameplay.zombieBehaviors.validateState(saved.zombie, zombie)
            if (!boardRow || saved.zombie.maxHealth !== zombie.maxHealth ||
                saved.zombie.helmHealth > (zombie.helm?.health ?? 0) || saved.zombie.hasPole && !zombie.vault ||
                (saved.zombie.animation === 'anim_run' || saved.zombie.state === 'vaulting') && !zombie.vault) {
                throw new Error(`Saved zombie ${saved.entityId} is invalid for the level`)
            }
        }
        if (saved.projectile && (!boardRow || !this.definitions.projectiles[saved.projectile.typeId])) {
            throw new Error(`Unknown saved projectile: ${saved.projectile.typeId}`)
        }
        if (saved.item && ((saved.item.typeId === level.definition.award.id
            ? saved.item.value !== 1
            : !this.definitions.items[saved.item.typeId] ||
                this.definitions.items[saved.item.typeId].value !== saved.item.value &&
                !(saved.item.typeId === 'pvz:sun' && saved.item.value === 15)) || saved.position.row !== -1)) {
            throw new Error(`Unknown saved item: ${saved.item.typeId}`)
        }

        world.activateEntity(saved.entityId)
        this.gameplay.components.restore(world, saved.entityId, saved.extensions ?? {})
        world.add(saved.entityId, PositionComponent, { ...saved.position })
        if (saved.lawnMower) world.add(saved.entityId, LawnMowerComponent, { ...saved.lawnMower })
        if (saved.plant) world.add(saved.entityId, PlantComponent, { ...saved.plant })
        if (saved.plantAttack) world.add(saved.entityId, PlantAttackComponent, { ...saved.plantAttack })
        if (saved.zombie) world.add(saved.entityId, ZombieComponent, { ...saved.zombie })
        if (saved.projectile) world.add(saved.entityId, ProjectileComponent, { ...saved.projectile })
        if (saved.item) world.add(saved.entityId, ItemComponent, { ...saved.item })
    }

    private seedAvailability(session: Session, seedId: string, packetId?: number): SeedAvailability {
        const seedBank = session.world.resources.get(SeedBankResource)
        if (packetId !== undefined) return seedBank.conveyor?.packets.some(packet => packet.id === packetId && packet.seedId === seedId)
            ? {} : { reason: 'seed-not-available' }
        const packet = seedBank.packets.find(packet => packet.seedId === seedId)
        if (!packet) return { reason: 'seed-not-available' }
        if (getDebugRules(session.world).cooldown && packet.readyAtTick > session.gameplayTick) {
            return { reason: 'seed-not-ready', warningKey: 'WAITING_FOR_SEED' }
        }
        if (getDebugRules(session.world).sunCost && this.availableSun(session.world) < this.definitions.seeds[seedId].sunCost) {
            return { reason: 'not-enough-sun', warningKey: 'NOT_ENOUGH_SUN' }
        }
        return {}
    }

    private rejectSeed(session: Session, _seedId: string, availability: SeedAvailability): CommandRejectionCode | undefined {
        if (availability.reason === 'seed-not-ready') getActiveTutorial(session.world)?.seedRejected?.(session.world, availability.reason)
        else if (availability.reason === 'not-enough-sun') {
            this.emitNotEnoughSunFeedback(session.world)
        }
        return availability.reason
    }

    private selectSeed(session: Session, seedId: string): CommandRejectionCode | undefined {
        const availability = this.seedAvailability(session, seedId)
        if (availability.reason) return this.rejectSeed(session, seedId, availability)
        const seedBank = session.world.resources.get(SeedBankResource)
        if (session.world.resources.get(TutorialResource).cantAffordAdviceShown) {
            emitServerEvent(session.world.resources.get(EventQueueResource), 'adviceCleared', {
                key: CANT_AFFORD_ADVICE,
            })
        }
        seedBank.selection = { mode: 'seed', seedId }
        getActiveTutorial(session.world)?.seedSelected?.(session.world, seedId)
    }

    private placePlant(
        session: Session,
        row: number,
        column: number,
    ): CommandRejectionCode | undefined {
        const { world, gameplayTick } = session
        const level = world.resources.get(LevelStateResource)
        const seedBank = world.resources.get(SeedBankResource)
        const seedId = selectedSeedId(seedBank)
        if (!seedId) return 'no-seed-selected'

        const packet = seedBank.packets.find(packet => packet.seedId === seedId)
        const seed = this.definitions.seeds[seedId]
        const rules = getDebugRules(world)
        const sunCost = !seedBank.conveyor && rules.sunCost ? seed.sunCost : 0
        const economy = world.resources.get(EconomyStateResource)
        if (rules.cooldown && packet && packet.readyAtTick > gameplayTick) return 'seed-not-ready'
        if (this.availableSun(world) < sunCost) {
            this.emitNotEnoughSunFeedback(world)
            return 'not-enough-sun'
        }
        if (!Number.isInteger(row) || row < 0 || row >= level.board.rows ||
            !level.definition.activeRows.includes(row)) return 'row-not-active'
        if (!Number.isInteger(column) || column < 0 || column >= level.board.columns) {
            return 'column-out-of-range'
        }
        const bowling = level.definition.bowling
        if (!canPlantConveyorAt(world, column)) return 'column-out-of-range'
        const occupiedEntity = this.findPlantAt(world, row, column)
        if (occupiedEntity !== undefined) return 'cell-occupied'

        const entity = this.createPlant(session, seedId, row, column)
        if (seedBank.conveyor) {
            const conveyor = seedBank.conveyor!
            const packetId = seedBank.selection.mode === 'conveyor' ? seedBank.selection.packetId : undefined
            const removedIndex = conveyor.packets.findIndex(packet => packet.id === packetId)
            conveyor.packets = conveyor.packets.filter(packet => packet.id !== packetId)
            for (let index = removedIndex; index >= 0 && index < conveyor.packets.length; index++) conveyor.packets[index].x += level.definition.conveyor!.removalGap
            emitServerEvent(world.resources.get(EventQueueResource), 'adviceCleared', { key: 'ADVICE_NOT_PASSED_LINE' })
        }
        const bankSpend = Math.min(economy.sun, sunCost)
        economy.sun -= bankSpend
        economy.pendingSunSpend += sunCost - bankSpend
        if (packet) {
            packet.cooldownTotal = rules.cooldown ? seed.cooldownTicks : 0
            packet.readyAtTick = gameplayTick + packet.cooldownTotal
        }
        seedBank.selection = { mode: 'none' }
        getActiveTutorial(world)?.plantPlaced?.(world, gameplayTick, seed.plant, occupiedEntity !== undefined)
        emitServerEvent(world.resources.get(EventQueueResource), 'plantPlaced', {
            entityId: entity,
            typeId: seed.plant,
            row,
            column,
            ...(bowling ? { bowling: true } : {}),
        })
    }

    private createPlant(session: Session, seedId: string, row: number, column: number): number {
        const { world, gameplayTick } = session
        const level = world.resources.get(LevelStateResource)
        const plantedSeed = this.definitions.seeds[seedId]
        const definition = this.definitions.plants[plantedSeed.plant]
        const behaviorState = this.gameplay.plantBehaviors.createState(plantedSeed.plant, definition)
        const entity = world.createEntity()
        world.add(entity, PositionComponent, {
            x: level.board.origin.x + column * level.board.cell.width,
            y: level.board.origin.y + row * level.board.cell.height,
            row,
        })
        world.add(entity, PlantComponent, {
            typeId: plantedSeed.plant,
            seedId: seedId,
            column,
            health: definition.maxHealth,
            maxHealth: definition.maxHealth,
            eatenFlashCounter: 0,
            recentlyEatenCounter: 0,
            ...(behaviorState === undefined ? {} : { behaviorState }),
        })
        const ability = initialPlantAbility(definition)
        if (ability) world.get(entity, PlantComponent)!.ability = ability
        if (definition.shooter || definition.producer) world.add(entity, PlantAttackComponent, {
            readyAtTick: gameplayTick + (definition.shooter?.initialDelayTicks ?? world.resources.get(RandomResource).integer(
                definition.producer!.initialDelayTicks.min, definition.producer!.initialDelayTicks.max,
            )),
        })
        return entity
    }

    private findPlantAt(world: World, row: number, column: number): number | undefined {
        return [...world.query(PositionComponent, PlantComponent)].find(entity =>
            this.definitions.plants[world.get(entity, PlantComponent)!.typeId].occupiesCell !== false && world.get(entity, PositionComponent)!.row === row && world.get(entity, PlantComponent)!.column === column)
    }

    private toolAvailable(session: Session, toolId: string): boolean {
        const level = session.world.resources.get(LevelStateResource)
        return toolId === 'pvz:shovel' && level.definition.tools?.includes(toolId) === true && !level.paused && level.result === 'playing' &&
            (level.phase === 'gameplay' || getActiveTutorial(session.world)?.canSelectTool?.(session.world, toolId) === true)
    }

    private selectTool(session: Session, toolId: string): CommandRejectionCode | undefined {
        const { world } = session
        if (!this.toolAvailable(session, toolId)) return 'unsupported-command'
        const bank = world.resources.get(SeedBankResource)
        bank.selection = { mode: 'tool', toolId }
        getActiveTutorial(world)?.toolSelected?.(world)
        emitServerEvent(world.resources.get(EventQueueResource), 'toolSelected', { toolId })
    }

    private useTool(session: Session, row: number, column: number): CommandRejectionCode | undefined {
        const { world } = session
        const bank = world.resources.get(SeedBankResource)
        if (bank.selection.mode !== 'tool' || bank.selection.toolId !== 'pvz:shovel') return 'unsupported-command'
        const entity = this.findPlantAt(world, row, column)
        bank.selection = { mode: 'none' }
        if (entity !== undefined) {
            world.destroyEntity(entity)
            getActiveTutorial(world)?.plantRemoved?.(world)
            emitServerEvent(world.resources.get(EventQueueResource), 'plantShoveled', { entityId: entity })
        } else {
            getActiveTutorial(world)?.seedCanceled?.(world, session.gameplayTick)
            emitServerEvent(world.resources.get(EventQueueResource), 'toolMissed', {})
        }
    }

    private collectItem(session: Session, itemId: number): CommandRejectionCode | undefined {
        const { world } = session
        const item = world.get(itemId, ItemComponent)
        if (!item) return 'item-not-found'
        if (item.state === 'collecting') return 'item-not-found'

        const level = world.resources.get(LevelStateResource)
        if (item.typeId === level.definition.award.id) {
            item.state = 'collecting'
            const events = world.resources.get(EventQueueResource)
            const position = world.get(itemId, PositionComponent)!
            emitServerEvent(events, 'levelAwardCollected', {
                entityId: itemId,
                typeId: item.typeId,
                x: position.x,
                y: position.y,
            })
            for (const entity of world.query(ItemComponent)) {
                const sun = world.get(entity, ItemComponent)!
                if (entity === itemId || !this.definitions.items[sun.typeId] || sun.state === 'collecting') continue
                sun.state = 'collecting'
                sun.disappearTicks = 0
                sun.fadeTicks = 0
                emitServerEvent(events, 'itemCollected', {
                    entityId: entity,
                    typeId: sun.typeId,
                    value: sun.value,
                })
            }
            const bank = world.resources.get(SeedBankResource)
            bank.selection = { mode: 'none' }
            level.result = 'won'
            emitServerEvent(events, 'levelWon', {})
            return
        }

        item.state = 'collecting'
        item.disappearTicks = 0
        item.fadeTicks = 0
        const availableBefore = this.availableSun(world) - item.value
        const availableAfter = availableBefore + item.value
        for (const packet of world.resources.get(SeedBankResource).packets) {
            const seedCost = getDebugRules(world).sunCost ? this.definitions.seeds[packet.seedId].sunCost : 0
            const ready = packet.readyAtTick <= session.gameplayTick
            if (ready && availableBefore < seedCost && availableAfter >= seedCost) {
                emitServerEvent(world.resources.get(EventQueueResource), 'seedPacketFlashRequested', { seedId: packet.seedId })
                getActiveTutorial(world)?.seedReady?.(world, session.gameplayTick, packet.seedId)
            }
            getActiveTutorial(world)?.sunCollected?.(world, session.gameplayTick, packet.seedId, ready && availableAfter >= seedCost)
        }
        emitServerEvent(world.resources.get(EventQueueResource), 'itemCollected', {
            entityId: itemId,
            typeId: item.typeId,
            value: item.value,
        })
    }

    private availableSun(world: World): number {
        return getAvailableSun(world, this.definitions)
    }

    private emitNotEnoughSunFeedback(world: World): void {
        emitServerEvent(world.resources.get(EventQueueResource), 'sunFlash', {})
        getActiveTutorial(world)?.seedRejected?.(world, 'not-enough-sun')
    }

    private createWorld(): World {
        const world = new World()
        world.resources.set(ZombieBehaviorsResource, this.gameplay.zombieBehaviors)
        return world
    }
}

function abilityMatches(definition: GameplayDefinitions['plants'][string], state: string): boolean {
    if (definition.fuse) return state === 'fuse'
    if (definition.mine) return state === 'arming' || state === 'rising' || state === 'armed'
    return state === 'ready' || state === 'biting' || state === 'got-one' || state === 'missed' ||
        state === 'digesting' || state === 'swallowing'
}

function isSessionCommand(command: QueuedCommand): boolean {
    if (command.type === 'debug') return true
    return command.type === 'pause' || command.type === 'resume' || command.type === 'completeIntro'
        || command.type === 'advanceDialog'
        || command.type === 'chooseSeed' || command.type === 'confirmSeeds'
}

function sameMods(saved: readonly EnabledMod[], expected: readonly EnabledMod[]): boolean {
    return saved.length === expected.length && saved.every((mod, index) => {
        const other = expected[index]
        return mod.id === other.id && mod.version === other.version && mod.contentHash === other.contentHash
    })
}
