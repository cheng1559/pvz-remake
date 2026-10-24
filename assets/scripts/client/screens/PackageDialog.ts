import { Button, Color, KeyCode, Node, UITransform } from 'cc'
import { FontMetricsUtil } from '@/client/font'
import { modManager } from '@/client/content/ModManager'
import { resourcePacks } from '@/client/content/ResourcePacks'
import { SoundEffect, SoundLoader } from '@/client/sound/LegacySoundSystem'
import type { UI } from '@/client/ui/UI'
import { UIButton } from '@/client/ui/UIButton'
import type { UIDialog } from '@/client/ui/UIDialog'
import { uiNode } from '@/client/view/uiNode'

const LIST_COLOR = new Color(23, 24, 35)
const TEXT_COLOR = new Color(235, 225, 180)
const LINK_COLOR = new Color(255, 120, 100)
const DIM_COLOR = new Color(120, 115, 95)
const ROW_HEIGHT = 34
const LIST_HEIGHT = ROW_HEIGHT * 6
const CHECKBOX_SCALE = 0.8
/** Vertical center of the opaque box in the original checkbox art, which has a soft shadow below it. */
const CHECKBOX_CENTER_Y = 17
const ARROW_WIDTH = 20

export type PackageKind = 'pack' | 'mod'

export interface PackageDialogOptions {
    /** Picks and installs a ZIP without enabling it; null when cancelled or failed. */
    install: () => Promise<string | null>
    /** Saves the running level and restarts the game. */
    restart: () => Promise<void>
}

interface Entry { id: string, version?: string, error?: string }

/**
 * Enabled states and uninstalls stay in the draft until Apply; Cancel discards them.
 * Import saves the ZIP immediately, without enabling it.
 * The pack list order is its priority, highest first, and checking a row never moves it.
 * Mods load in dependency order, so they have no priority.
 */
