import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { GameSaveV2Store, type StorageLike } from '@/app/GameSaveV2Store'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { createGameSaveV2, type GameSaveV2 } from '@/app/SaveCoordinator'
import type { ServerSaveSnapshotV2 } from '@/server/save'
import { parseGameplayDefinitionsV2, parseGameplayLevelsV2 } from '@/shared/content/gameplay'
import { adventure11Presentation } from './adventure11-test-snapshot'

const source = (name: string): unknown => JSON.parse(
    readFileSync(`tools/content/pvz-base/gameplay/${name}.json`, 'utf8'),
)
const definitions = parseGameplayDefinitionsV2(source('definitions'))
const levels = parseGameplayLevelsV2(source('levels'), definitions)

class MemoryStorage implements StorageLike {
    readonly values = new Map<string, string>()
    interruptNextSetFor: string | null = null

    getItem(key: string): string | null {
        return this.values.get(key) ?? null
    }

    setItem(key: string, value: string): void {
        if (this.interruptNextSetFor === key) {
            this.interruptNextSetFor = null
            this.values.set(key, '{')
            throw new Error('injected write failure')
        }
        this.values.set(key, value)
    }

    removeItem(key: string): void {
        this.values.delete(key)
    }
}

function gameSave(updatedAt: number): GameSaveV2 {
    const game = new LocalIntegratedGame(definitions, levels)
    game.start({
        levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0,
        firstAdventure: false, mods: [],
    })
    game.requestSave()
    game.update(0)
    return createGameSaveV2({
        profileId: 1,
        mode: 'adventure',
        levelId: 'pvz:adventure-1-1',
        createdAt: 100,
        updatedAt,
        contentSet: {
            base: { id: 'pvz:base', version: '2.0.0', contentHash: 'hash' },
            mods: [],
        },
        server: game.lastSave as unknown as ServerSaveSnapshotV2,
        client: game.snapshotPresentation(adventure11Presentation(game.render())),
    })
}

test('GameSaveV2Store keeps the previous valid save when primary replacement fails', () => {
    const storage = new MemoryStorage()
    const store = new GameSaveV2Store(storage, 'save')
    const oldSave = gameSave(200)
    store.save(oldSave)

    storage.interruptNextSetFor = 'save'
    assert.throws(() => store.save(gameSave(300)), /injected write failure/)
    assert.deepEqual(JSON.parse(storage.getItem('save')!), oldSave)
})

test('GameSaveV2Store recovers the newer valid temporary save after interruption', () => {
    const storage = new MemoryStorage()
    const store = new GameSaveV2Store(storage, 'save')
    const oldSave = gameSave(200)
    const newSave = gameSave(300)
    storage.setItem('save', JSON.stringify(oldSave))
    storage.setItem('save:temp', JSON.stringify(newSave))

    assert.deepEqual(store.load(), newSave)
    assert.deepEqual(JSON.parse(storage.getItem('save')!), newSave)
    assert.equal(storage.getItem('save:temp'), null)
})
