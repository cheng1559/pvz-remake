import { BlockInputEvents, Mask, Node } from 'cc'
import { LocalIntegratedGame } from './LocalIntegratedGame'
import { createLocalGameSaveV2Store } from './CocosGameSaveV2Store'
import { GAME_SAVE_V2_KEY } from './GameSaveV2Store'
import { createGameSaveV2, parseGameSaveV2, type GameSaveV2 } from './SaveCoordinator'
import { loadIntegratedGameContent } from '@/client/game/loadIntegratedGameContent'
import { Adventure11View } from '@/client/showcase/Adventure11View'
import {
    IntegratedAdventure11Showcase,
    type IntegratedAdventure11Lifecycle,
} from '@/client/showcase/IntegratedAdventure11Showcase'
import { uiNode } from '@/client/view/uiNode'
import { ProfileStore } from '@/app/persistence/ProfileStore'
import type { EnabledMod, JsonValue } from '@/shared/protocol/index'
import type { ServerSaveSnapshotV2 } from '@/server/save'
import {
    GameplaySystemMods,
    type GameplaySystemEnhancer,
    type GameplaySystemRunner,
} from '@/server/GameplaySystemMods'

export interface IntegratedAdventure11Controller {
    show(): Promise<Node>
    play(options?: { forceNewGame?: boolean }): Promise<Node>
    hide(): void
    isRunning(): boolean
    isPaused(): boolean
    pause(): void
    resume(): void
    snapshot(): Promise<GameSaveV2>
    restore(save?: unknown): Promise<Node>
    save(): Promise<GameSaveV2>
    saveIfRunning(): Promise<GameSaveV2 | null>
    deleteSave(): void
}
type ProbeGlobal = typeof globalThis & { pvzPhase4?: IntegratedAdventure11Controller }

interface RunningAdventure11 {
    root: Node
    game: LocalIntegratedGame
    view: Adventure11View
    showcase: IntegratedAdventure11Showcase
    base: EnabledMod
    createdAt?: number
}

const DEFAULT_START_OPTIONS = {
    levelId: 'pvz:adventure-1-1',
    randomSeed: 0x50565a31,
    initialMoney: 0,
    firstAdventure: true,
    mods: [] as EnabledMod[],
}

