import {
    Schedule,
    World,
} from '@/ecs/index'
import type {
    GameplayDefinitionsV2,
    GameplayLevelsV2,
} from '@/shared/content/gameplay'
import type { EnabledMod, ServerEvent, StartSessionPacket, WorldSnapshot } from '@/shared/protocol/index'
import type { GameCommand } from '@/shared/protocol/index'
import { DeterministicRng } from './DeterministicRng'
import {
    GameplaySystemMods,
    createGameplaySystemBindings,
    type ScheduledGameplaySystem,
} from './GameplaySystemMods'
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
    createPeashooterSystem,
    createProjectileSystem,
    createZombieSystem,
    spawnZombie,
} from './gameplay'
import {
    EventQueueResource,
    createEventQueue,
    drainServerEvents,
    emitServerEvent,
} from './events'
import {
    ItemComponent,
    TutorialResource,
    WaveResource,
    createLevelOneTutorialSystem,
    createLevelOneZombieGroanSystem,
    createLevelOneWaveSystem,
    createItemSystem,
    initializeLevelOne,
    noteLevelOnePlantPlaced,
    noteLevelOneSeedCanceled,
    noteLevelOneSeedSelected,
    noteLevelOneSunCollected,
} from './levelOne'
import { createMowerSystem } from './mower'
import {
    parseServerSaveSnapshotV2,
    type SavedEntityV2,
    type ServerSaveSnapshotV2,
} from './save'

const CANT_AFFORD_ADVICE = 'ADVICE_CANT_AFFORD_PLANT'
const SEED_REFRESH_ADVICE = 'ADVICE_SEED_REFRESH'

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

interface Session {
    world: World
    schedule: Schedule
    tick: number
    gameplayTick: number
    mods: EnabledMod[]
    commands: Array<{ sequence: number, command: GameCommand }>
    commandResults: Array<{ sequence: number, rejection?: CommandRejectionCode }>
}

export class IntegratedGameServer {
    private session?: Session

    constructor(
        private readonly definitions: GameplayDefinitionsV2,
        private readonly levels: GameplayLevelsV2,
        private readonly systemMods = new GameplaySystemMods(),
    ) {
        if (definitions.tickSeconds !== 0.01) {
            throw new Error('IntegratedGameServer requires a 0.01 second fixed tick')
        }
    }

