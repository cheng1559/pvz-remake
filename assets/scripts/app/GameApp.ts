import { waitForPreloadFrame } from '@/client/content/preloadTasks'
import { _decorator, Component, EventKeyboard, type EventTouch, game, Game, input, Input, KeyCode, Mask, Node, screen, sys } from 'cc'
import { DEBUG, PREVIEW } from 'cc/env'
import { uiNode } from '@/client/view/uiNode'
import { initializeViewport, resetViewport } from '@/client/view/ClientViewport'
import { FpsDisplay } from '@/client/view/FpsDisplay'
import { loadKernel } from '@/shared/kernel/index'
import { loadKernelMaterial } from '@/client/render/KernelBatch'
import { gameClock } from '@/core/GameClock'
import { MusicSystem } from '@/client/music/MusicSystem'
import { CursorManager } from '@/client/input/CursorManager'
import { OriginalResolution } from '@/client/view/OriginalResolution'
import { UIHoverManager } from '@/client/input/UIHoverManager'
import { MenuScreen } from '@/client/screens/MenuScreen'
import { ScreenTransition } from '@/client/screens/ScreenTransition'
import { showContinueGameDialog } from '@/client/dialogs/ContinueGameDialog'
import { UI } from '@/client/ui/UI'
import { UIDialog } from '@/client/ui/UIDialog'
import { UIInput } from '@/client/ui/UIInput'
import { OptionsSettings } from '@/platform/OptionsSettings'
import { LEVEL_DIALOGS, MENU_PAGES, type MenuAction, type MenuPageId, type MenuDialogId } from '@/client/screens/MenuPages'
import { showMenuDialog } from '@/client/dialogs/MenuDialog'
import {
    createLevelController,
    installLevelProbe,
    type LevelController,
} from './LevelController'
import { menuApi } from '@/client/api/MenuApi'
import { connectLocalMenuApi } from './LocalMenuApi'
import { createProfileStore } from '@/server/menu/profileStore'
import { createAlmanacCatalog } from '@/server/menu/almanacCatalog'
import { loadGameplayContent } from '@/client/game/loadIntegratedGameContent'
import { createStoreCatalog } from '@/server/menu/storeCatalog'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { showDebugCliDialog } from '@/client/dialogs/DebugCliDialog'
import { showPackageDialog } from '@/client/dialogs/PackageDialog'
import { executeDebugCliCommand } from '@/platform/debug/DebugCliCommands'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import type { DebugCliResult } from '@/shared/debug/DebugCli'
import { AdviceWidget } from '@/client/hud/advice/AdviceWidget'
import { modManager, type ModImport } from '@/client/content/ModManager'
import { selectZips, type SelectedZip } from '@/client/content/InstalledArchives'
import { provideInstalledMods } from '@/client/content/installedMods'
import { loadInstalledMods } from './ModLoader'
import { modFaults, type ModRuntimeError } from '@/shared/mod/ModHost'

const { ccclass } = _decorator
const ALMANAC_PAGES = new Set<MenuPageId>(['almanac', 'plants', 'zombies'])

@ccclass('GameApp')
export class GameApp extends Component {
    private controller: LevelController | null = null
    private menu: MenuScreen | null = null
    private gameLayer: Node | null = null
    private transitions: ScreenTransition | null = null
    private currentPage: MenuPageId | null = null
    /** The menu dialog over the page or level; navigating to a page, the board or another level closes it silently. */
    private dialog: { id: MenuDialogId, node?: Node } | null = null
    /** The dialog the almanac was opened from; closing the almanac back to the board reopens it. */
    private returnDialog: MenuDialogId | null = null
    private readonly history: MenuPageId[] = []
    private loading = false
    private spacePressed = false
    private debugCliOpen = false
    private lastDebugTap = 0
    private advice: AdviceWidget | null = null
    private adviceTick = 0
    private nextLevelId: string | null = null
    /** The award page button's target: the next level, or a page such as the almanac first (AwardScreen::StartButtonPressed). */
    private awardStart: MenuAction = 'nextLevel'
    private fpsDisplay: FpsDisplay | null = null
    private removeErrorListeners?: () => void
    private removeFocusListeners?: () => void

    private get canShowGameUI(): boolean {
        return !!this.node?.isValid && !modFaults.current
    }

