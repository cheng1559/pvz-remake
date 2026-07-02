import { sys } from 'cc'

const DEBUG_SETTINGS_KEY = 'pvz-remake:debug:settings'

export type DebugCollectMode = 'auto' | 'click' | 'move'
export type DebugPerfToggle = 'plants' | 'zombies' | 'particles' | 'sfx' | 'logic'

type DebugSettings = {
    rechargingEnabled: boolean
    sunCostEnabled: boolean
    collectMode: DebugCollectMode
    hitboxesVisible: boolean
    mobileEnabled: boolean
    hotkeysEnabled: boolean
    perfPlantsVisible: boolean
    perfZombiesVisible: boolean
    perfParticlesEnabled: boolean
    perfSfxEnabled: boolean
    perfLogicEnabled: boolean
}

const DEFAULT_DEBUG_SETTINGS: DebugSettings = {
    rechargingEnabled: true,
    sunCostEnabled: true,
    collectMode: 'click',
    hitboxesVisible: false,
    mobileEnabled: sys.isMobile,
    hotkeysEnabled: false,
    perfPlantsVisible: true,
    perfZombiesVisible: true,
    perfParticlesEnabled: true,
    perfSfxEnabled: true,
    perfLogicEnabled: true,
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
            mobileEnabled: DEFAULT_DEBUG_SETTINGS.mobileEnabled,
            hotkeysEnabled: parsed.hotkeysEnabled ?? DEFAULT_DEBUG_SETTINGS.hotkeysEnabled,
            perfPlantsVisible: DEFAULT_DEBUG_SETTINGS.perfPlantsVisible,
            perfZombiesVisible: DEFAULT_DEBUG_SETTINGS.perfZombiesVisible,
            perfParticlesEnabled: DEFAULT_DEBUG_SETTINGS.perfParticlesEnabled,
            perfSfxEnabled: DEFAULT_DEBUG_SETTINGS.perfSfxEnabled,
            perfLogicEnabled: DEFAULT_DEBUG_SETTINGS.perfLogicEnabled,
        }
    } catch {
        return { ...DEFAULT_DEBUG_SETTINGS }
    }
}

function saveDebugSettings(settings: DebugSettings) {
    const {
        mobileEnabled: _mobileEnabled,
        perfPlantsVisible: _perfPlantsVisible,
        perfZombiesVisible: _perfZombiesVisible,
        perfParticlesEnabled: _perfParticlesEnabled,
        perfSfxEnabled: _perfSfxEnabled,
        perfLogicEnabled: _perfLogicEnabled,
        ...persistedSettings
    } = settings
    sys.localStorage.setItem(DEBUG_SETTINGS_KEY, JSON.stringify(persistedSettings))
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
        return this.mobileEnabled
    },

    setHotkeysEnabled(enabled: boolean) {
        this.hotkeysEnabled = enabled
        saveDebugSettings(this)
        return this.hotkeysEnabled
    },

    setPerfToggle(toggle: DebugPerfToggle, enabled: boolean) {
        switch (toggle) {
            case 'plants':
                this.perfPlantsVisible = enabled
                return this.perfPlantsVisible
            case 'zombies':
                this.perfZombiesVisible = enabled
                return this.perfZombiesVisible
            case 'particles':
                this.perfParticlesEnabled = enabled
                return this.perfParticlesEnabled
            case 'sfx':
                this.perfSfxEnabled = enabled
                return this.perfSfxEnabled
            case 'logic':
                this.perfLogicEnabled = enabled
                return this.perfLogicEnabled
        }
    },

    isMobileMode() {
        return this.mobileEnabled
    },
}
