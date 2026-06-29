import { sys } from 'cc'

const DEBUG_SETTINGS_KEY = 'pvz.debug.settings'

type DebugSettings = {
    rechargingEnabled: boolean
    sunCostEnabled: boolean
    autoCollectEnabled: boolean
    hitboxesVisible: boolean
}

const DEFAULT_DEBUG_SETTINGS: DebugSettings = {
    rechargingEnabled: true,
    sunCostEnabled: true,
    autoCollectEnabled: false,
    hitboxesVisible: false,
}

function loadDebugSettings(): DebugSettings {
    const raw = sys.localStorage.getItem(DEBUG_SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_DEBUG_SETTINGS }

    try {
        const parsed = JSON.parse(raw) as Partial<DebugSettings>
        return {
            rechargingEnabled: parsed.rechargingEnabled ?? DEFAULT_DEBUG_SETTINGS.rechargingEnabled,
            sunCostEnabled: parsed.sunCostEnabled ?? DEFAULT_DEBUG_SETTINGS.sunCostEnabled,
            autoCollectEnabled: parsed.autoCollectEnabled ?? DEFAULT_DEBUG_SETTINGS.autoCollectEnabled,
            hitboxesVisible: parsed.hitboxesVisible ?? DEFAULT_DEBUG_SETTINGS.hitboxesVisible,
        }
    } catch {
        return { ...DEFAULT_DEBUG_SETTINGS }
    }
}

function saveDebugSettings(settings: DebugSettings) {
    sys.localStorage.setItem(DEBUG_SETTINGS_KEY, JSON.stringify(settings))
}

export const GameDebugSettings = {
    ...loadDebugSettings(),

    setRechargingEnabled(enabled: boolean) {
        this.rechargingEnabled = enabled
        saveDebugSettings(this)
        return this.rechargingEnabled
    },

    setSunCostEnabled(enabled: boolean) {
        this.sunCostEnabled = enabled
        saveDebugSettings(this)
        return this.sunCostEnabled
    },

    setAutoCollectEnabled(enabled: boolean) {
        this.autoCollectEnabled = enabled
        saveDebugSettings(this)
        return this.autoCollectEnabled
    },

    setHitboxesVisible(visible: boolean) {
        this.hitboxesVisible = visible
        saveDebugSettings(this)
        return this.hitboxesVisible
    },
}
