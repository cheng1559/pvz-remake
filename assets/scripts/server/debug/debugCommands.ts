import { Schedule } from '@/server/state/World'
import { packetTeam } from '@/shared/content/teams'
import type { Session } from '../session/session'
import { planting } from '../seeds/planting'
import { debugAmount, debugCondition, debugSwitched, debugInteger, debugSuccess, debugSyntax, normalizeDebugName, type DebugCliCommand, type DebugCliResult } from '@/shared/debug/DebugCli'
import { damageZombie } from '../zombies/damage'
import {
    EconomyStateResource,
    LevelStateResource,
    RandomResource,
    SeedBankResource,
    WaveResource,
} from '../state/resources'
import { pickZombieSpawnX, spawnZombie } from '../zombies/spawn'
import { createWaveSystem } from '../level/waves'
import { placeGrave, spawnZombiesFromGraves } from '../gridItems/graves'
import { placeCrater } from '../gridItems/craters'
import { startRepick } from '../seeds/seedChooser'
import { createMower } from '../mowers/mowers'
import { readyMowers } from '../level/lawn'
import { CRATER } from '@/shared/content/craters'
import { spawnLoot } from '../level/loot'
import { emitServerEvent, EventQueueResource } from '../state/events'
import { DebugRulesResource, getDebugRules } from './debugRules'
import { AchievementsResource, grantAchievement } from '../achievements/achievements'
import { spawnLevelAward } from '../level/levelAward'
import { cellPosition, LEVEL_AWARD, zombieRowY } from '@/shared/content/gameplay'

export const executor = { execute: executeCommand }

export function executeDebugGameCommand(...args: Parameters<typeof executeCommand>): DebugCliResult {
    return executor.execute(...args)
}

