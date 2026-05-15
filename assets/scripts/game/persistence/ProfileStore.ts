import { sys } from 'cc'
import { GameSaveStore } from './GameSaveStore'

const PROFILE_VERSION = 1
const PROFILE_REGISTRY_KEY = 'pvz.profile.registry'
const PROFILE_DATA_KEY_PREFIX = 'pvz.profile.'
const DEFAULT_PROFILE_NAME = 'Player'
const MAX_PROFILES = 200
const CHALLENGE_RECORD_COUNT = 100
const PURCHASE_COUNT = 80
const ACHIEVEMENT_COUNT = 21

export interface PersistedPottedPlant {
    seedType: string
    whichZenGarden: string
    x: number
    y: number
    facing: 'left' | 'right'
    lastWateredTime: number
    drawVariation: string
    plantAge: string
    timesFed: number
    feedingsPerGrow: number
    plantNeed: string
    lastNeedFulfilledTime: number
    lastFertilizedTime: number
    lastChocolateTime: number
}

export interface PlayerProfile {
    version: number
    id: number
    name: string
    useSeq: number
    adventureLevel: number
    coins: number
    finishedAdventure: number
    challengeRecords: number[]
    purchases: number[]
    playTimeActivePlayer: number
    playTimeInactivePlayer: number
    hasUsedCheatKeys: boolean
    hasWokenStinky: boolean
    didNotPurchasePacketUpgrade: boolean
    lastStinkyChocolateTime: number
    stinkyPosX: number
    stinkyPosY: number
    hasUnlockedMinigames: boolean
    hasUnlockedPuzzleMode: boolean
    hasNewMiniGame: boolean
    hasNewScaryPotter: boolean
    hasNewIZombie: boolean
    hasNewSurvival: boolean
    hasUnlockedSurvivalMode: boolean
    needsMessageOnGameSelector: boolean
    needsMagicTacoReward: boolean
    hasSeenStinky: boolean
    hasSeenUpsell: boolean
    placeholderPlayerStats: number
    numPottedPlants: number
    pottedPlants: PersistedPottedPlant[]
    earnedAchievements: boolean[]
    shownAchievements: boolean[]
}

export interface PlayerProfileSummary {
    id: number
    name: string
    useSeq: number
}

export interface ProfileRegistry {
    version: number
    currentProfileId: number | null
    nextProfileId: number
    nextProfileUseSeq: number
    summaries: PlayerProfileSummary[]
}

function getStorage() {
    return sys.localStorage
}

function makeProfileKey(id: number) {
    return `${PROFILE_DATA_KEY_PREFIX}${id}`
}

function createArray<T>(length: number, value: T): T[] {
    return Array.from({ length }, () => value)
}

function cloneProfile(profile: PlayerProfile): PlayerProfile {
    return {
        ...profile,
        challengeRecords: [...profile.challengeRecords],
        purchases: [...profile.purchases],
        pottedPlants: profile.pottedPlants.map((plant) => ({ ...plant })),
        earnedAchievements: [...profile.earnedAchievements],
        shownAchievements: [...profile.shownAchievements],
    }
}

function normalizeProfileSummary(summary: Partial<PlayerProfileSummary>): PlayerProfileSummary {
    return {
        id: Number(summary.id ?? 0),
        name: typeof summary.name === 'string' && summary.name.length > 0 ? summary.name : DEFAULT_PROFILE_NAME,
        useSeq: Number(summary.useSeq ?? 0),
    }
}

function defaultProfile(id: number, name: string, useSeq: number): PlayerProfile {
    return {
        version: PROFILE_VERSION,
        id,
        name,
        useSeq,
        adventureLevel: 1,
        coins: 0,
        finishedAdventure: 0,
        challengeRecords: createArray(CHALLENGE_RECORD_COUNT, 0),
        purchases: createArray(PURCHASE_COUNT, 0),
        playTimeActivePlayer: 0,
        playTimeInactivePlayer: 0,
        hasUsedCheatKeys: false,
        hasWokenStinky: false,
        didNotPurchasePacketUpgrade: false,
        lastStinkyChocolateTime: 0,
        stinkyPosX: 0,
        stinkyPosY: 0,
        hasUnlockedMinigames: false,
        hasUnlockedPuzzleMode: false,
        hasNewMiniGame: false,
        hasNewScaryPotter: false,
        hasNewIZombie: false,
        hasNewSurvival: false,
        hasUnlockedSurvivalMode: false,
        needsMessageOnGameSelector: false,
        needsMagicTacoReward: false,
        hasSeenStinky: false,
        hasSeenUpsell: false,
        placeholderPlayerStats: 0,
        numPottedPlants: 0,
        pottedPlants: [],
        earnedAchievements: createArray(ACHIEVEMENT_COUNT, false),
        shownAchievements: createArray(ACHIEVEMENT_COUNT, false),
    }
}

