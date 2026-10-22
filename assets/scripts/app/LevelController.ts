import { BlockInputEvents, Mask, Node } from 'cc'
import { LocalIntegratedGame } from './LocalIntegratedGame'
import { createLocalGameSaveStore } from './CocosGameSaveStore'
import { GAME_SAVE_KEY } from './GameSaveStore'
import { createGameSave, isCompatibleBaseContent, parseGameSave, type GameSave } from './SaveCoordinator'
import { loadIntegratedGameContent, LEVEL_PREFAB_ID } from '@/client/game/loadIntegratedGameContent'
import { LevelView } from '@/client/level/LevelView'
import {
    LevelScene,
    type LevelLifecycle,
} from '@/client/level/LevelScene'
import { uiNode } from '@/client/view/uiNode'
import { menuApi } from '@/client/api/MenuApi'
import type { EnabledMod, JsonValue } from '@/shared/protocol/index'
import type { ServerSaveSnapshot } from '@/server/save'
import type { LevelDefinition } from '@/shared/content/gameplay'
import { debugCondition, type DebugCliResult } from '@/shared/debug/DebugCli'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import {
    GameplaySystemMods,
    type GameplaySystemEnhancer,
    type GameplaySystemRunner,
} from '@/server/GameplaySystemMods'

export interface LevelController {
    show(): Promise<Node>
    play(options?: { forceNewGame?: boolean, levelId?: string, onRestore?: () => void }): Promise<Node>
    hide(): void
    isRunning(): boolean
    isPaused(): boolean
    canPause(): boolean
    getLevelDefinition(): LevelDefinition | null
    isWon(): boolean
    countZombiesOnScreenForMusic(): number
    debugCommand(command: string): DebugCliResult
    pause(): void
    resume(): void
    snapshot(): Promise<GameSave>
    restore(save?: unknown): Promise<Node>
    save(): Promise<GameSave>
    saveIfRunning(): Promise<GameSave | null>
    deleteSave(): Promise<void>
}
type ProbeGlobal = typeof globalThis & { pvzPhase4?: LevelController }

interface RunningLevel {
    root: Node
    game: LocalIntegratedGame
    view: LevelView
    scene: LevelScene
    base: EnabledMod
    level: LevelDefinition
    createdAt?: number
}

const DEFAULT_START_OPTIONS = {
    levelId: 'pvz:adventure-1-1',
    randomSeed: 0x50565a31,
    initialMoney: 0,
    firstAdventure: true,
    mods: [] as EnabledMod[],
}

