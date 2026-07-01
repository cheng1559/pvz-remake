import type { GameSessionSnapshot } from '../GameSessionSnapshot'
import type { LevelDefinition } from '../GameTypes'
import { GameSaveStore } from './GameSaveStore'
import { ProfileStore, type PlayerProfile } from './ProfileStore'

const ADVENTURE_SAVE_MODE = 'adventure'

export class AdventureProgressStore {
    static loadSnapshot(profile: PlayerProfile, level: LevelDefinition): GameSessionSnapshot | null {
        const record = GameSaveStore.load(profile.id, ADVENTURE_SAVE_MODE)
        if (!record?.snapshot || record.levelId !== level.id) return null

        try {
            const snapshot = JSON.parse(record.snapshot) as GameSessionSnapshot
            return snapshot.levelId === level.id ? snapshot : null
        } catch {
            return null
        }
    }

    static saveSnapshot(profile: PlayerProfile, level: LevelDefinition, snapshot: GameSessionSnapshot) {
        GameSaveStore.save({
            version: 1,
            profileId: profile.id,
            gameMode: ADVENTURE_SAVE_MODE,
            levelId: level.id,
            createdAt: 0,
            updatedAt: 0,
            snapshot: JSON.stringify(snapshot),
        })
    }

    static deleteSave(profile: PlayerProfile) {
        GameSaveStore.delete(profile.id, ADVENTURE_SAVE_MODE)
    }

    static advanceProgress(profile: PlayerProfile, completedLevel: number) {
        return ProfileStore.advanceAdventureProgress(profile, completedLevel)
    }

    static setProgress(profile: PlayerProfile, adventureLevel: number) {
        if (profile.adventureLevel === adventureLevel) return profile
        return ProfileStore.saveProfile({
            ...profile,
            adventureLevel,
        })
    }

    static setCoins(profile: PlayerProfile, amount: number) {
        if (profile.coins === amount) return profile
        return ProfileStore.saveProfile({
            ...profile,
            coins: amount,
        })
    }
}
