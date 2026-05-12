import type { AdventureGameScreen } from '@/game/GameScreen'
import { ADVENTURE_LEVELS, PLANT_DEFINITIONS, ZOMBIE_DEFINITIONS, getGameSpeed, setGameSpeed } from '@/game/GameDefinitions'
import type { LevelDefinition, PlantType, ZombieType } from '@/game/GameTypes'

const DEBUG_CLI_MIN_SPEED = 0
const DEBUG_CLI_MAX_SPEED = 10

export interface DebugCliResult {
    ok: boolean
    message: string
    failure?: 'syntax' | 'condition'
    action?: 'restart' | 'home' | 'level'
    levelId?: LevelDefinition['id']
}

const DEBUG_PLANT_TYPES = Object.keys(PLANT_DEFINITIONS) as PlantType[]
const DEBUG_ZOMBIE_TYPES = Object.keys(ZOMBIE_DEFINITIONS) as ZombieType[]
const DEBUG_PLANT_LOOKUP = createDebugTypeLookup(DEBUG_PLANT_TYPES)
const DEBUG_ZOMBIE_LOOKUP = createDebugTypeLookup(DEBUG_ZOMBIE_TYPES)
const DEBUG_BOOLEAN_VALUES = ['true', 'false']
const DEBUG_LEVEL_IDS = ADVENTURE_LEVELS.map((level) => debugLevelId(level))
const DEBUG_LEVEL_LOOKUP = new Map(DEBUG_LEVEL_IDS.map((id, index) => [id, ADVENTURE_LEVELS[index]]))
const DEBUG_CLI_COMMAND_SPECS: DebugCliCommandSpec[] = [
    {
        name: 'plant',
        completions: [DEBUG_PLANT_TYPES],
        parameterHints: ['{plant_name}', '{row}', '{col}'],
    },
    {
        name: 'removeplant',
        completions: [],
        parameterHints: ['{row}', '{col}'],
    },
    {
        name: 'win',
        completions: [],
        parameterHints: [],
    },
    {
        name: 'lose',
        completions: [],
        parameterHints: [],
    },
    {
        name: 'nextflag',
        completions: [],
        parameterHints: [],
    },
    {
        name: 'nextwave',
        completions: [],
        parameterHints: [],
    },
    {
        name: 'damage',
        completions: [],
        parameterHints: ['{damage}'],
    },
    {
        name: 'kill',
        completions: [],
        parameterHints: [],
    },
    {
        name: 'restart',
        completions: [],
        parameterHints: [],
    },
    {
        name: 'home',
        completions: [],
        parameterHints: [],
    },
    {
        name: 'level',
        completions: [DEBUG_LEVEL_IDS],
        parameterHints: ['{level}'],
    },
    {
        name: 'gamespeed',
        completions: [],
        parameterHints: ['{speed}'],
    },
    {
        name: 'lawnmower',
        completions: [['trigger', 'reset']],
        parameterHints: ['{action}', '[optional]{row}'],
    },
    {
        name: 'sun',
        completions: [['add', 'set']],
        parameterHints: ['{action}', '{number}'],
    },
    {
        name: 'sunspawning',
        completions: [DEBUG_BOOLEAN_VALUES],
        parameterHints: ['{enabled}'],
    },
    {
        name: 'autocollect',
        completions: [DEBUG_BOOLEAN_VALUES],
        parameterHints: ['{enabled}'],
    },
    {
        name: 'summon',
        completions: [DEBUG_ZOMBIE_TYPES],
        parameterHints: ['{zombie_name}', '[optional]{row}', '[optional]{col}'],
    },
    {
        name: 'cooldown',
        completions: [DEBUG_BOOLEAN_VALUES],
        parameterHints: ['{enabled}'],
    },
]

interface DebugCliCommandSpec {
    name: string
    completions: readonly (readonly string[])[]
    parameterHints: readonly string[]
}

interface DebugCliInputToken {
    value: string
    start: number
    end: number
}

