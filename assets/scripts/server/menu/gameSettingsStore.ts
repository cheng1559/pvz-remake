import { SFX_VOLUME_SCALE, type MenuSettings, type MenuStorage } from '@/shared/menu'

const SETTINGS_KEY = 'pvz-remake:settings:options'

type GameSettings = MenuSettings

const DEFAULTS: GameSettings = { version: 1, musicVolume: 0.85, sfxVolume: 0.85 * SFX_VOLUME_SCALE, fullScreen: false }

function volume(value: unknown, fallback: number, max = 1): number {
    const number = Number(value)
    return Number.isFinite(number) ? Math.max(0, Math.min(max, number)) : fallback
}

export function createGameSettingsStore(storage: MenuStorage) {
    return class GameSettingsStore {
        static load(): GameSettings {
            try {
                const value = JSON.parse(storage.getItem(SETTINGS_KEY) ?? 'null') as GameSettings | null
                return value?.version === DEFAULTS.version ? this.normalize(value) : { ...DEFAULTS }
            } catch { return { ...DEFAULTS } }
        }

        static update(value: Partial<GameSettings>): GameSettings {
            const settings = this.normalize({ ...this.load(), ...value })
            storage.setItem(SETTINGS_KEY, JSON.stringify(settings))
            return settings
        }

        private static normalize(value: GameSettings): GameSettings {
            return {
                version: DEFAULTS.version,
                musicVolume: volume(value.musicVolume, DEFAULTS.musicVolume),
                sfxVolume: volume(value.sfxVolume, DEFAULTS.sfxVolume, SFX_VOLUME_SCALE),
                fullScreen: !!value.fullScreen,
            }
        }
    }
}
