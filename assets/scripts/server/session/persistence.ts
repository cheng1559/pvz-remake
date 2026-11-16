import type { World } from '@/ecs/index'
import type { EnabledMod } from '@/shared/protocol/index'
import { jsonRoundTrip, sameMods } from '@/shared/protocol/index'
import { DeterministicRng } from '../state/DeterministicRng'
import { EconomyStateResource, LevelStateResource, PacketUpgradeOfferResource, RandomResource, SeedBankResource, ZombieComponent } from '../state/components'
import { EventQueueResource } from '../state/events'
import { AchievementsResource } from '../achievements/achievements'
import { ItemComponent, SkySunResource, TutorialResource, WaveResource } from '../state/levelState'
import { parseServerSaveSnapshot, type SavedEntity, type ServerSaveSnapshot } from './save'
import { checkSavedEntity, SAVED_COMPONENTS } from './savedComponents'
import { savedSeedBank } from '../seeds/seedChooser'
import { createSession, createWorld, type ServerContent, type Session } from './session'

/**
 * Captures a session as a save; `save.ts` defines and validates the format. Each entity is saved only as it would be
 * restored (checkSavedEntity), and everything is copied as the JSON it is.
 */
export function saveSession(session: Session): ServerSaveSnapshot {
    const { world, tick, gameplayTick, mods, gameplay } = session
    const level = world.resources.get(LevelStateResource)
    const entities = world.queryableEntities().map(entityId => {
        const extensions = gameplay.components.capture(world, entityId)
        const entity: SavedEntity = { entityId, ...(Object.keys(extensions).length ? { extensions } : {}) }
        for (const { key, component } of SAVED_COMPONENTS) {
            const value = world.get(entityId, component)
            if (value !== undefined) Object.assign(entity, { [key]: asSaved(value) })
        }
        checkSavedEntity(session, world, entity)
        return entity
    })
    const wave = world.resources.get(WaveResource), eventQueue = world.resources.get(EventQueueResource)
    return parseServerSaveSnapshot({
        schemaVersion: 3,
        levelId: level.id,
        mods: mods.map(mod => ({ ...mod })),
        tick,
        gameplayTick,
        allocator: world.snapshotEntityAllocator(),
        random: world.resources.get(RandomResource).snapshot(),
        level: { phase: level.phase, result: level.result, paused: level.paused },
        // The upgrades owned are the profile's, which a restore takes again (EconomyState.ownedUpgrades).
        economy: asSaved({ ...world.resources.get(EconomyStateResource), ownedUpgrades: undefined }),
        ...(world.resources.has(PacketUpgradeOfferResource) ? { packetUpgradeOffer: asSaved(world.resources.get(PacketUpgradeOfferResource)) } : {}),
        // A repick is not saved (savedSeedBank).
        seedBank: asSaved(savedSeedBank(world.resources.get(SeedBankResource))),
        tutorial: asSaved(world.resources.get(TutorialResource)),
        skySun: asSaved(world.resources.get(SkySunResource)),
        // The wave keeps the zombies of its own that are still about.
        wave: asSaved({ ...wave, zombieIds: wave.zombieIds.filter(entity => world.get(entity, ZombieComponent) !== undefined) }),
        // Its observer is the session's own (createSession), not the save's.
        eventQueue: asSaved({ nextEventId: eventQueue.nextEventId, events: eventQueue.events }),
        achievementProgress: jsonRoundTrip(world.resources.get(AchievementsResource).progress),
        entities,
    })
}

/**
 * Rebuilds a session from a save, rejecting one that does not fit the installed content or the requested game: only
 * what would break the game once loaded (content gone, a shape the level's systems cannot run), not a state the level
 * would not have started with, which the save holds whole.
 */
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
    if (save.wave.ruleState !== undefined) {
        const rule = content.gameplay.levelRules.get(definition)
        if (!rule?.parseState) throw new Error('The saved rule state does not fit the level')
        save.wave.ruleState = rule.parseState(save.wave.ruleState)
    }
    if (save.wave.plan.some(wave => wave.zombies.some(id => !definitions.zombies[id]))) {
        throw new Error('Saved zombie waves do not match the level')
    }
    if (save.wave.index > save.wave.plan.length) throw new Error('Saved wave index is outside the level')
    if (definition.activeRows.length > 1 && (!save.wave.rowPicks ||
        save.wave.rowPicks.length !== definition.activeRows.length ||
        save.wave.rowPicks.some(row => !definition.activeRows.includes(row.row)))) {
        throw new Error('Saved wave row history does not match the level')
    }
    const board = definitions.boards[definition.board]
    const cells = save.entities.flatMap(entity => entity.gridItem ? [entity.gridItem] : [])
    if (new Set(cells.map(item => `${item.typeId}:${item.column}:${item.row}`)).size !== cells.length) throw new Error('Saved grid items share a cell')
    // The conveyor system runs on a level's belt with the save's.
    if (!!save.seedBank.conveyor !== !!definition.conveyor) throw new Error('Saved conveyor does not match the level')
    // A bank or a belt may hold any installed seed: /seed and Mods' chooser entries put in hidden seeds or other sides,
    // and a save outlives the Mod that offered them (the card can still go back to the chooser).
    for (const card of [...save.seedBank.packets, ...save.seedBank.conveyor?.packets.map(packet => packet.card) ?? []]) {
        if (card && !definitions.seeds[card.seedId]) throw new Error(`Unknown saved seed: ${card.seedId}`)
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
    world.resources.set(EconomyStateResource, {
        ...jsonRoundTrip(save.economy), sun: Math.min(definitions.economy.maxSun, save.economy.sun), ownedUpgrades: 0,
    })
    if (save.packetUpgradeOffer) world.resources.set(PacketUpgradeOfferResource, jsonRoundTrip(save.packetUpgradeOffer))
    world.resources.set(RandomResource, DeterministicRng.restore(save.random))
    world.resources.set(SeedBankResource, jsonRoundTrip(save.seedBank))
    world.resources.set(TutorialResource, jsonRoundTrip(save.tutorial))
    world.resources.set(SkySunResource, jsonRoundTrip(save.skySun))
    world.resources.set(WaveResource, jsonRoundTrip(save.wave))
    world.resources.get(AchievementsResource).progress = jsonRoundTrip(save.achievementProgress)
    world.resources.set(EventQueueResource, jsonRoundTrip(save.eventQueue))
    for (const saved of save.entities) restoreEntity(content, world, saved)
    if (new Set(save.wave.zombieIds).size !== save.wave.zombieIds.length) {
        throw new Error('Saved wave zombie IDs must be unique')
    }
    for (const entity of save.wave.zombieIds) {
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
    checkSavedEntity(content, world, saved)
    world.activateEntity(saved.entityId)
    content.gameplay.components.restore(world, saved.entityId, saved.extensions ?? {})
    for (const { key, component } of SAVED_COMPONENTS) {
        const value = saved[key]
        if (value !== undefined) world.add(saved.entityId, component, jsonRoundTrip(value) as never)
    }
}

/**
 * A state as the JSON it is saved as: what is unset (undefined) is left out, as JSON leaves it; the save's parse then
 * checks what is left (parseServerSaveSnapshot).
 */
function asSaved<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T
}

