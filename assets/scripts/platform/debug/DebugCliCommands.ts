import { screen, sys } from 'cc'
import { menuApi } from '@/client/api/MenuApi'
import { CursorManager } from '@/client/input/CursorManager'
import { OriginalResolution } from '@/client/view/OriginalResolution'
import { hasNativeWindow, refreshNativeWindow } from '@/client/view/ClientViewport'
import { setFontSharpness } from '@/client/font/FontAreaMaterial'
import { SoundSystem } from '@/client/sound/SoundSystem'
import { gameClock } from '@/core/GameClock'
import { debugAmount, debugCondition, debugInteger, debugSuccess, debugSwitchAdvice, debugSwitched, debugSyntax, normalizeDebugName, parseDebugCliCommand, type DebugCliCatalog, type DebugCliResult, type DebugGotoPage } from '@/shared/debug/DebugCli'
import { SFX_VOLUME_SCALE } from '@/shared/menu'
import { MAX_TICKS_PER_UPDATE } from '@/shared/protocol'
import { loadGameplayContent } from '@/client/game/loadIntegratedGameContent'
import { OptionsSettings } from '@/platform/OptionsSettings'
import { GameDebugSettings, type DebugPerfToggle } from './GameDebugSettings'

/** The rule switches a level starts with (LevelController): outside one they set the preference alone. */
const RULE_PREFERENCES: Record<string, () => boolean> = {
    cooldown: () => GameDebugSettings.set('rechargingEnabled', !GameDebugSettings.rechargingEnabled),
    suncost: () => GameDebugSettings.set('sunCostEnabled', !GameDebugSettings.sunCostEnabled),
    plantinvincible: () => GameDebugSettings.set('plantInvincible', !GameDebugSettings.plantInvincible),
}

export async function executeDebugCliCommand(...args: Parameters<typeof executeCommand>): Promise<DebugCliResult> {
    return executor.execute(...args)
}

// Call through a mutable object: ES module namespace exports cannot be patched reliably.
export const executor = { execute: executeCommand }

