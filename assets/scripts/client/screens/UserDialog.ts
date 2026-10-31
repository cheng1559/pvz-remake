import { Button, Color, KeyCode, Node, UITransform } from 'cc'
import { menuApi } from '@/client/api/MenuApi'
import type { UserSummary } from '@/shared/menu'
import { FontMetricsUtil } from '@/client/font'
import type { UI } from '@/client/ui/UI'
import { UIButton } from '@/client/ui/UIButton'
import type { UIDialog } from '@/client/ui/UIDialog'
import { uiNode } from '@/client/view/uiNode'
import { restartWithProgress } from './RestartingDialog'

const LIST_COLOR = new Color(23, 24, 35)
const TEXT_COLOR = new Color(235, 225, 180)
const SELECT_COLOR = new Color(20, 180, 15)
const MAX_USERS = 8

/** Each player has their own installed Mods; loaded Mods cannot be unloaded, so another set needs a restart. */
export interface PlayerMods {
    needsRestartFor(profile: number | null): Promise<boolean>
    hasMods(profile: number | null): boolean
    copyMods(from: number | null, to: number, move?: boolean): void
    restart(): void
}

/** Like the Mod manager's Apply, the restart shows "Restarting..." until the game reloads. */
const restartGame = (parent: Node, ui: UI, mods: PlayerMods) => restartWithProgress(parent, ui, () => mods.restart())

/** Asks before switching to a player whose Mods differ; leaving a deleted player cannot be cancelled. */
async function modRestart(parent: Node, ui: UI, mods: PlayerMods | undefined, profile: number | null, cancellable: boolean): Promise<'same' | 'restart' | 'cancel'> {
    if (!mods || !await mods.needsRestartFor(profile)) return 'same'
    const accepted = await ui.dialog(parent, {
        title: ui.text('PLAYER_MODS_RESTART_HEADER'),
        message: ui.text('PLAYER_MODS_RESTART_BODY'),
        confirmText: ui.text('BUTTON_OK'), ...(cancellable ? { cancelText: ui.text('BUTTON_CANCEL') } : {}),
    }).result
    return accepted || !cancellable ? 'restart' : 'cancel'
}

/** A new player can start with the previous player's Mods; the first player keeps what was installed before. */
async function setUpNewPlayer(parent: Node, ui: UI, mods: PlayerMods | undefined, previous: number | null, created: number): Promise<boolean> {
    if (!mods) return false
    if (previous === null) mods.copyMods(null, created, true)
    // The new player starts without Mods; say so when declining would then restart the game.
    else if (mods.hasMods(previous) && await ui.dialog(parent, {
        title: ui.text('PLAYER_MODS_COPY_HEADER'),
        message: ui.text(await mods.needsRestartFor(created) ? 'PLAYER_MODS_COPY_RESTART_BODY' : 'PLAYER_MODS_COPY_BODY'),
        confirmText: ui.text('BUTTON_YES'), cancelText: ui.text('BUTTON_NO'),
    }).result) mods.copyMods(previous, created)
    if (await modRestart(parent, ui, mods, created, false) !== 'restart') return false
    await restartGame(parent, ui, mods)
    return true
}

