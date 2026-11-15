import { Schedule } from '@/ecs/index'
import { packetTeam } from '@/shared/content/teams'
import type { Session } from '../session/session'
import { planting } from '../seeds/planting'
import { EMPTY_SLOT, debugAmount, debugCondition, debugSwitched, debugInteger, debugSuccess, debugSyntax, normalizeDebugName, type DebugCliCommand, type DebugCliResult } from '@/shared/debug/DebugCli'
import { damageZombie } from '../zombies/damage'
import { EconomyStateResource, LevelStateResource, RandomResource, SeedBankResource, ZombieComponent } from '../state/components'
import { pickZombieSpawnX, spawnZombie } from '../zombies/spawn'
import { TutorialResource, WaveResource } from '../state/levelState'
import { createWaveSystem } from '../level/waves'
import { placeGrave } from '../level/graves'
import { startRepick } from '../seeds/seedChooser'
import { startMower } from '../level/mower'
import { spawnLoot } from '../level/loot'
import { emitServerEvent, EventQueueResource } from '../state/events'
import { DebugRulesResource, getDebugRules } from './debugRules'
import { AchievementsResource, grantAchievement } from '../achievements/achievements'
import { levelAwardDropped, spawnLevelAward } from '../level/levelAward'

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
            if (bank.choosing || bank.repick) return debugCondition('DEBUG_FINISH_CHOOSING')
            // `empty` clears the slot; a seed fills an empty one or replaces the packet there.
            const empty = args[1].toLowerCase() === EMPTY_SLOT
            const seedId = empty ? undefined : findType(definitions.seeds, args[1])
            const slot = debugInteger(args[0])
            // `team`: the side of what it puts down, kept only when not the seed's own (packetTeam).
            const side = args[2]?.toLowerCase()
            const sideOf = (id: string) => packetTeam(definitions.seeds[id], side === 'plants' || side === 'zombies' ? side : undefined)
            if (bank.conveyor) {
                // The belt's packets from the left.
                const conveyor = bank.conveyor, count = conveyor.packets.length
                if (slot === null || slot < 1 || slot > count) return debugSyntax(count ? `Use slot 1-${count}` : 'The conveyor belt is empty')
                if (!empty && !seedId) return debugCondition('DEBUG_SEED_NOT_INSTALLED', args[1])
                const packet = conveyor.packets[slot - 1]
                if (bank.selection.mode === 'conveyor' && bank.selection.packetId === packet.id) bank.selection = { mode: 'none' }
                if (!seedId) {
                    // The packets after it close the gap as the belt moves, as after a planting.
                    conveyor.packets.splice(slot - 1, 1)
                    return debugSuccess(`Conveyor slot ${slot}: ${EMPTY_SLOT}`)
                }
                const team = sideOf(seedId)
                packet.card = { seedId, ...(team ? { team } : {}) }
                return debugSuccess(`Conveyor slot ${slot}: ${seedId}${team ? ` (${team})` : ''}`)
            }
            if (slot === null || slot < 1 || slot > bank.packets.length) {
                return debugSyntax(`Use slot 1-${bank.packets.length}`)
            }
            if (!empty && !seedId) return debugCondition('DEBUG_SEED_NOT_INSTALLED', args[1])
            if (bank.selection.mode === 'seed' && bank.selection.slot === slot - 1) bank.selection = { mode: 'none' }
            if (!seedId) {
                bank.packets[slot - 1] = null
                return debugSuccess(`Seed slot ${slot}: ${EMPTY_SLOT}`)
            }
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
            const entity = grid.column === undefined ? undefined : planting.findPlantAt(session, grid.row, grid.column)
            if (entity === undefined) return debugCondition('DEBUG_NO_PLANT_THERE')
            world.destroyEntity(entity)
            return debugSuccess('Plant removed')
        }
        case 'grave': {
            const grid = position(args[0], args[1])
            if (!grid) return invalidPosition()
            // `plants`: a grave on the plants' side, whose zombies rise on that side.
            const team = args[2]?.toLowerCase()
            if (team !== undefined && team !== 'plants' && team !== 'zombies') return debugSyntax('Team must be plants or zombies')
            // Challenge::GraveDangerSpawnGraveAt (placeGrave): the plants there die, a grave there gives way.
            placeGrave(world, definitions, grid.row, grid.column!, tick, team === 'plants' ? 'plants' : undefined)
            return debugSuccess(`Spawned grave at ${args[0]}, ${args[1]}${team === 'plants' ? ' (plants)' : ''}`)
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
                    level.board.origin.y + grid.row * level.board.cell.height - 30)
            if (team === 'plants') world.get(entityId, ZombieComponent)!.team = 'plants'
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
            // `trigger` sets the rows' waiting mowers off; `reset` puts one back where it has gone, whatever it is doing.
            const trigger = args[0].toLowerCase() === 'trigger', level = world.resources.get(LevelStateResource)
            const rows = level.definition.activeRows.filter(active => (row === undefined || active === row) && level.mowerRows.includes(active) === trigger)
            for (const changed of rows) {
                if (trigger) startMower(world, definitions, changed)
                else level.mowerRows = [...level.mowerRows, changed].sort((left, right) => left - right)
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
            const award = ['award', 'levelaward', 'finalseedpacket'].includes(normalizeDebugName(args[0]))
            const typeId = award ? level.definition.award.id : findType(definitions.items, args[0])
            if (!typeId) return debugCondition('DEBUG_ITEM_NOT_INSTALLED', args[0])
            if (award && levelAwardDropped(world)) return debugCondition('DEBUG_AWARD_EXISTS')
            const grid = args.length === 3 ? position(args[1], args[2]) : undefined
            if (grid === null) return invalidPosition()
            const x = grid ? level.board.origin.x + grid.column! * level.board.cell.width : 400
            const y = grid ? level.board.origin.y + grid.row * level.board.cell.height : 280
            if (!award) {
                // Board::AddCoin with COIN_MOTION_COIN, like a zombie's loot.
                spawnLoot(world, definitions, world, typeId, x, y)
                return debugSuccess(`Spawned ${args[0]}`)
            }
            world.resources.get(WaveResource).index = world.resources.get(WaveResource).plan.length
            world.resources.get(TutorialResource).step = 'complete'
            // Unlike Zombie::TrySpawnLevelAward, the debug award leaves the zombies on the board.
            spawnLevelAward(world, x, y)
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
