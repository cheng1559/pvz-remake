import { sys } from 'cc'

const DEBUG_SETTINGS_KEY = 'pvz-remake:debug:settings'

export type DebugCollectMode = 'auto' | 'click' | 'move'
export type DebugPerfToggle = 'plants' | 'zombies' | 'particles' | 'sfx' | 'logic'

type DebugSettings = {
    rechargingEnabled: boolean
    sunCostEnabled: boolean
    plantInvincible: boolean
    /** `/cheatseed`: every seed on the chooser's pages, and Let's Rock with any cards chosen. */
    cheatSeedsEnabled: boolean
    fpsVisible: boolean
    collectMode: DebugCollectMode
    hitboxesVisible: boolean
    /** `/tilted`: a seed packet's picture half as large again (a zombie's twice) and leaning out of its packet. */
    tiltedSeedPackets: boolean
    mobileEnabled: boolean
    autoPauseEnabled: boolean
    hotkeysEnabled: boolean
    hapticsEnabled: boolean
    originalCursorsEnabled: boolean
    /** `/resize`: a desktop window resized freely. Off, it keeps the 600 height and only its width follows (ClientViewport). */
    windowResizable: boolean
    /**
     * `/highresolution`: the game drawn at the window's own pixels. Off, it is drawn as the original draws it, at a
     * pixel to a unit of its 800x600, and that picture enlarged over the window (OriginalResolution).
     */
    highResolutionEnabled: boolean
    /**
     * `/sharpness`: how crisp an enlarged pixel is. Its edge blends over 1 - sharpness screen pixels: a whole one at 0,
     * none at 1 (the nearest pixel). The pixels are the picture's that is enlarged over the window; in
     * /highresolution, where there is no such picture, the pixel fonts'.
     */
    sharpness: number
    perfPlantsVisible: boolean
    perfZombiesVisible: boolean
    perfParticlesEnabled: boolean
    perfSfxEnabled: boolean
    perfLogicEnabled: boolean
}

const DEFAULT_DEBUG_SETTINGS: DebugSettings = {
    rechargingEnabled: true,
    sunCostEnabled: true,
    plantInvincible: false,
    cheatSeedsEnabled: false,
    fpsVisible: false,
    collectMode: 'click',
    hitboxesVisible: false,
    tiltedSeedPackets: false,
    mobileEnabled: sys.isMobile,
    autoPauseEnabled: true,
    hotkeysEnabled: false,
    hapticsEnabled: true,
    originalCursorsEnabled: true,
    windowResizable: false,
    highResolutionEnabled: false,
    sharpness: 0.5,
    perfPlantsVisible: true,
    perfZombiesVisible: true,
    perfParticlesEnabled: true,
    perfSfxEnabled: true,
    perfLogicEnabled: true,
}

const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'

/**
 * The settings this device keeps across restarts, with what each may hold; a saved value that does not fit falls back
 * to the default. The others (`/mobile`, the `/perf` toggles) last for the session.
 */
const KEPT: { readonly [Key in keyof DebugSettings]?: (value: unknown) => value is DebugSettings[Key] } = {
    rechargingEnabled: isBoolean, sunCostEnabled: isBoolean, plantInvincible: isBoolean, cheatSeedsEnabled: isBoolean,
    fpsVisible: isBoolean, hitboxesVisible: isBoolean, tiltedSeedPackets: isBoolean, hotkeysEnabled: isBoolean,
    autoPauseEnabled: isBoolean, hapticsEnabled: isBoolean, originalCursorsEnabled: isBoolean, highResolutionEnabled: isBoolean,
    windowResizable: isBoolean,
    collectMode: (value): value is DebugCollectMode => value === 'auto' || value === 'click' || value === 'move',
    sharpness: (value): value is number => typeof value === 'number' && value >= 0 && value <= 1,
}

function loadDebugSettings(): DebugSettings {
    const settings: Record<string, unknown> = { ...DEFAULT_DEBUG_SETTINGS }
    try {
        const saved: unknown = JSON.parse(sys.localStorage.getItem(DEBUG_SETTINGS_KEY) ?? '{}')
        if (saved && typeof saved === 'object') {
            for (const [key, fits] of Object.entries(KEPT)) {
                const value = (saved as Record<string, unknown>)[key]
                if (fits(value)) settings[key] = value
            }
        }
    } catch { /* an unreadable save keeps the defaults */ }
    return settings as DebugSettings
}

/** Only the kept settings are written, so retired ones (such as hdSeedPacketsEnabled) drop out of old saves. */
function saveDebugSettings(settings: DebugSettings) {
    const kept = Object.fromEntries(Object.keys(KEPT).map(key => [key, settings[key as keyof DebugSettings]]))
    sys.localStorage.setItem(DEBUG_SETTINGS_KEY, JSON.stringify(kept))
}

const PERF_SETTINGS: Record<DebugPerfToggle, keyof DebugSettings> = {
    plants: 'perfPlantsVisible', zombies: 'perfZombiesVisible', particles: 'perfParticlesEnabled', sfx: 'perfSfxEnabled', logic: 'perfLogicEnabled',
}

/** Debug CLI commands, oldest first, kept on this device across restarts. */
const CLI_HISTORY_KEY = 'pvz-remake:debug:cli-history'
export const DEBUG_CLI_HISTORY_LIMIT = 64

export function loadDebugCliHistory(): string[] {
    try {
        const saved: unknown = JSON.parse(sys.localStorage.getItem(CLI_HISTORY_KEY) ?? '[]')
        return Array.isArray(saved) ? saved.filter((entry): entry is string => typeof entry === 'string').slice(-DEBUG_CLI_HISTORY_LIMIT) : []
    } catch { return [] }
}

export function saveDebugCliHistory(history: readonly string[]): void {
    try { sys.localStorage.setItem(CLI_HISTORY_KEY, JSON.stringify(history.slice(-DEBUG_CLI_HISTORY_LIMIT))) }
    catch (error) { console.warn('[Debug CLI] Failed to save history', error) }
}

export const GameDebugSettings = {
    ...loadDebugSettings(),

    /** Changes a setting and gives back its value; the device keeps it unless it lasts for the session only. */
    set<Key extends keyof DebugSettings>(key: Key, value: DebugSettings[Key]): DebugSettings[Key] {
        (this as DebugSettings)[key] = value
        if (key in KEPT) saveDebugSettings(this)
        return value
    },

    setPerfToggle(toggle: DebugPerfToggle, enabled: boolean): boolean {
        return this.set(PERF_SETTINGS[toggle], enabled) as boolean
    },

    isMobileMode() {
        return this.mobileEnabled
    },
}
