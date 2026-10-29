import { _decorator, Component, director, Director, EventKeyboard, type EventTouch, game, Game, input, Input, KeyCode, Mask, Node, screen, sys } from 'cc'
import { DEBUG } from 'cc/env'
import { uiNode } from '@/client/view/uiNode'
import { initializeViewport, resetViewport } from '@/client/view/ClientViewport'
import { FpsDisplay } from '@/client/view/FpsDisplay'
import { loadKernel } from '@/shared/kernel/index'
import { loadKernelMaterial } from '@/client/render/KernelBatch'
import { gameClock } from '@/core/GameClock'
import { MusicSystem } from '@/client/music/MusicSystem'
import { UIHoverManager } from '@/client/input/UIHoverManager'
import { MenuScreen } from '@/client/screens/MenuScreen'
import { ScreenTransition } from '@/client/screens/ScreenTransition'
import { showContinueGameDialog } from '@/client/screens/ContinueGameDialog'
import { UI } from '@/client/ui/UI'
import { UIDialog } from '@/client/ui/UIDialog'
import { UIInput } from '@/client/ui/UIInput'
import { OptionsSettings } from '@/platform/OptionsSettings'
import { MENU_PAGES, type MenuAction, type MenuPageId } from '@/client/screens/MenuPages'
import {
    createLevelController,
    installLevelProbe,
    type LevelController,
} from './LevelController'
import { menuApi } from '@/client/api/MenuApi'
import { connectLocalMenuApi } from './LocalMenuApi'
import { createStoreCatalog } from '@/server/menu/StoreCatalog'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { showDebugCliDialog } from '@/client/screens/DebugCliDialog'
import { showPackageDialog } from '@/client/screens/PackageDialog'
import { executeDebugCliCommand } from '@/platform/debug/DebugCliCommands'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'
import type { DebugCliResult } from '@/shared/debug/DebugCli'
import { AdviceWidget } from '@/client/hud/advice/AdviceWidget'
import { modResources } from '@/client/content/ModResources'
import { modManager, type ModImport } from '@/client/content/ModManager'
import { selectZips, type SelectedZip } from '@/client/content/InstalledArchives'

const { ccclass } = _decorator

@ccclass('GameApp')
export class GameApp extends Component {
    private controller: LevelController | null = null
    private menu: MenuScreen | null = null
    private gameLayer: Node | null = null
    private transitions: ScreenTransition | null = null
    private currentPage: MenuPageId | null = null
    private readonly history: MenuPageId[] = []
    private loading = false
    private spacePressed = false
    private debugCliOpen = false
    private lastDebugTap = 0
    private advice: AdviceWidget | null = null
    private adviceTick = 0
    private nextLevelId: string | null = null
    private fpsDisplay: FpsDisplay | null = null

