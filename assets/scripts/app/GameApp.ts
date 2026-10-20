import { _decorator, Component, EventKeyboard, game, Game, input, Input, KeyCode, Mask, Node, sys } from 'cc'
import { DEBUG } from 'cc/env'
import { uiNode } from '@/client/view/uiNode'
import { gameClock } from '@/core/GameClock'
import { UIHoverManager } from '@/client/input/UIHoverManager'
import { installContentShowcaseProbe } from '@/client/showcase/ContentShowcase'
import { MenuScreen } from '@/client/screens/MenuScreen'
import { ScreenTransition } from '@/client/screens/ScreenTransition'
import { UI } from '@/client/ui/UI'
import { UIDialog } from '@/client/ui/UIDialog'
import type { UILabel } from '@/client/ui/UILabel'
import { OptionsSettings } from '@/platform/OptionsSettings'
import { MENU_PAGES, type MenuAction, type MenuPageId } from '@/client/screens/MenuPages'
import { installPhase0PlatformProbe } from '@/platform/phase0/PlatformProbe'
import {
    createIntegratedAdventure11Controller,
    installIntegratedAdventure11Probe,
    type IntegratedAdventure11Controller,
} from './IntegratedAdventure11Probe'
import { menuApi } from '@/client/api/MenuApi'
import { connectLocalMenuApi } from './LocalMenuApi'

const { ccclass } = _decorator

@ccclass('GameApp')
export class GameApp extends Component {
    private controller: IntegratedAdventure11Controller | null = null
    private status: UILabel | null = null
    private menu: MenuScreen | null = null
    private gameLayer: Node | null = null
    private gameControls: Node | null = null
    private transitions: ScreenTransition | null = null
    private currentPage: MenuPageId | null = null
    private readonly history: MenuPageId[] = []
    private loading = false

    start(): void {
        connectLocalMenuApi(sys.localStorage)
        UIHoverManager.start(this.node)
        this.gameLayer = uiNode({
            name: 'GameLayer', parent: this.node, size: { width: 800, height: 600 }, active: false,
        }).node
        this.menu = uiNode({
            name: 'MenuLayer', parent: this.node, size: { width: 800, height: 600 },
            mask: Mask.Type.GRAPHICS_RECT,
        }).node.addComponent(MenuScreen)
        this.menu.onNavigate = action => this.navigate(action)
        this.gameControls = uiNode({
            name: 'GameControls', parent: this.node, active: false, position: { x: -400, y: 300 },
        }).node
        this.controller = createIntegratedAdventure11Controller(this.gameLayer, {
            onComplete: () => this.finish('award'),
            onGameOver: () => this.finish('gameOver'),
        })
        if (DEBUG) {
            ;(globalThis as typeof globalThis & { pvzTime?: typeof gameClock }).pvzTime = gameClock
            installPhase0PlatformProbe()
            installContentShowcaseProbe(this.node)
            installIntegratedAdventure11Probe(this.controller)
        }
        game.on(Game.EVENT_HIDE, this.save, this)
        input.on(Input.EventType.KEY_DOWN, this.onKeyDown, this)
        void OptionsSettings.start().catch(error => console.error('[Options]', error))
        this.transitions = new ScreenTransition(this.node)
        void this.navigate('splash')
        void UI.load().then(ui => {
            if (!this.node?.isValid) return
            ui.button(this.gameControls!, { text: 'Menu (Esc)', x: 600, y: 12, onClick: () => { void this.navigate('pause') } })
            this.status = ui.label(this.node, { text: '', x: -380, y: 0, width: 760, align: 'center' })
        }).catch(error => console.error('[GameApp] Failed to initialize UI', error))
    }

    private async navigate(action: MenuAction): Promise<void> {
        const { controller, menu, gameLayer, gameControls, transitions } = this
        if (this.loading || !controller || !menu || !gameLayer || !gameControls || !transitions) return
        const target = action === 'back' ? this.history[this.history.length - 1] ?? 'main' : action
        if (target === this.currentPage) return
        if (target === 'resume' && !controller.isRunning()) return
        const from = this.currentPage
        const slide = from === 'main' && target === 'achievements' ? 'up'
            : from === 'achievements' && target === 'main' ? 'down' : null
        this.loading = true
        try {
            await transitions.run(async () => {
                if (target === 'play' || target === 'restart' || target === 'resume') {
                    return async () => {
                        if (target !== 'resume') {
                            this.showStatus('Loading Adventure 1-1...')
                            const profile = await menuApi.getCurrentUser()
                            if (!profile) throw new Error('Could not create a player profile')
                            await controller.play({ forceNewGame: target === 'restart' })
                            if (!this.node?.isValid) return
                        }
                        controller.resume()
                        gameLayer.active = true
                        gameControls.active = true
                        menu.hide()
                        this.currentPage = null
                        this.history.length = 0
                    }
                }
                controller.pause()
                if (target === 'main' && controller.isRunning()) await controller.saveIfRunning()
                const page = await menu.prepare(target)
                return async () => {
                    menu.node.active = true
                    await menu.show(page, slide ? (previous, next) => transitions.slide(previous, next, slide) : undefined)
                    if (!this.node?.isValid) return
                    if (action === 'back') this.history.pop()
                    else if (this.currentPage) this.history.push(this.currentPage)
                    if (target === 'main' || target === 'title') this.history.length = 0
                    this.currentPage = target
                    gameLayer.active = MENU_PAGES[target].overlay === true && controller.isRunning()
                    gameControls.active = false
                    if (target === 'main') controller.hide()
                }
            })
            if (this.status?.node.isValid) this.status.node.active = false
        } catch (error) {
            console.error('[GameApp] Navigation failed', error)
            this.showStatus(error instanceof Error ? error.message : String(error))
        } finally {
            this.loading = false
        }
        if (target === 'main' && this.currentPage === 'main' && !await menuApi.getCurrentUser()) await this.navigate('players')
    }

    private async finish(page: 'award' | 'gameOver'): Promise<void> {
        await this.controller?.deleteSave()
        await this.navigate(page)
        if (this.currentPage === page) this.controller?.hide()
    }

    private showStatus(message: string): void {
        if (!this.status?.node.isValid) return
        this.status.text = message
        this.status.node.active = true
    }

    private onKeyDown(event: EventKeyboard): void {
        if (this.loading) return
        if (UIDialog.handleKey(event)) return
        if ((event.keyCode === KeyCode.ENTER || event.keyCode === KeyCode.SPACE)
            && (this.currentPage === 'help' || this.currentPage === 'award')) {
            void this.navigate(this.currentPage === 'help' ? 'main' : MENU_PAGES.award.buttons[0].target)
            return
        }
        if (event.keyCode === KeyCode.ESCAPE) {
            const action = this.currentPage ? MENU_PAGES[this.currentPage].back : 'pause'
            if (action) void this.navigate(action)
        } else if (event.keyCode === KeyCode.KEY_R && (this.currentPage === 'award' || this.currentPage === 'gameOver')) {
            void this.navigate('restart')
        }
    }

    private save(): void {
        void this.controller?.saveIfRunning().catch(error => {
            console.error('[GameApp] Failed to save Adventure 1-1', error)
        })
    }

    onDestroy(): void {
        UIHoverManager.stop()
        this.transitions?.dispose()
        this.save()
        game.off(Game.EVENT_HIDE, this.save, this)
        input.off(Input.EventType.KEY_DOWN, this.onKeyDown, this)
        OptionsSettings.stop()
    }
}