function normalizeProfile(raw: Partial<PlayerProfile>, fallbackId: number, fallbackName: string, fallbackUseSeq: number): PlayerProfile {
    const profile = defaultProfile(fallbackId, fallbackName, fallbackUseSeq)
    profile.version = PROFILE_VERSION
    profile.id = Number(raw.id ?? fallbackId)
    profile.name = typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : fallbackName
    profile.useSeq = Number(raw.useSeq ?? fallbackUseSeq)
    profile.adventureLevel = Math.max(1, Math.floor(Number(raw.adventureLevel ?? 1) || 1))
    profile.coins = Math.max(0, Math.floor(Number(raw.coins ?? 0) || 0))
    profile.finishedAdventure = Math.max(0, Math.floor(Number(raw.finishedAdventure ?? 0) || 0))
    profile.challengeRecords = [
        ...createArray(CHALLENGE_RECORD_COUNT, 0).map((_, index) => Number(raw.challengeRecords?.[index] ?? 0) || 0),
    ]
    profile.purchases = [
        ...createArray(PURCHASE_COUNT, 0).map((_, index) => Number(raw.purchases?.[index] ?? 0) || 0),
    ]
    profile.playTimeActivePlayer = Number(raw.playTimeActivePlayer ?? 0) || 0
    profile.playTimeInactivePlayer = Number(raw.playTimeInactivePlayer ?? 0) || 0
    profile.hasUsedCheatKeys = !!raw.hasUsedCheatKeys
    profile.hasWokenStinky = !!raw.hasWokenStinky
    profile.didNotPurchasePacketUpgrade = !!raw.didNotPurchasePacketUpgrade
    profile.lastStinkyChocolateTime = Number(raw.lastStinkyChocolateTime ?? 0) || 0
    profile.stinkyPosX = Number(raw.stinkyPosX ?? 0) || 0
    profile.stinkyPosY = Number(raw.stinkyPosY ?? 0) || 0
    profile.hasUnlockedMinigames = !!raw.hasUnlockedMinigames
    profile.hasUnlockedPuzzleMode = !!raw.hasUnlockedPuzzleMode
    profile.hasNewMiniGame = !!raw.hasNewMiniGame
    profile.hasNewScaryPotter = !!raw.hasNewScaryPotter
    profile.hasNewIZombie = !!raw.hasNewIZombie
    profile.hasNewSurvival = !!raw.hasNewSurvival
    profile.hasUnlockedSurvivalMode = !!raw.hasUnlockedSurvivalMode
    profile.needsMessageOnGameSelector = !!raw.needsMessageOnGameSelector
    profile.needsMagicTacoReward = !!raw.needsMagicTacoReward
    profile.hasSeenStinky = !!raw.hasSeenStinky
    profile.hasSeenUpsell = !!raw.hasSeenUpsell
    profile.placeholderPlayerStats = Number(raw.placeholderPlayerStats ?? 0) || 0
    profile.numPottedPlants = Math.max(0, Math.floor(Number(raw.numPottedPlants ?? 0) || 0))
    profile.pottedPlants = Array.isArray(raw.pottedPlants)
        ? raw.pottedPlants.slice(0, profile.numPottedPlants).map((plant) => ({
            seedType: String(plant?.seedType ?? 'peashooter'),
            whichZenGarden: String(plant?.whichZenGarden ?? 'main'),
            x: Number(plant?.x ?? 0) || 0,
            y: Number(plant?.y ?? 0) || 0,
            facing: plant?.facing === 'left' ? 'left' : 'right',
            lastWateredTime: Number(plant?.lastWateredTime ?? 0) || 0,
            drawVariation: String(plant?.drawVariation ?? 'normal'),
            plantAge: String(plant?.plantAge ?? 'sprout'),
            timesFed: Number(plant?.timesFed ?? 0) || 0,
            feedingsPerGrow: Number(plant?.feedingsPerGrow ?? 0) || 0,
            plantNeed: String(plant?.plantNeed ?? 'none'),
            lastNeedFulfilledTime: Number(plant?.lastNeedFulfilledTime ?? 0) || 0,
            lastFertilizedTime: Number(plant?.lastFertilizedTime ?? 0) || 0,
            lastChocolateTime: Number(plant?.lastChocolateTime ?? 0) || 0,
        }))
        : []
    profile.earnedAchievements = [
        ...createArray(ACHIEVEMENT_COUNT, false).map((_, index) => !!raw.earnedAchievements?.[index]),
    ]
    profile.shownAchievements = [
        ...createArray(ACHIEVEMENT_COUNT, false).map((_, index) => !!raw.shownAchievements?.[index]),
    ]
    if (profile.finishedAdventure > 0) {
        profile.earnedAchievements[0] = true
    }
    return profile
}

