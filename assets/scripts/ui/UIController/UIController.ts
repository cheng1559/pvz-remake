import { _decorator, Component, Node } from 'cc'
import { ChallengePage, ChallengeScreen } from '../ChallengeScreen'
import { DialogButtonMode, DialogResult, MessageBox } from '../MessageBox/MessageBox'
import { OptionsDialog } from '../OptionsDialog'
import { SelectorScreen } from '../SelectorScreen/SelectorScreen'
import { StartupResourceLoader } from '../StartupResourceLoader'
import { createUINode } from '../UIFactory'

const { ccclass, property } = _decorator

@ccclass('UIController')
export class UIController extends Component {
    @property(Node)
    uiRoot: Node | null = null

    private _currentScreen: Node | null = null

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
        selectorScreen.onChallengePageRequest = (page) => {
            this.showChallengeScreen(page)
        }

        this._setCurrentScreen(node)
        return selectorScreen
    }

    showChallengeScreen(page: ChallengePage): ChallengeScreen | null {
        const node = createUINode('ChallengeScreen', { active: false, width: 800, height: 600 })
        const challengeScreen = node.addComponent(ChallengeScreen)
        challengeScreen.page = page
        challengeScreen.onBackToMenu = () => {
            void this.showSelectorScreen()
        }

        this._setCurrentScreen(node)
        return challengeScreen
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

    private _setCurrentScreen(node: Node) {
        this._destroyCurrentScreen()
        this._currentScreen = node
        this.uiRoot!.addChild(node)
        node.active = true
    }

    private _destroyCurrentScreen() {
        if (this._currentScreen?.isValid) {
            this._currentScreen.destroy()
        }
        this._currentScreen = null
    }
}