export function executeDebugCliCommand(command: string, gameScreen: AdventureGameScreen | null): DebugCliResult {
    const tokens = tokenizeDebugCliCommand(command)
    if (tokens.length === 0) {
        return { ok: false, message: 'Empty command' }
    }

    const commandName = tokens[0].startsWith('/') ? tokens[0].slice(1) : tokens[0]
    switch (commandName.toLowerCase()) {
        case 'plant':
            return executeDebugPlantCommand(tokens, gameScreen)
        case 'removeplant':
            return executeDebugRemovePlantCommand(tokens, gameScreen)
        case 'win':
            return executeDebugWinCommand(tokens, gameScreen)
        case 'lose':
            return executeDebugLoseCommand(tokens, gameScreen)
        case 'nextflag':
            return executeDebugNextFlagCommand(tokens, gameScreen)
        case 'nextwave':
            return executeDebugNextWaveCommand(tokens, gameScreen)
        case 'damage':
            return executeDebugDamageCommand(tokens, gameScreen)
        case 'kill':
            return executeDebugKillCommand(tokens, gameScreen)
        case 'restart':
            return executeDebugRestartCommand(tokens, gameScreen)
        case 'home':
            return executeDebugHomeCommand(tokens, gameScreen)
        case 'level':
            return executeDebugLevelCommand(tokens)
        case 'summon':
            return executeDebugSummonCommand(tokens, gameScreen)
        case 'gamespeed':
            return executeDebugGameSpeedCommand(tokens)
        case 'lawnmower':
            return executeDebugLawnMowerCommand(tokens, gameScreen)
        case 'sun':
            return executeDebugSunCommand(tokens, gameScreen)
        case 'cooldown':
            return executeDebugRechargingCommand(tokens, gameScreen)
        case 'sunspawning':
            return executeDebugSunSpawningCommand(tokens, gameScreen)
        case 'autocollect':
            return executeDebugAutoCollectCommand(tokens, gameScreen)
        default:
            return { ok: false, message: `Unknown command: ${tokens[0]}` }
    }
}

export function getDebugCliCompletion(command: string) {
    return getDebugCliCompletions(command)[0] ?? ''
}

export function getDebugCliParameterHint(command: string) {
    const tokens = parseDebugCliInputTokens(command)
    if (tokens.length === 0) return ''

    const commandName = normalizeDebugCommandName(tokens[0].value)
    const spec = DEBUG_CLI_COMMAND_SPECS.find((candidate) => candidate.name === commandName)
    if (!spec) return ''

    const completedParamCount = getDebugCompletedParamCount(command, tokens, spec)
    if (completedParamCount == null) return ''

    const remainingHints = spec.parameterHints.slice(completedParamCount)
    if (remainingHints.length === 0) return ''

    const suffixPrefix = /\s$/.test(command) ? '' : ' '
    return `${suffixPrefix}${remainingHints.join(' ')}`
}

export function getDebugCliCompletions(command: string, allowEmptyTokenCompletion = false) {
    const tokens = parseDebugCliInputTokens(command)
    if (tokens.length === 0) {
        return getDebugCliCommandCompletions(command, '', command.length)
    }

    const hasTrailingWhitespace = /\s$/.test(command)
    const activeTokenIndex = hasTrailingWhitespace ? tokens.length : tokens.length - 1
    if (activeTokenIndex <= 0) {
        const token = tokens[0]
        return getDebugCliCommandCompletions(
            command,
            token.value,
            token.start,
            allowEmptyTokenCompletion,
        )
    }

    const commandName = normalizeDebugCommandName(tokens[0].value)
    const spec = DEBUG_CLI_COMMAND_SPECS.find((candidate) => candidate.name === commandName)
    if (!spec) return []

    const completionIndex = activeTokenIndex - 1
    const completions = spec.completions[completionIndex]
    if (!completions) return []

    const prefix = hasTrailingWhitespace ? '' : tokens[activeTokenIndex]?.value ?? ''
    const activeStart = hasTrailingWhitespace ? command.length : tokens[activeTokenIndex].start
    return getDebugTokenCompletions(completions, prefix, allowEmptyTokenCompletion)
        .map((completion) => command.slice(0, activeStart) + completion)
        .filter((completion) => completion.length > command.length)
}

function executeDebugPlantCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 4) {
        return { ok: false, message: 'Usage: /plant {plant_name} {row} {col}' }
    }

    if (!isLevelReady(gameScreen)) {
        return conditionFailure('/plant can only run during an active level')
    }

    const plantType = parseDebugPlantType(tokens[1])
    if (!plantType) {
        return {
            ok: false,
            message: `Unknown plant: ${tokens[1]}. Valid plants: ${listDebugNames(DEBUG_PLANT_TYPES)}`,
        }
    }

    const row = parseDebugInteger(tokens[2])
    if (row == null) {
        return { ok: false, message: `Invalid row. Use an integer from 1 to ${gameScreen.getGridSize().rows}` }
    }
    const col = parseDebugInteger(tokens[3])
    if (col == null) {
        return { ok: false, message: `Invalid col. Use an integer from 1 to ${gameScreen.getGridSize().cols}` }
    }
    const boundsError = validateDebugGridPosition(gameScreen, row, col)
    if (boundsError) return { ok: false, message: boundsError }

    if (!gameScreen.debugPlacePlant(plantType, row - 1, col - 1)) {
        return conditionFailure('/plant can only run during an active level')
    }
    return { ok: true, message: `Planted ${plantType} at row ${row}, col ${col}` }
}

function executeDebugRemovePlantCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 3) {
        return { ok: false, message: 'Usage: /removeplant {row} {col}' }
    }

    if (!isLevelReady(gameScreen)) {
        return conditionFailure('/removeplant can only run during an active level')
    }

    const row = parseDebugInteger(tokens[1])
    if (row == null) {
        return { ok: false, message: `Invalid row. Use an integer from 1 to ${gameScreen.getGridSize().rows}` }
    }
    const col = parseDebugInteger(tokens[2])
    if (col == null) {
        return { ok: false, message: `Invalid col. Use an integer from 1 to ${gameScreen.getGridSize().cols}` }
    }
    const boundsError = validateDebugGridPosition(gameScreen, row, col)
    if (boundsError) return { ok: false, message: boundsError }

    if (!gameScreen.debugRemovePlant(row - 1, col - 1)) {
        return conditionFailure(`No plant at row ${row}, col ${col}`)
    }
    return { ok: true, message: `Removed plant at row ${row}, col ${col}` }
}

function executeDebugWinCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 1) {
        return { ok: false, message: 'Usage: /win' }
    }

    if (!isLevelReady(gameScreen)) {
        return conditionFailure('/win can only run during an active level')
    }

    if (!gameScreen.debugCompleteLevel()) {
        return conditionFailure('/win can only run during an active level')
    }
    return { ok: true, message: 'Level completed' }
}

function executeDebugLoseCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 1) {
        return { ok: false, message: 'Usage: /lose' }
    }

    if (!isLevelReady(gameScreen)) {
        return conditionFailure('/lose can only run during an active level')
    }

    if (!gameScreen.debugLoseLevel()) {
        return conditionFailure('/lose can only run during an active level')
    }
    return { ok: true, message: 'Level failed' }
}

function executeDebugNextFlagCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 1) {
        return { ok: false, message: 'Usage: /nextflag' }
    }

    if (!isLevelReady(gameScreen)) {
        return conditionFailure('/nextflag can only run during an active level')
    }

    if (!gameScreen.debugSpawnNextFlagWave()) {
        return conditionFailure('No remaining flag waves')
    }
    return { ok: true, message: 'Spawned next flag wave' }
}

function executeDebugNextWaveCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 1) {
        return { ok: false, message: 'Usage: /nextwave' }
    }

    if (!isLevelReady(gameScreen)) {
        return conditionFailure('/nextwave can only run during an active level')
    }

    if (!gameScreen.debugSpawnNextWave()) {
        return conditionFailure('No remaining zombie waves')
    }
    return { ok: true, message: 'Spawned next zombie wave' }
}

function executeDebugDamageCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 2) {
        return { ok: false, message: 'Usage: /damage {damage}' }
    }

    if (!isLevelReady(gameScreen)) {
        return conditionFailure('/damage can only run during an active level')
    }

    const damage = parseDebugInteger(tokens[1])
    if (damage == null || damage <= 0) {
        return { ok: false, message: `Invalid damage: ${tokens[1]}. Use a positive integer` }
    }

    const damaged = gameScreen.debugDamageAllZombies(damage)
    if (damaged == null) {
        return conditionFailure('/damage can only run during an active level')
    }
    return { ok: true, message: `Damaged ${damaged} zombie(s) for ${damage}` }
}

function executeDebugKillCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 1) {
        return { ok: false, message: 'Usage: /kill' }
    }

    if (!isLevelReady(gameScreen)) {
        return conditionFailure('/kill can only run during an active level')
    }

    const killed = gameScreen.debugKillAllZombies()
    if (killed == null) {
        return conditionFailure('/kill can only run during an active level')
    }
    return { ok: true, message: `Cleared ${killed} zombie(s)` }
}

function executeDebugRestartCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 1) {
        return { ok: false, message: 'Usage: /restart' }
    }

    if (!isLevelScreenAvailable(gameScreen)) {
        return conditionFailure('/restart can only run from a level')
    }

    return { ok: true, message: 'Restarting level', action: 'restart' }
}

function executeDebugHomeCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 1) {
        return { ok: false, message: 'Usage: /home' }
    }

    return { ok: true, message: 'Returning to main menu', action: 'home' }
}

function executeDebugLevelCommand(tokens: string[]): DebugCliResult {
    if (tokens.length !== 2) {
        return { ok: false, message: 'Usage: /level {level}' }
    }

    const level = DEBUG_LEVEL_LOOKUP.get(normalizeDebugLevelId(tokens[1]))
    if (!level) {
        return {
            ok: false,
            message: `Unknown level: ${tokens[1]}. Valid levels: ${DEBUG_LEVEL_IDS.join(', ')}`,
        }
    }
    return {
        ok: true,
        message: `Loading level ${debugLevelId(level)}`,
        action: 'level',
        levelId: level.id,
    }
}

function executeDebugSummonCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length < 2 || tokens.length > 4) {
        return { ok: false, message: 'Usage: /summon {zombie_name} [row] [col]' }
    }

    if (!isLevelReady(gameScreen)) {
        return conditionFailure('/summon can only run during an active level')
    }

    const zombieType = parseDebugZombieType(tokens[1])
    if (!zombieType) {
        return {
            ok: false,
            message: `Unknown zombie: ${tokens[1]}. Valid zombies: ${listDebugNames(DEBUG_ZOMBIE_TYPES)}`,
        }
    }

    if (tokens.length === 2) {
        if (!gameScreen.debugSummonZombie(zombieType)) {
            return conditionFailure('/summon can only run during an active level')
        }
        return { ok: true, message: `Summoned ${zombieType} using spawn row logic` }
    }

    const row = parseDebugInteger(tokens[2])
    if (row == null) {
        return { ok: false, message: `Invalid row. Use an integer from 1 to ${gameScreen.getGridSize().rows}` }
    }
    const col = tokens.length === 4 ? parseDebugInteger(tokens[3]) : null
    if (tokens.length === 4 && col == null) {
        return { ok: false, message: `Invalid col. Use an integer from 1 to ${gameScreen.getGridSize().cols}` }
    }
    const boundsError = validateDebugGridPosition(gameScreen, row, col)
    if (boundsError) return { ok: false, message: boundsError }

    if (!gameScreen.debugSummonZombie(zombieType, row - 1, col == null ? undefined : col - 1)) {
        return conditionFailure('/summon can only run during an active level')
    }

    const position = col == null ? `row ${row}, right edge` : `row ${row}, col ${col}`
    return { ok: true, message: `Summoned ${zombieType} at ${position}` }
}