function defaultRegistry(): ProfileRegistry {
    return {
        version: PROFILE_VERSION,
        currentProfileId: null,
        nextProfileId: 1,
        nextProfileUseSeq: 1,
        summaries: [],
    }
}

function readRegistry(): ProfileRegistry {
    const raw = getStorage().getItem(PROFILE_REGISTRY_KEY)
    if (!raw) return defaultRegistry()

    try {
        const parsed = JSON.parse(raw) as Partial<ProfileRegistry>
        if (parsed.version !== PROFILE_VERSION) return defaultRegistry()
        const summaries = Array.isArray(parsed.summaries)
            ? parsed.summaries.map((summary) => normalizeProfileSummary(summary))
            : []
        return {
            version: PROFILE_VERSION,
            currentProfileId: parsed.currentProfileId == null ? null : Number(parsed.currentProfileId) || null,
            nextProfileId: Math.max(1, Number(parsed.nextProfileId ?? 1) || 1),
            nextProfileUseSeq: Math.max(1, Number(parsed.nextProfileUseSeq ?? 1) || 1),
            summaries: summaries.sort((a, b) => a.name.localeCompare(b.name)),
        }
    } catch {
        return defaultRegistry()
    }
}

function writeRegistry(registry: ProfileRegistry) {
    getStorage().setItem(PROFILE_REGISTRY_KEY, JSON.stringify(registry))
}

function readProfile(id: number): PlayerProfile | null {
    const raw = getStorage().getItem(makeProfileKey(id))
    if (!raw) return null

    try {
        const parsed = JSON.parse(raw) as Partial<PlayerProfile>
        return normalizeProfile(parsed, id, DEFAULT_PROFILE_NAME, 0)
    } catch {
        return null
    }
}

function writeProfile(profile: PlayerProfile) {
    getStorage().setItem(makeProfileKey(profile.id), JSON.stringify(profile))
}

function touchProfile(profile: PlayerProfile) {
    const registry = readRegistry()
    const touched = cloneProfile(profile)
    touched.useSeq = registry.nextProfileUseSeq++
    syncRegistryEntry(registry, touched)
    writeProfile(touched)
    writeRegistry(registry)
    return touched
}

function syncRegistryEntry(registry: ProfileRegistry, profile: PlayerProfile) {
    const summary = normalizeProfileSummary(profile)
    const index = registry.summaries.findIndex((entry) => entry.id === summary.id)
    if (index >= 0) {
        registry.summaries[index] = summary
    } else {
        registry.summaries.push(summary)
    }
    registry.summaries.sort((a, b) => a.name.localeCompare(b.name))
    registry.currentProfileId = profile.id
    registry.nextProfileId = Math.max(registry.nextProfileId, profile.id + 1)
    registry.nextProfileUseSeq = Math.max(registry.nextProfileUseSeq, profile.useSeq + 1)
}

function pruneProfiles(registry: ProfileRegistry) {
    while (registry.summaries.length > MAX_PROFILES) {
        let oldest = registry.summaries[0]
        for (const summary of registry.summaries) {
            if (summary.useSeq < oldest.useSeq) oldest = summary
        }
        GameSaveStore.deleteAllForProfile(oldest.id)
        getStorage().removeItem(makeProfileKey(oldest.id))
        registry.summaries = registry.summaries.filter((entry) => entry.id !== oldest.id)
        if (registry.currentProfileId === oldest.id) {
            registry.currentProfileId = registry.summaries[0]?.id ?? null
        }
    }
}

export class ProfileStore {
    static loadRegistry() {
        return readRegistry()
    }

    static loadProfiles(): PlayerProfileSummary[] {
        return [...readRegistry().summaries]
    }

    static loadProfileById(id: number): PlayerProfile | null {
        const registry = readRegistry()
        const summary = registry.summaries.find((entry) => entry.id === id)
        if (!summary) return null
        const profile = readProfile(id)
        return profile ? touchProfile(profile) : null
    }

