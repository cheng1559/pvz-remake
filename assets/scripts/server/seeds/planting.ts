import type { SeedAvailability } from '@/shared/protocol/index'
import { seedTeam, type Team } from '@/shared/content/teams'
import type { SeedDefinition } from '@/shared/content/gameplay'
import { spawnZombie } from '../zombies/spawn'
import { graveAt } from '@/shared/protocol/index'
import {
    EconomyStateResource, LevelStateResource, PlantAttackComponent, PlantComponent, PositionComponent, RandomResource, SeedBankResource,
    type SeedBankState, ZombieComponent,
} from '../state/components'
import { getDebugRules } from '../debug/debugRules'
import { EventQueueResource, emitServerEvent } from '../state/events'
import { getAvailableSun } from '../level/items'
import { TutorialResource, WaveResource } from '../state/levelState'
import { initialPlantAbility } from '../plants/abilities'
import { selectedSeedId } from './seedBank'
import type { CommandRejectionCode, Session } from '../session/session'
import { getActiveTutorial } from '../tutorials'
import { levelRule } from '../rules/registry'
import { clearCursor } from './cursor'
import { placeGrave } from '../level/graves'

const CANT_AFFORD_ADVICE = 'ADVICE_CANT_AFFORD_PLANT'

/**
 * Seed selection and planting. Mods wrap these through `host.around(planting, name, ...)`; the functions call each
 * other through this object so a wrapper also applies inside the host's own rules.
 */
