import { sys } from 'cc'

const SAVE_VERSION = 1
const SAVE_KEY_PREFIX = 'pvz-remake:saves:'

export interface GameSaveRecord {
    version: number
    profileId: number
    gameMode: string
    levelId: string
    createdAt: number
    updatedAt: number
    snapshot: string | null
}

function getStorage() {
    return sys.localStorage
}

function makeKey(profileId: number, gameMode: string) {
    return `${SAVE_KEY_PREFIX}${profileId}:${gameMode}`
}

function readRecord(raw: string | null): GameSaveRecord | null {
    if (!raw) return null
    try {
        const parsed = JSON.parse(raw) as Partial<GameSaveRecord>
        if (parsed.version !== SAVE_VERSION) return null
        return {
            version: SAVE_VERSION,
            profileId: Number(parsed.profileId ?? 0),
            gameMode: String(parsed.gameMode ?? ''),
            levelId: String(parsed.levelId ?? ''),
            createdAt: Number(parsed.createdAt ?? 0),
            updatedAt: Number(parsed.updatedAt ?? 0),
            snapshot: typeof parsed.snapshot === 'string' ? parsed.snapshot : null,
        }
    } catch {
        return null
    }
}

export class GameSaveStore {
    static load(profileId: number, gameMode: string): GameSaveRecord | null {
        return readRecord(getStorage().getItem(makeKey(profileId, gameMode)))
    }

    static save(record: GameSaveRecord) {
        const normalized: GameSaveRecord = {
            version: SAVE_VERSION,
            profileId: record.profileId,
            gameMode: record.gameMode,
            levelId: record.levelId,
            createdAt: record.createdAt || Date.now(),
            updatedAt: Date.now(),
            snapshot: record.snapshot ?? null,
        }
        getStorage().setItem(makeKey(normalized.profileId, normalized.gameMode), JSON.stringify(normalized))
    }

    static delete(profileId: number, gameMode: string) {
        getStorage().removeItem(makeKey(profileId, gameMode))
    }

    static deleteAllForProfile(profileId: number) {
        const storage = getStorage()
        const prefix = `${SAVE_KEY_PREFIX}${profileId}:`
        for (let i = storage.length - 1; i >= 0; i--) {
            const key = storage.key(i)
            if (key && key.startsWith(prefix)) {
                storage.removeItem(key)
            }
        }
    }

    static has(profileId: number, gameMode: string) {
        return this.load(profileId, gameMode) !== null
    }
}