    static loadProfileByName(name: string): PlayerProfile | null {
        const registry = readRegistry()
        const summary = registry.summaries.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
        return summary ? this.loadProfileById(summary.id) : null
    }

    static getCurrentProfile(): PlayerProfile | null {
        const registry = readRegistry()
        const profile =
            (registry.currentProfileId != null ? readProfile(registry.currentProfileId) : null) ??
            (registry.summaries[0] ? readProfile(registry.summaries[0].id) : null)
        return profile ? cloneProfile(profile) : null
    }

    static loadCurrentProfile(): PlayerProfile {
        const registry = readRegistry()
        const existing =
            (registry.currentProfileId != null ? readProfile(registry.currentProfileId) : null) ??
            (registry.summaries[0] ? readProfile(registry.summaries[0].id) : null)
        if (existing) {
            return touchProfile(existing)
        }

        return this.createProfile(DEFAULT_PROFILE_NAME)
    }

    static createProfile(name: string) {
        const registry = readRegistry()
        const existing = registry.summaries.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
        if (existing) {
            return this.loadProfileById(existing.id) ?? defaultProfile(existing.id, existing.name, existing.useSeq)
        }

        const profile = defaultProfile(registry.nextProfileId, name || DEFAULT_PROFILE_NAME, registry.nextProfileUseSeq)
        syncRegistryEntry(registry, profile)
        writeProfile(profile)
        pruneProfiles(registry)
        writeRegistry(registry)
        return cloneProfile(profile)
    }

    static saveProfile(profile: PlayerProfile) {
        const registry = readRegistry()
        const normalized = normalizeProfile(profile, profile.id, profile.name, profile.useSeq)
        syncRegistryEntry(registry, normalized)
        writeProfile(normalized)
        pruneProfiles(registry)
        writeRegistry(registry)
        return cloneProfile(normalized)
    }

    static setCurrentProfile(profileId: number) {
        const registry = readRegistry()
        registry.currentProfileId = profileId
        writeRegistry(registry)
    }

    static renameProfile(oldName: string, newName: string) {
        const registry = readRegistry()
        const summary = registry.summaries.find((entry) => entry.name.toLowerCase() === oldName.toLowerCase())
        if (!summary) return false
        const duplicate = registry.summaries.find((entry) => entry.name.toLowerCase() === newName.toLowerCase())
        if (duplicate && duplicate.id !== summary.id) return false

        summary.name = newName
        const profile = readProfile(summary.id)
        if (profile) {
            profile.name = newName
            writeProfile(profile)
        }
        registry.summaries.sort((a, b) => a.name.localeCompare(b.name))
        writeRegistry(registry)
        return true
    }

    static deleteProfile(name: string) {
        const registry = readRegistry()
        const summary = registry.summaries.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
        if (!summary) return false

        GameSaveStore.deleteAllForProfile(summary.id)
        getStorage().removeItem(makeProfileKey(summary.id))
        registry.summaries = registry.summaries.filter((entry) => entry.id !== summary.id)
        if (registry.currentProfileId === summary.id) {
            registry.currentProfileId = registry.summaries[0]?.id ?? null
        }
        writeRegistry(registry)
        return true
    }

    static getAnyProfile() {
        const registry = readRegistry()
        const profile = registry.summaries[0] ? readProfile(registry.summaries[0].id) : null
        return profile ? touchProfile(profile) : null
    }

    static advanceAdventureProgress(profile: PlayerProfile, completedLevel: number) {
        const normalized = cloneProfile(profile)
        if (completedLevel >= 50) {
            normalized.adventureLevel = 1
            normalized.finishedAdventure += 1
            normalized.earnedAchievements[0] = true
            if (normalized.finishedAdventure === 1) {
                normalized.needsMessageOnGameSelector = true
            }
        } else {
            normalized.adventureLevel = completedLevel + 1
        }
        return this.saveProfile(normalized)
    }

    static resetAdventureProgress(profile: PlayerProfile) {
        const normalized = cloneProfile(profile)
        normalized.adventureLevel = 1
        return this.saveProfile(normalized)
    }

    static clearAll() {
        const registry = readRegistry()
        for (const summary of registry.summaries) {
            getStorage().removeItem(makeProfileKey(summary.id))
            GameSaveStore.deleteAllForProfile(summary.id)
        }
        getStorage().removeItem(PROFILE_REGISTRY_KEY)
    }
}