    start(): void {
        game.frameRate = Infinity
        uiNode({ node: this.node, viewport: true })
        modManager.deferPendingChanges()
        connectLocalMenuApi(sys.localStorage, () => this.controller?.getLevelDefinition() ?? null, () => this.controller?.isWon() ?? false,
            modResources.baseJson('pvz:gameplay/store').then(createStoreCatalog))
        UIHoverManager.start(this.node)
        this.gameLayer = uiNode({
            name: 'GameLayer', parent: this.node, viewport: true, active: false,
        }).node
        this.menu = uiNode({
            name: 'MenuLayer', parent: this.node, viewport: true,
            mask: Mask.Type.GRAPHICS_RECT,
        }).node.addComponent(MenuScreen)
        this.menu.onNavigate = action => this.navigate(action)
        this.menu.isLevelIntro = () => this.controller?.isLevelIntro() ?? false
        this.controller = createLevelController(this.gameLayer, {
            onMenu: () => {
                void SoundSystem.play(SoundEffect.Pause)
                return this.navigate('gameOptions')
            },
            onComplete: () => this.finish('award'),
            onGameOver: () => this.finish('gameOver'),
        })
        if (DEBUG) {
            ;(globalThis as typeof globalThis & { pvzTime?: typeof gameClock }).pvzTime = gameClock
            installLevelProbe(this.controller)
        }
        game.on(Game.EVENT_HIDE, this.save, this)
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this)
        input.on(Input.EventType.KEY_UP, this.onKeyUp, this)
        this.node.on(Input.EventType.TOUCH_START, this.onDebugTouch, this, true)
        input.on(Input.EventType.TOUCH_START, this.onDebugTouch, this)
        void OptionsSettings.start().catch(error => console.error('[Options]', error))
        this.transitions = new ScreenTransition(this.node)
        // Animations and particles draw through the kernel and its material; the kernel may compile asynchronously on the web.
        void Promise.all([loadKernel(), loadKernelMaterial()]).then(() => this.node?.isValid && this.navigate('splash'))
            .catch(error => console.error('[GameApp] Failed to load the drawing kernel', error))
        void UI.load().then(ui => {
            if (!this.node?.isValid) return
            initializeViewport()
            this.fpsDisplay = new FpsDisplay(this.node, ui)
        }).catch(error => console.error('[GameApp] Failed to initialize UI', error))
    }

    private async navigate(action: MenuAction, levelId?: string): Promise<void> {
        const { controller, menu, gameLayer, transitions } = this
        if (this.loading || !controller || !menu || !gameLayer || !transitions) return
        if (action === 'nextLevel') {
            if (!this.nextLevelId) {
                const ui = await UI.load()
                if (this.node?.isValid) ui.dialog(this.node, {
                    title: 'Next Level', message: 'The next level is not available yet.',
                    confirmText: ui.text('AWARD_MAIN_MENU_BUTTON', 'Main Menu'),
                    onClose: () => { void this.navigate('main') },
                })
                return
            }
            levelId = this.nextLevelId
        }
        const target = action === 'nextLevel' ? 'restart' : action === 'back' ? this.history[this.history.length - 1] ?? 'main' : action
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
                        if (target !== 'resume') {
                            const profile = await menuApi.getCurrentUser()
                            if (!profile) throw new Error('Could not create a player profile')
                            await controller.play({
                                forceNewGame: target === 'restart',
                                levelId,
                                onRestore: () => { restoredGame = true },
                            })
                            if (!this.node?.isValid) return
                        }
                        if (!restoredGame) controller.resume()
                        gameLayer.active = true
                        menu.hide()
                        this.currentPage = null
                        this.history.length = 0
                    }
                }
                controller.pause()
                if (from === null && target === 'pause') void SoundSystem.play(SoundEffect.Pause)
                if ((target === 'main' || target === 'pause') && controller.isRunning()) await controller.saveIfRunning()
                const page = await menu.prepare(target)
                return async () => {
                    if (target === 'main') controller.hide()
                    menu.node.active = true
                    await menu.show(page, slide ? (previous, next) => transitions.slide(previous, next, slide) : undefined)
                    if (!this.node?.isValid) return
                    if (action === 'back') this.history.pop()
                    else if (this.currentPage) this.history.push(this.currentPage)
                    if (target === 'main' || target === 'title') this.history.length = 0
                    this.currentPage = target
                    gameLayer.active = MENU_PAGES[target].overlay === true && controller.isRunning()
                }
            })
            if (restoredGame && this.node?.isValid) {
                this.loading = false
                const action = await showContinueGameDialog(this.node, await UI.load())
                if (!this.node?.isValid || !controller.isRunning()) return
                if (action === 'continue') controller.resume()
                else await this.navigate(action === 'restart' ? 'restart' : 'main')
            }
        } catch (error) {
            if (from === null && !wasPaused && controller.isRunning()) controller.resume()
            console.error('[GameApp] Navigation failed', error)
            this.showAdvice(error instanceof Error ? error.message : String(error))
        } finally {
            this.loading = false
        }
        if (target === 'main' && this.currentPage === 'main' && !await menuApi.getCurrentUser()) await this.navigate('players')
    }

    private async finish(page: 'award' | 'gameOver'): Promise<void> {
        try {
            if (this.controller?.getLevelDefinition()?.persistent === false) {
                await this.navigate('main')
                return
            }
            if (page === 'award') this.nextLevelId = (await menuApi.completeLevel()).nextLevelId
            await this.controller?.deleteSave()
            await this.navigate(page)
            if (page === 'award' && this.currentPage === page) this.controller?.hide()
        } catch (error) {
            console.error('[GameApp] Failed to finish level', error)
            this.showAdvice(error instanceof Error ? error.message : String(error))
        }
    }

    private showAdvice(message: string): void {
        void UI.load().then(ui => {
            if (!this.node?.isValid) return
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
        this.fpsDisplay?.update(GameDebugSettings.fpsVisible)
        const ticks = gameClock.delta(dt) * 100
        MusicSystem.update(ticks, { zombiesOnScreen: this.controller?.countZombiesOnScreenForMusic() ?? 0 })
        this.adviceTick += ticks
        this.advice?.update(ticks, this.adviceTick)
        if (this.advice?.node.active) this.advice.node.parent!.setSiblingIndex(this.node.children.length - 1)
    }

    private async showDebugCli(): Promise<void> {
        if (this.debugCliOpen || this.loading || !this.controller) return
        this.debugCliOpen = true
        const controller = this.controller
        const running = controller.isRunning(), wasPaused = controller.isPaused(), page = this.currentPage
        if (running && !wasPaused) controller.pause()
        const releaseClock = gameClock.pause()
        let result: DebugCliResult | null = null
        try {
            const catalog = running ? controller.debugCommand('catalog').catalog : undefined
            const ui = await UI.load()
            if (!this.node?.isValid) return
            result = await showDebugCliDialog(this.node, ui,
                command => executeDebugCliCommand(command, running, value => controller.debugCommand(value), catalog), catalog)
        } catch (error) {
            console.error('[Debug CLI]', error)
            this.showAdvice(String(error))
        } finally {
            releaseClock()
            this.debugCliOpen = false
            if (!result?.action && this.node?.isValid && running && !wasPaused && this.currentPage === page) controller.resume()
        }
        if (!this.node?.isValid || !result) return
        if (!result.ok) { this.showAdvice(result.message); return }
        switch (result.action) {
            case 'manageMods':
                this.debugCliOpen = true
                try {
                    const ui = await UI.load()
                    if (!this.node?.isValid) return
                    await (await showPackageDialog(this.node, ui, {
                        import: () => this.importPackage(),
                        save: () => controller.saveIfRunning(),
                        restart: async () => { this.restartGame() },
                    })).result
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
            case 'home': await this.navigate('main'); break
            case 'help': await this.navigate('help'); break
            case 'menu': await this.navigate(running ? 'gameOptions' : 'options'); break
            case 'shop': await this.navigate('store'); break
            case 'almanac': await this.navigate('almanac'); break
            case 'zengarden': await this.navigate('garden'); break
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
    private async importPackage(): Promise<ModImport[]> {
        const ui = await UI.load()
        let progress: UIDialog | undefined
        let files: SelectedZip[] = []
        const imports = new Map<string, ModImport>(), errors: string[] = []
        const message = (error: unknown) => error instanceof Error ? error.message : String(error)
        try {
            files = await selectZips()
            if (!files.length || !this.node?.isValid) return []
            progress = ui.dialog(this.node, {
                title: 'Importing...', footer: false, clickSound: null,
            })
            progress.onConfirm = progress.onCancel = () => {}
            // Paint the dialog before ZIP validation occupies the main thread.
            await new Promise<void>(resolve => director.once(Director.EVENT_AFTER_DRAW, () => setTimeout(resolve, 0)))
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
            title: 'Import Failed', message: errors.join('\n'), confirmText: 'OK',
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
        if (!this.currentPage && this.controller?.canPause() && event.keyCode === KeyCode.SPACE) {
            event.propagationStopped = true
            void this.navigate('pause')
            return
        }
        if ((event.keyCode === KeyCode.ENTER || event.keyCode === KeyCode.SPACE)
            && (this.currentPage === 'help' || this.currentPage === 'award')) {
            void this.navigate(this.currentPage === 'help' ? 'main' : MENU_PAGES.award.buttons[0].target)
            return
        }
        if (event.keyCode === KeyCode.ESCAPE) {
            if (!this.currentPage && this.controller?.cancelCursor()) {
                event.propagationStopped = true
                return
            }
            const action = this.currentPage ? MENU_PAGES[this.currentPage].back : this.controller?.canPause() ? 'gameOptions' : null
            if (action) void this.navigate(action)
        } else if (event.keyCode === KeyCode.KEY_R && (this.currentPage === 'award' || this.currentPage === 'gameOver')) {
            void this.navigate('restart')
        }
    }

    private onKeyUp(event: EventKeyboard): void {
        UIInput.handleKeyUp(event)
        if (event.keyCode === KeyCode.SPACE) this.spacePressed = false
    }

    private save(): void {
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
        game.off(Game.EVENT_HIDE, this.save, this)
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this)
        input.off(Input.EventType.KEY_UP, this.onKeyUp, this)
        this.node.off(Input.EventType.TOUCH_START, this.onDebugTouch, this, true)
        input.off(Input.EventType.TOUCH_START, this.onDebugTouch, this)
        OptionsSettings.stop()
    }
}
