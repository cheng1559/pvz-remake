import { screen, sys } from 'cc'
import { SoundLoader } from '@/core/SoundLoader'
import type { AdventureGameScreen } from '@/game/GameScreen'
import { ADVENTURE_LEVELS, PLANT_DEFINITIONS, ZOMBIE_DEFINITIONS, getGameSpeed, setGameSpeed } from '@/game/GameDefinitions'
import { GameDebugSettings } from '@/game/GameDebugSettings'
import type { DebugCollectMode } from '@/game/GameDebugSettings'
import { GameSettingsStore, SFX_VOLUME_SCALE } from '@/game/persistence/GameSettingsStore'
import type { ItemType, LevelDefinition, PlantType, ZombieType } from '@/game/GameTypes'

const DEBUG_CLI_MIN_SPEED = 0
const DEBUG_CLI_MAX_SPEED = 10

export interface DebugCliResult {
    ok: boolean
    message: string
    failure?: 'syntax' | 'condition'
    action?: 'restart' | 'reload' | 'home' | 'level' | 'help' | 'menu' | 'store' | 'almanac' | 'zenGarden' | 'quit'
    levelId?: LevelDefinition['id']
    settingsChanged?: boolean
}

const DEBUG_PLANT_TYPES = Object.keys(PLANT_DEFINITIONS) as PlantType[]
const DEBUG_PLANT_NAMES = [...DEBUG_PLANT_TYPES, 'bowling-wallnut', 'bowling-explodenut']
const DEBUG_ZOMBIE_TYPES = Object.keys(ZOMBIE_DEFINITIONS) as ZombieType[]
const DEBUG_ITEM_SPECS: DebugItemSpec[] = [
    { name: 'silver', type: 'silver-coin' },
    { name: 'gold', type: 'gold-coin' },
    { name: 'diamond', type: 'diamond' },
    { name: 'sun', type: 'sun' },
    { name: 'small-sun', type: 'small-sun' },
    { name: 'large-sun', type: 'large-sun' },
    { name: 'award', type: 'level-award' },
]
const DEBUG_PLANT_LOOKUP = createDebugTypeLookup(DEBUG_PLANT_TYPES)
const DEBUG_ZOMBIE_LOOKUP = createDebugTypeLookup(DEBUG_ZOMBIE_TYPES)
const DEBUG_ITEM_LOOKUP = createDebugItemLookup(DEBUG_ITEM_SPECS)
const DEBUG_BOOLEAN_VALUES = ['true', 'false']
const DEBUG_COLLECT_MODES: DebugCollectMode[] = ['auto', 'click', 'move']
const DEBUG_LEVEL_IDS = ADVENTURE_LEVELS.map((level) => debugLevelId(level))
const DEBUG_LEVEL_LOOKUP = new Map(DEBUG_LEVEL_IDS.map((id, index) => [id, ADVENTURE_LEVELS[index]]))
type DebugNativeBridge = {
    setFullScreen?: (fullScreen: boolean) => boolean
}
type DebugNativeBindings = typeof globalThis & {
    jsb?: {
        PvzNative?: DebugNativeBridge
    }
}
const DEBUG_CLI_COMMAND_SPECS: DebugCliCommandSpec[] = [
    {
        name: 'plant',
        completions: [DEBUG_PLANT_NAMES],
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
        name: 'reload',
        completions: [],
        parameterHints: [],
    },
    {
        name: 'home',
        completions: [],
        parameterHints: [],
    },
    {
        name: 'quit',
        completions: [],
        parameterHints: [],
    },
    {
        name: 'help',
        completions: [],
        parameterHints: [],
    },
    {
        name: 'menu',
        completions: [],
        parameterHints: [],
    },
    {
        name: 'shop',
        completions: [],
        parameterHints: [],
    },
    {
        name: 'almanac',
        completions: [],
        parameterHints: [],
    },
    {
        name: 'zengarden',
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
        parameterHints: ['{0-10}'],
    },
    {
        name: 'hotkeys',
        completions: [DEBUG_BOOLEAN_VALUES],
        parameterHints: ['{enabled}'],
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
        name: 'money',
        completions: [['add', 'set']],
        parameterHints: ['{action}', '{number}'],
    },
    {
        name: 'item',
        completions: [DEBUG_ITEM_SPECS.map((item) => item.name)],
        parameterHints: ['{item_name}', '[optional]{row}', '[optional]{col}'],
    },
    {
        name: 'sunspawning',
        completions: [DEBUG_BOOLEAN_VALUES],
        parameterHints: ['{enabled}'],
    },
    {
        name: 'suncost',
        completions: [DEBUG_BOOLEAN_VALUES],
        parameterHints: ['{enabled}'],
    },
    {
        name: 'collect',
        completions: [DEBUG_COLLECT_MODES],
        parameterHints: ['{auto|click|move}'],
    },
    {
        name: 'hitboxes',
        completions: [DEBUG_BOOLEAN_VALUES],
        parameterHints: ['{enabled}'],
    },
    {
        name: 'zombie',
        completions: [DEBUG_ZOMBIE_TYPES],
        parameterHints: ['{zombie_name}', '[optional]{row}', '[optional]{col}'],
    },
    {
        name: 'cooldown',
        completions: [DEBUG_BOOLEAN_VALUES],
        parameterHints: ['{enabled}'],
    },
    {
        name: 'music',
        completions: [],
        parameterHints: ['{0-100}'],
    },
    {
        name: 'sfx',
        completions: [],
        parameterHints: ['{0-100}'],
    },
    {
        name: 'fullscreen',
        completions: [DEBUG_BOOLEAN_VALUES],
        parameterHints: ['{enabled}'],
    },
    {
        name: 'mobile',
        completions: [DEBUG_BOOLEAN_VALUES],
        parameterHints: ['{enabled}'],
    },
]

