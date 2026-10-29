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

/** A stored save that no longer matches the installed content or fails restore checks. */
class IncompatibleSaveError extends Error {}

/** Restore failures of a stored save become IncompatibleSaveError; other failures pass through. */
async function restoring<T>(save: GameSave | undefined, task: () => T | Promise<T>): Promise<T> {
    try {
        return await task()
    } catch (error) {
        if (!save || error instanceof IncompatibleSaveError) throw error
        throw new IncompatibleSaveError(error instanceof Error ? error.message : String(error))
    }
}

export interface LevelController {
    show(): Promise<Node>
    play(options?: { forceNewGame?: boolean, levelId?: string, onRestore?: () => void }): Promise<Node>
    hide(): void
    isRunning(): boolean
    isPaused(): boolean
    canPause(): boolean
    cancelCursor(): boolean
    isLevelIntro(): boolean
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
            name: 'Level', parent, viewport: true,
            mask: Mask.Type.GRAPHICS_RECT,
        }).node
        // Built hidden, like a restore; commit shows it in the same frame it removes the previous level, so starting a
        // level (/level, Restart) never shows an empty or half-built screen.
        root.active = false
        root.addComponent(BlockInputEvents)
        let scene: LevelScene | undefined
        try {
            const content = await loadIntegratedGameContent()
            if (!content.levels.levels[save?.levelId ?? levelId]) throw new Error(`Level is not installed: ${save?.levelId ?? levelId}`)
            const resolvedBase = content.registry.resolve('prefabs', LEVEL_PREFAB_ID)
            if (!resolvedBase) throw new Error(`Loaded content does not contain ${LEVEL_PREFAB_ID}`)
            const base = {
                id: resolvedBase.contentId,
                version: resolvedBase.contentVersion,
                contentHash: resolvedBase.contentHash,
            }
            if (save) {
                if (save.profileId !== await profileId()) throw new Error('GameSave belongs to another player profile')
                if (!isCompatibleBaseContent(save.contentSet.base, base)) {
                    throw new IncompatibleSaveError('GameSave base content does not match the installed content')
                }
                if (!sameMods(save.contentSet.mods, content.enabledMods)) {
                    throw new IncompatibleSaveError('GameSave Mods do not match the installed gameplay Mods')
                }
            }
            if (!root.isValid) throw new Error('Level scene was closed while loading')
            const gameplay = content.loadedMods.gameplay
            const profile = await menuApi.getCurrentUser()
            const purse = profile ? await menuApi.getPurse() : { coins: 0, packetUpgrades: 0, packetUpgradeCost: 0 }
            const playerName = profile?.name || 'Player'
            const game = new LocalIntegratedGame(content.definitions, content.levels, gameplay, true)
            const startOptions = save ? {
                ...DEFAULT_START_OPTIONS, initialMoney: purse.coins, packetUpgrades: purse.packetUpgrades,
                randomSeed: save.server.random.state,
                levelId: save.levelId,
                mods: save.contentSet.mods,
                save: save.server as unknown as JsonValue,
            } : { ...DEFAULT_START_OPTIONS, initialMoney: purse.coins, packetUpgrades: purse.packetUpgrades, randomSeed: Math.floor(Math.random() * 0x100000000),
                firstAdventure: profile?.finishedAdventure === 0, levelId, mods: content.enabledMods }
            await restoring(save, () => game.start(startOptions))
            const view = await LevelView.create(root, content, save?.levelId ?? levelId, { name: playerName, upgradeCost: purse.packetUpgradeCost }, game.render())
            // The profile owns the purse; a level only reports what it collected.
            if (profile) view.onMoneyChanged = money => { void menuApi.setCoins(money).catch(error => console.error('[LevelController] Saving coins failed', error)) }
            scene = root.addComponent(LevelScene)
            scene.configure(game, view, startOptions, lifecycle)
            if (save) await restoring(save, () => scene!.restorePresentation(save.client))
            if (!GameDebugSettings.rechargingEnabled) game.debugCommand('/cooldown false')
            if (!GameDebugSettings.sunCostEnabled) game.debugCommand('/suncost false')
            if (GameDebugSettings.plantInvincible) game.debugCommand('/plantinvincible true')
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
    const save = () => {
        if (current?.level.persistent === false) return Promise.reject(new Error('Temporary levels cannot be saved'))
        return saving ??= snapshot()
        .then(value => storeForProfile(value.profileId).save(value))
        .finally(() => { saving = null })
    }
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
                const targetLevel = current?.root.isValid && requestedLevelId === current.game.render().levelId
                    ? current.level : requestedLevelId ? (await loadIntegratedGameContent()).levels.levels[requestedLevelId] : undefined
                const temporary = targetLevel?.persistent === false
                if (temporary) await controller.saveIfRunning()
                // The running level stays on screen until the new one replaces it in commit.
                if (!temporary) storeForProfile(await profileId()).delete()
            } else if (current?.root.isValid && (!requestedLevelId || requestedLevelId === current.game.render().levelId)) {
                return current.root
            }
            const stored = options.forceNewGame ? null : storeForProfile(await profileId()).load()
            const save = !requestedLevelId || stored?.levelId === requestedLevelId ? stored : null
            const levelId = requestedLevelId ?? save?.levelId ?? (await menuApi.getAdventure()).levelId
            let root: Node
            try {
                root = await startLoading(save ?? undefined, levelId)
            } catch (error) {
                if (!save || !(error instanceof IncompatibleSaveError)) throw error
                // AGENTS.md: dev saves only support the current format, so a mismatched save counts as no save.
                console.warn(`[LevelController] Discarding incompatible save: ${error.message}`)
                storeForProfile(await profileId()).delete()
                return startLoading(undefined, requestedLevelId ?? (await menuApi.getAdventure()).levelId)
            }
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
            const snapshot = current?.root.isValid ? current.game.currentSnapshot : null
            if (snapshot?.phase !== 'gameplay') return 0
            return snapshot.zombies.reduce((count, zombie) => count + (
                zombie.hasHead && (zombie.state === 'walking' || zombie.state === 'eating') ? 1 : 0
            ), 0)
        },
        getLevelDefinition() {
            return current?.root.isValid ? current.level : null
        },
        debugCommand(command) {
            if (!current?.root.isValid) return debugCondition('DEBUG_NO_ACTIVE_GAME')
            const result = current.game.debugCommand(command)
            current.view.sync(current.game.render(), current.game.drainChanges(), current.game.drainEvents())
            return result
        },
        isPaused() {
            return current?.root.isValid === true && current.scene.isPaused()
        },
        canPause() {
            return current?.root.isValid === true && current.view.canOpenMenu &&
                !current.scene.isPaused() && current.game.render().result === 'playing'
        },
        cancelCursor() {
            if (!current?.root.isValid) return false
            const snapshot = current.game.render()
            if (snapshot.paused || snapshot.result !== 'playing' || snapshot.cursor.mode === 'none') return false
            current.game.command({ type: 'clearCursor' })
            current.game.update(0)
            current.view.sync(current.game.render(), current.game.drainChanges(), current.game.drainEvents())
            return true
        },
        isLevelIntro() {
            return current?.root.isValid === true && current.game.currentSnapshot?.phase === 'intro'
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
            if (!current?.root.isValid || current.level.persistent === false || current.game.render().result === 'lost') return null
            if (controller.isLevelIntro()) return null
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
