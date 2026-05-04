import { _decorator, Component, game, Node, tween, Vec3 } from 'cc'
import { AchievementScreen } from '../AchievementScreen'
import { AlmanacScreen } from '../AlmanacScreen/AlmanacScreen'
import { StoreScreen } from '../StoreScreen/StoreScreen'
import { ZenGardenScreen } from '../ZenGardenScreen/ZenGardenScreen'
import { ChallengePage, ChallengeScreen } from '../ChallengeScreen'
import { DialogButtonMode, DialogResult, MessageBox } from '../MessageBox/MessageBox'
import { HelpScreen } from '../HelpScreen'
import { OptionsDialog } from '../OptionsDialog'
import { SelectorScreen } from '../SelectorScreen/SelectorScreen'
import { StartupResourceLoader } from '../StartupResourceLoader'
import { createUINode } from '../UIFactory'

const { ccclass, property } = _decorator

interface StoreScreenOptions {
    initialPage?: number
    backButtonLabel?: string
    onBack?: () => void
}

@ccclass('UIController')
export class UIController extends Component {
    @property(Node)
    uiRoot: Node | null = null

    private _currentScreen: Node | null = null
    private _selectorScreen: SelectorScreen | null = null
    private _achievementScreen: Node | null = null
    private _modalScreen: Node | null = null
    private _screenTransitioning = false

    onLoad() {
        if (!this.uiRoot) {
            this.uiRoot = this.node
        }

        void this._bootstrap()
    }

    private async _bootstrap() {
        await StartupResourceLoader.preloadStartup()
        await this.showSelectorScreen()
    }

    async showSelectorScreen(): Promise<SelectorScreen | null> {
        this._destroyCurrentScreen()
        this._selectorScreen = null
        const [animation, zombieArmAnimation] = await Promise.all([
            StartupResourceLoader.loadJson('animations/selectorscreen'),
            StartupResourceLoader.loadJson('animations/zombie_hand'),
        ])
        if (!animation || !zombieArmAnimation) return null

        const node = createUINode('SelectorScreen', { active: false, width: 800, height: 600 })

        const selectorScreen = node.addComponent(SelectorScreen)
        selectorScreen.animation = animation
        selectorScreen.zombieArmAnimation = zombieArmAnimation
        selectorScreen.onLockedModeClick = (name) => {
            const dialog = this.showMessageBox('Locked!', `Play more Adventure to unlock ${name} Mode.`)
            dialog?.setMessageLayout(277, -3, 2)
        }
        selectorScreen.onMessageBoxRequest = () => {
            this.showMessageBox('Message', 'Hello from SelectorScreen!')
        }
        selectorScreen.onOptionsRequest = () => {
            this.showOptionsDialog()
        }
        selectorScreen.onHelpRequest = () => {
            this.showHelpScreen()
        }
        selectorScreen.onQuitRequest = () => {
            void this.confirmQuit()
        }
        selectorScreen.onChallengePageRequest = (page) => {
            this.showChallengeScreen(page)
        }
        selectorScreen.onAchievementRequest = () => {
            this.showAchievementScreen()
        }
        selectorScreen.onZenGardenRequest = () => {
            this.showZenGardenScreen()
        }
        selectorScreen.onStoreRequest = () => {
            this.showStoreDialog()
        }
        selectorScreen.onAlmanacRequest = () => {
            this.showAlmanacDialog()
        }

        this._setCurrentScreen(node)
        this._selectorScreen = selectorScreen
        return selectorScreen
    }

    showHelpScreen(): HelpScreen | null {
        const node = createUINode('HelpScreen', { active: false, width: 800, height: 600 })
        const helpScreen = node.addComponent(HelpScreen)
        helpScreen.onBackToMenu = () => {
            void this.showSelectorScreen()
        }

        this._setCurrentScreen(node)
        return helpScreen
    }

    showChallengeScreen(page: ChallengePage): ChallengeScreen | null {
        this._selectorScreen = null
        const node = createUINode('ChallengeScreen', { active: false, width: 800, height: 600 })
        const challengeScreen = node.addComponent(ChallengeScreen)
        challengeScreen.page = page
        challengeScreen.onBackToMenu = () => {
            void this.showSelectorScreen()
        }

        this._setCurrentScreen(node)
        return challengeScreen
    }

    showZenGardenScreen(): ZenGardenScreen | null {
        this._selectorScreen = null
        const node = createUINode('ZenGardenScreen', { active: false, width: 800, height: 600 })
        const zenGardenScreen = node.addComponent(ZenGardenScreen)
        zenGardenScreen.onBackToMenu = () => {
            void this.showSelectorScreen()
        }
        zenGardenScreen.onStoreRequest = () => {
            this.showStoreScreen({
                initialPage: 2,
                backButtonLabel: 'GO BACK',
                onBack: () => {
                    this.showZenGardenScreen()
                },
            })
        }

        this._setCurrentScreen(node)
        return zenGardenScreen
    }

    showStoreScreen(options: StoreScreenOptions = {}): StoreScreen | null {
        this._selectorScreen = null
        const node = createUINode('StoreScreen', { active: false, width: 800, height: 600 })
        const storeScreen = node.addComponent(StoreScreen)
        storeScreen.initialPage = options.initialPage ?? 0
        storeScreen.backButtonLabel = options.backButtonLabel ?? 'MAIN MENU'
        storeScreen.onBackToMenu = options.onBack ?? (() => {
            void this.showSelectorScreen()
        })

        this._setCurrentScreen(node)
        return storeScreen
    }

