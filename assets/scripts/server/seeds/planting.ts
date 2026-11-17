import type { SeedAvailability } from '@/shared/protocol/index'
import { seedTeam, type Team } from '@/shared/content/teams'
import { cellPosition, type SeedDefinition, zombieRowY } from '@/shared/content/gameplay'
import { spawnZombie } from '../zombies/spawn'
import { EconomyStateResource, LevelStateResource, RandomResource, SeedBankResource, type SeedBankState } from '../state/resources'
import { getDebugRules } from '../debug/debugRules'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { adviceShown, displayAdviceOnce } from '../tutorials/advice'
import { PlantFactoryResource } from '../plants/Plant'
import { startPlantAnimations } from '../plants/animation'
import { packetAvailability, seedSunCost, selectedSeedId, selectedTeam } from './seedBank'
import type { CommandRejectionCode, Session } from '../session/session'
import { getActiveTutorial } from '../tutorials'
import { levelRule } from '../rules/registry'
import { clearCursor } from './cursor'
import { placeGrave } from '../gridItems/graves'
import { graveAt } from '@/shared/content/graves'
import { cellPlant, type PlantingLawn, type PlantingRefusal, plantingRefusal } from '@/shared/content/planting'
import { lawnPlants, plantInPlay } from '../level/lawn'
import { gridItems } from '../gridItems/gridItems'
import { placeCrater } from '../gridItems/craters'
import { craterAt } from '@/shared/content/craters'
import { isPlantAsleep } from '../plants/sleep'

const CANT_AFFORD_ADVICE = 'ADVICE_CANT_AFFORD_PLANT'

/** Board::MouseDownWithPlant: what a placement refused by Board::CanPlantAt answers. */
const REJECTIONS: Record<PlantingRefusal, CommandRejectionCode> = {
    'row-not-active': 'row-not-active', 'column-out-of-range': 'column-out-of-range', 'rule-closed': 'column-out-of-range',
    'past-line': 'column-out-of-range', 'cell-occupied': 'cell-occupied', 'cell-has-grave': 'cell-has-grave',
    'not-on-grave': 'cell-has-grave', 'cell-needs-grave': 'cell-needs-grave', 'cell-has-own-grave': 'cell-has-own-grave',
    'cell-has-crater': 'cell-has-crater', 'not-on-crater': 'cell-has-crater',
}

/** Board::MouseDownWithPlant: the advice a refusal of a grave or a crater shows. */
const GRAVE_ADVICE: Partial<Record<PlantingRefusal, string>> = {
    'not-on-grave': 'ADVICE_PLANT_NOT_ON_GRAVE', 'cell-needs-grave': 'ADVICE_GRAVEBUSTERS_ON_GRAVES',
    'not-on-crater': 'ADVICE_PLANT_NOT_ON_CRATER',
}

/**
 * Seed selection and planting. Mods wrap these through `host.around(planting, name, ...)`; the functions call each
 * other through this object so a wrapper also applies inside the host's own rules.
 */
