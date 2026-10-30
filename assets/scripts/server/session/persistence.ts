import type { World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import type { EnabledMod } from '@/shared/protocol/index'
import { jsonRoundTrip } from '@/shared/protocol/index'
import { DeterministicRng } from '../state/DeterministicRng'
import {
    EconomyStateResource,
    LawnMowerComponent,
    LevelStateResource,
    MAX_SUN,
    PlantAttackComponent,
    PlantComponent,
    PositionComponent,
    ProjectileComponent,
    RandomResource,
    SeedBankResource,
    ZombieComponent,
} from '../state/components'
import { EventQueueResource } from '../state/events'
import { ItemComponent, TutorialResource, WaveResource } from '../state/levelState'
import { initialPlantAbility } from '../plants/abilities'
import { parseServerSaveSnapshot, type SavedEntity, type ServerSaveSnapshot } from './save'
import { availableSeeds } from '../seeds/seedChooser'
import { createSession, createWorld, type ServerContent, type Session } from './session'

/** Captures a session as a save; `save.ts` defines and validates the format. */
export function saveSession(session: Session): ServerSaveSnapshot {
    const { world, tick, gameplayTick, mods, definitions, gameplay } = session
    const level = world.resources.get(LevelStateResource)
    const entities = world.queryableEntities().map(entityId => {
        const extensions = gameplay.components.capture(world, entityId)
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
            gameplay.plantBehaviors.validateState(plant, definitions.plants[plant.typeId])
            entity.plant = { ...plant, ...(plant.ability ? { ability: { ...plant.ability } } : {}) }
        }
        if (plantAttack) entity.plantAttack = {
            readyAtTick: plantAttack.readyAtTick,
            ...(plantAttack.fireAtTick === undefined ? {} : { fireAtTick: plantAttack.fireAtTick }),
            ...(plantAttack.shotsRemaining === undefined ? {} : { shotsRemaining: plantAttack.shotsRemaining }),
        }
        if (zombie) {
            gameplay.zombieBehaviors.validateState(zombie, definitions.zombies[zombie.typeId])
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
            ...(wave.graves === undefined ? {} : { graves: wave.graves.map(grave => ({ ...grave })) }),
            ...(wave.graveRiseAtTick === undefined ? {} : { graveRiseAtTick: wave.graveRiseAtTick }),
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

/** Rebuilds a session from a save, rejecting one that does not fit the installed content or the requested game. */
export function restoreSession(
    content: ServerContent,
    value: unknown,
    expectedLevelId?: string,
    expectedMods?: readonly EnabledMod[],
): Session {
    const { definitions } = content
    const save = parseServerSaveSnapshot(value)
    if (expectedLevelId !== undefined && save.levelId !== expectedLevelId) {
        throw new Error(`Save level ${save.levelId} does not match requested level ${expectedLevelId}`)
    }
    if (expectedMods !== undefined && !sameMods(save.mods, expectedMods)) {
        throw new Error('Save enabled mods do not match the requested content set')
    }
    const definition = content.levels.levels[save.levelId]
    if (!definition) throw new Error(`Unknown saved level: ${save.levelId}`)
    if (save.wave.index > definition.waves.length) throw new Error('Saved wave index is outside the level')
    if (definition.zombiePool && (!save.wave.zombiesByWave || save.wave.zombiesByWave.length !== definition.waves.length ||
        save.wave.zombiesByWave.some(wave => wave.some(id => !definitions.zombies[id])))) {
        throw new Error('Saved zombie waves do not match the level')
    }
    if (definition.activeRows.length > 1 && (!save.wave.rowPicks ||
        save.wave.rowPicks.length !== definition.activeRows.length ||
        save.wave.rowPicks.some(row => !definition.activeRows.includes(row.row)))) {
        throw new Error('Saved wave row history does not match the level')
    }
    const board = definitions.boards[definition.board]
    if (save.wave.graves?.some(grave => grave.row >= board.rows || grave.column >= board.columns)) {
        throw new Error('Saved grave is outside the board')
    }
    const slots = definition.conveyor ? 0 : definition.seedBankSlots ?? definition.seedPackets.length
    if (!!save.seedBank.conveyor !== !!definition.conveyor || save.seedBank.conveyor?.packets.some(packet => !definition.conveyor!.seeds.some(seed => seed.id === packet.seedId))) {
        throw new Error('Saved conveyor does not match the level')
    }
    if (save.seedBank.conveyor && save.seedBank.conveyor.packets.length > definition.conveyor!.capacity) throw new Error('Saved conveyor exceeds capacity')
    if (save.seedBank.conveyor?.lastSeedId && !definition.conveyor!.seeds.some(seed => seed.id === save.seedBank.conveyor!.lastSeedId)) throw new Error('Saved conveyor last seed is not in the supply')
    if (save.seedBank.selection.mode === 'tool' && !definition.tools?.includes(save.seedBank.selection.toolId)) throw new Error('Saved tool is unavailable in this level')
    if (save.seedBank.choosing ? !definition.seedBankSlots || save.level.phase !== 'intro' || save.seedBank.packets.length > slots
        : save.seedBank.packets.length !== slots) throw new Error('Saved seed bank size does not match the level')
    // Only an open chooser is limited to unlocked seeds; /seed may put any installed seed in a confirmed bank.
    if (definition.seedBankSlots && (save.seedBank.choosing === undefined || save.seedBank.choosing &&
        save.seedBank.packets.some(packet => !availableSeeds(definitions, definition, save.tutorial.firstAdventure).includes(packet.seedId)))) {
        throw new Error('Saved seed choice does not match the level')
    }
    for (const packet of save.seedBank.packets) {
        if (!definitions.seeds[packet.seedId]) throw new Error(`Unknown saved seed: ${packet.seedId}`)
    }
    const selection = save.seedBank.selection
    if (selection.mode === 'seed' && !save.seedBank.packets[selection.slot] ||
        selection.mode === 'conveyor' && !save.seedBank.conveyor?.packets.some(packet => packet.id === selection.packetId)) {
        throw new Error('Saved selected seed is not in the seed bank')
    }

    const world = createWorld(content)
    world.resources.set(LevelStateResource, {
        id: save.levelId,
        definition,
        board,
        ...save.level,
    })
    world.resources.set(EconomyStateResource, { ...save.economy, sun: Math.min(MAX_SUN, save.economy.sun) })
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
    for (const saved of save.entities) restoreEntity(content, world, saved)
    const waveZombieIds = save.wave.zombieIds ?? []
    if (new Set(waveZombieIds).size !== waveZombieIds.length) {
        throw new Error('Saved wave zombie IDs must be unique')
    }
    for (const entity of waveZombieIds) {
        if (!world.get(entity, ZombieComponent)) throw new Error(`Saved wave zombie ${entity} is invalid`)
    }
    const collectingSun = [...world.query(ItemComponent)].reduce((total, entity) => {
        const item = world.get(entity, ItemComponent)!
        return total + (item.state === 'collecting' && definitions.items[item.typeId] ? item.value : 0)
    }, 0)
    if (save.economy.pendingSunSpend > collectingSun) {
        throw new Error('Saved pending sun spend exceeds collecting sun')
    }
    world.restoreEntityAllocator(save.allocator)
    return createSession(content, world, { tick: save.tick, gameplayTick: save.gameplayTick }, save.mods)
}

function restoreEntity(content: ServerContent, world: World, saved: SavedEntity): void {
    const { definitions, gameplay } = content
    if (!saved.position) throw new Error(`Saved entity ${saved.entityId} has no position`)
    const kinds = [saved.lawnMower, saved.plant, saved.zombie, saved.projectile, saved.item]
        .filter(value => value !== undefined).length
    if (kinds !== 1 && !(kinds === 0 && saved.extensions && Object.keys(saved.extensions).length)) throw new Error(`Saved entity ${saved.entityId} must have exactly one domain component`)
    const savedPlantDefinition = saved.plant ? definitions.plants[saved.plant.typeId] : undefined
    const hasAttack = !!(savedPlantDefinition?.shooter || savedPlantDefinition?.producer)
    if (saved.plantAttack !== undefined && !hasAttack ||
        saved.plant !== undefined && savedPlantDefinition !== undefined && hasAttack !== (saved.plantAttack !== undefined)) {
        throw new Error(`Saved entity ${saved.entityId} has an invalid plant attack component`)
    }
    const level = world.resources.get(LevelStateResource)
    const activeRow = level.definition.activeRows.includes(saved.position.row)
    const boardRow = saved.position.row >= 0 && saved.position.row < level.board.rows
    if (saved.lawnMower && !definitions.lawnMowers[saved.lawnMower.typeId]) {
        throw new Error(`Unknown saved mower: ${saved.lawnMower.typeId}`)
    }
    if (saved.lawnMower && (!activeRow || saved.lawnMower.typeId !== level.definition.lawnMower)) {
        throw new Error(`Saved mower ${saved.entityId} is invalid for the level`)
    }
    if (saved.plant) {
        const plant = definitions.plants[saved.plant.typeId]
        const seed = definitions.seeds[saved.plant.seedId]
        if (!plant || !seed || seed.plant !== saved.plant.typeId) {
            throw new Error(`Unknown saved plant: ${saved.plant.typeId}`)
        }
        gameplay.plantBehaviors.validateState(saved.plant, plant)
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
        const zombie = definitions.zombies[saved.zombie.typeId]
        if (!zombie) throw new Error(`Unknown saved zombie: ${saved.zombie.typeId}`)
        gameplay.zombieBehaviors.validateState(saved.zombie, zombie)
        if (!boardRow || saved.zombie.maxHealth !== zombie.maxHealth ||
            saved.zombie.helmHealth > (zombie.helm?.health ?? 0) || saved.zombie.hasPole && !zombie.vault ||
            (saved.zombie.animation === 'anim_run' || saved.zombie.state === 'vaulting') && !zombie.vault) {
            throw new Error(`Saved zombie ${saved.entityId} is invalid for the level`)
        }
    }
    if (saved.projectile && (!boardRow || !definitions.projectiles[saved.projectile.typeId])) {
        throw new Error(`Unknown saved projectile: ${saved.projectile.typeId}`)
    }
    if (saved.item && ((saved.item.typeId === level.definition.award.id
        ? saved.item.value !== 1
        : !definitions.items[saved.item.typeId] ||
            definitions.items[saved.item.typeId].value !== saved.item.value &&
            !(saved.item.typeId === 'pvz:sun' && saved.item.value === 15)) || saved.position.row !== -1)) {
        throw new Error(`Unknown saved item: ${saved.item.typeId}`)
    }

    world.activateEntity(saved.entityId)
    gameplay.components.restore(world, saved.entityId, saved.extensions ?? {})
    world.add(saved.entityId, PositionComponent, { ...saved.position })
    if (saved.lawnMower) world.add(saved.entityId, LawnMowerComponent, { ...saved.lawnMower })
    if (saved.plant) world.add(saved.entityId, PlantComponent, { ...saved.plant })
    if (saved.plantAttack) world.add(saved.entityId, PlantAttackComponent, { ...saved.plantAttack })
    if (saved.zombie) world.add(saved.entityId, ZombieComponent, { ...saved.zombie })
    if (saved.projectile) world.add(saved.entityId, ProjectileComponent, { ...saved.projectile })
    if (saved.item) world.add(saved.entityId, ItemComponent, { ...saved.item })
}

function abilityMatches(definition: GameplayDefinitions['plants'][string], state: string): boolean {
    if (definition.fuse) return state === 'fuse'
    if (definition.mine) return state === 'arming' || state === 'rising' || state === 'armed'
    if (definition.producer?.growth) return state === 'small' || state === 'growing' || state === 'big'
    if (definition.graveBuster) return state === 'landing' || state === 'eating'
    return state === 'ready' || state === 'biting' || state === 'got-one' || state === 'missed' ||
        state === 'digesting' || state === 'swallowing'
}

function sameMods(saved: readonly EnabledMod[], expected: readonly EnabledMod[]): boolean {
    return saved.length === expected.length && saved.every((mod, index) => {
        const other = expected[index]
        return mod.id === other.id && mod.version === other.version && mod.contentHash === other.contentHash
    })
}
