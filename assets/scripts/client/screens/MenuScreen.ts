import { _decorator, BlockInputEvents, Color, Component, director, Director, game, isValid, Node, Sprite } from 'cc'
import { DEBUG } from 'cc/env'
import { preloadAssets } from '@/client/content/PreloadAssets'
import { waitForPreloadFrame } from '@/client/content/preloadTasks'
import { SpriteLoader } from '@/core/SpriteLoader'
import { uiNode } from '@/client/view/uiNode'
import { UI, type UIButtonOptions } from '@/client/ui/UI'
import { MENU_PAGES, type MenuAction, type MenuPageId } from './MenuPages'
import { showOptionsDialog } from './OptionsDialog'
import { MainMenuScreen } from './MainMenuScreen'
import { PageFade } from './PageFade'
import { MusicSystem } from '@/client/music/MusicSystem'
import { SoundEffect, SoundLoader } from '@/client/sound/LegacySoundSystem'
import { UIHoverManager } from '@/client/input/UIHoverManager'
import { showChallengeScreen } from './ChallengeScreen'
import { showMenuPageControls } from './MenuPageControls'
import { StartupScreen } from './StartupScreen'
import { showUserDialog } from './UserDialog'
import { showAlmanacScreen, type AlmanacSelection } from './AlmanacScreen'
import { StoreScreen } from './StoreScreen'
import { AchievementScreen } from './AchievementScreen'
import { showAwardScreen } from './AwardScreen'
import { loadDisplayParts, loadEntityDisplayAssets } from '@/client/reanim/EntityDisplay'
import { showScreenAnimations } from './ScreenAnimations'

const { ccclass } = _decorator

export interface PreparedMenuPage {
    id: MenuPageId
    root: Node
    retainPrevious?: boolean
    enter?: () => void
}

@ccclass('MenuScreen')
export class MenuScreen extends Component {
    onNavigate: (action: MenuAction) => void | Promise<void> = () => {}
    private page: PreparedMenuPage | null = null
    private retainedPage: PreparedMenuPage | null = null
    private mainMenu: MainMenuScreen | null = null
    private mainPreparation: Promise<PreparedMenuPage> | null = null
    private achievementPreparation: Promise<PreparedMenuPage> | null = null
    private almanacSelection: AlmanacSelection = { plant: 0, zombie: 0 }

    async prepare(id: MenuPageId): Promise<PreparedMenuPage> {
        if (id === 'achievements') {
            const page = await this.prepareAchievements()
            await page.root.getComponentInChildren(AchievementScreen)!.refresh()
            page.root.setPosition(0, 0)
            page.root.setSiblingIndex(this.node.children.length - 1)
            return page
        }
        if (this.retainedPage?.id === id && this.retainedPage.root.isValid) return this.retainedPage
        if (id === 'main') {
            return this.prepareMain()
        }
        if (id === 'splash' || id === 'title') {
            const root = uiNode({ name: 'Startup', parent: this.node, viewport: true, active: false }).node
            const startup = root.addComponent(StartupScreen)
            startup.onStart = () => { void this.onNavigate('main') }
            try {
                await startup.initialize(id === 'splash', async progress => {
                    if (!DEBUG) await preloadAssets(value => progress(value * 0.95))
                    await waitForPreloadFrame()
                    await this.prepareMain(value => progress(DEBUG ? value * 0.9 : 0.95 + value * 0.04))
                    await waitForPreloadFrame()
                    const achievements = await this.prepareAchievements(true)
                    // Initialize components and render data behind the loading screen once.
                    achievements.root.setSiblingIndex(0)
                    achievements.root.active = true
                    await new Promise<void>(resolve => director.once(Director.EVENT_AFTER_DRAW, resolve))
                    achievements.root.active = false
                    progress(1)
                })
            } catch (error) {
                root.destroy()
                throw error
            }
            return { id, root, enter: () => startup.show() }
        }
        return this.createPage(id)
    }

