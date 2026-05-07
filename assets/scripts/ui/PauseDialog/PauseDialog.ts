import { _decorator, EventKeyboard } from 'cc'
import { SoundEffect, SoundLoader } from '@/core/SoundLoader'
import { DialogButtonMode, MessageBox } from '@/ui/MessageBox/MessageBox'

const { ccclass } = _decorator

@ccclass('PauseDialog')
export class PauseDialog extends MessageBox {
    start() {
        this.title = 'GAME PAUSED'
        this.message = 'Click to resume game'
        this.spaceAfterHeader = 155
        this.extraHeight = 10
        this.setButtonMode(DialogButtonMode.Footer, 'Resume Game')
        super.start()
    }

    protected onDialogKeyDown(event: EventKeyboard) {
        if (event.keyCode === 32 || event.keyCode === 13) {
            void SoundLoader.play(SoundEffect.ButtonClick)
        }
        super.onDialogKeyDown(event)
    }
}
