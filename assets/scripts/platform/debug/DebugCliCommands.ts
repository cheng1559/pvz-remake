import { screen, sys } from 'cc'
import { menuApi } from '@/client/api/MenuApi'
import { SoundLoader } from '@/client/sound/LegacySoundSystem'
import { gameClock } from '@/core/GameClock'
import { debugCondition, debugInteger, debugSuccess, debugSyntax, parseDebugCliCommand, type DebugCliCatalog, type DebugCliResult } from '@/shared/debug/DebugCli'
import { SFX_VOLUME_SCALE } from '@/shared/menu'
import { OptionsSettings } from '@/platform/OptionsSettings'
import { GameDebugSettings, type DebugPerfToggle } from './GameDebugSettings'

export async function executeDebugCliCommand(
    command: string,
    running: boolean,
    runGameCommand: (command: string) => DebugCliResult,
    catalog?: DebugCliCatalog,
): Promise<DebugCliResult> {
    const parsed = parseDebugCliCommand(command)
    if (!('name' in parsed)) return parsed
    const { name, args } = parsed
    switch (name) {
        case 'restart': return running ? { ...debugSuccess('Restarting level'), action: 'restart' } : debugCondition('No level to restart')
        case 'home': case 'reload': case 'quit': case 'help': case 'menu': case 'shop': case 'almanac': case 'zengarden':
            return { ...debugSuccess(`Opening ${name}`), action: name }
        case 'level': {
            const id = args[0].toLowerCase().replace(/^(?:pvz:)?adventure-/, '')
            if (catalog && !catalog.levels.includes(id)) return debugCondition(`Level is not installed: ${args[0]}`)
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
            SoundLoader.setMusicVolume(settings.musicVolume)
            SoundLoader.setSfxVolume(settings.sfxVolume)
            return debugSuccess(`${name}: ${percent}`)
        }
        case 'fullscreen': {
            const enabled = args[0].toLowerCase() === 'true'
            if (sys.isNative && sys.isMobile && !enabled) return debugCondition('Windowed mode is unavailable on mobile')
            if (!OptionsSettings.fullScreenForced && !screen.supportsFullScreen) return debugCondition('Full screen is unavailable')
            await OptionsSettings.setFullScreen(enabled)
            return debugSuccess(`Fullscreen: ${enabled}`)
        }
        case 'mobile': GameDebugSettings.setMobileEnabled(args[0].toLowerCase() === 'true'); break
        case 'hotkeys': GameDebugSettings.setHotkeysEnabled(args[0].toLowerCase() === 'true'); break
        case 'hitboxes': GameDebugSettings.setHitboxesVisible(args[0].toLowerCase() === 'true'); break
        case 'perf': GameDebugSettings.setPerfToggle(args[0].toLowerCase() as DebugPerfToggle, args[1].toLowerCase() === 'true'); break
        case 'background': return debugCondition('Widescreen backgrounds are not implemented in this version')
        default: {
            if (!running) return debugCondition(`/${name} requires an active level`)
            const result = runGameCommand(command)
            if (result.ok) {
                if (name === 'cooldown') GameDebugSettings.setRechargingEnabled(args[0].toLowerCase() === 'true')
                if (name === 'suncost') GameDebugSettings.setSunCostEnabled(args[0].toLowerCase() === 'true')
                if (name === 'collect') GameDebugSettings.setCollectMode(args[0].toLowerCase() as 'auto' | 'click' | 'move')
            }
            return result
        }
    }
    return debugSuccess(`${name}: ${args.join(' ')}`)
}