    private async createPage(id: MenuPageId, prewarm = false): Promise<PreparedMenuPage> {
        let paperAward = false
        const page = MENU_PAGES[id]
        const optionsPage = id === 'options' || id === 'gameOptions'
        const overMain = !!this.mainMenu?.node.isValid && (id === 'options' || id === 'players' || id === 'quit')
        const backgrounds = page.backgrounds.filter(background =>
            !(optionsPage && background.image === 'options_menuback')
            && !(overMain && MENU_PAGES.main.backgrounds.some(main => main.image === background.image)),
        )
        const [ui, frames] = await Promise.all([UI.load(), Promise.all(backgrounds.map(async background => {
            const frame = await SpriteLoader.load(background.image)
            if (!frame) throw new Error(`Missing menu background: ${background.image}`)
            return frame
        }))])
        if (!this.node?.isValid) throw new Error('Menu was destroyed while loading')
        const root = uiNode({
            name: id, parent: this.node, viewport: true, active: false,
            graphics: !optionsPage && id !== 'pause' && id !== 'gameOver' && !overMain,
        })
        if (prewarm) {
            // Initialize and draw new components incrementally behind the loading page.
            root.node.setSiblingIndex(0)
            root.node.active = true
        }
        if (page.retainPrevious) root.node.addComponent(BlockInputEvents)
        if (root.graphics) {
            const draw = () => {
                const { width, height } = root.transform.contentSize
                root.graphics!.clear()
                root.graphics!.fillColor = new Color(0, 0, 0, page.overlay ? 160 : 255)
                root.graphics!.fillRect(-width / 2, -height / 2, width, height)
            }
            root.node.on(Node.EventType.SIZE_CHANGED, draw)
            draw()
        }
        backgrounds.forEach((background, index) => {
            const frame = frames[index]
            uiNode({
                name: background.image, parent: root.node,
                position: { x: (background.x ?? 0) - 400, y: 300 - (background.y ?? 0) },
                anchor: { x: 0, y: 1 },
                size: { width: background.width ?? frame.originalSize.width, height: background.height ?? frame.originalSize.height },
                sprite: { frame, sizeMode: Sprite.SizeMode.CUSTOM, trim: false },
            })
        })
        const animations = ui.assets.presentation.screens?.[`pvz:${id}`]
        if (animations?.length) {
            try { await showScreenAnimations(root.node, animations) }
            catch (error) { root.node.destroy(); throw error }
        }
        if (optionsPage) {
            const inGame = id !== 'options'
            await showOptionsDialog(root.node, ui, {
                inGame,
                onClose: () => this.onNavigate(inGame ? 'resume' : 'back'),
                onRestart: () => this.onNavigate('restart'),
                onMainMenu: () => this.onNavigate('main'),
            })
        } else if (id === 'gameOver') {
            const dialog = ui.dialog(root.node, {
                title: ui.text('GAME_OVER'), contentInsetTopExtra: 15,
                confirmText: ui.text('TRY_AGAIN'),
                onClose: retry => { void this.onNavigate(retry ? 'restart' : 'main') },
            })
            const mainMenu = ui.button(dialog.node, {
                text: ui.text('MAIN_MENU_BUTTON'), x: 235, y: -310, width: 163, height: 46,
                onClick: () => dialog.close(false),
            })
            mainMenu.canInteract = () => !dialog.isDragging
        } else if (id === 'pause') {
            const dialog = ui.dialog(root.node, {
                title: ui.text('GAME_PAUSED'), message: ui.text('CLICK_TO_RESUME'),
                confirmText: ui.text('RESUME_GAME'), spaceAfterHeader: 155, extraHeight: 10,
                clickSound: null,
                onClose: () => { void this.onNavigate('resume') },
            })
            // Original widget (72, 42) + reanim (72, 42) + dialog header (0, 45).
            const zombie = uiNode({
                name: 'NewspaperZombie', parent: dialog.content, position: { x: 144, y: -129 }, active: false,
            }).node
            void loadEntityDisplayAssets().then(async ({ content, catalog }) => {
                if (!isValid(zombie, true)) return
                const parts = catalog.zombies[5].parts
                const players = await loadDisplayParts(zombie, parts, content)
                if (!players) return
                for (const part of parts) players.get(part.name)!.play({ loop: true, rate: 12 / part.fps })
                zombie.active = true
            }).catch(error => {
                if (isValid(zombie, true)) console.error('[PauseDialog] Failed to load newspaper zombie', error)
            })
        } else {
            const controls = uiNode({
                name: 'Controls', parent: root.node, position: { x: -400, y: 300 }, anchor: { x: 0, y: 1 },
            }).node
            if (page.heading && id !== 'award') {
                const { key, font, y, color } = page.heading
                ui.label(controls, {
                    text: ui.text(key, page.title), font, x: 400, y, color: new Color(...color),
                    baseline: true, align: 'center',
                })
            }
            const navigateButton = (target: MenuAction, options: UIButtonOptions) => ui.button(controls, {
                ...options, onClick: () => this.onNavigate(target),
            })
            if (id === 'players') {
                await showUserDialog(root.node, ui, () => { void this.onNavigate('main') }, () => this.mainMenu?.refreshProfile())
            } else if (id === 'quit') {
                ui.dialog(root.node, {
                    title: ui.text('QUIT_HEADER'), message: ui.text('QUIT_MESSAGE'),
                    confirmText: ui.text('QUIT_BUTTON'), cancelText: ui.text('DIALOG_BUTTON_CANCEL'),
                    onClose: confirmed => {
                        void this.onNavigate('main')
                        if (confirmed) game.end()
                    },
                })
            } else if (id === 'minigames' || id === 'puzzle' || id === 'survival') {
                try {
                    await showChallengeScreen(controls, ui, id, () => { void this.onNavigate('main') })
                } catch (error) {
                    root.node.destroy()
                    throw error
                }
            } else if (id === 'achievements') {
                try {
                    await controls.addComponent(AchievementScreen).initialize(ui, () => { void this.onNavigate('main') })
                } catch (error) { root.node.destroy(); throw error }
            } else if (id === 'help') {
                navigateButton('main', { skin: 'seed', text: 'Main Menu', x: 324, y: 520, rightClickTriggers: false })
            } else if (id === 'almanac' || id === 'plants' || id === 'zombies') {
                try {
                    if (!this.page || !['almanac', 'plants', 'zombies'].includes(this.page.id)) this.almanacSelection = { plant: 0, zombie: 0 }
                    await showAlmanacScreen(controls, ui, id, action => { void this.onNavigate(action) }, this.almanacSelection)
                } catch (error) { root.node.destroy(); throw error }
            } else if (id === 'store') {
                try {
                    const fromGarden = this.page && ['garden', 'mushroom', 'aquarium', 'tree'].includes(this.page.id)
                    await controls.addComponent(StoreScreen).initialize(ui, action => { void this.onNavigate(action) }, ui.text(fromGarden ? 'STORE_BACK_TO_GAME' : 'STORE_MAIN_MENU_BUTTON'))
                } catch (error) { root.node.destroy(); throw error }
            } else if (id === 'award') {
                try {
                    const award = await showAwardScreen(controls, ui)
                    paperAward = award.kind === 'note'
                    navigateButton('nextLevel', {
                        skin: 'seed', text: ui.text('NEXT_LEVEL_BUTTON', 'NEXT LEVEL!'), x: 324, y: paperAward ? 520 : 500,
                        pressOffset: [0, 0], rightClickTriggers: false,
                    })
                    if (award.showMainMenu) navigateButton('main', {
                        skin: 'seedSmall', text: ui.text('AWARD_MAIN_MENU_BUTTON', 'Main Menu'), x: 677, y: 16,
                        rightClickTriggers: false,
                    })
                } catch (error) { root.node.destroy(); throw error }
            } else if (!await showMenuPageControls(controls, ui, id, action => { void this.onNavigate(action) }).catch(error => {
                root.node.destroy()
                throw error
            })) {
                const buttons = [...page.buttons]
                if (page.back) buttons.push({ label: page.back === 'resume' ? 'Resume' : 'Back', target: page.back })
                const rows = Math.ceil(buttons.length / 4)
                buttons.forEach((button, index) => {
                    const count = Math.min(4, buttons.length - Math.floor(index / 4) * 4)
                    const x = (index % 4 - (count - 1) / 2) * 190
                    const y = -258 + (rows - 1 - Math.floor(index / 4)) * 44
                    navigateButton(button.target, {
                        text: button.label, x: x + 310, y: 282 - y, width: 180, height: 36,
                    })
                })
            }
        }
        if (id === 'help' || id === 'award') PageFade.create(root.node, id === 'help' || paperAward ? Color.BLACK : Color.WHITE)
        return {
            id, root: root.node, retainPrevious: page.retainPrevious,
            enter: id === 'help' || paperAward ? () => {
                MusicSystem.stop()
                void SoundLoader.play(SoundEffect.Paper)
            } : undefined,
        }
    }

