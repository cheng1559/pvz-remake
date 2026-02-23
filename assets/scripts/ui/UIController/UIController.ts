import {
    _decorator,
    Component,
    Node,
    Prefab,
    instantiate,
    UITransform,
    Label,
    Layers,
    Widget,
    Color,
} from 'cc'
import { MessageBox } from '../MessageBox/MessageBox'
import { SelectorScreen } from '../SelectorScreen/SelectorScreen'
const { ccclass, property } = _decorator

@ccclass('UIController')
export class UIController extends Component {
    @property(Prefab)
    selectorScreenPrefab: Prefab

    @property(Prefab)
    messageBoxPrefab: Prefab

    @property(Node)
    uiRoot: Node | null = null // The parent node for UI elements

    onLoad() {
        if (!this.uiRoot) {
            this.uiRoot = this.node
        }

        // Example: Show selector screen on start
        this.showSelectorScreen()
    }

    showSelectorScreen() {
        const node = instantiate(this.selectorScreenPrefab)
        this.uiRoot!.addChild(node)
        const selectorScreen = node.getComponent(SelectorScreen)
        selectorScreen.uiController = this
        // if (selectorScreen) {
        // selectorScreen.init(this)
        // selectorScreen.playOpenAnimation()
        // }
    }

    showMessageBox(title: string, message: string) {
        let node: Node

        console.log(`[UIController] Showing MessageBox - Title: "${title}", Message: "${message}"`)

        // Create node
        node = instantiate(this.messageBoxPrefab)

        // Setup component properties BEFORE adding to scene
        const messageBox = node.getComponent(MessageBox)
        if (messageBox) {
            messageBox.title = title
            messageBox.message = message
        }

        messageBox.setButtons([{ label: 'OK', onClick: () => {
            messageBox.close()
        } }])

        // Add to scene (triggers onEnable -> renderDialog)
        this.uiRoot!.addChild(node)
    }
}