interface DebugCliCommandSpec {
    name: string
    completions: readonly (readonly string[])[]
    parameterHints: readonly string[]
}

interface DebugItemSpec {
    name: string
    type: ItemType | 'level-award'
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
        case 'reload':
            return executeDebugReloadCommand(tokens)
        case 'home':
            return executeDebugHomeCommand(tokens, gameScreen)
        case 'quit':
            return executeDebugQuitCommand(tokens)
        case 'help':
            return executeDebugScreenCommand(tokens, 'help', 'Opening help')
        case 'menu':
            return executeDebugScreenCommand(tokens, 'menu', 'Opening menu')
        case 'shop':
            return executeDebugScreenCommand(tokens, 'store', 'Opening shop')
        case 'almanac':
            return executeDebugScreenCommand(tokens, 'almanac', 'Opening almanac')
        case 'zengarden':
            return executeDebugScreenCommand(tokens, 'zenGarden', 'Opening Zen Garden')
        case 'level':
            return executeDebugLevelCommand(tokens)
        case 'zombie':
            return executeDebugSummonCommand(tokens, gameScreen)
        case 'gamespeed':
            return executeDebugGameSpeedCommand(tokens)
        case 'hotkeys':
            return executeDebugHotkeysCommand(tokens)
        case 'lawnmower':
            return executeDebugLawnMowerCommand(tokens, gameScreen)
        case 'sun':
            return executeDebugSunCommand(tokens, gameScreen)
        case 'money':
            return executeDebugMoneyCommand(tokens, gameScreen)
        case 'item':
            return executeDebugItemCommand(tokens, gameScreen)
        case 'cooldown':
            return executeDebugRechargingCommand(tokens, gameScreen)
        case 'sunspawning':
            return executeDebugSunSpawningCommand(tokens, gameScreen)
        case 'suncost':
            return executeDebugSunCostCommand(tokens, gameScreen)
        case 'collect':
            return executeDebugCollectCommand(tokens, gameScreen)
        case 'hitboxes':
            return executeDebugHitboxesCommand(tokens, gameScreen)
        case 'music':
            return executeDebugMusicCommand(tokens)
        case 'sfx':
            return executeDebugSfxCommand(tokens)
        case 'fullscreen':
            return executeDebugFullScreenCommand(tokens)
        case 'mobile':
            return executeDebugMobileCommand(tokens)
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