export function createIntegratedAdventure11Controller(
    parent: Node,
    lifecycle: IntegratedAdventure11Lifecycle = {},
): IntegratedAdventure11Controller {
    let current: RunningAdventure11 | null = null
    let loading: Promise<Node> | null = null
    let saving: Promise<GameSaveV2> | null = null
    let revision = 0

    const profileId = () => {
        const id = ProfileStore.getCurrentProfile()?.id
        if (!id) throw new Error('Phase 4 save requires a current player profile')
        return id
    }
    const storeForProfile = (id = profileId()) =>
        createLocalGameSaveV2Store(`${GAME_SAVE_V2_KEY}:${id}:adventure`)
    const load = async (save?: GameSaveV2): Promise<RunningAdventure11> => {
        const rollback = current?.root.isValid ? await current.showcase.snapshotPresentation() : undefined
        const root = uiNode({
            name: 'IntegratedAdventure11', parent, size: { width: 800, height: 600 },
            mask: Mask.Type.GRAPHICS_RECT,
        }).node
        root.active = save === undefined
        root.addComponent(BlockInputEvents)
        let showcase: IntegratedAdventure11Showcase | undefined
        try {
            const content = await loadIntegratedGameContent()
            const resolvedBase = content.registry.resolve('prefabs', 'pvz:adventure11')
            if (!resolvedBase) throw new Error('Loaded content does not contain pvz:adventure11')
            const base = {
                id: resolvedBase.contentId,
                version: resolvedBase.contentVersion,
                contentHash: resolvedBase.contentHash,
            }
            if (save) {
                if (save.profileId !== profileId()) throw new Error('GameSaveV2 belongs to another player profile')
                if (save.contentSet.base.id !== base.id ||
                    save.contentSet.base.version !== base.version ||
                    save.contentSet.base.contentHash !== base.contentHash) {
                    throw new Error('GameSaveV2 base content does not match the installed content')
                }
                if (!sameMods(save.contentSet.mods, content.enabledMods)) {
                    throw new Error('GameSaveV2 Mods do not match the installed gameplay Mods')
                }
            }
            if (!root.isValid) throw new Error('Phase 4 showcase was closed while loading')
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
            const playerName = ProfileStore.getCurrentProfile()?.name || 'Player'
            const view = await Adventure11View.create(root, content, playerName)
            const game = new LocalIntegratedGame(content.definitions, content.levels, systemMods)
            showcase = root.addComponent(IntegratedAdventure11Showcase)
            showcase.configure(game, view, lifecycle, save ? {
                ...DEFAULT_START_OPTIONS,
                levelId: save.levelId,
                mods: save.contentSet.mods,
                save: save.server as unknown as JsonValue,
            } : { ...DEFAULT_START_OPTIONS, mods: content.enabledMods })
            if (save) await showcase.restorePresentation(save.client)
            return { root, game, view, showcase, base, createdAt: save?.createdAt }
        } catch (error) {
            if (showcase && rollback && current?.root.isValid) {
                showcase.prepareForReplacement()
                try {
                    await current.showcase.restorePresentation(rollback)
                } catch {
                    // Preserve the original restore error; the old screen remains mounted.
                }
            }
            if (root.isValid) root.destroy()
            throw error
        }
    }
    const commit = async (save?: GameSaveV2): Promise<Node> => {
        const expectedRevision = revision
        const candidate = await load(save)
        if (revision !== expectedRevision) {
            if (candidate.root.isValid) candidate.root.destroy()
            throw new Error('Phase 4 showcase was closed while loading')
        }
        if (current?.root.isValid) {
            current.showcase.prepareForReplacement()
            current.root.destroy()
        }
        candidate.root.active = true
        current = candidate
        return candidate.root
    }
    const startLoading = (save?: GameSaveV2) => {
        const promise = commit(save).finally(() => {
            if (loading === promise) loading = null
        })
        loading = promise
        return promise
    }
    const snapshot = async (): Promise<GameSaveV2> => {
        if (loading) await loading
        if (!current?.root.isValid) throw new Error('Phase 4 showcase is not running')
        const currentProfileId = profileId()
        const server = current.game.saveAtBoundary() as unknown as ServerSaveSnapshotV2
        current.view.sync(current.game.render(), current.game.drainChanges(), current.game.drainEvents())
        const now = Date.now()
        current.createdAt ??= now
        return createGameSaveV2({
            profileId: currentProfileId,
            mode: 'adventure',
            levelId: server.levelId,
            createdAt: current.createdAt,
            updatedAt: now,
            contentSet: { base: current.base, mods: server.mods },
            server,
            client: await current.showcase.snapshotPresentation(),
        })
    }
    const save = () => saving ??= snapshot()
        .then(value => storeForProfile(value.profileId).save(value))
        .finally(() => { saving = null })
    const controller: IntegratedAdventure11Controller = {
        async show() {
            if (loading) return loading
            if (current?.root.isValid) return current.root
            return startLoading()
        },
        async play(options = {}) {
            if (loading) await loading
            if (options.forceNewGame) {
                controller.hide()
                storeForProfile().delete()
            } else if (current?.root.isValid) {
                return current.root
            }
            const save = options.forceNewGame ? null : storeForProfile().load()
            const root = await startLoading(save ?? undefined)
            if (save && current?.root.isValid) current.showcase.resume()
            return root
        },
        hide() {
            revision++
            if (current?.root.isValid) current.root.destroy()
            current = null
        },
        isRunning() {
            return current?.root.isValid === true
        },
        isPaused() {
            return current?.root.isValid === true && current.showcase.isPaused()
        },
        pause() {
            if (current?.root.isValid) current.showcase.pause()
        },
        resume() {
            if (current?.root.isValid) current.showcase.resume()
        },
        snapshot,
        async restore(value?: unknown) {
            if (loading) await loading
            const save = value === undefined ? storeForProfile().load() : parseGameSaveV2(value)
            if (!save) throw new Error('No GameSaveV2 exists for the current player profile')
            return startLoading(save)
        },
        save,
        async saveIfRunning() {
            if (loading) await loading
            if (!current?.root.isValid) return null
            return save()
        },
        deleteSave() {
            storeForProfile().delete()
        },
    }
    return controller
}

export function installIntegratedAdventure11Probe(controller: IntegratedAdventure11Controller): void {
    ;(globalThis as ProbeGlobal).pvzPhase4 = controller
}

function sameMods(left: readonly EnabledMod[], right: readonly EnabledMod[]): boolean {
    return left.length === right.length && left.every((mod, index) => {
        const other = right[index]
        return mod.id === other.id && mod.version === other.version && mod.contentHash === other.contentHash
    })
}