function executeDebugGameSpeedCommand(tokens: string[]): DebugCliResult {
    if (tokens.length !== 2) {
        return { ok: false, message: 'Usage: /gamespeed {speed}' }
    }

    const speed = Number(tokens[1])
    if (!Number.isFinite(speed)) {
        return { ok: false, message: `Invalid speed: ${tokens[1]}` }
    }
    if (speed < DEBUG_CLI_MIN_SPEED || speed > DEBUG_CLI_MAX_SPEED) {
        return {
            ok: false,
            message: `Speed must be between ${DEBUG_CLI_MIN_SPEED.toFixed(1)} and ${DEBUG_CLI_MAX_SPEED.toFixed(1)}`,
        }
    }

    const previousSpeed = getGameSpeed()
    setGameSpeed(speed)
    return { ok: true, message: `Game speed changed from ${previousSpeed} to ${speed}` }
}

function executeDebugRechargingCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 2) {
        return { ok: false, message: 'Usage: /cooldown {true|false}' }
    }

    if (!isLevelReady(gameScreen)) {
        return conditionFailure('/cooldown can only run during an active level')
    }

    const enabled = parseDebugBoolean(tokens[1])
    if (enabled == null) {
        return { ok: false, message: `Invalid cooldown value: ${tokens[1]}. Use true or false` }
    }

    const rechargingEnabled = gameScreen.debugSetRechargingEnabled(enabled)
    if (rechargingEnabled == null) {
        return conditionFailure('/cooldown can only run during an active level')
    }
    return { ok: true, message: `Seed packet cooldown ${rechargingEnabled ? 'enabled' : 'disabled'}` }
}

function executeDebugSunSpawningCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 2) {
        return { ok: false, message: 'Usage: /sunspawning {true|false}' }
    }

    if (!isLevelReady(gameScreen)) {
        return conditionFailure('/sunspawning can only run during an active level')
    }

    const enabled = parseDebugBoolean(tokens[1])
    if (enabled == null) {
        return { ok: false, message: `Invalid sun spawning value: ${tokens[1]}. Use true or false` }
    }

    const sunSpawningEnabled = gameScreen.debugSetSunSpawningEnabled(enabled)
    if (sunSpawningEnabled == null) {
        return conditionFailure('/sunspawning can only run during an active level')
    }
    return { ok: true, message: `Sun spawning ${sunSpawningEnabled ? 'enabled' : 'disabled'}` }
}

function executeDebugAutoCollectCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 2) {
        return { ok: false, message: 'Usage: /autocollect {true|false}' }
    }

    if (!isLevelReady(gameScreen)) {
        return conditionFailure('/autocollect can only run during an active level')
    }

    const enabled = parseDebugBoolean(tokens[1])
    if (enabled == null) {
        return { ok: false, message: `Invalid auto collect value: ${tokens[1]}. Use true or false` }
    }

    const autoCollectEnabled = gameScreen.debugSetAutoCollectEnabled(enabled)
    if (autoCollectEnabled == null) {
        return conditionFailure('/autocollect can only run during an active level')
    }
    return { ok: true, message: `Auto collect ${autoCollectEnabled ? 'enabled' : 'disabled'}` }
}

function executeDebugLawnMowerCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 2 && tokens.length !== 3) {
        return { ok: false, message: 'Usage: /lawnmower {trigger|reset} [row]' }
    }

    if (!isLevelReady(gameScreen)) {
        return conditionFailure('/lawnmower can only run during an active level')
    }

    const status = parseLawnMowerStatus(tokens[1])
    if (!status) {
        return { ok: false, message: `Invalid lawn mower action: ${tokens[1]}. Use trigger or reset` }
    }

    if (tokens.length === 2) {
        const changed = gameScreen.debugSetAllLawnMowers(status)
        if (changed <= 0) {
            return conditionFailure(`No lawn mowers could be ${lawnMowerPastTense(status)}`)
        }
        return { ok: true, message: `${lawnMowerPastTense(status)} ${changed} lawn mower(s)` }
    }

    const row = parseDebugInteger(tokens[2])
    if (row == null) {
        return { ok: false, message: `Invalid row. Use an integer from 1 to ${gameScreen.getGridSize().rows}` }
    }
    const boundsError = validateDebugGridPosition(gameScreen, row, null)
    if (boundsError) return { ok: false, message: boundsError }

    const changed = gameScreen.debugSetLawnMower(row - 1, status)
    if (!changed) {
        return conditionFailure(
            status === 'trigger'
                ? `No ready lawn mower can be triggered at row ${row}`
                : `No triggered lawn mower can be reset at row ${row}`,
        )
    }
    return { ok: true, message: `${lawnMowerPastTense(status)} lawn mower at row ${row}` }
}

function executeDebugSunCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 3) {
        return { ok: false, message: 'Usage: /sun {add|set} {number}' }
    }

    if (!isLevelReady(gameScreen)) {
        return conditionFailure('/sun can only run during an active level')
    }

    const action = parseSunAction(tokens[1])
    if (!action) {
        return { ok: false, message: `Invalid sun action: ${tokens[1]}. Use add or set` }
    }

    const amount = parseDebugInteger(tokens[2])
    if (amount == null) {
        return { ok: false, message: `Invalid sun amount: ${tokens[2]}` }
    }

    const sun = action === 'add'
        ? gameScreen.debugAddSun(amount)
        : gameScreen.debugSetSun(amount)
    if (sun == null) {
        return conditionFailure('/sun can only run during an active level')
    }
    return {
        ok: true,
        message: action === 'add'
            ? `Changed sun by ${amount}. Current sun: ${sun}`
            : `Set sun to ${sun}`,
    }
}

function isLevelReady(gameScreen: AdventureGameScreen | null): gameScreen is AdventureGameScreen {
    return gameScreen?.isLevelRunning() === true
}

function isLevelScreenAvailable(gameScreen: AdventureGameScreen | null): gameScreen is AdventureGameScreen {
    return gameScreen?.node?.isValid === true
}

function conditionFailure(message: string): DebugCliResult {
    return { ok: false, message, failure: 'condition' }
}

function parseDebugPlantType(name: string): PlantType | null {
    return DEBUG_PLANT_LOOKUP[normalizeDebugEntityName(name)] ?? null
}

function getDebugCliCommandCompletions(
    command: string,
    prefix: string,
    activeStart: number,
    allowExactCommandCompletion = false,
) {
    const normalizedPrefix = prefix.startsWith('/') ? prefix.slice(1) : prefix
    if (normalizedPrefix.length === 0) return []
    if (
        !allowExactCommandCompletion &&
        DEBUG_CLI_COMMAND_SPECS.some((candidate) => candidate.name === normalizedPrefix.toLowerCase())
    ) {
        return []
    }

    const hasSlash = prefix.length === 0 || prefix.startsWith('/') || command.startsWith('/')
    const matches = DEBUG_CLI_COMMAND_SPECS.filter((candidate) =>
        candidate.name.toLowerCase().startsWith(normalizedPrefix.toLowerCase()),
    )
    return matches
        .map((spec) => command.slice(0, activeStart) + `${hasSlash ? '/' : ''}${spec.name}`)
        .filter((completion) => allowExactCommandCompletion || completion.length > command.length)
}

function getDebugCompletedParamCount(
    command: string,
    tokens: DebugCliInputToken[],
    spec: DebugCliCommandSpec,
) {
    if (tokens.length === 1) return 0

    if (/\s$/.test(command)) {
        return Math.max(0, tokens.length - 1)
    }

    const paramIndex = tokens.length - 2
    const token = tokens[tokens.length - 1]
    if (token.value.length === 0) return paramIndex

    const completions = spec.completions[paramIndex]
    if (completions && !completions.some((completion) => completion.toLowerCase() === token.value.toLowerCase())) {
        return null
    }
    return paramIndex + 1
}