    const plantSpec = parseDebugPlantSpec(tokens[1])
    if (!plantSpec) {
        return {
            ok: false,
            message: `Unknown plant: ${tokens[1]}. Valid plants: ${listDebugNames(DEBUG_PLANT_NAMES)}`,
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

    if (!gameScreen.debugPlacePlant(plantSpec.type, row - 1, col - 1, plantSpec.bowling ? 15 : undefined)) {
        return conditionFailure('/plant can only run during an active level')
    }
    return { ok: true, message: `Planted ${tokens[1]} at row ${row}, col ${col}` }
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

function executeDebugReloadCommand(tokens: string[]): DebugCliResult {
    if (tokens.length !== 1) {
        return { ok: false, message: 'Usage: /reload' }
    }

    return { ok: true, message: 'Reloading game', action: 'reload' }
}

function executeDebugHomeCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 1) {
        return { ok: false, message: 'Usage: /home' }
    }

    return { ok: true, message: 'Returning to main menu', action: 'home' }
}

function executeDebugQuitCommand(tokens: string[]): DebugCliResult {
    if (tokens.length !== 1) {
        return { ok: false, message: 'Usage: /quit' }
    }

    return { ok: true, message: 'Quitting game', action: 'quit' }
}

function executeDebugScreenCommand(
    tokens: string[],
    action: NonNullable<DebugCliResult['action']>,
    message: string,
): DebugCliResult {
    if (tokens.length !== 1) {
        return { ok: false, message: `Usage: /${tokens[0].replace(/^\//, '')}` }
    }

    return { ok: true, message, action }
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
        return { ok: false, message: 'Usage: /zombie {zombie_name} [row] [col]' }
    }

    if (!isLevelReady(gameScreen)) {
        return conditionFailure('/zombie can only run during an active level')
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
            return conditionFailure('/zombie can only run during an active level')
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
        return conditionFailure('/zombie can only run during an active level')
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

function executeDebugHotkeysCommand(tokens: string[]): DebugCliResult {
    if (tokens.length !== 2) {
        return { ok: false, message: 'Usage: /hotkeys {true|false}' }
    }

    const enabled = parseDebugBoolean(tokens[1])
    if (enabled == null) {
        return { ok: false, message: `Invalid hotkeys value: ${tokens[1]}. Use true or false` }
    }

    const hotkeysEnabled = GameDebugSettings.setHotkeysEnabled(enabled)
    return { ok: true, message: `Hotkeys ${hotkeysEnabled ? 'enabled' : 'disabled'}` }
}

function executeDebugMusicCommand(tokens: string[]): DebugCliResult {
    if (tokens.length !== 2) {
        return { ok: false, message: 'Usage: /music {0-100}' }
    }

    const percent = parseDebugPercent(tokens[1])
    if (percent == null) {
        return { ok: false, message: `Invalid music volume: ${tokens[1]}. Use an integer from 0 to 100` }
    }

    const settings = GameSettingsStore.update({ musicVolume: percent / 100 })
    SoundLoader.setMusicVolume(settings.musicVolume)
    return { ok: true, message: `Music volume set to ${Math.round(settings.musicVolume * 100)}`, settingsChanged: true }
}

function executeDebugSfxCommand(tokens: string[]): DebugCliResult {
    if (tokens.length !== 2) {
        return { ok: false, message: 'Usage: /sfx {0-100}' }
    }

    const percent = parseDebugPercent(tokens[1])
    if (percent == null) {
        return { ok: false, message: `Invalid SFX volume: ${tokens[1]}. Use an integer from 0 to 100` }
    }

    const settings = GameSettingsStore.update({ sfxVolume: percent / 100 * SFX_VOLUME_SCALE })
    SoundLoader.setSfxVolume(settings.sfxVolume)
    return { ok: true, message: `SFX volume set to ${Math.round(settings.sfxVolume / SFX_VOLUME_SCALE * 100)}`, settingsChanged: true }
}

function executeDebugFullScreenCommand(tokens: string[]): DebugCliResult {
    if (tokens.length !== 2) {
        return { ok: false, message: 'Usage: /fullscreen {true|false}' }
    }

    const enabled = parseDebugBoolean(tokens[1])
    if (enabled == null) {
        return { ok: false, message: `Invalid fullscreen value: ${tokens[1]}. Use true or false` }
    }
    if (sys.isNative && sys.isMobile && !enabled) {
        return conditionFailure('Windowed mode is not available on mobile devices')
    }
    if (!debugCanRequestFullScreen()) {
        return conditionFailure('Full screen mode is not available')
    }

    const settings = GameSettingsStore.update({ fullScreen: enabled })
    void applyDebugFullScreenPreference(settings.fullScreen)
    return { ok: true, message: `Fullscreen ${settings.fullScreen ? 'enabled' : 'disabled'}`, settingsChanged: true }
}

function executeDebugMobileCommand(tokens: string[]): DebugCliResult {
    if (tokens.length !== 2) {
        return { ok: false, message: 'Usage: /mobile {true|false}' }
    }

    const enabled = parseDebugBoolean(tokens[1])
    if (enabled == null) {
        return { ok: false, message: `Invalid mobile value: ${tokens[1]}. Use true or false` }
    }

    const mobileEnabled = GameDebugSettings.setMobileEnabled(enabled)
    return { ok: true, message: `Mobile mode ${mobileEnabled ? 'enabled' : 'disabled'}`, settingsChanged: true }
}

function executeDebugRechargingCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 2) {
        return { ok: false, message: 'Usage: /cooldown {true|false}' }
    }

