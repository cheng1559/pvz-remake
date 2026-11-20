import type { Node } from 'cc'
import type { UI } from '@/client/ui/UI'

export type ContinueGameAction = 'continue' | 'restart' | 'cancel'

export async function showContinueGameDialog(parent: Node, ui: UI): Promise<ContinueGameAction> {
    let restarting = false
    const dialog = ui.dialog(parent, {
        title: ui.text('CONTINUE_GAME_HEADER'), message: ui.text('CONTINUE_GAME_OR_RESTART'),
        tall: true, extraWidth: 10, extraHeight: 60, clickSound: null,
        buttons: [
            { text: ui.text('CONTINUE_BUTTON'), onClick: dialog => dialog.onConfirm() },
            {
                text: ui.text('RESTART_LEVEL_BUTTON'),
                onClick: () => {
                    const confirm = ui.dialog(parent, {
                        title: ui.text('RESTART_LEVEL_HEADER'), message: ui.text('RESTART_LEVEL_BODY'),
                        confirmText: ui.text('DIALOG_BUTTON_OK'), cancelText: ui.text('DIALOG_BUTTON_CANCEL'),
                        clickSound: null,
                    })
                    void confirm.result.then(accepted => {
                        if (!accepted || !dialog.node.isValid) return
                        restarting = true
                        dialog.close(false)
                    })
                },
            },
            { text: ui.text('DIALOG_BUTTON_CANCEL'), onClick: dialog => dialog.onCancel() },
        ],
    })
    const continued = await dialog.result
    return restarting ? 'restart' : continued ? 'continue' : 'cancel'
}