function getDebugTokenCompletions(
    completions: readonly string[],
    prefix: string,
    allowEmptyTokenCompletion: boolean,
) {
    if (prefix.length === 0 && !allowEmptyTokenCompletion) return []

    return completions.filter((completion) =>
        completion.toLowerCase().startsWith(prefix.toLowerCase()),
    )
}

function normalizeDebugCommandName(commandName: string) {
    return commandName.startsWith('/') ? commandName.slice(1).toLowerCase() : commandName.toLowerCase()
}

function parseDebugZombieType(name: string): ZombieType | null {
    return DEBUG_ZOMBIE_LOOKUP[normalizeDebugEntityName(name)] ?? null
}

function debugLevelId(level: LevelDefinition) {
    return level.id.replace('adventure-', '')
}

function normalizeDebugLevelId(value: string) {
    const normalized = value.trim().toLowerCase()
    return normalized.startsWith('adventure-') ? normalized.slice('adventure-'.length) : normalized
}

function parseLawnMowerStatus(status: string): 'trigger' | 'reset' | null {
    const normalized = status.toLowerCase()
    if (normalized === 'trigger' || normalized === 'reset') return normalized
    return null
}

function parseSunAction(action: string): 'add' | 'set' | null {
    const normalized = action.toLowerCase()
    if (normalized === 'add' || normalized === 'set') return normalized
    return null
}

function parseDebugBoolean(value: string): boolean | null {
    const normalized = value.toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
    return null
}

function lawnMowerPastTense(status: 'trigger' | 'reset') {
    return status === 'trigger' ? 'triggered' : 'reset'
}

function createDebugTypeLookup<T extends string>(types: T[]) {
    const lookup: Record<string, T> = Object.create(null)
    for (const type of types) {
        lookup[type.toLowerCase()] = type
        lookup[normalizeDebugEntityName(type)] = type
    }
    return lookup
}

function normalizeDebugEntityName(name: string) {
    return name.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function listDebugNames(names: readonly string[]) {
    return names.join(', ')
}

function parseDebugInteger(token: string) {
    if (!/^-?\d+$/.test(token)) return null
    const value = Number(token)
    return Number.isSafeInteger(value) ? value : null
}

function validateDebugGridPosition(gameScreen: AdventureGameScreen, row: number, col: number | null) {
    const size = gameScreen.getGridSize()
    if (row < 1 || row > size.rows) {
        return `Row ${row} is out of bounds. Use 1-${size.rows}`
    }
    if (col == null) return null
    if (col < 1 || col > size.cols) {
        return `Col ${col} is out of bounds. Use 1-${size.cols}`
    }
    return null
}

function parseDebugCliInputTokens(command: string) {
    const tokens: DebugCliInputToken[] = []
    let tokenStart = -1

    for (let i = 0; i < command.length; i++) {
        const char = command[i]
        if (/\s/.test(char)) {
            if (tokenStart !== -1) {
                tokens.push({
                    value: command.slice(tokenStart, i),
                    start: tokenStart,
                    end: i,
                })
                tokenStart = -1
            }
            continue
        }

        if (tokenStart === -1) tokenStart = i
    }

    if (tokenStart !== -1) {
        tokens.push({
            value: command.slice(tokenStart),
            start: tokenStart,
            end: command.length,
        })
    }
    return tokens
}

function tokenizeDebugCliCommand(command: string) {
    const tokens: string[] = []
    let token = ''
    let quote = ''
    let escaping = false

    for (const char of command.trim()) {
        if (escaping) {
            token += char
            escaping = false
            continue
        }
        if (char === '\\') {
            escaping = true
            continue
        }
        if (quote) {
            if (char === quote) {
                quote = ''
            } else {
                token += char
            }
            continue
        }
        if (char === '"' || char === "'") {
            quote = char
            continue
        }
        if (/\s/.test(char)) {
            if (token.length > 0) {
                tokens.push(token)
                token = ''
            }
            continue
        }
        token += char
    }

    if (escaping) token += '\\'
    if (token.length > 0) tokens.push(token)
    return tokens
}
