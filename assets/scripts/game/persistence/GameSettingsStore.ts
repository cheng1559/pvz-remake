import { sys } from 'cc'

const SETTINGS_VERSION = 1
const SETTINGS_KEY = 'pvz.settings.options'

export const DEFAULT_MUSIC_VOLUME = 0.85
export const SFX_VOLUME_SCALE = 0.65
export const DEFAULT_SFX_VOLUME = DEFAULT_MUSIC_VOLUME * SFX_VOLUME_SCALE

export interface GameSettings {
    version: number
    musicVolume: number
    sfxVolume: number
    fullScreen: boolean
}

function getStorage() {
    return sys.localStorage
}

function clampVolume(value: unknown, fallback: number, max = 1) {
    const volume = Number(value)
    if (!Number.isFinite(volume)) return fallback
    return Math.max(0, Math.min(max, volume))
}

function defaultSettings(): GameSettings {
    return {
        version: SETTINGS_VERSION,
        musicVolume: DEFAULT_MUSIC_VOLUME,
        sfxVolume: DEFAULT_SFX_VOLUME,
        fullScreen: false,
    }
}

function normalizeSettings(raw: Partial<GameSettings>): GameSettings {
    const fallback = defaultSettings()
    return {
        version: SETTINGS_VERSION,
        musicVolume: clampVolume(raw.musicVolume, fallback.musicVolume),
        sfxVolume: clampVolume(raw.sfxVolume, fallback.sfxVolume, SFX_VOLUME_SCALE),
        fullScreen: !!raw.fullScreen,
    }
}

function readSettings(): GameSettings {
    const raw = getStorage().getItem(SETTINGS_KEY)
    if (!raw) return defaultSettings()

    try {
        const parsed = JSON.parse(raw) as Partial<GameSettings>
        if (parsed.version !== SETTINGS_VERSION) return defaultSettings()
        return normalizeSettings(parsed)
    } catch {
        return defaultSettings()
    }
}

function writeSettings(settings: GameSettings) {
    getStorage().setItem(SETTINGS_KEY, JSON.stringify(settings))
}

export class GameSettingsStore {
    static load(): GameSettings {
        return readSettings()
    }

    static save(settings: GameSettings): GameSettings {
        const normalized = normalizeSettings(settings)
        writeSettings(normalized)
        return normalized
    }

    static update(settings: Partial<GameSettings>): GameSettings {
        return this.save({
            ...readSettings(),
            ...settings,
            version: SETTINGS_VERSION,
        })
    }

    static clear() {
        getStorage().removeItem(SETTINGS_KEY)
    }
}