    start(): void {
        game.frameRate = Infinity
        this.listenForModFaults()
        // Before anything loads content: the client reads the Mods this loads for both sides through this.
        provideInstalledMods(loadInstalledMods)
        uiNode({ node: this.node, viewport: true, mask: Mask.Type.GRAPHICS_RECT })
        // Mods load for the current player, read straight from the profile store (menu requests wait for the store
        // catalog, which is itself built from Mod content).
        modManager.useProfiles(() => createProfileStore(sys.localStorage).getCurrentProfile()?.id ?? null)
        modManager.deferPendingChanges()
        connectLocalMenuApi(sys.localStorage, () => this.controller?.getLevelDefinition() ?? null, () => this.controller?.isWon() ?? false,
            loadGameplayContent().then(({ definitions, levels }) => [createStoreCatalog(definitions), createAlmanacCatalog(definitions), definitions, levels]))
        UIHoverManager.start(this.node)
        // Load the original arrow now rather than on the first mouse move.
        CursorManager.refresh()
        OriginalResolution.refresh()
        this.gameLayer = uiNode({
            name: 'GameLayer', parent: this.node, viewport: true, active: false,
        }).node
        this.menu = uiNode({
            name: 'MenuLayer', parent: this.node, viewport: true,
        }).node.addComponent(MenuScreen)
        this.menu.onNavigate = action => this.navigate(action)
        this.menu.onOpenDialog = id => this.openDialog(id)
        this.controller = createLevelController(this.gameLayer, {
            onMenu: () => {
                void SoundSystem.play(SoundEffect.Pause)
                return this.openDialog('gameOptions')
            },
            // SeedChooserScreen: the almanac (on a preview zombie's entry) and the store open over the paused level.
            onAlmanac: zombie => this.openAlmanacFromLevel(zombie),
            onStore: () => this.navigate('store'),
            onComplete: () => this.finish('award'),
            onGameOver: () => this.finish('gameOver'),
        })
        if (PREVIEW && !Object.hasOwn(Error.prototype, 'toJSON')) {
            // The preview forwards console arguments to the editor log as JSON, where an Error would print as {}.
            Object.defineProperty(Error.prototype, 'toJSON', {
                configurable: true, writable: true,
                value(this: Error) { return { message: this.message, stack: this.stack } },
            })
        }
        if (DEBUG) {
            ;(globalThis as typeof globalThis & { pvzTime?: typeof gameClock }).pvzTime = gameClock
            installLevelProbe(this.controller)
        }
        this.listenForFocusChanges()
        // LawnApp::Shutdown saves the level when the window closes (close button, Alt+F4, Cmd+Q).
        game.on(Game.EVENT_CLOSE, this.save, this)
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this)
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this)
        this.node.on(Input.EventType.TOUCH_START, this.onDebugTouch, this, true)
        input.on(Input.EventType.TOUCH_START, this.onDebugTouch, this)
        void OptionsSettings.start().catch(error => console.error('[Options]', error))
        this.transitions = new ScreenTransition(this.node)
        // Animations and particles draw through the kernel and its material; the kernel may compile asynchronously on the web.
        void Promise.all([loadKernel(), loadKernelMaterial()]).then(() => this.node?.isValid && this.navigate('splash'))
        void UI.load().then(ui => {
            if (!this.canShowGameUI) return
            initializeViewport()
            this.fpsDisplay = new FpsDisplay(this.node, ui)
        })
    }

    private listenForFocusChanges(): void {
        const web = !sys.isNative && typeof document !== 'undefined' && typeof window !== 'undefined'
        const bridge = sys.isNative ? (globalThis as typeof globalThis & {
            jsb?: { windowFocused?: boolean, onWindowFocusChanged?: (focused: boolean) => void }
        }).jsb : undefined
        let hidden = web && document.hidden
        let focused = web ? document.hasFocus() : bridge?.windowFocused ?? true
        let active = true, savedOnLoss = false
        const sync = () => {
            // A hidden game mutes. A visible one that lost focus mutes only with auto-pause on: with it off, the game
            // goes on behind other windows and stays audible.
            SoundSystem.setFocusMuted(hidden || (!focused && GameDebugSettings.autoPauseEnabled))
            const next = focused && !hidden
            if (next === active) return
            active = next
            if (active) { savedOnLoss = false; return }
            this.spacePressed = false
            if (GameDebugSettings.autoPauseEnabled && this.canShowGameUI && !this.currentPage && !this.loading &&
                !this.dialog && !this.debugCliOpen && !UIDialog.isOpen && this.controller?.canPause('focusLoss')) {
                savedOnLoss = true
                void this.openDialog('pause', 'focusLoss')
            }
        }
        const blur = () => { focused = false; sync() }
        const focus = () => { focused = true; sync() }
        const hide = () => {
            hidden = true
            sync()
            if (!savedOnLoss) { savedOnLoss = true; this.save() }
        }
        const show = () => {
            hidden = false
            if (web) focused = document.hasFocus()
            sync()
        }
        const previous = bridge?.onWindowFocusChanged
        const nativeFocus = (value: boolean) => { focused = value; sync(); previous?.(value) }
        if (web) {
            window.addEventListener('blur', blur)
            window.addEventListener('focus', focus)
        }
        if (bridge) bridge.onWindowFocusChanged = nativeFocus
        game.on(Game.EVENT_HIDE, hide)
        game.on(Game.EVENT_SHOW, show)
        sync()
        this.removeFocusListeners = () => {
            if (web) {
                window.removeEventListener('blur', blur)
                window.removeEventListener('focus', focus)
            }
            if (bridge?.onWindowFocusChanged === nativeFocus) bridge.onWindowFocusChanged = previous
            game.off(Game.EVENT_HIDE, hide)
            game.off(Game.EVENT_SHOW, show)
            SoundSystem.setFocusMuted(false)
        }
    }

    private listenForModFaults(): void {
        modFaults.onFault = error => {
            console.error('[Mods] Game interrupted', error.original)
            this.transitions?.dispose()
            if (this.gameLayer) this.gameLayer.active = false
            void this.showModFault(error)
        }
        const error = (event: ErrorEvent) => modFaults.report(event.error ?? event.message, event.filename, true)
        const rejected = (event: PromiseRejectionEvent) => modFaults.report(event.reason, '', true)
        if (typeof window !== 'undefined') {
            window.addEventListener?.('error', error)
            window.addEventListener?.('unhandledrejection', rejected)
        }
        // V8 also passes the exception object, including a Mod resource's owner.
        const scope = globalThis as typeof globalThis & { __errorHandler?: (file: string, line: number, message: string, stack: string, error?: unknown) => void }
        const previous = scope.__errorHandler
        const nativeError: NonNullable<typeof previous> = (...args) => {
            const [file, , message, stack, error] = args
            modFaults.report(error ?? { message, stack }, file, true)
            previous?.(...args)
        }
        if (sys.isNative) scope.__errorHandler = nativeError
        this.removeErrorListeners = () => {
            if (typeof window !== 'undefined') {
                window.removeEventListener?.('error', error)
                window.removeEventListener?.('unhandledrejection', rejected)
            }
            if (scope.__errorHandler === nativeError) scope.__errorHandler = previous
            modFaults.onFault = undefined
            modFaults.current = undefined
        }
    }

    private async showModFault(error: ModRuntimeError, useLoadedLanguage = true): Promise<void> {
        const ui = await UI.recovery(useLoadedLanguage)
        if (!this.node?.isValid) return
        const layer = uiNode({ name: 'GameErrorLayer', parent: this.node, viewport: true }).node
        try { this.drawModFault(layer, ui, error) }
        catch (failure) {
            layer.destroy()
            if (useLoadedLanguage && ui.locale !== 'en-US') return this.showModFault(error, false)
            throw failure
        }
    }

    private drawModFault(layer: Node, ui: UI, error: ModRuntimeError): void {
        // The fault dialog stays underneath the manager, including when its draft is cancelled.
        let managing = false
        const manage = async (dialog: UIDialog) => {
            if (managing) return
            managing = true
            try { await this.showModManager(ui, dialog.node) }
            catch (failure) {
                if (ui.locale !== 'en-US' && layer.isValid) {
                    layer.destroy()
                    await this.showModFault(error, false)
                    return
                }
                await ui.dialog(dialog.node, { title: ui.text('ERROR_HEADER'), message: String(failure) }).result
            } finally { managing = false }
        }
        const message = error.message.split(/[\r\n]/, 1)[0].slice(0, 160)
        const dialog = ui.dialog(layer, {
            title: ui.text('MOD_RUNTIME_ERROR_HEADER'),
            extraWidth: 160,
            message: ui.format('MOD_RUNTIME_ERROR_BODY', [message]).replace(/\n{2,}/g, '\n'),
            buttons: [
                { text: ui.text('MOD_RUNTIME_MANAGE'), onClick: dialog => { void manage(dialog) } },
                { text: ui.text('MOD_RUNTIME_EXIT'), onClick: () => game.end() },
            ],
        })
        dialog.onConfirm = () => { void manage(dialog) }
        dialog.onCancel = () => {}
    }

    /**
     * SeedChooserScreen::MouseDown: AlmanacDialog::ShowZombie opens the zombie list on the clicked preview zombie. The
     * chooser's Almanac (SeedChooserScreen::ButtonDepress) waits on the dialog without pausing the board's music, so
     * the level pauses but its music plays on.
     */
    private async openAlmanacFromLevel(zombieId?: string): Promise<void> {
        if (zombieId === undefined) return this.navigate('almanac', undefined, { keepMusic: true })
        const zombie = (await menuApi.getAlmanac()).zombies.find(entry => entry.zombie === zombieId)
        if (!zombie || !this.menu) return
        this.menu.presetAlmanac({ plant: 0, zombie: zombie.place })
        return this.navigate('zombies', undefined, { keepMusic: true })
    }

    /** `keepMusic`: a page opened over the level leaves its music playing while the board waits. */
    private async navigate(action: MenuAction, levelId?: string, { keepMusic = false }: { keepMusic?: boolean } = {}): Promise<void> {
        const { controller, menu, gameLayer, transitions } = this
        if (modFaults.current || this.loading || !controller || !menu || !gameLayer || !transitions) return
        // AwardScreen::StartButtonPressed: closing an almanac opened from the award page continues to the next level.
        if (action === 'back' && this.currentPage && ALMANAC_PAGES.has(this.currentPage) && this.history.at(-1) === 'award') action = 'nextLevel'
        const adventureComplete = this.nextLevelId === null && (action === 'nextLevel' || action === 'main' && this.currentPage === 'award')
        if (adventureComplete) action = 'main'
        else if (action === 'nextLevel') levelId = this.nextLevelId!
        // Anything else replaces the dialog: a page, the board (resume) or another level.
        this.closeDialog()
        // Pages opened from a running level (debug CLI) have no history and go back to the level.
        const previous = this.history[this.history.length - 1] ?? (controller.isRunning() ? 'resume' : 'main')
        const target = action === 'nextLevel' ? 'restart' : action === 'back' ? previous : action
        // Leaving the almanac for the board brings back the options it was opened from; going anywhere else forgets them.
        const reopen = target === 'resume' ? this.returnDialog : null
        if (!ALMANAC_PAGES.has(target as MenuPageId)) this.returnDialog = null
        // Back to the board from a dialog over it: the level only needs to resume.
        if (target === 'resume' && this.currentPage === null) {
            if (controller.isRunning()) controller.resume()
            return
        }
        if (target === this.currentPage) return
        if (target === 'resume' && !controller.isRunning()) return
        const from = this.currentPage
        const wasPaused = controller.isPaused()
        let restoredGame = false
        const slide = from === 'main' && target === 'achievements' ? 'up'
            : from === 'achievements' && target === 'main' ? 'down' : null
        this.loading = true
        try {
            await transitions.run(async () => {
                if (target === 'play' || target === 'restart' || target === 'resume') {
                    return async () => {
                        if (target === 'resume') {
                            // A page over the level (the store) may have changed the purse it plays with.
                            await controller.syncPurse()
                        } else {
                            const profile = await menuApi.getCurrentUser()
                            if (!profile) throw new Error('Could not create a player profile')
                            await controller.play({
                                forceNewGame: target === 'restart',
                                levelId,
                                onRestore: () => { restoredGame = true },
                            })
                        }
                        if (!this.canShowGameUI) return
                        if (!restoredGame && !reopen) controller.resume()
                        gameLayer.active = true
                        menu.hide()
                        this.currentPage = null
                        this.history.length = 0
                    }
                }
                controller.pause(false, keepMusic)
                if (target === 'main' && controller.isRunning()) await controller.saveIfRunning()
                const page = await menu.prepare(target)
                return async () => {
                    if (target === 'main') controller.hide()
                    menu.node.active = true
                    // AlmanacDialog: its music unless the board is paused; one opened from the seed chooser leaves it playing.
                    await menu.show(page, slide ? (previous, next) => transitions.slide(previous, next, slide) : undefined,
                        !controller.isRunning() || keepMusic)
                    if (!this.canShowGameUI) return
                    if (action === 'back') this.history.pop()
                    // The almanac index, plants and zombies pages count as one page, so Close leaves all of them.
                    else if (this.currentPage && !(ALMANAC_PAGES.has(this.currentPage) && ALMANAC_PAGES.has(target))) this.history.push(this.currentPage)
                    if (target === 'main' || target === 'title') this.history.length = 0
                    this.currentPage = target
                    gameLayer.active = false
                    if (target === 'main') {
                        // A start without Mods says so; otherwise each Mod that failed to load is named once, one per line.
                        if (modManager.finishStartup()) void this.showModNotice('MODS_STARTUP_FAILED_HEADER', 'MODS_STARTUP_FAILED_BODY')
                        else {
                            const failed = modManager.takeUnreportedFailures()
                            if (failed.length) void this.showModNotice('MODS_LOAD_FAILED_HEADER', 'MODS_LOAD_FAILED_BODY', failed.join('\n'))
                        }
                    }
                }
            })
            if (!this.canShowGameUI) return
            if (restoredGame || (adventureComplete && this.currentPage === 'main')) {
                const ui = await UI.load()
                if (!this.canShowGameUI) return
                if (restoredGame) {
                    this.loading = false
                    const action = await showContinueGameDialog(this.node, ui)
                    if (!this.canShowGameUI || !controller.isRunning()) return
                    if (action === 'continue') controller.resume()
                    else await this.navigate(action === 'restart' ? 'restart' : 'main')
                } else ui.dialog(this.node, {
                    width: 500, height: 300,
                    title: ui.text('ADVENTURE_THANKS_HEADER'), message: ui.text('ADVENTURE_THANKS_BODY'),
                    buttons: [
                        { text: 'GitHub', onClick: () => sys.openURL('https://github.com/cheng1559/pvz-remake') },
                        { text: ui.text('DIALOG_BUTTON_OK'), onClick: dialog => dialog.onConfirm() },
                    ],
                })
            }
        } catch (error) {
            if (modFaults.report(error, '', target === 'splash' || target === 'title' || target === 'award')) return
            if (from === null && !wasPaused && controller.isRunning()) controller.resume()
            console.error('[GameApp] Navigation failed', error)
            this.showAdvice(error instanceof Error ? error.message : String(error))
        } finally {
            this.loading = false
        }
        if (reopen && controller.isRunning() && this.currentPage === null) {
            await this.openDialog(reopen)
            // The board stayed paused for the options; if they failed to open, it goes on.
            if (!this.dialog && controller.isRunning() && this.currentPage === null) controller.resume()
        }
        if (target === 'main') await this.requirePlayer()
    }

    /**
     * GameSelector: an opened main menu without a player keeps asking for one; once the create-user dialog closes with
     * one (SELECTOR_NEW_USER), the sign drops.
     */
    private async requirePlayer(): Promise<void> {
        if (this.currentPage !== 'main' || this.dialog || !this.menu?.mainMenuOpened()) return
        if (await menuApi.getCurrentUser()) this.menu.showPlayerSign()
        else await this.openDialog('players')
    }

    /**
     * Opens a menu dialog over the current page or level, which stays mounted and, for a level, paused. One is open at
     * a time: while it is, the board and the page under it take no input.
     */
    private async openDialog(id: MenuDialogId, reason?: 'focusLoss'): Promise<void> {
        const { controller } = this
        if (modFaults.current || !controller || this.dialog || this.loading) return
        const inLevel = LEVEL_DIALOGS.includes(id)
        if (inLevel && !controller.isRunning()) return
        const wasPaused = controller.isPaused()
        if (inLevel) controller.pause()
        if (id === 'pause' && reason !== 'focusLoss' && this.currentPage === null) void SoundSystem.play(SoundEffect.Pause)
        const levelIntro = controller.isLevelIntro()
        const entry: NonNullable<GameApp['dialog']> = { id }
        this.dialog = entry
        this.loading = true
        try {
            if (id === 'pause' && controller.isRunning()) await controller.saveIfRunning()
            // LawnApp::CanShowAlmanac: only the in-game options offer it (OptionsDialog hides it during the intro).
            const almanac = id === 'gameOptions' && (await menuApi.getCurrentUser())?.unlocks.almanac === true
            const ui = await UI.load()
            if (!this.canShowGameUI || this.dialog !== entry) return
            entry.node = (await showMenuDialog(this.node, ui, id, {
                levelIntro, almanac,
                manageMods: () => this.manageMods(),
                profileChanged: () => this.menu?.refreshProfile(),
                restartGame: () => this.restartGame(),
                act: action => {
                    if (this.dialog !== entry) return
                    this.dialog = null
                    if (action === 'almanac') {
                        // NewOptionsDialog_Almanac: the almanac returns to these options.
                        this.returnDialog = id
                        void this.navigate('almanac')
                    } else if (action !== 'back') void this.navigate(action)
                    else if (id === 'players') void this.requirePlayer()
                },
            })).node
        } catch (error) {
            if (this.dialog === entry) this.dialog = null
            if (modFaults.report(error)) return
            if (inLevel && !wasPaused && controller.isRunning() && this.currentPage === null) controller.resume()
            console.error('[GameApp] Failed to open a menu dialog', error)
            this.showAdvice(error instanceof Error ? error.message : String(error))
        } finally {
            this.loading = false
        }
    }

    /**
     * The main menu's options' Mods button: the Mod manager over the options, which stay the open menu dialog under it
     * and are back as they were once it closes.
     */
    private async manageMods(): Promise<void> {
        try {
            await this.showModManager()
        } catch (error) {
            console.error('[Packages]', error)
            this.showAdvice(String(error))
        }
    }

    /** The Mod manager, from `/mod` or the main menu's options. */
    private async showModManager(assets?: UI, parent = this.node): Promise<void> {
        const ui = assets ?? await UI.load()
        if (!parent?.isValid || (!assets && modFaults.current)) return
        await (await showPackageDialog(parent, ui, {
            fault: modFaults.current,
            import: () => this.importPackage(ui),
            save: async () => { if (!modFaults.current) await this.controller?.saveIfRunning() },
            restart: async () => {
                if (modFaults.current) modManager.finishStartup()
                this.restartGame()
            },
        })).result
    }

    /** Removes the menu dialog without acting on it. */
    private closeDialog(): void {
        const entry = this.dialog
        this.dialog = null
        if (entry?.node?.isValid) entry.node.destroy()
    }

    private async finish(page: 'award' | 'gameOver'): Promise<void> {
        if (modFaults.current) return
        if (this.controller?.getLevelDefinition()?.persistent === false) {
            await this.navigate('main')
            return
        }
        if (page === 'award') {
            const award = await menuApi.completeLevel()
            this.nextLevelId = award.nextLevelId
            this.awardStart = award.opens?.page ?? 'nextLevel'
        }
        await this.controller?.deleteSave()
        if (page === 'gameOver') await this.openDialog('gameOver')
        else {
            await this.navigate('award')
            if (this.currentPage === 'award') this.controller?.hide()
        }
    }

    private showAdvice(message: string): void {
        if (modFaults.current) return
        void UI.load().then(ui => {
            if (!this.canShowGameUI) return
            if (!this.advice?.node.isValid) {
                const layer = uiNode({
                    name: 'GlobalAdviceLayer', parent: this.node, size: { width: 800, height: 600 },
                    position: { x: -400, y: 300 }, anchor: { x: 0, y: 1 },
                }).node
                this.advice = new AdviceWidget({ ui, parent: layer, font: ui.assets.fonts.pageTitle })
            }
            this.advice.node.parent!.setSiblingIndex(this.node.children.length - 1)
            this.advice.show(message, 'hint')
        }).catch(error => console.error('[GameApp] Failed to show advice', error))
    }

    update(dt: number): void {
        if (modFaults.current) return
        this.fpsDisplay?.update(GameDebugSettings.fpsVisible)
        const ticks = gameClock.delta(dt) * 100
        MusicSystem.update(ticks, { zombiesOnScreen: this.controller?.countZombiesOnScreenForMusic() ?? 0 })
        this.adviceTick += ticks
        this.advice?.update(ticks, this.adviceTick)
        if (this.advice?.node.active) this.advice.node.parent!.setSiblingIndex(this.node.children.length - 1)
    }

    private async showDebugCli(): Promise<void> {
        if (modFaults.current || this.debugCliOpen || this.loading || !this.controller) return
        this.debugCliOpen = true
        const controller = this.controller
        const running = controller.isRunning(), wasPaused = controller.isPaused(), page = this.currentPage
        // The CLI is not the game's own pause, so it leaves the coin bank hidden.
        if (running && !wasPaused) controller.pause(true)
        const releaseClock = gameClock.pause()
        let result: DebugCliResult | null = null
        let ui: UI
        try {
            const catalog = running ? controller.debugCommand('catalog').catalog : undefined
            ui = await UI.load()
            if (!this.canShowGameUI) return
            result = await showDebugCliDialog(this.node, ui,
                command => executeDebugCliCommand(command, running, value => controller.debugCommand(value), catalog), catalog)
        } catch (error) {
            if (modFaults.report(error)) return
            console.error('[Debug CLI]', error)
            this.showAdvice(String(error))
            return
        } finally {
            releaseClock()
            this.debugCliOpen = false
            if (!result?.action && this.node?.isValid && running && !wasPaused && this.currentPage === page) controller.resume()
        }
        if (!this.canShowGameUI || !result) return
        if (!result.ok) { this.showAdvice('key' in result ? ui.format(result.key, result.args) : result.message); return }
        if (result.advice) {
            this.showAdvice(ui.format(result.advice.key, result.advice.args?.map(arg => ui.text(arg))))
        }
        switch (result.action) {
            case 'manageMods':
                this.debugCliOpen = true
                try {
                    await this.showModManager()
                } catch (error) {
                    console.error('[Packages]', error)
                    this.showAdvice(String(error))
                } finally {
                    this.debugCliOpen = false
                    if (this.node?.isValid && running && !wasPaused && controller.isRunning() && this.currentPage === page) controller.resume()
                }
                break
            case 'restart': await this.navigate('restart'); break
            case 'level': await this.navigate('restart', result.levelId); break
            case 'goto': await this.navigate(result.page!); break
            case 'reload':
                await controller.saveIfRunning()
                controller.hide()
                this.menu?.hide()
                if (this.gameLayer) this.gameLayer.active = false
                this.currentPage = null
                this.history.length = 0
                this.spacePressed = false
                this.advice?.clear()
                await this.navigate('splash')
                break
            case 'quit': await controller.saveIfRunning(); game.end(); break
        }
    }

    /** Validate selected ZIPs sequentially; the dialog keeps them in its draft until Apply. */
    /** A Mod notice on the main menu; `%s` in the body takes `detail`. */
    private async showModNotice(header: string, body: string, detail = ''): Promise<void> {
        const ui = await UI.load()
        if (!this.canShowGameUI) return
        await ui.dialog(this.node, {
            title: ui.text(header), message: ui.text(body).replace('%s', detail), confirmText: ui.text('DIALOG_BUTTON_OK'),
        }).result
    }

    private async importPackage(ui: UI): Promise<ModImport[]> {
        let progress: UIDialog | undefined
        let files: SelectedZip[] = []
        const imports = new Map<string, ModImport>(), errors: string[] = []
        const message = (error: unknown) => error instanceof Error ? error.message : String(error)
        try {
            files = await selectZips()
            if (!files.length || !this.node?.isValid) return []
            progress = ui.dialog(this.node, {
                title: ui.text('PACKAGE_IMPORTING'), footer: false, clickSound: null,
            })
            progress.onConfirm = progress.onCancel = () => {}
            // Paint the dialog before ZIP validation occupies the main thread.
            await waitForPreloadFrame()
            for (const file of files) {
                if (!this.node?.isValid) break
                try {
                    const mod = await modManager.prepareImport(await file.read())
                    const previous = imports.get(mod.id)
                    if (previous) await modManager.discardImports([previous])
                    imports.set(mod.id, mod)
                } catch (error) { errors.push(`${file.name}: ${message(error)}`) }
            }
        } catch (error) {
            errors.push(message(error))
        } finally {
            progress?.close()
            for (const file of files) file.dispose?.()
        }
        if (errors.length && this.node?.isValid) await ui.dialog(this.node, {
            title: ui.text('PACKAGE_IMPORT_FAILED'), message: errors.join('\n'), confirmText: ui.text('DIALOG_BUTTON_OK'),
        }).result
        return [...imports.values()]
    }

    private restartGame(): void {
        if (sys.isNative) sys.restartVM()
        else window.location.reload()
    }

    private onDebugTouch(event: EventTouch): void {
        if ((!sys.isMobile && !GameDebugSettings.isMobileMode()) || this.debugCliOpen) return
        const p = event.getLocation(), corner = 100 * screen.devicePixelRatio
        if (p.x < screen.windowSize.width - corner || p.y > corner) { this.lastDebugTap = 0; return }
        const now = Date.now()
        if (this.lastDebugTap && now - this.lastDebugTap <= 350) {
            this.lastDebugTap = 0
            event.propagationStopped = true
            void this.showDebugCli()
        } else this.lastDebugTap = now
    }

    private onKeyDown(event: EventKeyboard): void {
        if (modFaults.current) { UIDialog.handleKey(event); return }
        if (event.keyCode === KeyCode.SPACE) {
            if (this.spacePressed) return
            this.spacePressed = true
        }
        if (this.loading) return
        if (event.keyCode === 191 && !UIInput.hasFocusedInput) {
            event.propagationStopped = true
            void this.showDebugCli()
            return
        }
        if (UIDialog.handleKey(event)) return
        // Board::KeyDown hands Space to the cutscene during SCENE_LEVEL_INTRO (seed chooser included); only play pauses.
        // A repick's chooser is the intro's again, so Space leaves it alone too; Escape and the menu button still open the menu.
        if (!this.currentPage && !this.dialog && this.controller?.canPause() && !this.controller.isLevelIntro() && !this.controller.isRepicking()
            && event.keyCode === KeyCode.SPACE) {
            event.propagationStopped = true
            void this.openDialog('pause')
            return
        }
        if ((event.keyCode === KeyCode.ENTER || event.keyCode === KeyCode.SPACE)
            && (this.currentPage === 'help' || this.currentPage === 'award')) {
            void this.navigate(this.currentPage === 'help' ? 'main' : this.awardStart)
            return
        }
        // An open dialog takes its own keys (UIDialog.handleKey above).
        if (this.dialog) return
        if (event.keyCode === KeyCode.ESCAPE) {
            if (!this.currentPage && this.controller?.cancelCursor()) {
                event.propagationStopped = true
                return
            }
            if (this.currentPage) {
                const back = MENU_PAGES[this.currentPage].back
                if (back) void this.navigate(back)
            } else if (this.controller?.canPause()) void this.openDialog('gameOptions')
        } else if (event.keyCode === KeyCode.KEY_R && this.currentPage === 'award') {
            void this.navigate('restart')
        }
    }

    private onKeyUp(event: EventKeyboard): void {
        UIInput.handleKeyUp(event)
        if (event.keyCode === KeyCode.SPACE) this.spacePressed = false
    }

    private save(): void {
        if (modFaults.current) return
        this.fpsDisplay?.reset()
        this.spacePressed = false
        void this.controller?.saveIfRunning().catch(error => {
            console.error('[GameApp] Failed to save level', error)
        })
    }

    onDestroy(): void {
        this.fpsDisplay?.dispose()
        this.fpsDisplay = null
        resetViewport()
        UIHoverManager.stop()
        this.transitions?.dispose()
        this.save()
        this.removeErrorListeners?.()
        this.removeFocusListeners?.()
        game.off(Game.EVENT_CLOSE, this.save, this)
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this)
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this)
        this.node.off(Input.EventType.TOUCH_START, this.onDebugTouch, this, true)
        input.off(Input.EventType.TOUCH_START, this.onDebugTouch, this)
        OptionsSettings.stop()
    }
}
