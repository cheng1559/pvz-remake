import { screen, sys } from 'cc'
import { menuApi } from '@/client/api/MenuApi'
import { CursorManager } from '@/client/input/CursorManager'
import { setFontSharpness } from '@/client/font/FontAreaMaterial'
import { SoundSystem } from '@/client/sound/SoundSystem'
import { gameClock } from '@/core/GameClock'
import { debugAmount, debugCondition, debugInteger, debugSuccess, debugSyntax, parseDebugCliCommand, type DebugCliCatalog, type DebugCliResult, type DebugGotoPage } from '@/shared/debug/DebugCli'
import { SFX_VOLUME_SCALE } from '@/shared/menu'
import { loadGameplayContent } from '@/client/game/loadIntegratedGameContent'
import { OptionsSettings } from '@/platform/OptionsSettings'
import { GameDebugSettings, type DebugPerfToggle, type SeedPacketStyle } from './GameDebugSettings'

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
        case 'music': case 'sfx': {
            const percent = debugInteger(args[0])
            if (percent === null || percent < 0 || percent > 100) return debugSyntax('Volume must be an integer from 0 to 100')
            const settings = await menuApi.updateSettings(name === 'music' ? { musicVolume: percent / 100 } : { sfxVolume: percent / 100 * SFX_VOLUME_SCALE })
            SoundSystem.setMusicVolume(settings.musicVolume)
            SoundSystem.setSfxVolume(settings.sfxVolume)
            return debugSuccess(`${name}: ${percent}`)
        }
        case 'fullscreen': {
            const enabled = args[0].toLowerCase() === 'true'
            if (sys.isNative && sys.isMobile && !enabled) return debugCondition('DEBUG_WINDOWED_UNAVAILABLE')
            if (!OptionsSettings.fullScreenForced && !screen.supportsFullScreen) return debugCondition('DEBUG_FULLSCREEN_UNAVAILABLE')
            await OptionsSettings.setFullScreen(enabled)
            return debugSuccess(`Fullscreen: ${enabled}`)
        }
        case 'mobile': GameDebugSettings.setMobileEnabled(args[0].toLowerCase() === 'true'); break
        case 'hotkeys': GameDebugSettings.setHotkeysEnabled(args[0].toLowerCase() === 'true'); break
        case 'haptics': GameDebugSettings.setHapticsEnabled(args[0].toLowerCase() === 'true'); break
        case 'cursor': GameDebugSettings.setOriginalCursorsEnabled(args[0].toLowerCase() === 'true'); CursorManager.refresh(); break
        case 'fps': GameDebugSettings.setFpsVisible(args[0].toLowerCase() === 'true'); break
        case 'hitboxes': GameDebugSettings.setHitboxesVisible(args[0].toLowerCase() === 'true'); break
        case 'seedstyle': GameDebugSettings.setSeedPacketStyle(args[0].toLowerCase() as SeedPacketStyle); break
        case 'fontsharpness': {
            const sharpness = Number(args[0])
            if (!Number.isFinite(sharpness) || sharpness < 0 || sharpness > 1) return debugSyntax('Font sharpness must be between 0 and 1')
            setFontSharpness(GameDebugSettings.setFontSharpness(sharpness))
            return debugSuccess(`Font sharpness: ${sharpness}`)
        }
        case 'mod': return { ...debugSuccess('Opening Mod manager'), action: 'manageMods' }
        case 'perf': GameDebugSettings.setPerfToggle(args[0].toLowerCase() as DebugPerfToggle, args[1].toLowerCase() === 'true'); break
        case 'background': return debugCondition('DEBUG_BACKGROUND_UNAVAILABLE')
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
        default: {
            if (!running) return debugCondition('DEBUG_REQUIRES_LEVEL', name)
            const result = runGameCommand(command)
            if (result.ok) {
                if (name === 'cooldown') GameDebugSettings.setRechargingEnabled(args[0].toLowerCase() === 'true')
                if (name === 'suncost') GameDebugSettings.setSunCostEnabled(args[0].toLowerCase() === 'true')
                if (name === 'plantinvincible') GameDebugSettings.setPlantInvincible(args[0].toLowerCase() === 'true')
                if (name === 'collect') GameDebugSettings.setCollectMode(args[0].toLowerCase() as 'auto' | 'click' | 'move')
            }
            return result
        }
    }
    return debugSuccess(`${name}: ${args.join(' ')}`)
}
