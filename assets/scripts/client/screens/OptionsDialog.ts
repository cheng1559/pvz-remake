import { Color, screen, sys, type Node } from 'cc'
import { menuApi } from '@/client/api/MenuApi'
import { SFX_VOLUME_SCALE } from '@/shared/menu'
import { SoundEffect, SoundLoader } from '@/client/sound/LegacySoundSystem'
import { UI, type UIDialogOptions } from '@/client/ui/UI'
import { OptionsSettings } from '@/platform/OptionsSettings'

export async function showOptionsDialog(parent: Node, ui: UI, options: {
    inGame: boolean
    onClose: () => void
    onRestart: () => void
    onMainMenu: () => void
}) {
    const settings = await menuApi.getSettings()
    const dialog = ui.dialog(parent, {
        width: 423, height: 498, background: ui.assets.sprites.options_menuback, footer: false,
    })
    const showMessage = (message: UIDialogOptions) => ui.dialog(parent, { ...message, clickSound: null })
    const content = dialog.content
    const offset = options.inGame ? 0 : 1
    const label = (text: string, x: number, y: number) => ui.label(content, {
        text, x, y, baseline: true, align: 'right', color: new Color(107, 109, 145),
    })
    label('Music', 186, 140 + 5 * offset)
    label('Sound FX', 186, 167 + 10 * offset)
    label('3D Acceleration', 274, 197 + 15 * offset)
    label('Full Screen', 274, 229 + 20 * offset)
    ui.slider(content, {
        x: 199, y: 116 + 5 * offset, value: settings.musicVolume,
        onChange: musicVolume => { void menuApi.updateSettings({ musicVolume }).then(value => SoundLoader.setMusicVolume(value.musicVolume)).catch(error => console.error('[Options]', error)) },
    })
    ui.slider(content, {
        x: 199, y: 143 + 10 * offset, value: settings.sfxVolume / SFX_VOLUME_SCALE,
        onChange: value => { void menuApi.updateSettings({ sfxVolume: value * SFX_VOLUME_SCALE }).then(value => SoundLoader.setSfxVolume(value.sfxVolume)).catch(error => console.error('[Options]', error)) },
    })
    ui.checkbox(content, {
        x: 284, y: 175 + 15 * offset, value: true,
        locked: () => showMessage({
            title: '3D Acceleration Required', message: '3D acceleration is required for this version.',
        }),
    })
    const fullscreen = ui.checkbox(content, {
        x: 284, y: 206 + 20 * offset, value: OptionsSettings.fullScreenForced || settings.fullScreen,
        locked: OptionsSettings.fullScreenForced ? () => showMessage({
            title: 'Full Screen Required', message: 'Windowed mode is not available on mobile devices.',
        }) : undefined,
        onChange: value => {
            if (value && !screen.supportsFullScreen) {
                fullscreen.value = false
                showMessage({
                    title: 'Full Screen Unavailable', message: 'This browser does not support full screen mode.',
                })
            }
        },
    })
    let closing = false
    const close = (action: () => void) => {
        if (closing) return
        closing = true
        // Start fullscreen inside the input callback so browsers retain user activation.
        void OptionsSettings.setFullScreen(fullscreen.value).then(() => {
            if (!dialog.node.isValid) return
            dialog.close(true)
            action()
        }).catch(async error => {
            fullscreen.value = OptionsSettings.fullScreenForced || (await menuApi.getSettings()).fullScreen
            showMessage({ title: 'Full Screen Unavailable', message: String(error) })
        }).finally(() => { closing = false })
    }
    const confirmAction = (message: UIDialogOptions, action: () => void) => {
        const confirm = showMessage(message)
        void confirm.result.then(accepted => {
            if (!accepted || !dialog.node.isValid) return
            void SoundLoader.play(SoundEffect.ButtonClick)
            close(action)
        })
    }
    dialog.onConfirm = dialog.onCancel = () => close(options.onClose)
    if (options.inGame) {
        ui.button(content, {
            text: 'Restart Level', x: 107, y: 284, width: 209, clickSound: null,
            onClick: () => confirmAction({
                title: 'Restart Level?', message: 'Do you want to try this level\nagain from the beginning?', cancelText: 'CANCEL',
            }, options.onRestart),
        })
        ui.button(content, {
            text: 'Main Menu', x: 107, y: 327, width: 209, clickSound: null,
            onClick: () => confirmAction({
                title: 'Leave Game?', message: 'Do you want to return\nto the main menu?\n\nYour game will be saved.',
                confirmText: 'LEAVE', cancelText: 'CANCEL', height: 350,
            }, options.onMainMenu),
        })
    } else ui.button(content, {
        text: 'GitHub', x: 107, y: 327, width: 209, clickSound: null,
        onClick: () => sys.openURL('https://github.com/cheng1559/pvz-remake'),
    })
    ui.button(content, {
        text: ui.text(options.inGame ? 'BACK_TO_GAME' : 'DIALOG_BUTTON_OK'), skin: 'back', x: 30, y: 381,
        onClick: () => close(options.onClose),
    })
    return dialog
}
