import { readGameplaySource } from '../../tools/mod/content'
import assert from 'node:assert/strict'
import test from 'node:test'

import { GameSaveStore, type StorageLike } from '@/app/GameSaveStore'
import { LocalIntegratedGame } from '@/app/LocalIntegratedGame'
import { createGameSave, type GameSave } from '@/app/SaveCoordinator'
import type { ServerSaveSnapshot } from '@/server/save'
import { parseGameplayDefinitions, parseGameplayLevels } from '@/shared/content/gameplay'
import { levelPresentation } from './level-test-snapshot'

const source = readGameplaySource
const definitions = parseGameplayDefinitions(source('definitions'), source('seed-catalog'))
const levels = parseGameplayLevels(source('levels'), definitions)

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

function gameSave(updatedAt: number): GameSave {
    const game = new LocalIntegratedGame(definitions, levels)
    game.start({
        levelId: 'pvz:adventure-1-1', randomSeed: 1, initialMoney: 0,
        firstAdventure: false, mods: [],
    })
    game.requestSave()
    game.update(0)
    return createGameSave({
        profileId: 1,
        mode: 'adventure',
        levelId: 'pvz:adventure-1-1',
        createdAt: 100,
        updatedAt,
        contentSet: {
            base: { id: 'pvz:base', version: '2.0.0', contentHash: 'hash' },
            mods: [],
        },
        server: game.lastSave as unknown as ServerSaveSnapshot,
        client: game.snapshotPresentation(levelPresentation(game.render())),
    })
}

test('GameSaveStore keeps the previous valid save when primary replacement fails', () => {
    const storage = new MemoryStorage()
    const store = new GameSaveStore(storage, 'save')
    const oldSave = gameSave(200)
    store.save(oldSave)

    storage.interruptNextSetFor = 'save'
    assert.throws(() => store.save(gameSave(300)), /injected write failure/)
    assert.deepEqual(JSON.parse(storage.getItem('save')!), oldSave)
})

test('GameSaveStore recovers the newer valid temporary save after interruption', () => {
    const storage = new MemoryStorage()
    const store = new GameSaveStore(storage, 'save')
    const oldSave = gameSave(200)
    const newSave = gameSave(300)
    storage.setItem('save', JSON.stringify(oldSave))
    storage.setItem('save:temp', JSON.stringify(newSave))

    assert.deepEqual(store.load(), newSave)
    assert.deepEqual(JSON.parse(storage.getItem('save')!), newSave)
    assert.equal(storage.getItem('save:temp'), null)
})


test('GameSaveStore ignores obsolete formats and accepts a fresh current-format save', () => {
    const storage = new MemoryStorage()
    const store = new GameSaveStore(storage, 'save')
    const obsolete = JSON.parse(JSON.stringify(gameSave(200)))
    obsolete.client.adventure11 = obsolete.client.level
    delete obsolete.client.level
    storage.setItem('save', JSON.stringify(obsolete))
    assert.equal(store.load(), null)

    const fresh = gameSave(300)
    store.save(fresh)
    assert.deepEqual(store.load(), fresh)
})