    async show(page: PreparedMenuPage, animate?: (previous: Node, next: Node) => Promise<void>): Promise<void> {
        page.root.active = true
        const music = MENU_PAGES[page.id].music
        if (music) void MusicSystem.playTune(music)
        page.enter?.()
        if (animate && this.page?.root.isValid && this.page.root !== page.root) await animate(this.page.root, page.root)
        if (this.node?.isValid) this.replacePage(page)
    }

    hide(): void {
        if (this.page) UIHoverManager.endModalBlock(this.page.root)
        this.destroyPage(this.page)
        if (this.retainedPage !== this.page) this.destroyPage(this.retainedPage)
        if (this.mainMenu?.node.isValid) this.destroyPage({ id: 'main', root: this.mainMenu.node })
        this.page = this.retainedPage = null
        this.node.active = false
    }

    private replacePage(page: PreparedMenuPage): void {
        const previous = this.page
        if (this.retainedPage?.root === page.root) this.retainedPage = null
        else if (page.retainPrevious) this.retainedPage ??= previous
        else {
            if (this.retainedPage !== previous) this.destroyPage(this.retainedPage)
            this.retainedPage = null
        }
        if (previous?.root !== page.root && previous !== this.retainedPage) this.destroyPage(previous)
        if (this.retainedPage?.root.isValid) this.retainedPage.root.active = true
        page.root.active = true
        this.page = page
        if (previous) UIHoverManager.endModalBlock(previous.root)
        UIHoverManager.beginModalBlock(page.root)
    }