    start(packet: StartSessionPacket): WorldSnapshot {
        if (packet.save !== undefined) return this.restore(packet.save, packet.levelId, packet.mods)
        const level = this.levels.levels[packet.levelId]
        if (!level) throw new Error(`Unknown level: ${packet.levelId}`)

        const board = this.definitions.boards[level.board]
        const world = new World()
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
            packets: level.seedPackets.map(seedId => ({ seedId, readyAtTick: 0 })),
        })
        world.resources.set(EventQueueResource, createEventQueue())
        initializeLevelOne(world, packet.firstAdventure)

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
        return this.snapshot()
    }

    save(): ServerSaveSnapshotV2 {
        const { world, tick, gameplayTick, mods } = this.requireSession()
        const level = world.resources.get(LevelStateResource)
        const entities = world.queryableEntities().map(entityId => {
            const entity: SavedEntityV2 = { entityId }
            const position = world.get(entityId, PositionComponent)
            const lawnMower = world.get(entityId, LawnMowerComponent)
            const plant = world.get(entityId, PlantComponent)
            const plantAttack = world.get(entityId, PlantAttackComponent)
            const zombie = world.get(entityId, ZombieComponent)
            const projectile = world.get(entityId, ProjectileComponent)
            const item = world.get(entityId, ItemComponent)
            if (position) entity.position = { ...position }
            if (lawnMower) entity.lawnMower = { ...lawnMower }
            if (plant) entity.plant = { ...plant }
            if (plantAttack) entity.plantAttack = {
                readyAtTick: plantAttack.readyAtTick,
                ...(plantAttack.fireAtTick === undefined ? {} : { fireAtTick: plantAttack.fireAtTick }),
                ...(plantAttack.shotsRemaining === undefined ? {} : { shotsRemaining: plantAttack.shotsRemaining }),
            }
            if (zombie) entity.zombie = { ...zombie }
            if (projectile) entity.projectile = { ...projectile }
            if (item) entity.item = { ...item }
            return entity
        })
        const seedBank = world.resources.get(SeedBankResource)
        const tutorial = world.resources.get(TutorialResource)
        const wave = world.resources.get(WaveResource)
        const eventQueue = world.resources.get(EventQueueResource)
        return parseServerSaveSnapshotV2({
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
                ...(seedBank.selectedSeedId === undefined ? {} : { selectedSeedId: seedBank.selectedSeedId }),
                packets: seedBank.packets.map(packet => ({ ...packet })),
            },
            tutorial: {
                firstAdventure: tutorial.firstAdventure,
                step: tutorial.step,
                ...(tutorial.sunAtTick === undefined ? {} : { sunAtTick: tutorial.sunAtTick }),
                ...(tutorial.promptAtTick === undefined ? {} : { promptAtTick: tutorial.promptAtTick }),
                ...(tutorial.cantAffordAdviceShown === undefined
                    ? {}
                    : { cantAffordAdviceShown: tutorial.cantAffordAdviceShown }),
                ...(tutorial.seedRefreshAdviceShown === undefined
                    ? {}
                    : { seedRefreshAdviceShown: tutorial.seedRefreshAdviceShown }),
            },
            wave: {
                index: wave.index,
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
        const save = parseServerSaveSnapshotV2(value)
        if (expectedLevelId !== undefined && save.levelId !== expectedLevelId) {
            throw new Error(`Save level ${save.levelId} does not match requested level ${expectedLevelId}`)
        }
        if (expectedMods !== undefined && !sameMods(save.mods, expectedMods)) {
            throw new Error('Save enabled mods do not match the requested content set')
        }
        const definition = this.levels.levels[save.levelId]
        if (!definition) throw new Error(`Unknown saved level: ${save.levelId}`)
        if (save.wave.index > definition.waves.length) throw new Error('Saved wave index is outside the level')
        for (const packet of save.seedBank.packets) {
            if (!definition.seedPackets.includes(packet.seedId)) throw new Error(`Unknown saved seed: ${packet.seedId}`)
        }
        if (save.seedBank.selectedSeedId !== undefined &&
            !save.seedBank.packets.some(packet => packet.seedId === save.seedBank.selectedSeedId)) {
            throw new Error('Saved selected seed is not in the seed bank')
        }

        const world = new World()
        world.resources.set(LevelStateResource, {
            id: save.levelId,
            definition,
            board: this.definitions.boards[definition.board],
            ...save.level,
        })
        world.resources.set(EconomyStateResource, { ...save.economy })
        world.resources.set(RandomResource, DeterministicRng.restore(save.random))
        world.resources.set(SeedBankResource, {
            ...(save.seedBank.selectedSeedId === undefined ? {} : { selectedSeedId: save.seedBank.selectedSeedId }),
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

    hasPendingCommands(): boolean {
        return this.requireSession().commands.length > 0
    }

    drainCommandResults(): Array<{ sequence: number, rejection?: CommandRejectionCode }> {
        return this.requireSession().commandResults.splice(0)
    }

    processBoundaryCommands(): boolean {
        const session = this.requireSession()
        let changed = false
        while (session.commands.length > 0) {
            const command = session.commands[0].command
            const level = session.world.resources.get(LevelStateResource)
            if (!isSessionCommand(command) && level.phase === 'gameplay' && !level.paused && level.result === 'playing') {
                break
            }
            const previousPhase = level.phase
            const previousPaused = level.paused
            const rejection = this.processNextCommand(session)
            if (rejection === undefined && isSessionCommand(command)
                && (level.phase !== previousPhase || level.paused !== previousPaused)) {
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
        if (level.result !== 'playing') return 'game-not-playing'
        if (command.type === 'completeIntro') {
            if (level.phase !== 'intro') return 'intro-already-complete'
            level.phase = 'gameplay'
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
        if (level.phase !== 'gameplay') return 'intro-not-complete'
        if (level.paused) return 'game-paused'

        switch (command.type) {
            case 'selectSeed': return this.selectSeed(session, command.seedId)
            case 'placePlant': return this.placePlant(session, command.row, command.column)
            case 'collectItemAt': return this.collectItem(session, command.itemId)
            case 'clearCursor':
                if (session.world.resources.get(SeedBankResource).selectedSeedId) {
                    noteLevelOneSeedCanceled(session.world, session.gameplayTick)
                }
                session.world.resources.get(SeedBankResource).selectedSeedId = undefined
                return
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
        return this.snapshot()
    }

    snapshot(): WorldSnapshot {
        const { world, tick, gameplayTick } = this.requireSession()
        const level = world.resources.get(LevelStateResource)
        const economy = world.resources.get(EconomyStateResource)
        const seedBank = world.resources.get(SeedBankResource)
        const waves = world.resources.get(WaveResource)
        const tutorial = world.resources.get(TutorialResource)
        const seedPackets = seedBank.packets.map(packet => {
            const cooldownRemaining = Math.max(0, packet.readyAtTick - gameplayTick)
            const selected = seedBank.selectedSeedId === packet.seedId
            return {
                seedId: packet.seedId,
                ready: cooldownRemaining === 0 && !selected,
                selected,
                cooldownRemaining,
                cooldownTotal: cooldownRemaining === 0
                    ? 0
                    : this.definitions.seeds[packet.seedId].cooldownTicks,
            }
        })
        const plants = [...world.query(PositionComponent, PlantComponent)].map(entity => {
            const position = world.get(entity, PositionComponent)!
            const plant = world.get(entity, PlantComponent)!
            return { entityId: entity, ...plant, ...position }
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
                hasHead: zombie.hasHead,
                hasArm: zombie.hasArm,
                hitFlashCounter: zombie.hitFlashCounter,
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
            },
            cursor: seedBank.selectedSeedId
                ? { mode: 'seed', seedId: seedBank.selectedSeedId }
                : { mode: 'none' },
            seedPackets,
            conveyorPackets: [],
            plants,
            zombies,
            projectiles,
            items,
            lawnMowers,
            tutorial: { id: level.definition.tutorial, step: tutorial.step },
            extensions: {},
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
        const systems: ScheduledGameplaySystem[] = [
            { phase: 'command', system: { id: 'pvz:commands', run: () => this.processCommandPhase() } },
            { phase: 'tutorial', system: createLevelOneTutorialSystem(this.definitions) },
            { phase: 'spawn', system: createLevelOneWaveSystem(this.definitions) },
            { phase: 'plant', system: createPeashooterSystem(this.definitions) },
            { phase: 'zombie', system: createLevelOneZombieGroanSystem() },
            { phase: 'zombie', system: createZombieSystem(this.definitions) },
            { phase: 'projectile', system: createProjectileSystem(this.definitions) },
            { phase: 'mower', system: createMowerSystem(this.definitions) },
            { phase: 'cleanup', system: createItemSystem() },
        ]
        for (const { phase, system } of this.systemMods.apply(
            systems,
            createGameplaySystemBindings(this.definitions),
        )) schedule.add(phase, system)
        return schedule
    }

    private processNextCommand(session: Session): CommandRejectionCode | undefined {
        const queued = session.commands.shift()!
        const rejection = this.executeCommand(queued.command)
        session.commandResults.push({
            sequence: queued.sequence,
            ...(rejection === undefined ? {} : { rejection }),
        })
        return rejection
    }

    private restoreEntity(world: World, saved: SavedEntityV2): void {
        if (!saved.position) throw new Error(`Saved entity ${saved.entityId} has no position`)
        const kinds = [saved.lawnMower, saved.plant, saved.zombie, saved.projectile, saved.item]
            .filter(value => value !== undefined).length
        if (kinds !== 1) throw new Error(`Saved entity ${saved.entityId} must have exactly one domain component`)
        if ((saved.plantAttack !== undefined) !== (saved.plant !== undefined)) {
            throw new Error(`Saved entity ${saved.entityId} has an invalid plant attack component`)
        }
        const level = world.resources.get(LevelStateResource)
        const activeRow = level.definition.activeRows.includes(saved.position.row)
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
            if (!activeRow || saved.plant.column >= level.board.columns ||
                saved.plant.maxHealth !== plant.maxHealth) {
                throw new Error(`Saved plant ${saved.entityId} is invalid for the level`)
            }
            if (saved.plantAttack?.shotsRemaining !== undefined &&
                saved.plantAttack.shotsRemaining > plant.shooter.shotsPerBurst) {
                throw new Error(`Saved plant ${saved.entityId} has invalid burst state`)
            }
        }
        if (saved.zombie) {
            const zombie = this.definitions.zombies[saved.zombie.typeId]
            if (!zombie) throw new Error(`Unknown saved zombie: ${saved.zombie.typeId}`)
            if (!activeRow || saved.zombie.maxHealth !== zombie.maxHealth) {
                throw new Error(`Saved zombie ${saved.entityId} is invalid for the level`)
            }
        }
        if (saved.projectile && (!activeRow || !this.definitions.projectiles[saved.projectile.typeId])) {
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
        world.add(saved.entityId, PositionComponent, { ...saved.position })
        if (saved.lawnMower) world.add(saved.entityId, LawnMowerComponent, { ...saved.lawnMower })
        if (saved.plant) world.add(saved.entityId, PlantComponent, { ...saved.plant })
        if (saved.plantAttack) world.add(saved.entityId, PlantAttackComponent, { ...saved.plantAttack })
        if (saved.zombie) world.add(saved.entityId, ZombieComponent, { ...saved.zombie })
        if (saved.projectile) world.add(saved.entityId, ProjectileComponent, { ...saved.projectile })
        if (saved.item) world.add(saved.entityId, ItemComponent, { ...saved.item })
    }

    private selectSeed(session: Session, seedId: string): CommandRejectionCode | undefined {
        const seedBank = session.world.resources.get(SeedBankResource)
        const packet = seedBank.packets.find(packet => packet.seedId === seedId)
        if (!packet) return 'seed-not-available'
        if (packet.readyAtTick > session.gameplayTick) {
            this.emitSeedRefreshFeedback(session.world)
            return 'seed-not-ready'
        }

        if (this.availableSun(session.world) < this.definitions.seeds[seedId].sunCost) {
            this.emitNotEnoughSunFeedback(session.world)
            return 'not-enough-sun'
        }
        if (session.world.resources.get(TutorialResource).cantAffordAdviceShown) {
            emitServerEvent(session.world.resources.get(EventQueueResource), 'adviceCleared', {
                key: CANT_AFFORD_ADVICE,
            })
        }
        seedBank.selectedSeedId = seedId
        noteLevelOneSeedSelected(session.world)
    }

    private placePlant(
        session: Session,
        row: number,
        column: number,
    ): CommandRejectionCode | undefined {
        const { world, gameplayTick } = session
        const level = world.resources.get(LevelStateResource)
        const seedBank = world.resources.get(SeedBankResource)
        const seedId = seedBank.selectedSeedId
        if (!seedId) return 'no-seed-selected'

        const packet = seedBank.packets.find(packet => packet.seedId === seedId)!
        const seed = this.definitions.seeds[seedId]
        const economy = world.resources.get(EconomyStateResource)
        if (packet.readyAtTick > gameplayTick) return 'seed-not-ready'
        if (this.availableSun(world) < seed.sunCost) {
            this.emitNotEnoughSunFeedback(world)
            return 'not-enough-sun'
        }
        if (!level.definition.activeRows.includes(row)) return 'row-not-active'
        if (!Number.isInteger(column) || column < 0 || column >= level.board.columns) {
            return 'column-out-of-range'
        }
        let occupiedEntity: number | undefined
        let occupiedPlantType: string | undefined
        let plantedSeedId = seedId
        for (const entity of world.query(PositionComponent, PlantComponent)) {
            const position = world.get(entity, PositionComponent)!
            const plant = world.get(entity, PlantComponent)!
            if (position.row === row && plant.column === column) {
                occupiedEntity = entity
                occupiedPlantType = plant.typeId
            }
        }
        const upgradeSeedId = occupiedPlantType === undefined
            ? undefined
            : this.systemMods.resolvePlantUpgrade(seedId, occupiedPlantType)
        if (occupiedEntity !== undefined && !upgradeSeedId) return 'cell-occupied'
        if (upgradeSeedId) plantedSeedId = upgradeSeedId

        const plantedSeed = this.definitions.seeds[plantedSeedId]
        const definition = this.definitions.plants[plantedSeed.plant]
        if (occupiedEntity !== undefined) world.destroyEntity(occupiedEntity)
        const entity = world.createEntity()
        world.add(entity, PositionComponent, {
            x: level.board.origin.x + column * level.board.cell.width,
            y: level.board.origin.y + row * level.board.cell.height,
            row,
        })
        world.add(entity, PlantComponent, {
            typeId: plantedSeed.plant,
            seedId: plantedSeedId,
            column,
            health: definition.maxHealth,
            maxHealth: definition.maxHealth,
            eatenFlashCounter: 0,
        })
        world.add(entity, PlantAttackComponent, {
            readyAtTick: gameplayTick + definition.shooter.initialDelayTicks,
        })
        const bankSpend = Math.min(economy.sun, seed.sunCost)
        economy.sun -= bankSpend
        economy.pendingSunSpend += seed.sunCost - bankSpend
        packet.readyAtTick = gameplayTick + seed.cooldownTicks
        seedBank.selectedSeedId = undefined
        noteLevelOnePlantPlaced(world, gameplayTick, occupiedEntity !== undefined)
        emitServerEvent(world.resources.get(EventQueueResource), 'plantPlaced', {
            entityId: entity,
            typeId: plantedSeed.plant,
            row,
            column,
        })
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
            world.resources.get(SeedBankResource).selectedSeedId = undefined
            level.result = 'won'
            emitServerEvent(events, 'levelWon', {})
            return
        }

        item.state = 'collecting'
        item.disappearTicks = 0
        item.fadeTicks = 0
        const availableBefore = this.availableSun(world) - item.value
        const packet = world.resources.get(SeedBankResource).packets.find(candidate =>
            candidate.seedId === 'pvz:peashooter')
        const seedCost = this.definitions.seeds['pvz:peashooter']?.sunCost ?? Number.MAX_SAFE_INTEGER
        const availableAfter = availableBefore + item.value
        const packetReady = !!packet && packet.readyAtTick <= session.gameplayTick
        if (packetReady && availableBefore < seedCost && availableAfter >= seedCost) {
            emitServerEvent(world.resources.get(EventQueueResource), 'seedPacketFlashRequested', {
                seedId: 'pvz:peashooter',
            })
        }
        noteLevelOneSunCollected(world, session.gameplayTick, packetReady && availableAfter >= seedCost)
        emitServerEvent(world.resources.get(EventQueueResource), 'itemCollected', {
            entityId: itemId,
            typeId: item.typeId,
            value: item.value,
        })
    }

    private availableSun(world: World): number {
        const economy = world.resources.get(EconomyStateResource)
        let sun = economy.sun - economy.pendingSunSpend
        for (const entity of world.query(ItemComponent)) {
            const item = world.get(entity, ItemComponent)!
            if (item.state === 'collecting' && this.definitions.items[item.typeId]) sun += item.value
        }
        return sun
    }

    private emitNotEnoughSunFeedback(world: World): void {
        const events = world.resources.get(EventQueueResource)
        emitServerEvent(events, 'sunFlash', {})
        const tutorial = world.resources.get(TutorialResource)
        if (!tutorial.firstAdventure || tutorial.cantAffordAdviceShown) return
        tutorial.cantAffordAdviceShown = true
        emitServerEvent(events, 'advice', {
            key: CANT_AFFORD_ADVICE,
            style: 'tutorial-level1',
        })
    }

    private emitSeedRefreshFeedback(world: World): void {
        const tutorial = world.resources.get(TutorialResource)
        if (!tutorial.firstAdventure || tutorial.seedRefreshAdviceShown ||
            tutorial.step === 'pick-first-seed' || tutorial.step === 'plant-first-seed' ||
            tutorial.step === 'first-plant-done') return
        tutorial.seedRefreshAdviceShown = true
        emitServerEvent(world.resources.get(EventQueueResource), 'advice', {
            key: SEED_REFRESH_ADVICE,
            style: 'tutorial-level1',
        })
    }

    private spawnZombie(typeId: string, row: number, x: number): number {
        const { world } = this.requireSession()
        const level = world.resources.get(LevelStateResource)
        return spawnZombie(
            world,
            this.definitions,
            typeId,
            row,
            x,
            level.board.origin.y + row * level.board.cell.height - 30,
        )
    }
}

function isSessionCommand(command: GameCommand): boolean {
    return command.type === 'pause' || command.type === 'resume' || command.type === 'completeIntro'
}

function sameMods(saved: readonly EnabledMod[], expected: readonly EnabledMod[]): boolean {
    return saved.length === expected.length && saved.every((mod, index) => {
        const other = expected[index]
        return mod.id === other.id && mod.version === other.version && mod.contentHash === other.contentHash
    })
}