export const planting = {
    /** `slot` picks one bank packet; without it, the first packet holding `seedId` answers. */
    seedAvailability(session: Session, seedId: string, packetId?: number, slot?: number): SeedAvailability {
        const { world, definitions } = session
        const seedBank = world.resources.get(SeedBankResource)
        if (packetId !== undefined) return seedBank.conveyor?.packets.some(packet => packet.id === packetId && packet.seedId === seedId)
            ? {} : { reason: 'seed-not-available' }
        const packet = slot === undefined ? seedBank.packets.find(packet => packet.seedId === seedId) : seedBank.packets[slot]
        if (packet?.seedId !== seedId) return { reason: 'seed-not-available' }
        if (getDebugRules(world).cooldown && packet.readyAtTick > session.gameplayTick) {
            return { reason: 'seed-not-ready', warningKey: 'WAITING_FOR_SEED' }
        }
        if (getDebugRules(world).sunCost && getAvailableSun(world, definitions) < definitions.seeds[seedId].sunCost) {
            return { reason: 'not-enough-sun', warningKey: 'NOT_ENOUGH_SUN' }
        }
        return {}
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
        const slots = seedBank.packets.flatMap((packet, slot) => packet.seedId === seedId ? [slot] : [])
        const slot = requestedSlot ?? slots.find(slot => !planting.seedAvailability(session, seedId, undefined, slot).reason) ?? slots[0]
        const availability = planting.seedAvailability(session, seedId, undefined, slot)
        if (availability.reason) return planting.rejectSeed(session, seedId, availability)
        if (world.resources.get(TutorialResource).cantAffordAdviceShown) {
            emitServerEvent(world.resources.get(EventQueueResource), 'adviceCleared', { key: CANT_AFFORD_ADVICE })
        }
        seedBank.selection = { mode: 'seed', slot: slot! }
        getActiveTutorial(world)?.seedSelected?.(world, seedId)
    },

    selectConveyorPacket(session: Session, packetId: number): CommandRejectionCode | undefined {
        const bank = session.world.resources.get(SeedBankResource)
        const packet = bank.conveyor?.packets.find(packet => packet.id === packetId)
        if (!packet) return 'seed-not-available'
        const availability = planting.seedAvailability(session, packet.seedId, packet.id)
        if (availability.reason) return planting.rejectSeed(session, packet.seedId, availability)
        bank.selection = { mode: 'conveyor', packetId: packet.id }
    },

    /** Plants the selected seed, spending its sun and starting its recharge. */
    placePlant(session: Session, row: number, column: number): CommandRejectionCode | undefined {
        const { world, gameplayTick, definitions } = session
        const level = world.resources.get(LevelStateResource)
        const seedBank = world.resources.get(SeedBankResource)
        const seedId = selectedSeedId(seedBank)
        if (!seedId) return 'no-seed-selected'

        const packet = seedBank.selection.mode === 'seed' ? seedBank.packets[seedBank.selection.slot] : undefined
        const seed = definitions.seeds[seedId]
        const rules = getDebugRules(world)
        const sunCost = !seedBank.conveyor && rules.sunCost ? seed.sunCost : 0
        if (rules.cooldown && packet && packet.readyAtTick > gameplayTick) return 'seed-not-ready'
        if (getAvailableSun(world, definitions) < sunCost) {
            notEnoughSun(session)
            return 'not-enough-sun'
        }
        // Board::MouseDownWithPlant: where the rules say so (Whack-a-Zombie), a seed refused by Board::CanPlantAt is
        // dropped (RefreshSeedPacketFromCursor with FOLEY_DROP) instead of staying in hand.
        const refuseCell = (code: CommandRejectionCode): CommandRejectionCode => {
            if (levelRule(world)?.dropsRefusedSeeds) {
                clearCursor(world)
                getActiveTutorial(world)?.seedCanceled?.(world, gameplayTick)
                emitServerEvent(world.resources.get(EventQueueResource), 'seedDropped', {})
            }
            return code
        }
        if (!Number.isInteger(row) || row < 0 || row >= level.board.rows ||
            !level.definition.activeRows.includes(row)) return refuseCell('row-not-active')
        if (!Number.isInteger(column) || column < 0 || column >= level.board.columns) {
            return refuseCell('column-out-of-range')
        }
        const team = packet?.team ?? seedTeam(seed)
        if (seed.kind === 'zombie') {
            // Challenge::IZombieMouseDownWithZombie: a zombie goes into any cell of an active row, whatever stands there.
            const entity = planting.placeZombie(session, seed.id, row, column, team)
            spendSeed(session, seed, packet, sunCost)
            emitServerEvent(world.resources.get(EventQueueResource), 'zombiePlaced', { entityId: entity, typeId: seed.id, row, column })
            return
        }
        if (seed.kind === 'grave') {
            // Like Grave Danger's graves (placeGrave): any cell of an active row without a grave (the plants there die);
            // on the plants' side when its packet is, so its zombies rise there too.
            if (graveAt(world.resources.get(WaveResource).graves, row, column)) return refuseCell('cell-has-grave')
            placeGrave(world, definitions, row, column, gameplayTick, team === 'plants' ? 'plants' : undefined)
            spendSeed(session, seed, packet, sunCost)
            return
        }
        if (levelRule(world)?.canPlantAt?.(world, row, column) === false) return refuseCell('column-out-of-range')
        // Board::CanPlantAt: nothing past the level's red line, with ADVICE_NOT_PASSED_LINE once a game.
        const line = level.definition.plantingLine
        if (line && column > line.column) {
            const displayed = world.resources.get(TutorialResource).displayedAdvice ??= []
            if (!displayed.includes('ADVICE_NOT_PASSED_LINE')) {
                displayed.push('ADVICE_NOT_PASSED_LINE')
                emitServerEvent(world.resources.get(EventQueueResource), 'advice', { key: 'ADVICE_NOT_PASSED_LINE', style: 'hint' })
            }
            return refuseCell('column-out-of-range')
        }
        const occupiedEntity = planting.findPlantAt(session, row, column)
        if (occupiedEntity !== undefined) return refuseCell('cell-occupied')
        // Board::CanPlantAt: graves block planting, except that a grave buster needs one.
        const onGrave = !!graveAt(world.resources.get(WaveResource).graves, row, column)
        if (onGrave !== (seed.placement === 'grave')) {
            // Board::DisplayAdvice remembers the help index for the rest of this game.
            const key = onGrave ? 'ADVICE_PLANT_NOT_ON_GRAVE' : 'ADVICE_GRAVEBUSTERS_ON_GRAVES'
            const displayed = world.resources.get(TutorialResource).displayedAdvice ??= []
            if (!displayed.includes(key)) {
                displayed.push(key)
                session.graveAdvice = key
                emitServerEvent(world.resources.get(EventQueueResource), 'advice', { key, style: 'hint' })
            }
            return refuseCell(onGrave ? 'cell-has-grave' : 'cell-needs-grave')
        }
        if (session.graveAdvice) {
            emitServerEvent(world.resources.get(EventQueueResource), 'adviceCleared', { key: session.graveAdvice })
            session.graveAdvice = undefined
        }

        const entity = planting.createPlant(session, seedId, row, column, team)
        spendSeed(session, seed, packet, sunCost)
        getActiveTutorial(world)?.plantPlaced?.(world, gameplayTick, seed.id, occupiedEntity !== undefined)
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
        const entity = spawnZombie(world, definitions, typeId, row, board.origin.x + column * board.cell.width - 30 + offsetX,
            board.origin.y + row * board.cell.height - 30)
        if (team === 'plants') world.get(entity, ZombieComponent)!.team = 'plants'
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
        const entity = world.createEntity()
        world.add(entity, PositionComponent, {
            x: level.board.origin.x + column * level.board.cell.width + (offset ? random.integer(offset.min.x, offset.max.x) : 0),
            y: level.board.origin.y + row * level.board.cell.height + (offset ? random.integer(offset.min.y, offset.max.y) : 0),
            row,
        })
        world.add(entity, PlantComponent, {
            typeId: plantedSeed.id,
            seedId,
            column,
            health: definition.maxHealth,
            maxHealth: definition.maxHealth,
            recentlyEatenCounter: 0,
            ...(behaviorState === undefined ? {} : { behaviorState }),
            ...(team === 'zombies' ? { team } : {}),
        })
        const ability = initialPlantAbility(definition, random)
        if (ability) world.get(entity, PlantComponent)!.ability = ability
        const delay = definition.shooter?.initialDelayTicks ?? definition.producer?.initialDelayTicks
        if (delay) world.add(entity, PlantAttackComponent, {
            readyAtTick: gameplayTick + random.integer(delay.min, delay.max),
        })
        return entity
    },

    /** The plant occupying a cell, if any; plants that do not occupy their cell are skipped. */
    findPlantAt(session: Session, row: number, column: number): number | undefined {
        const { world, definitions } = session
        return [...world.query(PositionComponent, PlantComponent)].find(entity =>
            definitions.plants[world.get(entity, PlantComponent)!.typeId].occupiesCell !== false && world.get(entity, PositionComponent)!.row === row && world.get(entity, PlantComponent)!.column === column)
    },
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
