import { sys } from 'cc'

import { GAME_SAVE_KEY, GameSaveStore } from './GameSaveStore'

export function createLocalGameSaveStore(primaryKey = GAME_SAVE_KEY): GameSaveStore {
    return new GameSaveStore(sys.localStorage, primaryKey)
}
