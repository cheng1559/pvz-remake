import { parseGameSaveV2, type GameSaveV2 } from './SaveCoordinator'

export interface StorageLike {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
}

export const GAME_SAVE_V2_KEY = 'pvz-remake:game-save-v2'

export class GameSaveV2Store {
    private readonly tempKey: string

    constructor(
        private readonly storage: StorageLike,
        private readonly primaryKey = GAME_SAVE_V2_KEY,
    ) {
        this.tempKey = `${primaryKey}:temp`
    }

    save(value: unknown): GameSaveV2 {
        const save = parseGameSaveV2(value)
        const raw = JSON.stringify(save)
        const oldPrimary = this.read(this.primaryKey)

        this.storage.setItem(this.tempKey, raw)
        if (JSON.stringify(this.read(this.tempKey)) !== raw) {
            throw new Error('Temporary GameSaveV2 verification failed')
        }

        try {
            this.storage.setItem(this.primaryKey, raw)
            if (JSON.stringify(this.read(this.primaryKey)) !== raw) {
                throw new Error('Primary GameSaveV2 verification failed')
            }
        } catch (error) {
            if (oldPrimary) this.storage.setItem(this.primaryKey, JSON.stringify(oldPrimary))
            throw error
        }

        try {
            this.storage.removeItem(this.tempKey)
        } catch {
            // The committed primary is valid; load() can clean the leftover temp record.
        }
        return save
    }

    load(): GameSaveV2 | null {
        const primary = this.read(this.primaryKey)
        const temp = this.read(this.tempKey)
        if (!temp || (primary && primary.updatedAt >= temp.updatedAt)) return primary

        const raw = JSON.stringify(temp)
        try {
            this.storage.setItem(this.primaryKey, raw)
            if (JSON.stringify(this.read(this.primaryKey)) !== raw) {
                throw new Error('Recovered GameSaveV2 verification failed')
            }
            this.storage.removeItem(this.tempKey)
        } catch (error) {
            if (primary) this.storage.setItem(this.primaryKey, JSON.stringify(primary))
        }
        return temp
    }

    delete(): void {
        this.storage.removeItem(this.tempKey)
        this.storage.removeItem(this.primaryKey)
    }

    private read(key: string): GameSaveV2 | null {
        try {
            const raw = this.storage.getItem(key)
            return raw === null ? null : parseGameSaveV2(JSON.parse(raw))
        } catch {
            return null
        }
    }
}