    const enabled = parseDebugBoolean(tokens[1])
    if (enabled == null) {
        return { ok: false, message: `Invalid cooldown value: ${tokens[1]}. Use true or false` }
    }

    const rechargingEnabled = isLevelScreenAvailable(gameScreen)
        ? gameScreen.debugSetRechargingEnabled(enabled)
        : setDebugRechargingEnabled(enabled)
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

function executeDebugSunCostCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 2) {
        return { ok: false, message: 'Usage: /suncost {true|false}' }
    }

    const enabled = parseDebugBoolean(tokens[1])
    if (enabled == null) {
        return { ok: false, message: `Invalid sun cost value: ${tokens[1]}. Use true or false` }
    }

    const sunCostEnabled = isLevelScreenAvailable(gameScreen)
        ? gameScreen.debugSetSunCostEnabled(enabled)
        : setDebugSunCostEnabled(enabled)
    return { ok: true, message: `Sun cost ${sunCostEnabled ? 'enabled' : 'disabled'}` }
}

function executeDebugCollectCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 2) {
        return { ok: false, message: 'Usage: /collect {auto|click|move}' }
    }

    const mode = parseDebugCollectMode(tokens[1])
    if (!mode) {
        return { ok: false, message: `Invalid collect mode: ${tokens[1]}. Use auto, click, or move` }
    }

    const collectMode = isLevelScreenAvailable(gameScreen)
        ? gameScreen.debugSetCollectMode(mode)
        : setDebugCollectMode(mode)
    return { ok: true, message: `Collect mode: ${collectMode}` }
}

function executeDebugHitboxesCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 2) {
        return { ok: false, message: 'Usage: /hitboxes {true|false}' }
    }

    const enabled = parseDebugBoolean(tokens[1])
    if (enabled == null) {
        return { ok: false, message: `Invalid hitboxes value: ${tokens[1]}. Use true or false` }
    }

    const hitboxesVisible = isLevelScreenAvailable(gameScreen)
        ? gameScreen.debugSetHitboxesVisible(enabled)
        : setDebugHitboxesVisible(enabled)
    return { ok: true, message: `Hitboxes ${hitboxesVisible ? 'enabled' : 'disabled'}` }
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

    const action = parseAmountAction(tokens[1])
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

function executeDebugMoneyCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 3) {
        return { ok: false, message: 'Usage: /money {add|set} {number}' }
    }

    if (!isLevelReady(gameScreen)) {
        return conditionFailure('/money can only run during an active level')
    }

    const action = parseAmountAction(tokens[1])
    if (!action) {
        return { ok: false, message: `Invalid money action: ${tokens[1]}. Use add or set` }
    }

    const amount = parseDebugInteger(tokens[2])
    if (amount == null) {
        return { ok: false, message: `Invalid money amount: ${tokens[2]}` }
    }

    const money = action === 'add'
        ? gameScreen.debugAddMoney(amount)
        : gameScreen.debugSetMoney(amount)
    if (money == null) {
        return conditionFailure('/money can only run during an active level')
    }
    return {
        ok: true,
        message: action === 'add'
            ? `Changed money by ${amount}. Current money: ${money}`
            : `Set money to ${money}`,
    }
}