export async function showUserDialog(parent: Node, ui: UI, onClose: () => void, onChanged: () => void | Promise<void>, mods?: PlayerMods): Promise<UIDialog> {
    const current = await menuApi.getCurrentUser()
    if (!parent.isValid) throw new Error('User dialog was closed while loading')
    if (!current) return showNameDialog(parent, ui, async () => { await onChanged(); onClose() }, undefined, undefined, mods)
    let entries: UserSummary[] = []
    let selected = 0
    let list: Node | null = null
    let child: UIDialog | null = null
    let lastPress = { id: 0, time: 0 }
    const dialog = ui.dialog(parent, {
        title: ui.text('WHO_ARE_YOU'), extraWidth: 210, extraHeight: 270, tall: true,
        confirmText: ui.text('BUTTON_OK'), cancelText: ui.text('BUTTON_CANCEL'), onClose,
    })
    const fail = (error: unknown) => { if (dialog.node.isValid) ui.dialog(dialog.node, { title: ui.text('ERROR_HEADER'), message: String(error) }) }
    let selecting = false
    const panel = dialog.content
    const size = panel.getComponent(UITransform)!
    const footer = panel.getComponentsInChildren(UIButton)
    const extraButton = (text: string, index: number, onClick: () => void) => ui.button(panel, {
        text, x: footer[index].node.position.x, y: -footer[index].node.position.y - 46,
        width: footer[index].node.getComponent(UITransform)!.width, onClick,
    })
    const rename = extraButton(ui.text('RENAME_BUTTON'), 0, () => { if (entries[selected]) editName(entries[selected]) })
    const remove = extraButton(ui.text('DELETE_BUTTON'), 1, deleteSelected)

    async function refresh(preferredId = entries[selected]?.id): Promise<void> {
        const state = await menuApi.listUsers()
        if (!dialog.node.isValid) return
        const profiles = state.users
        const currentId = state.current?.id
        preferredId ??= currentId
        entries = (entries.length ? entries.flatMap(entry => profiles.filter(profile => profile.id === entry.id)) : [
            ...profiles.filter(profile => profile.id === currentId),
            ...profiles.filter(profile => profile.id !== currentId),
        ]).slice(0, MAX_USERS)
        selected = Math.max(0, entries.findIndex(profile => profile.id === preferredId))
        if (list) { list.active = false; list.destroy() }
        const width = size.width - 142
        const area = uiNode({
            name: 'UserList', parent: panel, position: { x: 66, y: -138 }, anchor: { x: 0, y: 1 },
            size: { width, height: 200 }, graphics: true,
        })
        list = area.node
        area.graphics!.fillColor = LIST_COLOR
        area.graphics!.fillRect(0, -200, width, 200)
        area.graphics!.strokeColor = Color.BLACK
        area.graphics!.lineWidth = 1
        area.graphics!.rect(0, -200, width, 200)
        area.graphics!.stroke()
        const names = entries.map(profile => profile.name)
        if (entries.length < MAX_USERS) names.push(ui.text('CREATE_NEW_USER'))
        const metrics = FontMetricsUtil.getMetrics(ui.assets.fonts.profile.config)
        names.forEach((name, index) => {
            const row = uiNode({
                name: `User-${index}`, parent: list!, active: false, position: { y: -index * 24 },
                size: { width, height: 24 }, anchor: { x: 0, y: 1 },
            }).node
            const selection = uiNode({ name: 'Selection', parent: row, graphics: true }).graphics!
            selection.fillColor = SELECT_COLOR
            selection.fillRect(1, -23, width - 2, 22)
            const textWidth = FontMetricsUtil.measureTextWidth(ui.assets.fonts.profile.config, name)
            const label = ui.label(row, {
                text: name, font: 'profile', color: TEXT_COLOR,
                x: Math.max(0, Math.floor((width - textWidth) / 2)), y: Math.floor((24 - metrics.height) / 2) - metrics.ascentPadding,
            })
            const button = row.addComponent(UIButton)
            button.refreshHoverOnEnable = false
            button.releaseToNormalOnPressOut = true
            button.onPress = () => {
                const profile = entries[index]
                if (!profile) { editName(); return }
                const now = Date.now()
                if (lastPress.id === profile.id && now - lastPress.time <= 500) { selected = index; void confirm().catch(fail) }
                lastPress = { id: profile.id, time: now }
            }
            button.onClick = () => { if (entries[index]) { selected = index; updateSelection() } }
            row.on(Button.EventType.CLICK, () => button.onClick())
            button.onStateChange = state => { label.renderer.fontColor = state === 'hover' || state === 'pressed' ? Color.WHITE : TEXT_COLOR }
            row.active = true
        })
        updateSelection()
    }

    function updateSelection(): void {
        list?.children.forEach((row, index) => { row.getChildByName('Selection')!.active = index === selected })
        rename.interactable = remove.interactable = !!entries[selected]
    }

    async function confirm(): Promise<void> {
        if (selecting) return
        const profile = entries[selected]
        if (!profile) { editName(); return }
        selecting = true
        try {
            const restart = await modRestart(dialog.node, ui, mods, profile.id, true)
            if (restart === 'cancel' || !dialog.node.activeInHierarchy) return
            const result = await menuApi.selectUser(profile.id)
            if (!result.ok || !dialog.node.activeInHierarchy) return
            if (restart === 'restart') { await restartGame(dialog.node, ui, mods!); return }
            await onChanged()
            dialog.close(true)
        } finally { selecting = false }
    }

    function editName(profile?: UserSummary): void {
        if (child?.node.activeInHierarchy) return
        child = showNameDialog(dialog.node, ui, async () => {
            child = null
            await onChanged()
            if (profile) await refresh(profile.id)
            else dialog.close(true)
        }, profile, () => { child = null }, mods)
    }

    function deleteSelected(): void {
        const profile = entries[selected]
        if (!profile || child?.node.activeInHierarchy) return
        const confirm = ui.dialog(dialog.node, {
            title: ui.text('ARE_YOU_SURE'), message: ui.text('DELETE_USER_WARNING').replace('%s', profile.name),
            confirmText: ui.text('BUTTON_YES'), cancelText: ui.text('BUTTON_NO'),
        })
        child = confirm
        void confirm.result.then(async accepted => {
            child = null
            if (!accepted || !dialog.node?.isValid) return
            const deletingCurrent = (await menuApi.getCurrentUser())?.id === profile.id
            if (!(await menuApi.deleteUser(profile.id)).ok) return
            const nextId = entries[Math.max(0, selected - 1)]?.id
            await refresh(nextId)
            if (deletingCurrent && entries[selected]) {
                await menuApi.selectUser(entries[selected].id)
                if (await modRestart(dialog.node, ui, mods, entries[selected].id, false) === 'restart') { await restartGame(dialog.node, ui, mods!); return }
            }
            await onChanged()
            if (!entries.length) editName()
        }).catch(fail)
    }

    dialog.onConfirm = () => confirm().catch(fail)
    const cancel = async () => {
        if (!await menuApi.getCurrentUser()) editName()
        else dialog.close(false)
    }
    dialog.onCancel = () => cancel().catch(fail)
    dialog.onKeyDown = event => {
        if (event.keyCode === KeyCode.ARROW_UP || event.keyCode === KeyCode.ARROW_DOWN) {
            selected = Math.max(0, Math.min(entries.length - 1, selected + (event.keyCode === KeyCode.ARROW_UP ? -1 : 1)))
            updateSelection()
        } else if (event.keyCode !== KeyCode.SPACE) return false
        return true
    }
    await refresh(current?.id)
    if (!entries.length) editName()
    return dialog
}