export const planting = {
    /** `slot` picks one bank packet; without it, the first packet holding `seedId` answers. */
    seedAvailability(session: Session, seedId: string, packetId?: number, slot?: number): SeedAvailability {
        const { world, definitions } = session
        const seedBank = world.resources.get(SeedBankResource)
        if (packetId !== undefined) return seedBank.conveyor?.packets.some(packet => packet.id === packetId && packet.card.seedId === seedId)
            ? {} : { reason: 'seed-not-available' }
        const packet = slot === undefined ? seedBank.packets.find(packet => packet?.seedId === seedId) : seedBank.packets[slot]
        if (packet?.seedId !== seedId) return { reason: 'seed-not-available' }
        return packetAvailability(world, definitions, packet, session.gameplayTick)
    },

    /** Feedback for a refused selection; returns the rejection. */
    rejectSeed(session: Session, _seedId: string, availability: SeedAvailability): CommandRejectionCode | undefined {
        if (availability.reason === 'seed-not-ready') getActiveTutorial(session.world)?.seedRejected?.(session.world, availability.reason)
        else if (availability.reason === 'not-enough-sun') notEnoughSun(session)
        return availability.reason
    },

    selectSeed(session: Session, seedId: string, requestedSlot?: number): CommandRejectionCode | undefined {
        const { world } = session
        const seedBank = world.resources.get(SeedBankResource)
        // Without a slot, prefer a ready copy of the seed so a recharging duplicate does not hide it.
        const slots = seedBank.packets.flatMap((packet, slot) => packet?.seedId === seedId ? [slot] : [])
        const slot = requestedSlot ?? slots.find(slot => !planting.seedAvailability(session, seedId, undefined, slot).reason) ?? slots[0]
        const availability = planting.seedAvailability(session, seedId, undefined, slot)
        if (availability.reason) return planting.rejectSeed(session, seedId, availability)
        if (adviceShown(world, CANT_AFFORD_ADVICE)) {
            emitServerEvent(world.resources.get(EventQueueResource), 'adviceCleared', { key: CANT_AFFORD_ADVICE })
        }
        seedBank.selection = { mode: 'seed', slot: slot! }
        getActiveTutorial(world)?.seedSelected?.(world, seedId)
    },

    selectConveyorPacket(session: Session, packetId: number): CommandRejectionCode | undefined {
        const bank = session.world.resources.get(SeedBankResource)
        const packet = bank.conveyor?.packets.find(packet => packet.id === packetId)
        if (!packet) return 'seed-not-available'
        const availability = planting.seedAvailability(session, packet.card.seedId, packet.id)
        if (availability.reason) return planting.rejectSeed(session, packet.card.seedId, availability)
        bank.selection = { mode: 'conveyor', packetId: packet.id }
    },

    /** Plants the selected seed, spending its sun and starting its recharge. */
    placePlant(session: Session, row: number, column: number): CommandRejectionCode | undefined {
        const { world, gameplayTick, definitions } = session
        const seedBank = world.resources.get(SeedBankResource)
        const seedId = selectedSeedId(seedBank)
        if (!seedId) return 'no-seed-selected'

        const packet = seedBank.selection.mode === 'seed' ? seedBank.packets[seedBank.selection.slot] : undefined
        const seed = definitions.seeds[seedId]
        // A bank packet still has to be usable as it goes down (SeedPacket::CanPickUp); a conveyor's seeds cost nothing.
        const sunCost = packet ? seedSunCost(world, definitions, seedId) : 0
        const availability = packet ? packetAvailability(world, definitions, packet, gameplayTick) : {}
        if (availability.reason === 'seed-not-ready') return 'seed-not-ready'
        if (availability.reason === 'not-enough-sun') {
            notEnoughSun(session)
            return 'not-enough-sun'
        }
        // Board::MouseDownWithPlant: where the rules say so (Whack-a-Zombie), a seed refused by Board::CanPlantAt is
        // dropped (RefreshSeedPacketFromCursor with FOLEY_DROP) instead of staying in hand.
        const refuseCell = (code: CommandRejectionCode): CommandRejectionCode => {
            if (levelRule(world)?.dropsRefusedSeeds) {
                clearCursor(world)
                getActiveTutorial(world)?.seedCanceled?.(world, definitions, gameplayTick)
                emitServerEvent(world.resources.get(EventQueueResource), 'seedDropped', {})
            }
            return code
        }
        const team = selectedTeam(seedBank) ?? seedTeam(seed)
        const refusal = plantingRefusal(sessionLawn(session), seed, team, row, column)
        if (refusal) {
            // Board::MouseDownWithPlant: the line's advice once a game; Board::DisplayAdvice remembers a grave's help
            // index for the rest of this game, and the next planting clears it.
            if (refusal === 'past-line') displayAdviceOnce(world, 'ADVICE_NOT_PASSED_LINE', 'hint')
            const graveAdvice = GRAVE_ADVICE[refusal]
            if (graveAdvice && displayAdviceOnce(world, graveAdvice, 'hint')) session.graveAdvice = graveAdvice
            return refuseCell(REJECTIONS[refusal])
        }
        if (seed.kind === 'zombie') {
            const entity = planting.placeZombie(session, seed.id, row, column, team)
            spendSeed(session, seed, packet, sunCost)
            emitServerEvent(world.resources.get(EventQueueResource), 'zombiePlaced', { entityId: entity, typeId: seed.id, row, column })
            return
        }
        if (seed.kind === 'grave') {
            // On the plants' side when its packet is, so its zombies rise there too.
            placeGrave(world, definitions, row, column, gameplayTick, team === 'plants' ? 'plants' : undefined)
            spendSeed(session, seed, packet, sunCost)
            emitServerEvent(world.resources.get(EventQueueResource), 'gravePlaced', { seedId, row, column })
            return
        }
        if (seed.kind === 'crater') {
            placeCrater(world, definitions, row, column, seed.craterTicks, team)
            spendSeed(session, seed, packet, sunCost)
            emitServerEvent(world.resources.get(EventQueueResource), 'craterPlaced', { seedId, row, column })
            return
        }
        if (session.graveAdvice) {
            emitServerEvent(world.resources.get(EventQueueResource), 'adviceCleared', { key: session.graveAdvice })
            session.graveAdvice = undefined
        }

        const entity = planting.createPlant(session, seedId, row, column, team)
        spendSeed(session, seed, packet, sunCost)
        getActiveTutorial(world)?.plantPlaced?.(world, definitions, gameplayTick, seed.id)
        emitServerEvent(world.resources.get(EventQueueResource), 'plantPlaced', {
            entityId: entity,
            typeId: seed.id,
            row,
            column,
        })
    },

    /**
     * Challenge::IZombiePlaceZombie: the zombie stands in the row, 30 left of the cell, on `team`'s side; one on the
     * plants' side `facingRightOffsetX` further.
     */
    placeZombie(session: Session, typeId: string, row: number, column: number, team: Team = 'zombies'): number {
        const { world, definitions } = session
        const board = world.resources.get(LevelStateResource).board
        const offsetX = team === 'plants' ? definitions.zombies[typeId].facingRightOffsetX ?? 0 : 0
        const entity = spawnZombie(world, definitions, typeId, row, cellPosition(board, row, column).x - 30 + offsetX, zombieRowY(board, row))
        if (team === 'plants') world.zombies.get(entity)!.team = 'plants'
        return entity
    },

    /** Creates the plant of `seedId` in a cell without any planting checks, on the plants' side unless `team` says otherwise. */
    createPlant(session: Session, seedId: string, row: number, column: number, team?: Team): number {
        const { world, gameplayTick, definitions, gameplay } = session
        const level = world.resources.get(LevelStateResource)
        const plantedSeed = definitions.seeds[seedId]
        if (plantedSeed.kind !== 'plant') throw new Error(`${seedId} is a ${plantedSeed.kind} seed, not a plant seed`)
        const definition = definitions.plants[plantedSeed.id]
        const behaviorState = gameplay.plantBehaviors.createState(plantedSeed.id, definition)
        const offset = definition.plantingOffset, random = world.resources.get(RandomResource)
        const entity = world.createEntity(), cell = cellPosition(level.board, row, column)
        const position = {
            x: cell.x + (offset ? random.integer(offset.min.x, offset.max.x) : 0),
            y: cell.y + (offset ? random.integer(offset.min.y, offset.max.y) : 0),
            row,
        }
        // Made as its kind (PlantFactoryResource), which starts it on what it does of its own (Plant.start).
        const plant = world.resources.get(PlantFactoryResource).create(plantedSeed.id)
        plant.id = entity
        plant.position = position
        plant.seedId = seedId
        plant.column = column
        if (behaviorState !== undefined) plant.behaviorState = behaviorState
        if (team === 'zombies') plant.team = team
        world.insert(world.plants, plant)
        plant.start(random, gameplayTick)
        startPlantAnimations(plant, definition, isPlantAsleep(definition, level.board), random)
        return entity
    },

    /** The plant holding a cell (holdsCell), if any. */
    findPlantAt(session: Session, row: number, column: number): number | undefined {
        return cellPlant(session.definitions.plants, lawnPlants(session.world), row, column)?.id
    },
}