function executeDebugItemCommand(tokens: string[], gameScreen: AdventureGameScreen | null): DebugCliResult {
    if (tokens.length !== 2 && tokens.length !== 4) {
        return { ok: false, message: 'Usage: /item {item_name} [row] [col]' }
    }

    if (!isLevelReady(gameScreen)) {
        return conditionFailure('/item can only run during an active level')
    }

    const itemSpec = parseDebugItemSpec(tokens[1])
    if (!itemSpec) {
        return {
            ok: false,
            message: `Unknown item: ${tokens[1]}. Valid items: ${listDebugNames(DEBUG_ITEM_SPECS.map((item) => item.name))}`,
        }
    }

    let row: number | undefined
    let col: number | undefined
    if (tokens.length === 4) {
        const parsedRow = parseDebugInteger(tokens[2])
        if (parsedRow == null) {
            return { ok: false, message: `Invalid row. Use an integer from 1 to ${gameScreen.getGridSize().rows}` }
        }
        const parsedCol = parseDebugInteger(tokens[3])
        if (parsedCol == null) {
            return { ok: false, message: `Invalid col. Use an integer from 1 to ${gameScreen.getGridSize().cols}` }
        }
        const boundsError = validateDebugGridPosition(gameScreen, parsedRow, parsedCol)
        if (boundsError) return { ok: false, message: boundsError }
        row = parsedRow - 1
        col = parsedCol - 1
    }

    const item = gameScreen.debugSpawnItem(itemSpec.type, row, col)
    if (!item) {
        return conditionFailure('/item can only run during an active level')
    }

    const position = row == null || col == null
        ? 'at the default board position'
        : `at row ${row + 1}, col ${col + 1}`
    return { ok: true, message: `Spawned ${itemSpec.name} ${position}` }
}

function isLevelReady(gameScreen: AdventureGameScreen | null): gameScreen is AdventureGameScreen {
    return gameScreen?.isLevelRunning() === true
}

function isLevelScreenAvailable(gameScreen: AdventureGameScreen | null): gameScreen is AdventureGameScreen {
    return gameScreen?.node?.isValid === true
}

function setDebugRechargingEnabled(enabled: boolean) {
    return GameDebugSettings.setRechargingEnabled(enabled)
}

function setDebugSunCostEnabled(enabled: boolean) {
    return GameDebugSettings.setSunCostEnabled(enabled)
}

function setDebugCollectMode(mode: DebugCollectMode) {
    return GameDebugSettings.setCollectMode(mode)
}

function setDebugHitboxesVisible(visible: boolean) {
    return GameDebugSettings.setHitboxesVisible(visible)
}

function conditionFailure(message: string): DebugCliResult {
    return { ok: false, message, failure: 'condition' }
}

function parseDebugPlantSpec(name: string): { type: PlantType, bowling: boolean } | null {
    const normalized = normalizeDebugEntityName(name)
    if (normalized === 'bowlingwallnut') return { type: 'wallnut', bowling: true }
    if (normalized === 'bowlingexplodenut') return { type: 'explodenut', bowling: true }

    const type = DEBUG_PLANT_LOOKUP[normalized] ?? null
    return type ? { type, bowling: false } : null
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

function parseDebugItemSpec(name: string): DebugItemSpec | null {
    return DEBUG_ITEM_LOOKUP[normalizeDebugEntityName(name)] ?? null
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

function parseAmountAction(action: string): 'add' | 'set' | null {
    const normalized = action.toLowerCase()
    if (normalized === 'add' || normalized === 'set') return normalized
    return null
}

function parseDebugCollectMode(value: string): DebugCollectMode | null {
    const normalized = value.toLowerCase()
    if (normalized === 'auto' || normalized === 'click' || normalized === 'move') return normalized
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

function createDebugItemLookup(items: DebugItemSpec[]) {
    const lookup: Record<string, DebugItemSpec> = Object.create(null)
    for (const item of items) {
        lookup[item.name.toLowerCase()] = item
        lookup[normalizeDebugEntityName(item.name)] = item
        lookup[normalizeDebugEntityName(item.type)] = item
    }
    lookup.silvercoin = items.find((item) => item.name === 'silver')!
    lookup.goldcoin = items.find((item) => item.name === 'gold')!
    lookup.finalseedpacket = items.find((item) => item.name === 'award')!
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

function parseDebugPercent(token: string) {
    const value = parseDebugInteger(token)
    if (value == null || value < 0 || value > 100) return null
    return value
}

function debugCanRequestFullScreen() {
    if (sys.isNative) return sys.isMobile || !!debugNativeBridge()?.setFullScreen
    return screen.supportsFullScreen
}

async function applyDebugFullScreenPreference(fullScreen: boolean) {
    try {
        const nativeBridge = debugNativeBridge()
        if (sys.isNative) {
            nativeBridge?.setFullScreen?.(fullScreen)
            return
        }

        if (fullScreen) {
            if (!screen.fullScreen()) await screen.requestFullScreen()
            return
        }

        if (screen.fullScreen()) await screen.exitFullScreen()
    } catch (error) {
        console.warn('[DebugCliCommands] Failed to apply fullscreen preference', error)
    }
}

function debugNativeBridge() {
    return (globalThis as DebugNativeBindings).jsb?.PvzNative
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
