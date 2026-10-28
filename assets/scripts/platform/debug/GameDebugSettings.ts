import { sys } from 'cc'

const DEBUG_SETTINGS_KEY = 'pvz-remake:debug:settings'

export type DebugCollectMode = 'auto' | 'click' | 'move'
export type DebugPerfToggle = 'plants' | 'zombies' | 'particles' | 'sfx' | 'logic'
export type SeedPacketStyle = 'standard' | 'rendered' | 'tilted'

type DebugSettings = {
    rechargingEnabled: boolean
    sunCostEnabled: boolean
    plantInvincible: boolean
    fpsVisible: boolean
    collectMode: DebugCollectMode
    hitboxesVisible: boolean
    hdSeedPacketsEnabled: boolean
    seedPacketStyle: SeedPacketStyle
    mobileEnabled: boolean
    hotkeysEnabled: boolean
    hapticsEnabled: boolean
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
    fpsVisible: false,
    collectMode: 'click',
    hitboxesVisible: false,
    hdSeedPacketsEnabled: false,
    seedPacketStyle: 'standard',
    mobileEnabled: sys.isMobile,
    hotkeysEnabled: false,
    hapticsEnabled: true,
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
            plantInvincible: typeof parsed.plantInvincible === 'boolean' ? parsed.plantInvincible : DEFAULT_DEBUG_SETTINGS.plantInvincible,
            fpsVisible: typeof parsed.fpsVisible === 'boolean' ? parsed.fpsVisible : DEFAULT_DEBUG_SETTINGS.fpsVisible,
            collectMode: normalizeCollectMode(parsed.collectMode),
            hitboxesVisible: parsed.hitboxesVisible ?? DEFAULT_DEBUG_SETTINGS.hitboxesVisible,
            hdSeedPacketsEnabled: parsed.hdSeedPacketsEnabled ?? DEFAULT_DEBUG_SETTINGS.hdSeedPacketsEnabled,
            seedPacketStyle: parsed.seedPacketStyle === 'standard' || parsed.seedPacketStyle === 'rendered' || parsed.seedPacketStyle === 'tilted'
                ? parsed.seedPacketStyle : parsed.hdSeedPacketsEnabled ? 'rendered' : DEFAULT_DEBUG_SETTINGS.seedPacketStyle,
            mobileEnabled: DEFAULT_DEBUG_SETTINGS.mobileEnabled,
            hotkeysEnabled: parsed.hotkeysEnabled ?? DEFAULT_DEBUG_SETTINGS.hotkeysEnabled,
            hapticsEnabled: parsed.hapticsEnabled ?? DEFAULT_DEBUG_SETTINGS.hapticsEnabled,
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

    setPlantInvincible(enabled: boolean) {
        this.plantInvincible = enabled
        saveDebugSettings(this)
        return this.plantInvincible
    },

    setFpsVisible(visible: boolean) {
        this.fpsVisible = visible
        saveDebugSettings(this)
        return this.fpsVisible
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

    setHDSeedPacketsEnabled(enabled: boolean) {
        this.hdSeedPacketsEnabled = enabled
        this.seedPacketStyle = enabled ? 'rendered' : 'standard'
        saveDebugSettings(this)
        return this.hdSeedPacketsEnabled
    },

    setSeedPacketStyle(style: SeedPacketStyle) {
        this.seedPacketStyle = style
        saveDebugSettings(this)
        return this.seedPacketStyle
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

    setHapticsEnabled(enabled: boolean) {
        this.hapticsEnabled = enabled
        saveDebugSettings(this)
        return this.hapticsEnabled
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
