import { Schedule, type World } from '@/ecs/index'
import type { GameplayDefinitions } from '@/shared/content/gameplay'
import { debugCondition, debugInteger, debugSuccess, debugSyntax, normalizeDebugName, type DebugCliCommand, type DebugCliResult } from '@/shared/debug/DebugCli'
import { damageZombie, EconomyStateResource, LawnMowerComponent, LevelStateResource, PlantComponent, PositionComponent, RandomResource, SeedBankResource, spawnZombie, ZombieComponent } from '../gameplay'
import { createLevelOneWaveSystem, ItemComponent, TutorialResource, WaveResource } from '../levelOne'
import { emitServerEvent, EventQueueResource } from '../events'
import { DebugRulesResource, getDebugRules } from './DebugRules'

export function executeDebugGameCommand(
    world: World, definitions: GameplayDefinitions, tick: number, command: DebugCliCommand,
    placePlant: (seedId: string, row: number, column: number) => string | undefined,
): DebugCliResult {
    const { name, args } = command
    const level = world.resources.get(LevelStateResource)
    const preference = ['cooldown', 'suncost', 'sunspawning', 'collect'].includes(name)
    if (!preference && (level.phase !== 'gameplay' || level.result !== 'playing')) return debugCondition(`/${name} requires an active level`)
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
            economy[name] = Math.max(0, next)
            if (name === 'sun') economy.pendingSunSpend = 0
            return debugSuccess(`${name}: ${economy[name]}`)
        }
        case 'plant': {
            const seedId = findType(definitions.seeds, args[0])
            if (!seedId) return debugCondition(`Plant is not installed: ${args[0]}`)
            const grid = position(args[1], args[2])
            if (!grid) return invalidPosition()
            const rejection = placePlant(seedId, grid.row, grid.column!)
            return rejection ? debugCondition(rejection) : debugSuccess(`Planted ${args[0]}`)
        }
        case 'removeplant': {
            const grid = position(args[0], args[1])
            if (!grid) return invalidPosition()
            const entity = [...world.query(PositionComponent, PlantComponent)].find(entity =>
                world.get(entity, PositionComponent)!.row === grid.row && world.get(entity, PlantComponent)!.column === grid.column)
            if (entity === undefined) return debugCondition('No plant at that position')
            world.destroyEntity(entity)
            return debugSuccess('Plant removed')
        }
        case 'zombie': {
            const typeId = findType(definitions.zombies, args[0])
            if (!typeId) return debugCondition(`Zombie is not installed: ${args[0]}`)
            const grid = position(args[1], args[2])
            if (!grid) return invalidPosition()
            const entityId = spawnZombie(world, definitions, typeId, grid.row,
                grid.column === undefined ? 780 : level.board.origin.x + grid.column * level.board.cell.width,
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
                else damageZombie(world, entity, damage)
            }
            return debugSuccess(`${name}: ${zombies.length} zombie(s)`)
        }
        case 'win':
        case 'lose':
            if (name === 'win') for (const entity of [...world.query(ZombieComponent)]) world.destroyEntity(entity)
            level.result = name === 'win' ? 'won' : 'lost'
            emitServerEvent(events, name === 'win' ? 'levelWon' : 'levelLost', {})
            return debugSuccess(name === 'win' ? 'Level completed' : 'Level failed')
        case 'nextwave': {
            const wave = world.resources.get(WaveResource)
            if (wave.index >= level.definition.waves.length) return debugCondition('No remaining zombie waves')
            wave.nextWaveAtTick = tick
            const paused = level.paused
            level.paused = false
            try {
                const schedule = new Schedule()
                schedule.add('spawn', createLevelOneWaveSystem(definitions))
                schedule.run(world, tick)
            } finally { level.paused = paused }
            return debugSuccess('Spawned next zombie wave')
        }
        case 'nextflag': return debugCondition('This level has no flag waves')
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
            return changed ? debugSuccess(`Changed ${changed} lawn mower(s)`) : debugCondition('No lawn mowers could be changed')
        }
        case 'cooldown':
        case 'suncost':
        case 'sunspawning':
        case 'collect': {
            const rules = { ...getDebugRules(world) }
            const enabled = args[0].toLowerCase() === 'true'
            if (name === 'collect') rules.collect = args[0].toLowerCase() as typeof rules.collect
            else if (name === 'suncost') rules.sunCost = enabled
            else if (name === 'sunspawning') rules.sunSpawning = enabled
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
            if (!typeId) return debugCondition(`Item is not installed: ${args[0]}`)
            if (award && [...world.query(ItemComponent)].some(entity => world.get(entity, ItemComponent)!.typeId === typeId)) return debugCondition('The level award already exists')
            const grid = args.length === 3 ? position(args[1], args[2]) : undefined
            if (grid === null) return invalidPosition()
            const x = grid ? level.board.origin.x + grid.column! * level.board.cell.width : 400
            const y = grid ? level.board.origin.y + grid.row * level.board.cell.height : 280
            const entityId = world.createEntity()
            world.add(entityId, PositionComponent, { x, y, row: -1 })
            world.add(entityId, ItemComponent, {
                typeId, value: award ? 1 : definitions.items[typeId].value, state: 'available',
                velocityX: 0, velocityY: -3, groundY: y + 45, disappearTicks: 0, fadeTicks: 0,
                width: award ? 50 : definitions.items[typeId].width, scale: 1, alpha: 255,
            })
            if (award) {
                world.resources.get(WaveResource).index = level.definition.waves.length
                world.resources.get(TutorialResource).step = 'complete'
                for (const entity of [...world.query(ZombieComponent)]) world.destroyEntity(entity)
            }
            emitServerEvent(events, award ? 'levelAwardDropped' : 'itemSpawned', { entityId, typeId })
            return debugSuccess(`Spawned ${args[0]}`)
        }
        default: return debugCondition(`/${name} is unavailable in this version`)
    }
}
