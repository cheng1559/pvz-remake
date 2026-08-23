import { sys } from 'cc'

import { GAME_SAVE_V2_KEY, GameSaveV2Store } from './GameSaveV2Store'

export function createLocalGameSaveV2Store(primaryKey = GAME_SAVE_V2_KEY): GameSaveV2Store {
    return new GameSaveV2Store(sys.localStorage, primaryKey)
}