export function createLevelController(
    parent: Node,
    lifecycle: LevelLifecycle = {},
): LevelController {
    let current: RunningLevel | null = null
    let loading: Promise<Node> | null = null
    let saving: Promise<GameSave> | null = null
    let revision = 0

    const profileId = async () => {
        const id = (await menuApi.getCurrentUser())?.id
        if (!id) throw new Error('Level save requires a current player profile')
        return id
    }
    const storeForProfile = (id: number) =>
        createLocalGameSaveStore(`${GAME_SAVE_KEY}:${id}:adventure`)
    const load = async (save?: GameSave, levelId = DEFAULT_START_OPTIONS.levelId): Promise<RunningLevel> => {
        const rollback = current?.root.isValid ? await current.scene.snapshotPresentation() : undefined
        const root = uiNode({
            name: 'Level', parent, size: { width: 800, height: 600 },
            mask: Mask.Type.GRAPHICS_RECT,
        }).node
        root.active = save === undefined
        root.addComponent(BlockInputEvents)
        let scene: LevelScene | undefined
        try {
            const content = await loadIntegratedGameContent()
            if (!content.levels.levels[save?.levelId ?? levelId]) throw new Error(`Level is not installed: ${save?.levelId ?? levelId}`)
            const resolvedBase = content.registry.resolve('prefabs', LEVEL_PREFAB_ID)
            if (!resolvedBase) throw new Error('Loaded content does not contain pvz:adventure11')
            const base = {
                id: resolvedBase.contentId,
                version: resolvedBase.contentVersion,
                contentHash: resolvedBase.contentHash,
            }
            if (save) {
                if (save.profileId !== await profileId()) throw new Error('GameSave belongs to another player profile')
                if (!isCompatibleBaseContent(save.contentSet.base, base, content.saveCompatibleHashes)) {
                    throw new Error('GameSave base content does not match the installed content')
                }
                if (!sameMods(save.contentSet.mods, content.enabledMods)) {
                    throw new Error('GameSave Mods do not match the installed gameplay Mods')
                }
            }
            if (!root.isValid) throw new Error('Level scene was closed while loading')
            const systemMods = new GameplaySystemMods()
            for (const operation of content.loadedMods.gameplaySystems) {
                if (operation.mode === 'enhance') {
                    systemMods.register(
                        operation.ownerId,
                        operation.targetId,
                        operation.mode,
                        operation.apply as GameplaySystemEnhancer,
                    )
                } else {
                    systemMods.register(
                        operation.ownerId,
                        operation.targetId,
                        operation.mode,
                        operation.apply as GameplaySystemRunner,
                    )
                }
            }
            for (const upgrade of content.loadedMods.plantUpgrades) {
                systemMods.registerPlantUpgrade(upgrade.ownerId, upgrade)
            }
            const profile = await menuApi.getCurrentUser()
            const playerName = profile?.name || 'Player'
            const view = await LevelView.create(root, content, save?.levelId ?? levelId, playerName)
            const game = new LocalIntegratedGame(content.definitions, content.levels, systemMods, true)
            scene = root.addComponent(LevelScene)
            scene.configure(game, view, save ? {
                ...DEFAULT_START_OPTIONS,
                levelId: save.levelId,
                mods: save.contentSet.mods,
                save: save.server as unknown as JsonValue,
            } : { ...DEFAULT_START_OPTIONS, firstAdventure: profile?.finishedAdventure === 0, levelId, mods: content.enabledMods }, lifecycle)
            if (save) await scene.restorePresentation(save.client)
            if (!GameDebugSettings.rechargingEnabled) game.debugCommand('/cooldown false')
            if (!GameDebugSettings.sunCostEnabled) game.debugCommand('/suncost false')
            if (GameDebugSettings.collectMode !== 'click') game.debugCommand(`/collect ${GameDebugSettings.collectMode}`)
            return { root, game, view, scene, base, level: content.levels.levels[game.render().levelId], createdAt: save?.createdAt }
        } catch (error) {
            if (scene && rollback && current?.root.isValid) {
                scene.prepareForReplacement()
                try {
                    await current.scene.restorePresentation(rollback)
                } catch {
                    // Preserve the original restore error; the old screen remains mounted.
                }
            }
            if (root.isValid) root.destroy()
            throw error
        }
    }
    const commit = async (save?: GameSave, levelId?: string): Promise<Node> => {
        const expectedRevision = revision
        const candidate = await load(save, levelId)
        if (revision !== expectedRevision) {
            if (candidate.root.isValid) candidate.root.destroy()
            throw new Error('Level scene was closed while loading')
        }
        if (current?.root.isValid) {
            current.scene.prepareForReplacement()
            current.root.destroy()
        }
        candidate.root.active = true
        current = candidate
        return candidate.root
    }
    const startLoading = (save?: GameSave, levelId?: string) => {
        const promise = commit(save, levelId).finally(() => {
            if (loading === promise) loading = null
        })
        loading = promise
        return promise
    }
    const snapshot = async (): Promise<GameSave> => {
        if (loading) await loading
        if (!current?.root.isValid) throw new Error('Level scene is not running')
        const currentProfileId = await profileId()
        const server = current.game.saveAtBoundary() as unknown as ServerSaveSnapshot
        current.view.sync(current.game.render(), current.game.drainChanges(), current.game.drainEvents())
        const now = Date.now()
        current.createdAt ??= now
        return createGameSave({
            profileId: currentProfileId,
            mode: 'adventure',
            levelId: server.levelId,
            createdAt: current.createdAt,
            updatedAt: now,
            contentSet: { base: current.base, mods: server.mods },
            server,
            client: await current.scene.snapshotPresentation(),
        })
    }
    const save = () => saving ??= snapshot()
        .then(value => storeForProfile(value.profileId).save(value))
        .finally(() => { saving = null })
    const controller: LevelController = {
        async show() {
            if (loading) return loading
            if (current?.root.isValid) return current.root
            return startLoading()
        },
        async play(options = {}) {
            if (loading) await loading
            const requestedLevelId = options.levelId ?? (options.forceNewGame && current?.root.isValid ? current.game.render().levelId : undefined)
            if (options.forceNewGame) {
                controller.hide()
                storeForProfile(await profileId()).delete()
            } else if (current?.root.isValid && (!requestedLevelId || requestedLevelId === current.game.render().levelId)) {
                return current.root
            }
            const stored = options.forceNewGame ? null : storeForProfile(await profileId()).load()
            const save = !requestedLevelId || stored?.levelId === requestedLevelId ? stored : null
            const levelId = requestedLevelId ?? save?.levelId ?? (await menuApi.getAdventure()).levelId
            const root = await startLoading(save ?? undefined, levelId)
            if (save && current?.root.isValid) {
                if (options.onRestore) {
                    current.scene.pause()
                    options.onRestore()
                } else current.scene.resume()
            }
            return root
        },
        hide() {
            revision++
            if (current?.root.isValid) {
                current.view.audio.stop()
                current.scene.prepareForReplacement()
                current.root.destroy()
            }
            current = null
        },
        isRunning() {
            return current?.root.isValid === true
        },
        isWon() {
            return current?.root.isValid === true && current.game.render().result === 'won'
        },
        countZombiesOnScreenForMusic() {
            const snapshot = current?.root.isValid ? current.game.render() : null
            if (snapshot?.phase !== 'gameplay') return 0
            return snapshot.zombies.reduce((count, zombie) => count + (
                zombie.hasHead && (zombie.state === 'walking' || zombie.state === 'eating') ? 1 : 0
            ), 0)
        },
        getLevelDefinition() {
            return current?.root.isValid ? current.level : null
        },
        debugCommand(command) {
            if (!current?.root.isValid) return debugCondition('No active game')
            const result = current.game.debugCommand(command)
            current.view.sync(current.game.render(), current.game.drainChanges(), current.game.drainEvents())
            return result
        },
        isPaused() {
            return current?.root.isValid === true && current.scene.isPaused()
        },
        canPause() {
            return current?.root.isValid === true && current.view.introComplete &&
                !current.scene.isPaused() && current.game.render().result === 'playing'
        },
        pause() {
            if (current?.root.isValid) current.scene.pause()
        },
        resume() {
            if (current?.root.isValid) current.scene.resume()
        },
        snapshot,
        async restore(value?: unknown) {
            if (loading) await loading
            const save = value === undefined ? storeForProfile(await profileId()).load() : parseGameSave(value)
            if (!save) throw new Error('No GameSave exists for the current player profile')
            return startLoading(save)
        },
        save,
        async saveIfRunning() {
            if (loading) await loading
            if (!current?.root.isValid || current.game.render().result === 'lost') return null
            return save()
        },
        async deleteSave() {
            storeForProfile(await profileId()).delete()
        },
    }
    return controller
}

export function installLevelProbe(controller: LevelController): void {
    ;(globalThis as ProbeGlobal).pvzPhase4 = controller
}

function sameMods(left: readonly EnabledMod[], right: readonly EnabledMod[]): boolean {
    return left.length === right.length && left.every((mod, index) => {
        const other = right[index]
        return mod.id === other.id && mod.version === other.version && mod.contentHash === other.contentHash
    })
}
