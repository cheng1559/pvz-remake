import { screen, sys } from 'cc'
import { menuApi } from '@/client/api/MenuApi'
import { SoundLoader } from '@/client/sound/LegacySoundSystem'
import { gameClock } from '@/core/GameClock'
import { debugCondition, debugInteger, debugSuccess, debugSyntax, parseDebugCliCommand, type DebugCliCatalog, type DebugCliResult } from '@/shared/debug/DebugCli'
import { SFX_VOLUME_SCALE } from '@/shared/menu'
import { OptionsSettings } from '@/platform/OptionsSettings'
import { modManager } from '@/client/content/ModManager'
import { GameDebugSettings, type DebugPerfToggle, type SeedPacketStyle } from './GameDebugSettings'

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
        case 'haptics': GameDebugSettings.setHapticsEnabled(args[0].toLowerCase() === 'true'); break
        case 'hitboxes': GameDebugSettings.setHitboxesVisible(args[0].toLowerCase() === 'true'); break
        case 'hdseed': GameDebugSettings.setHDSeedPacketsEnabled(args[0].toLowerCase() === 'true'); break
        case 'seedstyle': GameDebugSettings.setSeedPacketStyle(args[0].toLowerCase() as SeedPacketStyle); break
        case 'mod': {
            if (!args.length) return { ...debugSuccess(`Opening ${name} manager`), action: 'manageMods' }
            const operation = args[0].toLowerCase()
            if (args.length !== (operation === 'install' || operation === 'list' ? 1 : 2)) return debugSyntax(`Usage: /${name} [install | load <installed_id> | unload <id|all> | uninstall <id> | list]`)
            const manager = modManager
            const label = 'Mod'
            try {
                if (operation === 'list') return debugSuccess(`${label}s: ${(await manager.list()).join(', ') || 'none'}`)
                if (operation === 'install') return { ...debugSuccess(`Select a ${label.toLowerCase()} ZIP`), action: 'installMod' }
                const changed = operation === 'load' ? await manager.load(args[1])
                    : operation === 'unload' ? await manager.unload(args[1]) : await manager.uninstall(args[1])
                return { ...debugSuccess(`${label} ${operation}: ${args[1]}`), action: changed ? 'restartForMods' : undefined }
            } catch (error) {
                return debugCondition(error instanceof Error ? error.message : String(error))
            }
        }
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