    private destroyPage(page: PreparedMenuPage | null): void {
        if (!page?.root.isValid) return
        if (this.mainMenu?.node === page.root) {
            this.mainMenu = null
            this.mainPreparation = null
        }
        page.root.active = false
        if (page.id !== 'achievements') page.root.destroy()
    }

    private prepareAchievements(prewarm = false): Promise<PreparedMenuPage> {
        return this.achievementPreparation ??= this.createPage('achievements', prewarm).catch(error => {
            this.achievementPreparation = null
            throw error
        })
    }

    private prepareMain(onProgress: (progress: number) => void = () => {}): Promise<PreparedMenuPage> {
        if (this.mainMenu?.node.isValid && !this.mainPreparation) {
            onProgress(1)
            return Promise.resolve({ id: 'main', root: this.mainMenu.node, enter: () => this.mainMenu!.show() })
        }
        return this.mainPreparation ??= this.createMain(onProgress).catch(error => {
            this.mainPreparation = null
            throw error
        })
    }

    private async createMain(onProgress: (progress: number) => void): Promise<PreparedMenuPage> {
        const root = uiNode({ name: 'MainMenu', parent: this.node, viewport: true, active: false }).node
        const menu = root.addComponent(MainMenuScreen)
        this.mainMenu = menu
        menu.onNavigate = action => this.onNavigate(action)
        try {
            // UI loading installs Mod wrappers; resolve initialize only after that finishes.
            const ui = await UI.load()
            await menu.initialize(ui, onProgress)
            if (!this.node?.isValid || !root.isValid) throw new Error('Menu was destroyed while loading')
        } catch (error) {
            if (this.mainMenu === menu) this.mainMenu = null
            root.destroy()
            throw error
        }
        return { id: 'main', root, enter: () => menu.show() }
    }
}