async function executeCommand(
    command: string,
    running: boolean,
    runGameCommand: (command: string) => DebugCliResult,
    catalog?: DebugCliCatalog,
): Promise<DebugCliResult> {
    const parsed = parseDebugCliCommand(command)
    if (!('name' in parsed)) return parsed
    const { name, args } = parsed
    switch (name) {
        case 'restart': return running ? { ...debugSuccess('Restarting level'), action: 'restart' } : debugCondition('DEBUG_NO_LEVEL_TO_RESTART')
        case 'reload': case 'quit':
            return { ...debugSuccess(`Opening ${name}`), action: name }
        case 'goto': {
            // The parser only lets DEBUG_GOTO_PAGES through.
            const page = args[0].toLowerCase() as DebugGotoPage
            return { ...debugSuccess(`Opening ${page}`), action: 'goto', page }
        }
        case 'level': {
            const id = args[0].toLowerCase().replace(/^(?:pvz:)?adventure-/, '')
            if (catalog && !catalog.levels.includes(id)) return debugCondition('DEBUG_LEVEL_NOT_INSTALLED', args[0])
            return { ...debugSuccess(`Loading level ${id}`), action: 'level', levelId: id.includes(':') ? id : `pvz:adventure-${id}` }
        }
        case 'gamespeed': {
            const speed = Number(args[0])
            if (!Number.isFinite(speed) || speed < 0 || speed > 10) return debugSyntax('Game speed must be between 0 and 10')
            gameClock.setSpeed(speed)
            return debugSuccess(`Game speed: ${speed}`)
        }
        case 'step': {
            const ticks = debugInteger(args[0])
            if (ticks === null || ticks < 1 || ticks > MAX_TICKS_PER_UPDATE) return debugSyntax(`Ticks must be an integer from 1 to ${MAX_TICKS_PER_UPDATE}`)
            if (!running) return debugCondition('DEBUG_REQUIRES_LEVEL', name)
            return { ...debugSuccess(`Running ${ticks} ticks`), action: 'step', ticks }
        }
        case 'music': case 'sfx': {
            const percent = debugInteger(args[0])
            if (percent === null || percent < 0 || percent > 100) return debugSyntax('Volume must be an integer from 0 to 100')
            const settings = await menuApi.updateSettings(name === 'music' ? { musicVolume: percent / 100 } : { sfxVolume: percent / 100 * SFX_VOLUME_SCALE })
            SoundSystem.setMusicVolume(settings.musicVolume)
            SoundSystem.setSfxVolume(settings.sfxVolume)
            return debugSuccess(`${name}: ${percent}`)
        }
        // Each switch turns over and says where it now stands (debugSwitched).
        case 'fullscreen': {
            const enabled = !(OptionsSettings.fullScreenForced || screen.fullScreen())
            if (sys.isNative && sys.isMobile && !enabled) return debugCondition('DEBUG_WINDOWED_UNAVAILABLE')
            if (!OptionsSettings.fullScreenForced && !screen.supportsFullScreen) return debugCondition('DEBUG_FULLSCREEN_UNAVAILABLE')
            await OptionsSettings.setFullScreen(enabled)
            return debugSwitched(name, enabled)
        }
        case 'resize': {
            if (!hasNativeWindow()) return debugCondition('DEBUG_RESIZE_UNAVAILABLE')
            GameDebugSettings.set('windowResizable', !GameDebugSettings.windowResizable)
            refreshNativeWindow()
            return debugSwitched(name, GameDebugSettings.windowResizable)
        }
        case 'mobile': return debugSwitched(name, (GameDebugSettings.set('mobileEnabled', !GameDebugSettings.mobileEnabled), GameDebugSettings.mobileEnabled))
        case 'autopause': return debugSwitched(name, GameDebugSettings.set('autoPauseEnabled', !GameDebugSettings.autoPauseEnabled))
        case 'hotkeys': return debugSwitched(name, (GameDebugSettings.set('hotkeysEnabled', !GameDebugSettings.hotkeysEnabled), GameDebugSettings.hotkeysEnabled))
        case 'haptics': return debugSwitched(name, (GameDebugSettings.set('hapticsEnabled', !GameDebugSettings.hapticsEnabled), GameDebugSettings.hapticsEnabled))
        case 'cursor': {
            GameDebugSettings.set('originalCursorsEnabled', !GameDebugSettings.originalCursorsEnabled)
            CursorManager.refresh()
            return debugSwitched(name, GameDebugSettings.originalCursorsEnabled)
        }
        case 'highresolution': {
            GameDebugSettings.set('highResolutionEnabled', !GameDebugSettings.highResolutionEnabled)
            OriginalResolution.refresh()
            return debugSwitched(name, GameDebugSettings.highResolutionEnabled)
        }
        case 'tilted': return debugSwitched(name, GameDebugSettings.set('tiltedSeedPackets', !GameDebugSettings.tiltedSeedPackets))
        case 'cheatseed': {
            // A preference for the levels to come; in a level its chooser takes it up from the next one it opens.
            if (!running) return debugSwitched(name, GameDebugSettings.set('cheatSeedsEnabled', !GameDebugSettings.cheatSeedsEnabled))
            const result = runGameCommand(command)
            if (result.ok && result.enabled !== undefined) GameDebugSettings.set('cheatSeedsEnabled', result.enabled)
            return result
        }
        case 'fps': return debugSwitched(name, (GameDebugSettings.set('fpsVisible', !GameDebugSettings.fpsVisible), GameDebugSettings.fpsVisible))
        case 'hitboxes': return debugSwitched(name, (GameDebugSettings.set('hitboxesVisible', !GameDebugSettings.hitboxesVisible), GameDebugSettings.hitboxesVisible))
        case 'hp': return debugSwitched(name, GameDebugSettings.set('hpVisible', !GameDebugSettings.hpVisible))
        case 'id': return debugSwitched(name, GameDebugSettings.set('idVisible', !GameDebugSettings.idVisible))
        case 'sharpness': {
            const sharpness = Number(args[0])
            if (!Number.isFinite(sharpness) || sharpness < 0 || sharpness > 1) return debugSyntax('Sharpness must be between 0 and 1')
            // The fonts' materials hold it; the picture enlarged over the window reads it as it is drawn.
            setFontSharpness(GameDebugSettings.set('sharpness', sharpness))
            return debugSuccess(`Sharpness: ${sharpness}`)
        }
        case 'mod': return { ...debugSuccess('Opening Mod manager'), action: 'manageMods' }
        case 'perf': {
            const toggle = args[0].toLowerCase() as DebugPerfToggle
            const current = { plants: GameDebugSettings.perfPlantsVisible, zombies: GameDebugSettings.perfZombiesVisible,
                particles: GameDebugSettings.perfParticlesEnabled, sfx: GameDebugSettings.perfSfxEnabled, logic: GameDebugSettings.perfLogicEnabled }[toggle]
            return debugSwitched(`perf ${toggle}`, GameDebugSettings.setPerfToggle(toggle, !current))
        }
        case 'money': {
            if (running) return runGameCommand(command)
            // Outside a level the purse is the profile's (PlayerInfo::mCoins).
            if (debugInteger(args[1]) === null) return debugSyntax('Amount must be an integer')
            if (!await menuApi.getCurrentUser()) return debugCondition('DEBUG_REQUIRES_PLAYER', name)
            const next = debugAmount(args, (await menuApi.getPurse()).coins, (await loadGameplayContent()).definitions.economy.maxMoney)
            if (typeof next !== 'number') return next
            const purse = await menuApi.setCoins(next)
            return debugSuccess(`money: ${purse.coins}`)
        }
        case 'achievement': {
            if (!await menuApi.getCurrentUser()) return debugCondition('DEBUG_REQUIRES_PLAYER', name)
            const ids = Object.keys((await loadGameplayContent()).definitions.achievements)
            const id = args[1] === undefined ? undefined : ids.find(id => normalizeDebugName(id) === normalizeDebugName(args[1]))
            if (args[1] !== undefined && !id) return debugCondition('DEBUG_ACHIEVEMENT_NOT_INSTALLED', args[1])
            if (args[0].toLowerCase() === 'reset') {
                await menuApi.resetAchievements(id)
                // The level forgets it too, so it can be granted again.
                if (running) runGameCommand(command)
                return debugSuccess(`Reset ${id ?? 'every achievement'}`)
            }
            if (!id) return debugSyntax('Usage: /achievement give {achievement}')
            // In a level the level grants it, announcing it like a real one; elsewhere it waits for the next award page.
            if (running) return runGameCommand(command)
            if (!(await menuApi.earnAchievement(id, false)).earned) return debugCondition('DEBUG_ACHIEVEMENT_EARNED', args[1])
            return debugSuccess(`Granted ${id}`)
        }
        default: {
            if (!running) {
                if (name === 'collect') {
                    GameDebugSettings.set('collectMode', args[0].toLowerCase() as 'auto' | 'click' | 'move')
                    return debugSuccess(`${name}: ${args[0]}`)
                }
                const turn = RULE_PREFERENCES[name]
                return turn ? debugSwitched(name, turn()) : debugCondition('DEBUG_REQUIRES_LEVEL', name)
            }
            const result = runGameCommand(command)
            if (!result.ok) return result
            if (name === 'collect') GameDebugSettings.set('collectMode', args[0].toLowerCase() as 'auto' | 'click' | 'move')
            // The level's switches turn there; the preferences keep their new state for later levels.
            const enabled = result.enabled
            if (enabled === undefined) return result
            if (name === 'cooldown') GameDebugSettings.set('rechargingEnabled', enabled)
            if (name === 'suncost') GameDebugSettings.set('sunCostEnabled', enabled)
            if (name === 'plantinvincible') GameDebugSettings.set('plantInvincible', enabled)
            return { ...result, advice: debugSwitchAdvice(name, enabled) }
        }
    }
    return debugSuccess(`${name}: ${args.join(' ')}`)
}
