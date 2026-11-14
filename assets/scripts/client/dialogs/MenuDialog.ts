import { game, isValid, type Node } from 'cc'
import { modManager } from '@/client/content/ModManager'
import { createOffBoardZombie } from '@/client/view/offBoard'
import type { UI } from '@/client/ui/UI'
import type { UIDialog } from '@/client/ui/UIDialog'
import { uiNode } from '@/client/view/uiNode'
import type { MenuDialogId } from '@/client/screens/MenuPages'
import { showOptionsDialog } from './OptionsDialog'
import { showUserDialog } from './UserDialog'

/** What a menu dialog's buttons ask for; `back` just closes it. */
export type MenuDialogAction = 'resume' | 'back' | 'restart' | 'main' | 'almanac' | 'mods'

/** Opens the dialog straight on `parent` (the app's node), as the debug CLI's dialog is. */
export async function showMenuDialog(parent: Node, ui: UI, id: MenuDialogId, { levelIntro, almanac, act, profileChanged, restartGame }: {
    levelIntro: boolean
    /** LawnApp::CanShowAlmanac: the in-game options offer the almanac (OptionsDialog hides it during the level intro). */
    almanac: boolean
    act: (action: MenuDialogAction) => void
    /** The player list changed the current player (the main menu's sign follows it). */
    profileChanged: () => void | Promise<void>
    /** Switching to a player with other Mods restarts the game. */
    restartGame: () => void
}): Promise<UIDialog> {
    if (id === 'players') {
        return showUserDialog(parent, ui, () => act('back'), profileChanged, {
            needsRestartFor: profile => modManager.needsRestartFor(profile),
            hasMods: profile => modManager.hasMods(profile),
            copyMods: (from, to, move) => modManager.copyMods(from, to, move),
            restart: restartGame,
        })
    }
    if (id === 'quit') {
        return ui.dialog(parent, {
            title: ui.text('QUIT_HEADER'), message: ui.text('QUIT_MESSAGE'),
            confirmText: ui.text('QUIT_BUTTON'), cancelText: ui.text('DIALOG_BUTTON_CANCEL'),
            onClose: confirmed => {
                act('back')
                if (confirmed) game.end()
            },
        })
    }
    if (id === 'options' || id === 'gameOptions') {
        const inGame = id === 'gameOptions'
        return showOptionsDialog(parent, ui, {
            inGame,
            levelIntro: inGame && levelIntro,
            onClose: () => act(inGame ? 'resume' : 'back'),
            onRestart: () => act('restart'),
            onMainMenu: () => act('main'),
            ...(almanac ? { onAlmanac: () => act('almanac') } : {}),
            ...(inGame ? {} : { onMods: () => act('mods') }),
        })
    }
    if (id === 'gameOver') {
        const dialog = ui.dialog(parent, {
            title: ui.text('GAME_OVER'), contentInsetTopExtra: 15,
            confirmText: ui.text('TRY_AGAIN'),
            onClose: retry => act(retry ? 'restart' : 'main'),
        })
        const mainMenu = ui.button(dialog.node, {
            text: ui.text('MAIN_MENU_BUTTON'), x: 235, y: -310, width: 163, height: 46,
            onClick: () => dialog.close(false),
        })
        mainMenu.canInteract = () => !dialog.isDragging
        return dialog
    }
    const dialog = ui.dialog(parent, {
        title: ui.text('GAME_PAUSED'), message: ui.text('CLICK_TO_RESUME'),
        confirmText: ui.text('RESUME_GAME'), spaceAfterHeader: 155, extraHeight: 10,
        clickSound: null,
        onClose: () => act('resume'),
    })
    // Original widget (72, 42) + reanim (72, 42) + dialog header (0, 45).
    const zombie = uiNode({
        name: 'NewspaperZombie', parent: dialog.content, position: { x: 144, y: -129 }, active: false,
    }).node
    // The zombie on its idle at the Reanim's own pace, from the Reanim's origin, as the original draws the widget.
    void createOffBoardZombie(uiNode({ name: 'Zombie', parent: zombie }).node, 'pvz:newspaper', { pose: 'idle', draw: { position: { x: 0, y: 0 }, shadow: false } }).then(shown => {
        if (shown && isValid(zombie, true)) zombie.active = true
    }).catch(error => {
        if (isValid(zombie, true)) console.error('[PauseDialog] Failed to load newspaper zombie', error)
    })
    return dialog
}
