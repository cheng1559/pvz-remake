import assert from 'node:assert/strict'
import test from 'node:test'
import { loadScript } from '../loadScript'
import * as protocol from '@/shared/protocol'

// The protocol's own helpers run as they are: what is loaded asks them whether the level stands still.
const shared: Record<string, unknown> = { '@/shared/protocol': protocol, '@/shared/protocol/index': protocol }

test('temporary levels preserve the adventure save when entered, restarted and exited', async () => {
    const saved: any[] = []
    const debugCommands: string[] = []
    let deletions = 0
    let phase = 'intro'
    let cursor: any = { mode: 'none' }
    const commands: string[] = []
    const levels = { normal: {}, stress: { persistent: false } }
    const store = { save(value: any) { saved.push(value); return value }, load: () => null, delete() { deletions++ } }
    class Scene {
        configure() {} prepareForReplacement() {} pause() {} resume() {}
        async snapshotPresentation() { return {} }
    }
    class Game {
        levelId = ''
        get currentSnapshot() { return { phase } }
        start(options: any) { this.levelId = options.levelId }
        debugCommand(command: string) { debugCommands.push(command) }
        render() { return { levelId: this.levelId, paused: false, result: 'playing', cursor } }
        command(command: { type: string }) { commands.push(command.type); cursor = { mode: 'none' } }
        update() {}
        saveAtBoundary() { return { levelId: this.levelId, mods: [] } }
        drainChanges() { return [] } drainEvents() { return [] }
    }
    const modules: Record<string, any> = {
        cc: { BlockInputEvents: class {}, Mask: { Type: { GRAPHICS_RECT: 1 } }, Node: class {} },
        './LocalIntegratedGame': { LocalIntegratedGame: Game },
        './ModLoader': { loadInstalledMods: async () => ({ gameplay: [] }) },
        './CocosGameSaveStore': { createLocalGameSaveStore: () => store },
        '@/shared/menu': { GAME_SAVE_KEY: 'save' },
        './SaveCoordinator': { createGameSave: (value: any) => value },
        '@/client/game/loadIntegratedGameContent': { LEVEL_PREFAB_ID: 'prefab', async loadIntegratedGameContent() {
            return { levels: { levels }, definitions: {}, enabledMods: [],
                registry: { resolve: () => ({ contentId: 'base', contentVersion: '1', contentHash: 'hash' }) } }
        } },
        '@/client/level/LevelView': { LevelView: { async create() { return { audio: { stop() {} }, sync() {} } } } },
        '@/client/level/LevelScene': { LevelScene: Scene },
        '@/client/view/uiNode': { uiNode: () => ({ node: {
            isValid: true, active: true, addComponent(type: any) { return new type() }, destroy() { this.isValid = false },
        } }) },
        '@/client/api/MenuApi': { menuApi: { async getCurrentUser() { return { id: 1, name: 'Player', unlocks: { almanac: false, store: false } } }, async getAdventure() { return { levelId: 'normal' } }, async getPurse() { return { coins: 0, packetUpgrades: 0, packetUpgradeCost: 75 } }, async setCoins() {}, async getAchievements() { return { items: [], total: 0, completed: 0 } } } },
        '@/platform/debug/GameDebugSettings': { GameDebugSettings: { rechargingEnabled: true, sunCostEnabled: true, plantInvincible: true, collectMode: 'click' } },
        '@/shared/debug/DebugCli': {},
    }
    const levelController = loadScript('assets/scripts/app/LevelController.ts', (id: string) => modules[id] ?? shared[id], { Date, Math, Promise, Error })
    const controller = levelController.createLevelController({})
    await controller.play({ levelId: 'normal' })
    assert.equal(controller.isLevelIntro(), true)
    assert.equal(await controller.saveIfRunning(), null, 'leaving seed selection does not create a battle save')
    assert.equal(saved.length, 0)
    phase = 'gameplay'
    assert.equal(controller.isLevelIntro(), false)
    assert.equal(controller.cancelCursor(), false)
    for (const held of [{ mode: 'seed', seedId: 'pea' }, { mode: 'seed', seedId: 'nut', packetId: 17 }, { mode: 'tool', toolId: 'pvz:shovel' }]) {
        cursor = held
        assert.equal(controller.cancelCursor(), true)
        assert.equal(cursor.mode, 'none')
    }
    assert.deepEqual(commands, ['clearCursor', 'clearCursor', 'clearCursor'])
    await controller.play({ forceNewGame: true, levelId: 'stress' })
    assert.deepEqual(debugCommands, ['/plantinvincible', '/plantinvincible'])
    assert.equal(saved.length, 1)
    assert.equal(saved[0].levelId, 'normal')
    assert.equal(deletions, 0)
    assert.equal(await controller.saveIfRunning(), null)
    await assert.rejects(controller.save(), /Temporary levels cannot be saved/)
    await controller.play({ forceNewGame: true })
    assert.equal(await controller.saveIfRunning(), null)
    assert.equal(saved.length, 1)
    assert.equal(deletions, 0)
    // A failed replacement leaves the last successful adventure save available for the next startup.
    const failure = new Error('level view failed')
    modules['@/client/level/LevelView'].LevelView.create = async () => { throw failure }
    await assert.rejects(controller.play({ forceNewGame: true, levelId: 'normal' }), (error: unknown) => error === failure)
    assert.equal(deletions, 0)
    assert.equal(saved.length, 1)
    controller.hide()
})

test('temporary level completion and defeat return to the menu without changing progress or saves', async () => {
    let completions = 0, deletions = 0
    const modules: Record<string, any> = {
        cc: { Component: class {}, _decorator: { ccclass: () => (value: unknown) => value } },
        '@/client/api/MenuApi': { menuApi: { async completeLevel() { completions++ } } },
    }
    const { GameApp } = loadScript('assets/scripts/app/GameApp.ts', (id: string) => modules[id] ?? {}, { console })
    const app = new GameApp()
    const destinations: string[] = []
    app.navigate = async (page: string) => { destinations.push(page) }
    app.controller = { getLevelDefinition: () => ({ persistent: false }), async deleteSave() { deletions++ } }
    await app.finish('award')
    await app.finish('gameOver')
    assert.deepEqual(destinations, ['main', 'main'])
    assert.equal(completions, 0)
    assert.equal(deletions, 0)
})
