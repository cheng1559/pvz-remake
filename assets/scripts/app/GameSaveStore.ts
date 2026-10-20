import { parseGameSave, type GameSave } from './SaveCoordinator'

export interface StorageLike {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
}

// Keep the persisted key stable; code names do not depend on the save format version.
export const GAME_SAVE_KEY = 'pvz-remake:game-save-v2'

export class GameSaveStore {
    private readonly tempKey: string

    constructor(
        private readonly storage: StorageLike,
        private readonly primaryKey = GAME_SAVE_KEY,
    ) {
        this.tempKey = `${primaryKey}:temp`
    }

    save(value: unknown): GameSave {
        const save = parseGameSave(value)
        const raw = JSON.stringify(save)
        const oldPrimary = this.read(this.primaryKey)

        this.storage.setItem(this.tempKey, raw)
        if (JSON.stringify(this.read(this.tempKey)) !== raw) {
            throw new Error('Temporary GameSave verification failed')
        }

        try {
            this.storage.setItem(this.primaryKey, raw)
            if (JSON.stringify(this.read(this.primaryKey)) !== raw) {
                throw new Error('Primary GameSave verification failed')
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

    load(): GameSave | null {
        const primary = this.read(this.primaryKey)
        const temp = this.read(this.tempKey)
        if (!temp || (primary && primary.updatedAt >= temp.updatedAt)) return primary

        const raw = JSON.stringify(temp)
        try {
            this.storage.setItem(this.primaryKey, raw)
            if (JSON.stringify(this.read(this.primaryKey)) !== raw) {
                throw new Error('Recovered GameSave verification failed')
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

    private read(key: string): GameSave | null {
        try {
            const raw = this.storage.getItem(key)
            return raw === null ? null : parseGameSave(JSON.parse(raw))
        } catch {
            return null
        }
    }
}