    showStoreDialog(): StoreScreen | null {
        if (
            this._screenTransitioning ||
            this._modalScreen?.isValid ||
            !this._currentScreen?.isValid ||
            !this._selectorScreen?.node.isValid
        ) {
            return null
        }

        const node = createUINode('StoreDialog', { active: false, width: 800, height: 600 })
        const storeScreen = node.addComponent(StoreScreen)
        storeScreen.onBackToMenu = () => {
            this.hideModalScreen()
        }

        this.uiRoot!.addChild(node)
        node.active = true
        this._modalScreen = node
        this._selectorScreen.setButtonsInteractable(false)
        return storeScreen
    }

    showAlmanacDialog(): AlmanacScreen | null {
        if (
            this._screenTransitioning ||
            this._modalScreen?.isValid ||
            !this._currentScreen?.isValid ||
            !this._selectorScreen?.node.isValid
        ) {
            return null
        }

        const node = createUINode('AlmanacDialog', { active: false, width: 800, height: 600 })
        const almanacScreen = node.addComponent(AlmanacScreen)
        almanacScreen.onBackToMenu = () => {
            this.hideModalScreen()
        }

        this.uiRoot!.addChild(node)
        node.active = true
        this._modalScreen = node
        this._selectorScreen.setButtonsInteractable(false)
        return almanacScreen
    }

    hideModalScreen() {
        if (!this._modalScreen?.isValid) return

        const dialogNode = this._modalScreen
        this._modalScreen = null
        dialogNode.destroy()
        this._selectorScreen?.setButtonsInteractable(true)
    }

    showAchievementScreen(): AchievementScreen | null {
        if (
            this._screenTransitioning ||
            this._achievementScreen?.isValid ||
            !this._currentScreen?.isValid ||
            !this._selectorScreen?.node.isValid
        ) {
            return null
        }

        const node = createUINode('AchievementScreen', { active: false, width: 800, height: 600 })
        const achievementScreen = node.addComponent(AchievementScreen)
        achievementScreen.onBackToMenu = () => {
            this.hideAchievementScreen()
        }

        this.uiRoot!.addChild(node)
        node.setPosition(0, -599, 0)
        node.active = true
        this._achievementScreen = node

        this._selectorScreen?.setButtonsInteractable(false)
        this._screenTransitioning = true
        tween(this._currentScreen)
            .to(0.75, { position: new Vec3(0, 600, 0) }, { easing: 'quadInOut' })
            .start()
        tween(node)
            .to(0.75, { position: new Vec3(0, 1, 0) }, { easing: 'quadInOut' })
            .call(() => {
                this._screenTransitioning = false
            })
            .start()

        return achievementScreen
    }

    hideAchievementScreen() {
        if (
            this._screenTransitioning ||
            !this._achievementScreen?.isValid ||
            !this._currentScreen?.isValid
        ) {
            return
        }

        const achievementNode = this._achievementScreen
        this._screenTransitioning = true
        tween(this._currentScreen)
            .to(0.75, { position: new Vec3(0, 0, 0) }, { easing: 'quadInOut' })
            .start()
        tween(achievementNode)
            .to(0.75, { position: new Vec3(0, -599, 0) }, { easing: 'quadInOut' })
            .call(() => {
                if (achievementNode.isValid) achievementNode.destroy()
                if (this._achievementScreen === achievementNode) this._achievementScreen = null
                this._selectorScreen?.setButtonsInteractable(true)
                this._screenTransitioning = false
            })
            .start()
    }

    showOptionsDialog(): OptionsDialog | null {
        const node = createUINode('OptionsDialog', { active: false, width: 423, height: 498 })
        const optionsDialog = node.addComponent(OptionsDialog)

        this.uiRoot!.addChild(node)
        node.active = true
        return optionsDialog
    }

    showMessageBox(title: string, message: string): MessageBox | null {
        const node = createUINode('MessageBox', { active: false, width: 100, height: 100 })

        const messageBox = node.addComponent(MessageBox)
        messageBox.dialogWidth = 500
        messageBox.dialogHeight = 300
        messageBox.title = title
        messageBox.message = message
        messageBox.setButtonMode(DialogButtonMode.Footer, 'OK')

        this.uiRoot!.addChild(node)
        node.active = true
        return messageBox
    }

    async showConfirmBox(title: string, message: string): Promise<boolean> {
        const dialog = this.showMessageBox(title, message)
        if (!dialog) return false
        dialog.setButtonMode(DialogButtonMode.YesNo)
        const result = await dialog.waitForResult()
        return result === DialogResult.Yes
    }

    async confirmQuit(): Promise<void> {
        const dialog = this.showMessageBox('Quit', 'Are you sure you wish to\nquit the game?')
        if (!dialog) return

        dialog.setMessageLayout(0, 0, 2)
        dialog.setButtonMode(DialogButtonMode.OkCancel, 'Quit', 'Cancel')
        const result = await dialog.waitForResult()
        if (result === DialogResult.Ok) {
            game.end()
        }
    }

    private _setCurrentScreen(node: Node) {
        this._destroyCurrentScreen()
        this._currentScreen = node
        this.uiRoot!.addChild(node)
        node.active = true
    }

    private _destroyCurrentScreen() {
        if (this._achievementScreen?.isValid) {
            this._achievementScreen.destroy()
        }
        this._achievementScreen = null
        if (this._modalScreen?.isValid) {
            this._modalScreen.destroy()
        }
        this._modalScreen = null
        this._screenTransitioning = false
        if (this._currentScreen?.isValid) {
            this._currentScreen.destroy()
        }
        this._currentScreen = null
        this._selectorScreen = null
    }
}