/** A debug command on the session's game; what it puts down or finds it puts down and finds as playing does (planting). */
function executeCommand(session: Session, command: DebugCliCommand): DebugCliResult {
    const { world, definitions, gameplayTick: tick } = session
    const { name, args } = command
    const level = world.resources.get(LevelStateResource)
    const preference = ['cooldown', 'suncost', 'plantinvincible', 'collect', 'cheatseed'].includes(name)
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
            const seed = seedId ? definitions.seeds[seedId] : undefined
            if (!seedId || seed?.kind !== 'plant') return debugCondition('DEBUG_PLANT_NOT_INSTALLED', args[0])
            const plant = seed.id
            const grid = position(args[1], args[2])
            if (!grid) return invalidPosition()
            // `zombies`: on the zombies' side, facing left; the plants' side attacks it and it attacks them.
            const entityId = planting.createPlant(session, seedId, grid.row, grid.column!, args[3]?.toLowerCase() === 'zombies' ? 'zombies' : undefined)
            // `debug`: not the player's planting (Board::AddPlant), which the planting achievements check.
            emitServerEvent(events, 'plantPlaced', { entityId, typeId: plant,
                row: grid.row, column: grid.column!, debug: true })
            return debugSuccess(`Planted ${args[0]}`)
        }
        case 'repick': {
            const bank = world.resources.get(SeedBankResource)
            // A repick's bank is the chooser's until the level goes on after it.
            if (bank.choosing || bank.repick) return debugCondition('DEBUG_FINISH_CHOOSING')
            if (bank.conveyor || !bank.packets.length) return debugCondition('DEBUG_REPICK_NO_BANK')
            startRepick(world)
            return debugSuccess('Choose your seeds again')
        }
        case 'cheatseed': {
            // Any time: a chooser open now offers what the switch gives at once.
            const rules = { ...getDebugRules(world), cheatSeeds: !getDebugRules(world).cheatSeeds }
            world.resources.set(DebugRulesResource, rules)
            return debugSwitched(name, rules.cheatSeeds)
        }
        case 'seed': {
            const bank = world.resources.get(SeedBankResource)
            // A repick's bank is the chooser's until the level goes on after it.
            if (bank.repick) return debugCondition('DEBUG_FINISH_CHOOSING')
            // A seed fills an empty slot or replaces the packet there.
            const seedId = findType(definitions.seeds, args[1])
            const slot = debugInteger(args[0])
            // `team`: the side of what it puts down, kept only when not the seed's own (packetTeam).
            const side = args[2]?.toLowerCase()
            const sideOf = (id: string) => packetTeam(definitions.seeds[id], side === 'plants' || side === 'zombies' ? side : undefined)
            if (bank.conveyor) {
                // The belt's packets from the left.
                const conveyor = bank.conveyor, count = conveyor.packets.length
                if (slot === null || slot < 1 || slot > count) return debugSyntax(count ? `Use slot 1-${count}` : 'The conveyor belt is empty')
                if (!seedId) return debugCondition('DEBUG_SEED_NOT_INSTALLED', args[1])
                const packet = conveyor.packets[slot - 1]
                if (bank.selection.mode === 'conveyor' && bank.selection.packetId === packet.id) bank.selection = { mode: 'none' }
                const team = sideOf(seedId)
                packet.card = { seedId, ...(team ? { team } : {}) }
                return debugSuccess(`Conveyor slot ${slot}: ${seedId}${team ? ` (${team})` : ''}`)
            }
            if (slot === null || slot < 1 || slot > bank.packets.length) {
                return debugSyntax(`Use slot 1-${bank.packets.length}`)
            }
            if (!seedId) return debugCondition('DEBUG_SEED_NOT_INSTALLED', args[1])
            if (bank.selection.mode === 'seed' && bank.selection.slot === slot - 1) bank.selection = { mode: 'none' }
            // A bank may hold the same seed twice; each slot keeps its own recharge.
            const packet = bank.packets[slot - 1] ??= { seedId, readyAtTick: tick, cooldownTotal: 0 }
            packet.seedId = seedId
            packet.readyAtTick = tick
            const team = sideOf(seedId)
            if (team) packet.team = team
            else delete packet.team
            return debugSuccess(`Seed slot ${slot}: ${seedId}${packet.team ? ` (${packet.team})` : ''}`)
        }
        case 'removeplant': {
            const grid = position(args[0], args[1])
            if (!grid) return invalidPosition()
            const entity = planting.findPlantAt(session, grid.row, grid.column!)
            if (entity !== undefined) world.destroyEntity(entity)
            return debugSuccess('Plant removed')
        }
        case 'griditem': {
            const [kind, row, col, side] = args
            const grid = position(row, col)
            if (!grid) return invalidPosition()
            const team = side?.toLowerCase()
            let placed: number
            if (kind.toLowerCase() === 'grave') {
                placed = placeGrave(world, definitions, grid.row, grid.column!, tick, team === 'plants' ? 'plants' : undefined)
            } else {
                const seed = definitions.seeds[CRATER]
                if (seed?.kind !== 'crater') return debugCondition('DEBUG_SEED_NOT_INSTALLED', CRATER)
                placed = placeCrater(world, definitions, grid.row, grid.column!, seed.craterTicks, team === 'zombies' ? 'zombies' : 'plants')
            }
            for (const item of world.gridItems) {
                if (item.row === grid.row && item.column === grid.column && item.id !== placed) world.destroyEntity(item.id)
            }
            return debugSuccess(`Placed ${kind} at ${row}, ${col}`)
        }
        case 'gravezombies': {
            const count = spawnZombiesFromGraves(world, definitions)
            return debugSuccess(`Raised ${count} zombie(s) from graves`)
        }
        case 'zombie': {
            const typeId = findType(definitions.zombies, args[0])
            if (!typeId) return debugCondition('DEBUG_ZOMBIE_NOT_INSTALLED', args[0])
            const grid = position(args[1], args[2])
            if (!grid) return invalidPosition()
            // `plants`: on the plants' side, walking right. In a cell it goes down as a zombie seed's zombie does; without
            // one it comes from where the wave's zombies come.
            const team = args[3]?.toLowerCase() === 'plants' ? 'plants' : 'zombies'
            const entityId = grid.column !== undefined ? planting.placeZombie(session, typeId, grid.row, grid.column, team)
                : spawnZombie(world, definitions, typeId, grid.row, pickZombieSpawnX(definitions.zombies[typeId], world.resources.get(RandomResource)),
                    zombieRowY(level.board, grid.row))
            if (team === 'plants') world.zombies.get(entityId)!.team = 'plants'
            emitServerEvent(events, 'zombieSpawned', { entityId, typeId, row: grid.row })
            return debugSuccess(`Summoned ${args[0]}`)
        }
        case 'damage':
        case 'kill': {
            const damage = name === 'kill' ? 0 : debugInteger(args[0])
            if (damage === null || name === 'damage' && damage <= 0) return debugSyntax('Damage must be a positive integer')
            const zombies = [...world.zombies].map(zombie => zombie.id)
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
            // `trigger` sets the rows' waiting mowers off; `reset` puts a new one down where one has gone, whatever that
            // one is doing.
            const trigger = args[0].toLowerCase() === 'trigger', level = world.resources.get(LevelStateResource), ready = readyMowers(world)
            const rows = level.definition.activeRows.filter(active => (row === undefined || active === row) && ready.has(active) === trigger)
            for (const changed of rows) {
                const mower = ready.get(changed)
                if (mower !== undefined) world.mowers.get(mower)!.setOff(world, definitions)
                else createMower(world, changed)
            }
            return rows.length ? debugSuccess(`Changed ${rows.length} lawn mower(s)`) : debugCondition('DEBUG_NO_MOWERS')
        }
        case 'cooldown':
        case 'suncost':
        case 'plantinvincible':
        case 'collect': {
            const rules = { ...getDebugRules(world) }
            if (name === 'collect') {
                rules.collect = args[0].toLowerCase() as typeof rules.collect
                world.resources.set(DebugRulesResource, rules)
                return debugSuccess(`${name}: ${args[0]}`)
            }
            // A switch turns over.
            const rule = ({ cooldown: 'cooldown', suncost: 'sunCost', plantinvincible: 'plantInvincible' } as const)[name]
            const enabled = rules[rule] = !rules[rule]
            if (rule === 'cooldown' && !enabled) for (const packet of world.resources.get(SeedBankResource).packets) if (packet) packet.readyAtTick = 0
            world.resources.set(DebugRulesResource, rules)
            return debugSwitched(name, enabled)
        }
        case 'item': {
            const award = args[0].toLowerCase() === 'award'
            const typeId = award ? LEVEL_AWARD : findType(definitions.items, args[0])
            if (!typeId) return debugCondition('DEBUG_ITEM_NOT_INSTALLED', args[0])
            const grid = args.length === 3 ? position(args[1], args[2]) : undefined
            if (grid === null) return invalidPosition()
            const { x, y } = grid ? cellPosition(level.board, grid.row, grid.column!) : { x: 400, y: 280 }
            if (award) spawnLevelAward(world, x, y)
            else spawnLoot(world, definitions, world, typeId, x, y)
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
