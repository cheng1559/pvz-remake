import { sys } from 'cc'

const DEBUG_SETTINGS_KEY = 'pvz-remake:debug:settings'

export type DebugCollectMode = 'auto' | 'click' | 'move'

type DebugSettings = {
    rechargingEnabled: boolean
    sunCostEnabled: boolean
    collectMode: DebugCollectMode
    hitboxesVisible: boolean
    mobileEnabled: boolean
    hotkeysEnabled: boolean
}

const DEFAULT_DEBUG_SETTINGS: DebugSettings = {
    rechargingEnabled: true,
    sunCostEnabled: true,
    collectMode: 'click',
    hitboxesVisible: false,
    mobileEnabled: sys.isMobile,
    hotkeysEnabled: false,
}

function normalizeCollectMode(value: unknown): DebugCollectMode {
    return value === 'auto' || value === 'click' || value === 'move'
        ? value
        : DEFAULT_DEBUG_SETTINGS.collectMode
}

function loadDebugSettings(): DebugSettings {
    const raw = sys.localStorage.getItem(DEBUG_SETTINGS_KEY)
    if (!raw) return { ...DEFAULT_DEBUG_SETTINGS }

    try {
        const parsed = JSON.parse(raw) as Partial<DebugSettings>
        return {
            rechargingEnabled: parsed.rechargingEnabled ?? DEFAULT_DEBUG_SETTINGS.rechargingEnabled,
            sunCostEnabled: parsed.sunCostEnabled ?? DEFAULT_DEBUG_SETTINGS.sunCostEnabled,
            collectMode: normalizeCollectMode(parsed.collectMode),
            hitboxesVisible: parsed.hitboxesVisible ?? DEFAULT_DEBUG_SETTINGS.hitboxesVisible,
            mobileEnabled: parsed.mobileEnabled ?? DEFAULT_DEBUG_SETTINGS.mobileEnabled,
            hotkeysEnabled: parsed.hotkeysEnabled ?? DEFAULT_DEBUG_SETTINGS.hotkeysEnabled,
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

    setCollectMode(mode: DebugCollectMode) {
        this.collectMode = mode
        saveDebugSettings(this)
        return this.collectMode
    },

    setHitboxesVisible(visible: boolean) {
        this.hitboxesVisible = visible
        saveDebugSettings(this)
        return this.hitboxesVisible
    },

    setMobileEnabled(enabled: boolean) {
        this.mobileEnabled = enabled
        saveDebugSettings(this)
        return this.mobileEnabled
    },

    setHotkeysEnabled(enabled: boolean) {
        this.hotkeysEnabled = enabled
        saveDebugSettings(this)
        return this.hotkeysEnabled
    },

    isMobileMode() {
        return this.mobileEnabled
    },
}
