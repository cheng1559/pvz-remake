import { Schedule, type World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { debugCondition, debugInteger, debugSuccess, debugSyntax, normalizeDebugName, type DebugCliCommand, type DebugCliResult } from '@/shared/debug/DebugCli'
import { damageZombie } from '../zombies/damage'
import {
    EconomyStateResource,
    LawnMowerComponent,
    LevelStateResource,
    MAX_SUN,
    PlantComponent,
    PositionComponent,
    RandomResource,
    SeedBankResource,
    ZombieComponent,
} from '../components'
import { pickZombieSpawnX, spawnZombie } from '../zombies/spawn'
import { ItemComponent, TutorialResource, WaveResource } from '../levelState'
import { createWaveSystem } from '../waves'
import { createGrave } from '../graves'
import { MAX_MONEY, spawnLoot } from '../loot'
import { graveAt } from '@/shared/protocol/index'
import { emitServerEvent, EventQueueResource } from '../events'
import { DebugRulesResource, getDebugRules } from './DebugRules'

export const executor = { execute: executeCommand }

export function executeDebugGameCommand(...args: Parameters<typeof executeCommand>): DebugCliResult {
    return executor.execute(...args)
}

function executeCommand(
    world: World, definitions: GameplayDefinitions, tick: number, command: DebugCliCommand,
    createPlant: (seedId: string, row: number, column: number) => number,
): DebugCliResult {
    const { name, args } = command
    const level = world.resources.get(LevelStateResource)
    const preference = ['cooldown', 'suncost', 'sunspawning', 'plantinvincible', 'collect'].includes(name)
    if (!preference && name !== 'plant' && (level.phase !== 'gameplay' || level.result !== 'playing')) return debugCondition('DEBUG_REQUIRES_LEVEL', name)
    const economy = world.resources.get(EconomyStateResource)
    const events = world.resources.get(EventQueueResource)
    const findType = (entries: Record<string, unknown>, value: string) => Object.keys(entries).find(id => normalizeDebugName(id) === normalizeDebugName(value))
    const position = (rowValue?: string, columnValue?: string) => {
        const row = rowValue === undefined ? level.definition.activeRows[world.resources.get(RandomResource).integer(0, level.definition.activeRows.length - 1)] : (debugInteger(rowValue) ?? 0) - 1
        const column = columnValue === undefined ? undefined : (debugInteger(columnValue) ?? 0) - 1
        if (row < 0 || row >= level.board.rows) return null
        if (column !== undefined && (column < 0 || column >= level.board.columns)) return null
        return { row, column }
    }
    const invalidPosition = () => debugSyntax(`Use row 1-${level.board.rows} and col 1-${level.board.columns}`)
    switch (name) {
        case 'sun':
        case 'money': {
            const amount = debugInteger(args[1])
            if (amount === null) return debugSyntax('Amount must be an integer')
            const next = (args[0].toLowerCase() === 'add' ? economy[name] : 0) + amount
            if (!Number.isSafeInteger(next)) return debugSyntax('Amount is too large')
            economy[name] = Math.max(0, Math.min(name === 'sun' ? MAX_SUN : MAX_MONEY, next))
            if (name === 'sun') economy.pendingSunSpend = 0
            return debugSuccess(`${name}: ${economy[name]}`)
        }
        case 'plant': {
            const seedId = findType(definitions.seeds, args[0])
            if (!seedId) return debugCondition('DEBUG_PLANT_NOT_INSTALLED', args[0])
            const grid = position(args[1], args[2])
            if (!grid) return invalidPosition()
            const entityId = createPlant(seedId, grid.row, grid.column!)
            emitServerEvent(events, 'plantPlaced', { entityId, typeId: definitions.seeds[seedId].plant,
                row: grid.row, column: grid.column! })
            return debugSuccess(`Planted ${args[0]}`)
        }
        case 'seed': {
            const bank = world.resources.get(SeedBankResource)
            if (bank.choosing) return debugCondition('DEBUG_FINISH_CHOOSING')
            const slot = debugInteger(args[0])
            if (slot === null || slot < 1 || slot > bank.packets.length) {
                return debugSyntax(`Use slot 1-${bank.packets.length}`)
            }
            const seedId = findType(definitions.seeds, args[1])
            if (!seedId) return debugCondition('DEBUG_SEED_NOT_INSTALLED', args[1])
            // A bank may hold the same seed twice; each slot keeps its own recharge.
            const packet = bank.packets[slot - 1]
            if (bank.selection.mode === 'seed' && bank.selection.slot === slot - 1) bank.selection = { mode: 'none' }
            packet.seedId = seedId
            packet.readyAtTick = tick
            return debugSuccess(`Seed slot ${slot}: ${seedId}`)
        }
        case 'removeplant': {
            const grid = position(args[0], args[1])
            if (!grid) return invalidPosition()
            const entity = [...world.query(PositionComponent, PlantComponent)].find(entity =>
                world.get(entity, PositionComponent)!.row === grid.row && world.get(entity, PlantComponent)!.column === grid.column)
            if (entity === undefined) return debugCondition('DEBUG_NO_PLANT_THERE')
            world.destroyEntity(entity)
            return debugSuccess('Plant removed')
        }
        case 'grave': {
            const grid = position(args[0], args[1])
            if (!grid) return invalidPosition()
            const wave = world.resources.get(WaveResource)
            if (graveAt(wave.graves, grid.row, grid.column!)) {
                return debugCondition('DEBUG_GRAVE_EXISTS')
            }
            if ([...world.query(PositionComponent, PlantComponent)].some(entity =>
                world.get(entity, PositionComponent)!.row === grid.row && world.get(entity, PlantComponent)!.column === grid.column)) {
                return debugCondition('DEBUG_PLANT_OCCUPIES')
            }
            wave.graves ??= []
            wave.graves.push(createGrave(world, grid.row, grid.column!))
            return debugSuccess(`Spawned grave at ${args[0]}, ${args[1]}`)
        }
        case 'zombie': {
            const typeId = findType(definitions.zombies, args[0])
            if (!typeId) return debugCondition('DEBUG_ZOMBIE_NOT_INSTALLED', args[0])
            const grid = position(args[1], args[2])
            if (!grid) return invalidPosition()
            const entityId = spawnZombie(world, definitions, typeId, grid.row,
                grid.column === undefined ? pickZombieSpawnX(definitions.zombies[typeId], world.resources.get(RandomResource))
                    : level.board.origin.x + grid.column * level.board.cell.width,
                level.board.origin.y + grid.row * level.board.cell.height - 30)
            emitServerEvent(events, 'zombieSpawned', { entityId, typeId, row: grid.row })
            return debugSuccess(`Summoned ${args[0]}`)
        }
        case 'damage':
        case 'kill': {
            const damage = name === 'kill' ? 0 : debugInteger(args[0])
            if (damage === null || name === 'damage' && damage <= 0) return debugSyntax('Damage must be a positive integer')
            const zombies = [...world.query(ZombieComponent)]
            for (const entity of zombies) {
                if (name === 'kill') world.destroyEntity(entity)
                else damageZombie(world, definitions, entity, damage)
            }
            return debugSuccess(`${name}: ${zombies.length} zombie(s)`)
        }
        case 'win':
        case 'lose':
            if (name === 'win') for (const entity of [...world.query(ZombieComponent)]) world.destroyEntity(entity)
            level.result = name === 'win' ? 'won' : 'lost'
            emitServerEvent(events, name === 'win' ? 'levelWon' : 'levelLost', {})
            return debugSuccess(name === 'win' ? 'Level completed' : 'Level failed')
        case 'nextwave':
        case 'nextflag': {
            const wave = world.resources.get(WaveResource)
            const index = name === 'nextflag'
                ? level.definition.waves.findIndex((entry, index) => index >= wave.index && entry.flagWave)
                : wave.index
            if (index < 0 || index >= level.definition.waves.length) return debugCondition(name === 'nextflag' ? 'DEBUG_NO_FLAG_WAVES' : 'DEBUG_NO_WAVES')
            wave.index = index
            wave.nextWaveAtTick = tick
            if (level.definition.waves[index].flagWave) {
                wave.hugeWaveAnnounced = true
                emitServerEvent(events, 'hugeWave', {})
                emitServerEvent(events, 'hugeWaveSound', {})
            }
            const paused = level.paused
            level.paused = false
            try {
                const schedule = new Schedule()
                schedule.add('spawn', createWaveSystem(definitions))
                schedule.run(world, tick)
            } finally { level.paused = paused }
            return debugSuccess(name === 'nextflag' ? 'Spawned next flag wave' : 'Spawned next zombie wave')
        }
        case 'lawnmower': {
            const row = args[1] === undefined ? undefined : position(args[1])?.row
            if (args[1] !== undefined && row === undefined) return invalidPosition()
            let changed = 0
            for (const entity of world.query(PositionComponent, LawnMowerComponent)) {
                const p = world.get(entity, PositionComponent)!, mower = world.get(entity, LawnMowerComponent)!
                if (row !== undefined && p.row !== row) continue
                if (args[0].toLowerCase() === 'trigger') {
                    if (mower.state !== 'ready') continue
                    mower.state = 'active'
                    emitServerEvent(events, 'mowerActivated', { entityId: entity, row: p.row })
                } else {
                    if (mower.state === 'ready') continue
                    mower.state = 'ready'
                    mower.chompCounter = 0
                    p.x = -21
                }
                changed++
            }
            return changed ? debugSuccess(`Changed ${changed} lawn mower(s)`) : debugCondition('DEBUG_NO_MOWERS')
        }
        case 'cooldown':
        case 'suncost':
        case 'sunspawning':
        case 'plantinvincible':
        case 'collect': {
            const rules = { ...getDebugRules(world) }
            const enabled = args[0].toLowerCase() === 'true'
            if (name === 'collect') rules.collect = args[0].toLowerCase() as typeof rules.collect
            else if (name === 'suncost') rules.sunCost = enabled
            else if (name === 'sunspawning') rules.sunSpawning = enabled
            else if (name === 'plantinvincible') rules.plantInvincible = enabled
            else {
                rules.cooldown = enabled
                if (!enabled) for (const packet of world.resources.get(SeedBankResource).packets) packet.readyAtTick = 0
            }
            world.resources.set(DebugRulesResource, rules)
            return debugSuccess(`${name}: ${args[0]}`)
        }
        case 'item': {
            const award = ['award', 'levelaward', 'finalseedpacket'].includes(normalizeDebugName(args[0]))
            const typeId = award ? level.definition.award.id : findType(definitions.items, args[0])
            if (!typeId) return debugCondition('DEBUG_ITEM_NOT_INSTALLED', args[0])
            if (award && [...world.query(ItemComponent)].some(entity => world.get(entity, ItemComponent)!.typeId === typeId)) return debugCondition('DEBUG_AWARD_EXISTS')
            const grid = args.length === 3 ? position(args[1], args[2]) : undefined
            if (grid === null) return invalidPosition()
            const x = grid ? level.board.origin.x + grid.column! * level.board.cell.width : 400
            const y = grid ? level.board.origin.y + grid.row * level.board.cell.height : 280
            if (!award) {
                // Board::AddCoin with COIN_MOTION_COIN, like a zombie's loot.
                spawnLoot(world, definitions, world, typeId, x, y)
                return debugSuccess(`Spawned ${args[0]}`)
            }
            const entityId = world.createEntity()
            world.add(entityId, PositionComponent, { x, y, row: -1 })
            world.add(entityId, ItemComponent, {
                typeId, value: 1, state: 'available',
                velocityX: 0, velocityY: -3, groundY: y + 45, disappearTicks: 0, fadeTicks: 0,
                width: 50, scale: 1, alpha: 255,
            })
            world.resources.get(WaveResource).index = level.definition.waves.length
            world.resources.get(TutorialResource).step = 'complete'
            for (const entity of [...world.query(ZombieComponent)]) world.destroyEntity(entity)
            emitServerEvent(events, 'levelAwardDropped', { entityId, typeId })
            return debugSuccess(`Spawned ${args[0]}`)
        }
        default: return debugCondition('DEBUG_UNAVAILABLE', name)
    }
}
