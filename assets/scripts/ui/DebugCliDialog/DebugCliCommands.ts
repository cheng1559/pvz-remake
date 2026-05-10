import type { AdventureGameScreen } from '@/game/GameScreen'
import { PLANT_DEFINITIONS, ZOMBIE_DEFINITIONS, getGameSpeed, setGameSpeed } from '@/game/GameDefinitions'
import type { PlantType, ZombieType } from '@/game/GameTypes'

const DEBUG_CLI_MIN_SPEED = 0
const DEBUG_CLI_MAX_SPEED = 10

export interface DebugCliResult {
    ok: boolean
    message: string
}

const DEBUG_PLANT_TYPES = Object.keys(PLANT_DEFINITIONS) as PlantType[]
const DEBUG_ZOMBIE_TYPES = Object.keys(ZOMBIE_DEFINITIONS) as ZombieType[]
const DEBUG_PLANT_LOOKUP = createDebugTypeLookup(DEBUG_PLANT_TYPES)
const DEBUG_ZOMBIE_LOOKUP = createDebugTypeLookup(DEBUG_ZOMBIE_TYPES)

export function executeDebugCliCommand(command: string, gameScreen: AdventureGameScreen | null): DebugCliResult {
    const tokens = tokenizeDebugCliCommand(command)
    if (tokens.length === 0) {
        return { ok: false, message: 'Empty command' }
    }

    const commandName = tokens[0].startsWith('/') ? tokens[0].slice(1) : tokens[0]
    switch (commandName.toLowerCase()) {
        case 'plant':
            return executeDebugPlantCommand(tokens, gameScreen)
        case 'summon':
            return executeDebugSummonCommand(tokens, gameScreen)
        case 'gamespeed':
            return executeDebugGameSpeedCommand(tokens)
        case 'lawnmower':
            return executeDebugLawnMowerCommand(tokens, gameScreen)
        case 'sun':
            return executeDebugSunCommand(tokens, gameScreen)
        case 'recharging':
            return executeDebugRechargingCommand(tokens, gameScreen)
        case 'sunspawning':
            return executeDebugSunSpawningCommand(tokens, gameScreen)
        default:
            return { ok: false, message: `Unknown command: ${tokens[0]}` }
    }
}

function executeDebugPlantCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 4) {
        return { ok: false, message: 'Usage: /plant {plant_name} {row} {col}' }
    }

    if (!isLevelReady(gameScreen)) {
        return { ok: false, message: '/plant can only run during an active level' }
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
        return { ok: false, message: '/plant can only run during an active level' }
    }
    return { ok: true, message: `Planted ${plantType} at row ${row}, col ${col}` }
}

function executeDebugSummonCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 3 && tokens.length !== 4) {
        return { ok: false, message: 'Usage: /summon {zombie_name} {row} [col]' }
    }

    if (!isLevelReady(gameScreen)) {
        return { ok: false, message: '/summon can only run during an active level' }
    }

    const zombieType = parseDebugZombieType(tokens[1])
    if (!zombieType) {
        return {
            ok: false,
            message: `Unknown zombie: ${tokens[1]}. Valid zombies: ${listDebugNames(DEBUG_ZOMBIE_TYPES)}`,
        }
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
        return { ok: false, message: '/summon can only run during an active level' }
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
        return { ok: false, message: 'Usage: /recharging {true|false}' }
    }

    if (!isLevelReady(gameScreen)) {
        return { ok: false, message: '/recharging can only run during an active level' }
    }

    const enabled = parseDebugBoolean(tokens[1])
    if (enabled == null) {
        return { ok: false, message: `Invalid recharging value: ${tokens[1]}. Use true or false` }
    }

    const rechargingEnabled = gameScreen.debugSetRechargingEnabled(enabled)
    if (rechargingEnabled == null) {
        return { ok: false, message: '/recharging can only run during an active level' }
    }
    return { ok: true, message: `Seed packet recharging ${rechargingEnabled ? 'enabled' : 'disabled'}` }
}

function executeDebugSunSpawningCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 2) {
        return { ok: false, message: 'Usage: /sunspawning {true|false}' }
    }

    if (!isLevelReady(gameScreen)) {
        return { ok: false, message: '/sunspawning can only run during an active level' }
    }

    const enabled = parseDebugBoolean(tokens[1])
    if (enabled == null) {
        return { ok: false, message: `Invalid sun spawning value: ${tokens[1]}. Use true or false` }
    }

    const sunSpawningEnabled = gameScreen.debugSetSunSpawningEnabled(enabled)
    if (sunSpawningEnabled == null) {
        return { ok: false, message: '/sunspawning can only run during an active level' }
    }
    return { ok: true, message: `Sun spawning ${sunSpawningEnabled ? 'enabled' : 'disabled'}` }
}

function executeDebugLawnMowerCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 2 && tokens.length !== 3) {
        return { ok: false, message: 'Usage: /lawnmower {trigger|reset} [row]' }
    }

    if (!isLevelReady(gameScreen)) {
        return { ok: false, message: '/lawnmower can only run during an active level' }
    }

    const status = parseLawnMowerStatus(tokens[1])
    if (!status) {
        return { ok: false, message: `Invalid lawn mower action: ${tokens[1]}. Use trigger or reset` }
    }

    if (tokens.length === 2) {
        const changed = gameScreen.debugSetAllLawnMowers(status)
        if (changed <= 0) {
            return { ok: false, message: `No lawn mowers could be ${lawnMowerPastTense(status)}` }
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
        return {
            ok: false,
            message: status === 'trigger'
                ? `No ready lawn mower can be triggered at row ${row}`
                : `No triggered lawn mower can be reset at row ${row}`,
        }
    }
    return { ok: true, message: `${lawnMowerPastTense(status)} lawn mower at row ${row}` }
}

function executeDebugSunCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 3) {
        return { ok: false, message: 'Usage: /sun {add|set} {number}' }
    }

    if (!isLevelReady(gameScreen)) {
        return { ok: false, message: '/sun can only run during an active level' }
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
        return { ok: false, message: '/sun can only run during an active level' }
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

function parseDebugPlantType(name: string): PlantType | null {
    return DEBUG_PLANT_LOOKUP[normalizeDebugEntityName(name)] ?? null
}

function parseDebugZombieType(name: string): ZombieType | null {
    return DEBUG_ZOMBIE_LOOKUP[normalizeDebugEntityName(name)] ?? null
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
