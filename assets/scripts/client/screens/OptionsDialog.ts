import { Color, screen, sys, type Node } from 'cc'
import { menuApi } from '@/client/api/MenuApi'
import { SFX_VOLUME_SCALE } from '@/shared/menu'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import { UI, type UIDialogOptions } from '@/client/ui/UI'
import { OptionsSettings } from '@/platform/OptionsSettings'

export async function showOptionsDialog(parent: Node, ui: UI, options: {
    inGame: boolean
    levelIntro?: boolean
    onClose: () => void
    onRestart: () => void
    onMainMenu: () => void
}) {
    const settings = await menuApi.getSettings()
    const dialog = ui.dialog(parent, {
        width: 423, height: 498, background: ui.assets.sprites.options_menuback, footer: false,
    })
    const showMessage = (message: UIDialogOptions) => ui.dialog(parent, {
        confirmText: ui.text('DIALOG_BUTTON_OK'), ...message, clickSound: null,
    })
    const content = dialog.content
    const offset = options.inGame ? 0 : 1
    const label = (text: string, x: number, y: number) => ui.label(content, {
        text, x, y, baseline: true, align: 'right', color: new Color(107, 109, 145),
    })
    label(ui.text('OPTIONS_MUSIC_LABEL'), 186, 140 + 5 * offset)
    label(ui.text('OPTIONS_SOUNDFX'), 186, 167 + 10 * offset)
    label(ui.text('OPTIONS_3D_ACCELERATION'), 274, 197 + 15 * offset)
    label(ui.text('OPTIONS_FULL_SCREEN'), 274, 229 + 20 * offset)
    ui.slider(content, {
        x: 199, y: 116 + 5 * offset, value: settings.musicVolume,
        onChange: musicVolume => { void menuApi.updateSettings({ musicVolume }).then(value => SoundSystem.setMusicVolume(value.musicVolume)).catch(error => console.error('[Options]', error)) },
    })
    ui.slider(content, {
        x: 199, y: 143 + 10 * offset, value: settings.sfxVolume / SFX_VOLUME_SCALE,
        onChange: value => { void menuApi.updateSettings({ sfxVolume: value * SFX_VOLUME_SCALE }).then(value => SoundSystem.setSfxVolume(value.sfxVolume)).catch(error => console.error('[Options]', error)) },
    })
    ui.checkbox(content, {
        x: 284, y: 175 + 15 * offset, value: true,
        locked: () => showMessage({
            title: ui.text('OPTIONS_3D_REQUIRED_HEADER'), message: ui.text('OPTIONS_3D_REQUIRED_BODY'),
        }),
    })
    const fullscreen = ui.checkbox(content, {
        x: 284, y: 206 + 20 * offset, value: OptionsSettings.fullScreenForced || settings.fullScreen,
        locked: OptionsSettings.fullScreenForced ? () => showMessage({
            title: ui.text('OPTIONS_FULLSCREEN_REQUIRED_HEADER'), message: ui.text('OPTIONS_FULLSCREEN_REQUIRED_BODY'),
        }) : undefined,
        onChange: value => {
            if (value && !screen.supportsFullScreen) {
                fullscreen.value = false
                showMessage({
                    title: ui.text('OPTIONS_FULLSCREEN_UNAVAILABLE_HEADER'), message: ui.text('OPTIONS_FULLSCREEN_UNAVAILABLE_BODY'),
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
            showMessage({ title: ui.text('OPTIONS_FULLSCREEN_UNAVAILABLE_HEADER'), message: String(error) })
        }).finally(() => { closing = false })
    }
    const confirmAction = (message: UIDialogOptions, action: () => void) => {
        const confirm = showMessage(message)
        void confirm.result.then(accepted => {
            if (!accepted || !dialog.node.isValid) return
            void SoundSystem.play(SoundEffect.ButtonClick)
            close(action)
        })
    }
    dialog.onConfirm = dialog.onCancel = () => close(options.onClose)
    if (options.inGame) {
        if (!options.levelIntro) ui.button(content, {
            text: ui.text('RESTART_LEVEL_BUTTON'), x: 107, y: 284, width: 209, clickSound: null,
            onClick: () => confirmAction({
                title: ui.text('RESTART_LEVEL_HEADER'), message: ui.text('RESTART_LEVEL_BODY'),
                cancelText: ui.text('DIALOG_BUTTON_CANCEL'),
            }, options.onRestart),
        })
        ui.button(content, {
            text: ui.text('MAIN_MENU_BUTTON'), x: 107, y: 327, width: 209, clickSound: null,
            onClick: () => options.levelIntro ? close(options.onMainMenu) : confirmAction({
                title: ui.text('LEAVE_GAME_HEADER'), message: ui.text('LEAVE_GAME'),
                confirmText: ui.text('LEAVE_BUTTON'), cancelText: ui.text('DIALOG_BUTTON_CANCEL'), height: 350,
            }, options.onMainMenu),
        })
    } else ui.button(content, {
        text: ui.text('OPTIONS_GITHUB_BUTTON'), x: 107, y: 327, width: 209, clickSound: null,
        onClick: () => sys.openURL('https://github.com/cheng1559/pvz-remake'),
    })
    ui.button(content, {
        text: ui.text(options.inGame ? 'BACK_TO_GAME' : 'DIALOG_BUTTON_OK'), skin: 'back', x: 30, y: 381,
        onClick: () => close(options.onClose),
    })
    return dialog
}
