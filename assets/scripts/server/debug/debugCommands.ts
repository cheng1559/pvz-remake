import { Schedule, type World } from '@/ecs/index'
import type { Team } from '@/shared/content/teams'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { debugAmount, debugCondition, debugInteger, debugSuccess, debugSyntax, normalizeDebugName, type DebugCliCommand, type DebugCliResult } from '@/shared/debug/DebugCli'
import { damageZombie } from '../zombies/damage'
import {
    EconomyStateResource,
    LawnMowerComponent,
    LevelStateResource,
    PlantComponent,
    PositionComponent,
    RandomResource,
    SeedBankResource,
    ZombieComponent,
} from '../state/components'
import { pickZombieSpawnX, spawnZombie } from '../zombies/spawn'
import { ItemComponent, TutorialResource, WaveResource } from '../state/levelState'
import { createWaveSystem } from '../level/waves'
import { createGrave } from '../level/graves'
import { spawnLoot } from '../level/loot'
import { emitServerEvent, EventQueueResource } from '../state/events'
import { DebugRulesResource, getDebugRules } from './debugRules'
import { AchievementsResource, grantAchievement } from '../achievements/achievements'

export const executor = { execute: executeCommand }

export function executeDebugGameCommand(...args: Parameters<typeof executeCommand>): DebugCliResult {
    return executor.execute(...args)
}

function executeCommand(
    world: World, definitions: GameplayDefinitions, tick: number, command: DebugCliCommand,
    createPlant: (seedId: string, row: number, column: number, team?: Team) => number,
): DebugCliResult {
    const { name, args } = command
    const level = world.resources.get(LevelStateResource)
    const preference = ['cooldown', 'suncost', 'sunspawning', 'plantinvincible', 'collect'].includes(name)
    // The purse and the achievements are no board state, so /money and /achievement also work in the intro (Crazy
    // Dave's offer checks the purse there).
    const anyPhase = name === 'money' || name === 'achievement'
    if (!preference && name !== 'plant' && (level.phase !== 'gameplay' && !anyPhase || level.result !== 'playing')) return debugCondition('DEBUG_REQUIRES_LEVEL', name)
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
            const next = debugAmount(args, economy[name], name === 'sun' ? definitions.economy.maxSun : definitions.economy.maxMoney)
            if (typeof next !== 'number') return next
            economy[name] = next
            if (name === 'sun') economy.pendingSunSpend = 0
            // The client shows the coin bank, as when money is collected.
            else emitServerEvent(events, 'moneyChanged', { money: economy.money })
            return debugSuccess(`${name}: ${economy[name]}`)
        }
        case 'plant': {
            const seedId = findType(definitions.seeds, args[0])
            if (!seedId) return debugCondition('DEBUG_PLANT_NOT_INSTALLED', args[0])
            const grid = position(args[1], args[2])
            if (!grid) return invalidPosition()
            // `zombies`: on the zombies' side, facing left; the plants' side attacks it and it attacks them.
            const entityId = createPlant(seedId, grid.row, grid.column!, args[3]?.toLowerCase() === 'zombies' ? 'zombies' : undefined)
            // `debug`: not the player's planting (Board::AddPlant), which the planting achievements check.
            emitServerEvent(events, 'plantPlaced', { entityId, typeId: definitions.seeds[seedId].plant,
                row: grid.row, column: grid.column!, debug: true })
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
            // `zombies`: the packet plants on the zombies' side.
            if (args[2]?.toLowerCase() === 'zombies') packet.team = 'zombies'
            else delete packet.team
            return debugSuccess(`Seed slot ${slot}: ${seedId}${packet.team ? ' (zombies)' : ''}`)
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
            // Challenge::GraveDangerSpawnGraveAt: every plant in the cell dies (Plant::Die, silently). A grave already there
            // is replaced and rises again, which the original's CanAddGraveStoneAt would not pick. Rolling nuts keep the
            // column they were planted in but hold no cell (planting.findPlantAt), so they roll on.
            for (const entity of [...world.query(PositionComponent, PlantComponent)]) {
                const plant = world.get(entity, PlantComponent)!
                if (definitions.plants[plant.typeId].occupiesCell !== false && world.get(entity, PositionComponent)!.row === grid.row
                    && plant.column === grid.column) world.destroyEntity(entity)
            }
            const wave = world.resources.get(WaveResource)
            wave.graves = (wave.graves ?? []).filter(grave => grave.row !== grid.row || grave.column !== grid.column)
            wave.graves.push({ ...createGrave(world, grid.row, grid.column!), riseAtTick: tick })
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
            // `plants`: on the plants' side, as if mind-controlled, walking right.
            if (args[3]?.toLowerCase() === 'plants') world.get(entityId, ZombieComponent)!.team = 'plants'
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
            level.result = name === 'win' ? 'won' : 'lost'
            emitServerEvent(events, name === 'win' ? 'levelWon' : 'levelLost', {})
            return debugSuccess(name === 'win' ? 'Level completed' : 'Level failed')
        case 'nextwave':
        case 'nextflag': {
            const wave = world.resources.get(WaveResource)
            const index = name === 'nextflag'
                ? wave.plan.findIndex((entry, index) => index >= wave.index && entry.flagWave)
                : wave.index
            if (index < 0 || index >= wave.plan.length) return debugCondition(name === 'nextflag' ? 'DEBUG_NO_FLAG_WAVES' : 'DEBUG_NO_WAVES')
            // Board::KeyChar('/'): a running huge wave countdown ends now. Otherwise /nextflag starts the flag wave's
            // 750-tick countdown through the wave system below, and /nextwave spawns at once.
            const countdown = name === 'nextflag' && !wave.hugeWaveAnnounced
            wave.index = index
            wave.nextWaveAtTick = tick
            if (name === 'nextwave' && wave.plan[index].flagWave && !wave.hugeWaveAnnounced) {
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
            return debugSuccess(countdown ? 'Huge wave approaching' : name === 'nextflag' ? 'Spawned next flag wave' : 'Spawned next zombie wave')
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
            world.resources.get(WaveResource).index = world.resources.get(WaveResource).plan.length
            world.resources.get(TutorialResource).step = 'complete'
            // Unlike Zombie::TrySpawnLevelAward, the debug award leaves the zombies on the board.
            emitServerEvent(events, 'levelAwardDropped', { entityId, typeId })
            return debugSuccess(`Spawned ${args[0]}`)
        }
        case 'achievement': {
            // The client saves the profile; the level only needs to know what the player has.
            const achievements = world.resources.get(AchievementsResource)
            const id = args[1] === undefined ? undefined : findType(achievements.definitions, args[1])
            if (args[1] !== undefined && !id) return debugCondition('DEBUG_ACHIEVEMENT_NOT_INSTALLED', args[1])
            if (args[0].toLowerCase() === 'reset') {
                if (id) achievements.earned.delete(id)
                else achievements.earned.clear()
                return debugSuccess(`Reset ${id ?? 'every achievement'}`)
            }
            if (!id) return debugSyntax('Usage: /achievement give {achievement}')
            if (level.definition.achievements === false) return debugCondition('DEBUG_ACHIEVEMENTS_OFF')
            if (!grantAchievement(world, id)) return debugCondition('DEBUG_ACHIEVEMENT_EARNED', args[1])
            return debugSuccess(`Granted ${id}`)
        }
        default: return debugCondition('DEBUG_UNAVAILABLE', name)
    }
}