function showNameDialog(parent: Node, ui: UI, onSaved: () => void | Promise<void>, profile?: UserSummary, onCancel?: () => void, mods?: PlayerMods): UIDialog {
    const dialog = ui.dialog(parent, {
        title: ui.text(profile ? 'RENAME_USER' : 'NEW_USER'), message: ui.text('PLEASE_ENTER_NAME'),
        extraWidth: 110, extraHeight: 40, centerMessage: false,
        confirmText: ui.text('BUTTON_OK'), cancelText: ui.text('BUTTON_CANCEL'),
    })
    const size = dialog.content.getComponent(UITransform)!
    const input = ui.input(dialog.content, {
        value: profile?.name ?? '', x: 40, y: size.height - 159, width: size.width - 90,
        maxLength: 12, filter: value => value.replace(/[^a-zA-Z0-9 ]/g, ''),
        onSubmit: () => submit(), onCancel: () => cancel(),
    })
    function showError(title: string, message: string): void {
        input.blur()
        const error = ui.dialog(dialog.node, { title: ui.text(title), message: ui.text(message) })
        void error.result.then(() => { if (input.node?.isValid && dialog.node.activeInHierarchy) input.focus() })
    }
    let submitting = false
    async function submit(): Promise<void> {
        if (submitting || !dialog.node.activeInHierarchy) return
        submitting = true
        try {
            const previous = profile ? undefined : (await menuApi.getCurrentUser())?.id ?? null
            const result = profile ? await menuApi.renameUser(profile.id, input.value) : await menuApi.createUser(input.value)
            if (!dialog.node.activeInHierarchy) return
            if (result.ok === false) {
                if (result.code === 'emptyName') { if (!profile) showError('ENTER_YOUR_NAME', 'USER_ERROR_MESSAGE') }
                else if (result.code === 'duplicateName') showError('NAME_CONFLICT', 'ENTER_UNIQUE_PLAYER_NAME')
                else showError('ENTER_YOUR_NAME', 'USER_ERROR_MESSAGE')
                return
            }
            dialog.close(true)
            if (previous !== undefined && result.user && await setUpNewPlayer(parent, ui, mods, previous, result.user.id)) return
            await onSaved()
        } catch (error) {
            if (dialog.node.isValid) ui.dialog(dialog.node, { title: ui.text('ERROR_HEADER'), message: String(error) })
        } finally { submitting = false }
    }
    async function cancel(): Promise<void> {
        if (!await menuApi.getCurrentUser()) { showError('ENTER_YOUR_NAME', 'USER_ERROR_MESSAGE'); return }
        dialog.close(false)
        onCancel?.()
    }
    dialog.onConfirm = submit
    dialog.onCancel = cancel
    dialog.onKeyDown = event => event.keyCode === KeyCode.SPACE
    input.focus()
    if (profile) input.selectAll()
    return dialog
}