/** The World as the shared planting decision reads it; its plants are planting.findPlantAt's, so a wrapper of it applies. */
function sessionLawn(session: Session): PlantingLawn {
    const { world } = session
    const { definition, board } = world.resources.get(LevelStateResource)
    return {
        level: definition, board, rule: levelRule(world),
        plantAt: (row, column) => {
            const entity = planting.findPlantAt(session, row, column)
            return entity === undefined ? undefined : plantInPlay(world, entity)
        },
        graveAt: (row, column) => graveAt(gridItems(world), row, column),
        craterAt: (row, column) => craterAt(gridItems(world), row, column),
    }
}

/** SeedPacket::WasPlanted: the seed's sun is spent, its packet (or conveyor packet) used and the cursor cleared. */
function spendSeed(session: Session, seed: SeedDefinition, packet: SeedBankState['packets'][number] | undefined, sunCost: number): void {
    const { world, gameplayTick } = session
    const seedBank = world.resources.get(SeedBankResource)
    if (seedBank.conveyor) {
        const conveyor = seedBank.conveyor
        const packetId = seedBank.selection.mode === 'conveyor' ? seedBank.selection.packetId : undefined
        // Positions are absolute; the remaining packets close the gap through normal belt movement.
        conveyor.packets = conveyor.packets.filter(packet => packet.id !== packetId)
        emitServerEvent(world.resources.get(EventQueueResource), 'adviceCleared', { key: 'ADVICE_NOT_PASSED_LINE' })
    }
    const economy = world.resources.get(EconomyStateResource)
    const bankSpend = Math.min(economy.sun, sunCost)
    economy.sun -= bankSpend
    economy.pendingSunSpend += sunCost - bankSpend
    if (packet) {
        packet.cooldownTotal = getDebugRules(world).cooldown ? seed.cooldownTicks : 0
        packet.readyAtTick = gameplayTick + packet.cooldownTotal
    }
    clearCursor(world)
}

function notEnoughSun(session: Session): void {
    emitServerEvent(session.world.resources.get(EventQueueResource), 'sunFlash', {})
    getActiveTutorial(session.world)?.seedRejected?.(session.world, 'not-enough-sun')
}
