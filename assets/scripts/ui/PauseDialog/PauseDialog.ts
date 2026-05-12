import { _decorator, EventKeyboard, Node } from 'cc'
import { Animator } from '@/core/Animator'
import { createZombieAnimationView, playZombieBodyAnimation, wireZombieAnimation } from '@/game/ZombieAnimation'
import { DialogButtonMode, MessageBox } from '@/ui/MessageBox/MessageBox'
import { StartupResourceLoader } from '@/ui/StartupResourceLoader'

const { ccclass } = _decorator

const NEWSPAPER_ZOMBIE_ANIMATION_PATH = 'animations/zombie_paper'
const NEWSPAPER_ZOMBIE_ANIMATION = 'anim_idle'
const DIALOG_HEADER_OFFSET = 45
const NEWSPAPER_ZOMBIE_WIDGET_X = 72
const NEWSPAPER_ZOMBIE_WIDGET_Y = 42
const NEWSPAPER_ZOMBIE_REANIM_X = 72
const NEWSPAPER_ZOMBIE_REANIM_Y = 42

@ccclass('PauseDialog')
export class PauseDialog extends MessageBox {
    private _paperZombieRoot: Node | null = null
    private _paperZombieRenderId = 0

    start() {
        this.title = 'GAME PAUSED'
        this.message = 'Click to resume game'
        this.spaceAfterHeader = 155
        this.extraHeight = 10
        this.setButtonMode(DialogButtonMode.Footer, 'Resume Game')
        super.start()
    }

    onDestroy() {
        this._destroyPaperZombie()
        super.onDestroy()
    }

    protected onDialogRendered(actualWidth: number, actualHeight: number) {
        void this._renderPaperZombie(actualWidth, actualHeight)
    }

    protected onDialogKeyDown(event: EventKeyboard) {
        super.onDialogKeyDown(event)
    }

    private async _renderPaperZombie(dialogWidth: number, dialogHeight: number) {
        const renderId = ++this._paperZombieRenderId
        this._removePaperZombieNode()

        const animationAsset = await StartupResourceLoader.loadJson(NEWSPAPER_ZOMBIE_ANIMATION_PATH)
        if (renderId !== this._paperZombieRenderId || !this.node.isValid || !animationAsset?.json) {
            return
        }

        const zombieRoot = new Node('NewspaperZombie')
        zombieRoot.layer = this.node.layer
        const reanimDialogX = NEWSPAPER_ZOMBIE_WIDGET_X + NEWSPAPER_ZOMBIE_REANIM_X
        const reanimDialogY =
            NEWSPAPER_ZOMBIE_WIDGET_Y + DIALOG_HEADER_OFFSET + NEWSPAPER_ZOMBIE_REANIM_Y
        zombieRoot.setPosition(
            reanimDialogX - dialogWidth / 2,
            dialogHeight / 2 - reanimDialogY,
            0,
        )
        this.node.addChild(zombieRoot)
        this._paperZombieRoot = zombieRoot

        const animator = zombieRoot.addComponent(Animator)
        await animator.parseJson(animationAsset.json as Record<string, any>)
        if (renderId !== this._paperZombieRenderId || !zombieRoot.isValid) return

        const view = createZombieAnimationView(animator)
        wireZombieAnimation(animator, view, 'newspaper')
        playZombieBodyAnimation(view, NEWSPAPER_ZOMBIE_ANIMATION, {
            speed: 1,
            manualTime: false,
            loop: true,
        })
    }

    private _destroyPaperZombie() {
        this._paperZombieRenderId++
        this._removePaperZombieNode()
    }

    private _removePaperZombieNode() {
        if (this._paperZombieRoot?.isValid) {
            this._paperZombieRoot.destroy()
        }
        this._paperZombieRoot = null
    }
}