export async function showPackageDialog(parent: Node, ui: UI, kind: PackageKind, options: PackageDialogOptions): Promise<UIDialog> {
    const manager = kind === 'pack' ? resourcePacks : modManager
    const ordered = kind === 'pack'
    const running = await manager.running()
    const initial = ordered ? running : await modManager.list()
    const packEntries = ordered ? await resourcePacks.entries() : []
    const checked = new Set(ordered ? packEntries.filter(entry => entry.enabled).map(entry => entry.id) : initial)
    const pendingUninstalls = new Set<string>()
    /** Display order; for packs, the first row has the highest priority. */
    let entries: Entry[] = []
    let order = packEntries.map(entry => entry.id)
    /** An import replaced files used by this session. */
    let touchedRunning = false
    let busy = false
    if (!parent.isValid) throw new Error('Package dialog was closed while loading')

    const dialog = ui.dialog(parent, {
        title: ui.text(kind === 'pack' ? 'PACKAGE_PACKS_TITLE' : 'PACKAGE_MODS_TITLE', kind === 'pack' ? 'Resource Packs' : 'Mods'),
        width: 640, extraHeight: 270, tall: true,
        confirmText: ui.text('PACKAGE_APPLY', 'Apply'), cancelText: ui.text('BUTTON_CANCEL'),
    })
    const fail = (error: unknown) => {
        if (dialog.node.isValid) ui.dialog(dialog.node, { title: 'Error', message: error instanceof Error ? error.message : String(error) })
    }
    const panel = dialog.content
    const width = panel.getComponent(UITransform)!.width - 142
    const background = uiNode({
        name: 'PackageList', parent: panel, position: { x: 66, y: -138 }, anchor: { x: 0, y: 1 },
        size: { width, height: LIST_HEIGHT }, graphics: true,
    }).graphics!
    background.fillColor = LIST_COLOR
    background.fillRect(0, -LIST_HEIGHT, width, LIST_HEIGHT)
    background.strokeColor = Color.BLACK
    background.lineWidth = 1
    background.rect(0, -LIST_HEIGHT, width, LIST_HEIGHT)
    background.stroke()
    const scroll = ui.scroll(panel, { x: 66, y: 138, width, height: LIST_HEIGHT, contentHeight: 0, wheelStep: ROW_HEIGHT })
    const footer = panel.getComponentsInChildren(UIButton)
    const left = footer[0].node, right = footer[1].node
    ui.button(panel, {
        text: ui.text('PACKAGE_IMPORT', 'Import'), x: left.position.x, y: -left.position.y - 46,
        width: right.position.x + right.getComponent(UITransform)!.width - left.position.x,
        onClick: () => { void run(importArchive) },
    })

    const font = ui.assets.fonts.profile.config
    const metrics = FontMetricsUtil.getMetrics(font)
    const textY = Math.floor((ROW_HEIGHT - metrics.height) / 2) - metrics.ascentPadding

    /** Runs one operation at a time, reporting failures without closing the manager. */
    async function run(operation: () => Promise<void>): Promise<void> {
        if (busy || !dialog.node.activeInHierarchy) return
        busy = true
        try { await operation() } catch (error) { fail(error) } finally { busy = false }
    }

    async function refresh(): Promise<void> {
        const installed: Entry[] = kind === 'pack' ? (await resourcePacks.installed()).map(id => ({ id })) : await modManager.installed()
        if (!dialog.node.isValid) return
        const ids = installed.filter(entry => !pendingUninstalls.has(entry.id)).map(entry => entry.id)
        order = ordered ? [...order, ...ids].filter((id, index, all) => all.indexOf(id) === index && ids.includes(id)) : ids
        for (const id of checked) if (!order.includes(id)) checked.delete(id)
        entries = order.map(id => installed.find(entry => entry.id === id)!)
        render()
    }

    function render(): void {
        const offset = scroll.offset
        for (const child of [...scroll.content.children]) { child.active = false; child.destroy() }
        scroll.setContentHeight(entries.length * ROW_HEIGHT)
        if (!entries.length) {
            const text = ui.text(kind === 'pack' ? 'PACKAGE_NO_PACKS' : 'PACKAGE_NO_MODS', kind === 'pack' ? 'No resource packs installed' : 'No Mods installed')
            ui.label(scroll.content, {
                text, font: 'profile', color: DIM_COLOR, y: textY,
                x: Math.max(0, Math.floor((width - FontMetricsUtil.measureTextWidth(font, text)) / 2)),
            })
        }
        entries.forEach((entry, index) => renderRow(entry, index, scroll.contentWidth))
        scroll.offset = offset
    }

    function renderRow(entry: Entry, index: number, rowWidth: number): void {
        const row = uiNode({
            name: `Package-${index}`, parent: scroll.content, active: false, position: { y: -index * ROW_HEIGHT },
            size: { width: rowWidth, height: ROW_HEIGHT }, anchor: { x: 0, y: 1 },
        }).node
        const toggle = (value: boolean) => { if (value) checked.add(entry.id); else checked.delete(entry.id) }
        const checkbox = ui.checkbox(row, {
            x: 6, y: Math.ceil(ROW_HEIGHT / 2 - CHECKBOX_CENTER_Y * CHECKBOX_SCALE), value: checked.has(entry.id), onChange: toggle,
        })
        checkbox.node.setScale(CHECKBOX_SCALE, CHECKBOX_SCALE)
        const name = `${entry.id}${entry.version ? `  ${entry.version}` : ''}${entry.error ? ' [Error]' : ''}`
        const nameColor = entry.error ? LINK_COLOR : TEXT_COLOR
        const nameLabel = ui.label(row, { text: name, font: 'profile', color: nameColor, x: 46, y: textY })
        if (entry.error) ui.tooltip(row, { text: entry.error })

        const text = ui.text('PACKAGE_UNINSTALL', 'Uninstall')
        const textWidth = FontMetricsUtil.measureTextWidth(font, text)
        const uninstallX = rowWidth - textWidth - 8
        const label = ui.label(row, { text, font: 'profile', color: LINK_COLOR, x: uninstallX, y: textY })
        rowButton(row, uninstallX, textWidth, LINK_COLOR, true, () => { void run(() => uninstallEntry(entry.id)) },
            color => { label.renderer.fontColor = color })
        // Clicking the name toggles the checkbox, as clicking the box does.
        const nameRight = ordered ? uninstallX - 2 * ARROW_WIDTH - 14 : uninstallX - 4
        rowButton(row, 46, Math.max(0, nameRight - 46), nameColor, true, () => {
            checkbox.value = !checkbox.value
            toggle(checkbox.value)
        }, color => { nameLabel.renderer.fontColor = color })
        if (ordered) {
            arrowButton(row, uninstallX - 2 * ARROW_WIDTH - 10, true, index > 0, () => move(index, -1))
            arrowButton(row, uninstallX - ARROW_WIDTH - 6, false, index < entries.length - 1, () => move(index, 1))
        }
        row.active = true
    }

    /** A hit area over row text or an arrow; `paint` recolors it for hover and disabled states. */
    function rowButton(row: Node, x: number, buttonWidth: number, color: Color, available: boolean,
        onClick: () => void, paint: (color: Color) => void): void {
        const node = uiNode({
            name: 'RowButton', parent: row, active: false, position: { x },
            size: { width: buttonWidth, height: ROW_HEIGHT }, anchor: { x: 0, y: 1 },
        }).node
        const normal = available ? color : DIM_COLOR
        paint(normal)
        const button = node.addComponent(UIButton)
        button.refreshHoverOnEnable = false
        button.releaseToNormalOnPressOut = true
        button.onPress = () => { void SoundLoader.play(SoundEffect.ButtonClick) }
        button.onClick = onClick
        button.onStateChange = state => paint(state === 'hover' || state === 'pressed' ? Color.WHITE : normal)
        node.on(Button.EventType.CLICK, () => button.onClick())
        button.interactable = available
        node.active = true
    }

    function arrowButton(row: Node, x: number, up: boolean, available: boolean, onClick: () => void): void {
        const graphics = uiNode({ name: up ? 'Up' : 'Down', parent: row, position: { x }, anchor: { x: 0, y: 1 }, graphics: true }).graphics!
        const middle = ARROW_WIDTH / 2, top = -10, bottom = 10 - ROW_HEIGHT
        rowButton(row, x, ARROW_WIDTH, TEXT_COLOR, available, onClick, color => {
            graphics.clear()
            graphics.fillColor = color
            graphics.moveTo(middle - 6, up ? bottom : top)
            graphics.lineTo(middle + 6, up ? bottom : top)
            graphics.lineTo(middle, up ? top : bottom)
            graphics.close()
            graphics.fill()
        })
    }

    /** Swaps a pack row with the one above (-1) or below (+1). */
    function move(index: number, delta: 1 | -1): void {
        const target = index + delta
        if (target < 0 || target >= order.length) return
        const id = order[index]
        order[index] = order[target]
        order[target] = id
        void refresh().catch(fail)
    }

    /** The draft enabled list in load order (lowest priority first), comparable with `running`. */
    function enabledDraft(): string[] {
        const ids = order.filter(id => checked.has(id))
        return ordered ? ids.reverse() : ids
    }

    async function importArchive(): Promise<void> {
        const id = await options.install()
        if (!id || !dialog.node.isValid) return
        pendingUninstalls.delete(id)
        if (running.includes(id) || initial.includes(id)) touchedRunning = true
        if (ordered && !order.includes(id)) order.unshift(id)
        checked.add(id)
        await refresh()
    }

    async function uninstallEntry(id: string): Promise<void> {
        const confirmed = await ui.dialog(dialog.node, {
            title: ui.text('ARE_YOU_SURE'), message: ui.text('PACKAGE_UNINSTALL_WARNING', 'Uninstall %s?').replace('%s', id),
            confirmText: ui.text('BUTTON_YES'), cancelText: ui.text('BUTTON_NO'),
        }).result
        if (!confirmed || !dialog.node.isValid) return
        pendingUninstalls.add(id)
        checked.delete(id)
        await refresh()
    }

    async function apply(): Promise<void> {
        const enabled = enabledDraft()
        const same = enabled.length === initial.length
            && enabled.every((id, index) => ordered ? initial[index] === id : initial.includes(id))
        const restart = !same || touchedRunning
        if (restart) {
            const confirmed = await ui.dialog(dialog.node, {
                title: ui.text('PACKAGE_RESTART_HEADER', 'Restart Game?'),
                message: ui.text('PACKAGE_RESTART_BODY', 'Restart now to apply the changes? The current level will be saved.'),
                confirmText: ui.text('BUTTON_OK'), cancelText: ui.text('BUTTON_CANCEL'),
            }).result
            if (!confirmed || !dialog.node.isValid) return
        }
        if (ordered) await resourcePacks.setEntries(order.map(id => ({ id, enabled: checked.has(id) })))
        else await modManager.setEnabled(enabled)
        for (const id of pendingUninstalls) {
            await manager.uninstall(id)
            pendingUninstalls.delete(id)
        }
        if (restart) await options.restart()
        else dialog.close(true)
    }

    dialog.onConfirm = () => { void run(apply) }
    dialog.onKeyDown = event => event.keyCode === KeyCode.SPACE
    await refresh()
    const draft = () => JSON.stringify([ordered ? order : [], [...checked].sort()])
    const initialDraft = draft()
    dialog.onCancel = () => { void run(async () => {
        if (pendingUninstalls.size || draft() !== initialDraft) {
            const discard = await ui.dialog(dialog.node, {
                title: ui.text('ARE_YOU_SURE'),
                message: ui.text('PACKAGE_DISCARD_WARNING', 'Unapplied changes will not be saved. Discard them?'),
                confirmText: ui.text('BUTTON_YES'), cancelText: ui.text('BUTTON_NO'),
            }).result
            if (!discard || !dialog.node.isValid) return
        }
        dialog.close(false)
    }) }
    return dialog
}
