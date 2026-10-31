import { BASE_MOD_ID } from '@/shared/mod'
import { Button, Color, director, Director, KeyCode, Node, UITransform } from 'cc'
import { FontMetricsUtil } from '@/client/font'
import { modManager, type ModImport } from '@/client/content/ModManager'
import { modResources } from '@/client/content/ModResources'
import { SoundEffect, SoundSystem } from '@/client/sound/SoundSystem'
import type { UI } from '@/client/ui/UI'
import { UIButton } from '@/client/ui/UIButton'
import type { UIDialog } from '@/client/ui/UIDialog'
import { uiNode } from '@/client/view/uiNode'
import { restartWithProgress } from './RestartingDialog'

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

export interface PackageDialogOptions {
    /** Picks and validates ZIPs without saving them; empty when cancelled or all failed. */
    import: () => Promise<ModImport[]>
    /** Saves the running level before handing the draft to the next startup. */
    save: () => Promise<unknown>
    /** Restarts after the pending changes have been persisted. */
    restart: () => Promise<void>
}

interface Entry { id: string, version?: string, author?: string, error?: string, builtin?: boolean }

/**
 * Imports, enabled states and uninstalls stay in the draft until Apply; Cancel discards them.
 * The Mod list order is its priority, highest first, and checking a row never moves it.
 * Dependencies load first; later Mods override earlier resources.
 */
export async function showPackageDialog(parent: Node, ui: UI, options: PackageDialogOptions): Promise<UIDialog> {
    const dialog = ui.dialog(parent, {
        title: ui.text('PACKAGE_MODS_TITLE'),
        width: 530, extraHeight: 270, tall: true,
        confirmText: ui.text('PACKAGE_APPLY'), cancelText: ui.text('BUTTON_CANCEL'),
    })
    dialog.onConfirm = () => {}
    dialog.onKeyDown = event => event.keyCode === KeyCode.SPACE
    const panel = dialog.content
    const footer = panel.getComponentsInChildren(UIButton)
    const left = footer[0].node, right = footer[1].node
    const importButton = ui.button(panel, {
        text: ui.text('PACKAGE_IMPORT'), x: left.position.x, y: -left.position.y - 46,
        width: right.position.x + right.getComponent(UITransform)!.width - left.position.x,
    })
    const width = panel.getComponent(UITransform)!.width - 142
    const list = uiNode({
        name: 'PackageList', parent: panel, position: { x: 66, y: -138 }, anchor: { x: 0, y: 1 },
        size: { width, height: LIST_HEIGHT }, graphics: true,
    })
    const background = list.graphics!
    background.fillColor = LIST_COLOR
    background.fillRect(0, -LIST_HEIGHT, width, LIST_HEIGHT)
    background.strokeColor = Color.BLACK
    background.lineWidth = 1
    background.rect(0, -LIST_HEIGHT, width, LIST_HEIGHT)
    background.stroke()
    const font = ui.assets.fonts.profile.config
    const metrics = FontMetricsUtil.getMetrics(font)
    const loading = ui.label(list.node, {
        text: 'Loading...', font: 'profile', color: TEXT_COLOR, width, align: 'center',
        y: Math.floor((LIST_HEIGHT - metrics.height) / 2) - metrics.ascentPadding,
    })
    // Paint Loading before reading and unpacking installed Mods.
    await new Promise<void>(resolve => director.once(Director.EVENT_AFTER_DRAW, () => setTimeout(resolve, 0)))
    if (!dialog.node.isValid || !dialog.node.activeInHierarchy) return dialog
    const manager = modManager
    let initial: string[], installedEntries: Entry[], baseEntry: Entry = { id: BASE_MOD_ID, builtin: true }
    try {
        initial = await manager.list()
        installedEntries = await manager.installed()
        // The built-in base row shows its own version (and author) like the installed Mods.
        const base = await modResources?.baseContent?.().then(archive => archive.manifest).catch(() => undefined)
        baseEntry = { id: BASE_MOD_ID, builtin: true, ...(base ? { version: base.version, ...(base.author ? { author: base.author } : {}) } : {}) }
    } catch (error) {
        dialog.close(false)
        throw error
    }
    if (!dialog.node.isValid || !dialog.node.activeInHierarchy) return dialog
    loading.node.destroy()
    const checked = new Set(initial)
    const pendingUninstalls = new Set<string>()
    const pendingImports = new Map<string, ModImport>()
    void dialog.result.then(async () => {
        await manager.discardImports([...pendingImports.values()])
        pendingImports.clear()
    }).catch(error => console.warn('[Mods] Failed to discard staged imports', error))
    /** Display order; the first row has the highest priority. */
    let entries: Entry[] = []
    let order = installedEntries.map(entry => entry.id)
    let busy = false
    let restarting = false

    const fail = (error: unknown) => {
        if (dialog.node.isValid) ui.dialog(dialog.node, { title: ui.text('ERROR_HEADER'), message: error instanceof Error ? error.message : String(error) })
    }
    const scroll = ui.scroll(panel, { x: 66, y: 138, width, height: LIST_HEIGHT, contentHeight: 0, wheelStep: ROW_HEIGHT })
    const textY = Math.floor((ROW_HEIGHT - metrics.height) / 2) - metrics.ascentPadding

    /** Runs one operation at a time, reporting failures without closing the manager. */
    async function run(operation: () => Promise<void>): Promise<void> {
        if (busy || restarting || !dialog.node.activeInHierarchy) return
        busy = true
        try { await operation() } catch (error) { fail(error) } finally { busy = false }
    }

    // Imports and uninstalls stay in the draft until Apply, so the installed list read on opening is still current.
    async function refresh(installed: Entry[] = installedEntries): Promise<void> {
        if (!dialog.node.isValid) return
        const merged = new Map(installed.map(entry => [entry.id, entry]))
        for (const { id, version, author } of pendingImports.values()) merged.set(id, { id, version, author })
        installed = [...merged.values()]
        const ids = installed.filter(entry => !pendingUninstalls.has(entry.id)).map(entry => entry.id)
        order = [...order, ...ids].filter((id, index, all) => all.indexOf(id) === index && ids.includes(id))
        for (const id of checked) if (!order.includes(id)) checked.delete(id)
        entries = order.map(id => installed.find(entry => entry.id === id)!)
        entries.push(baseEntry)
        render()
    }

    function render(): void {
        const offset = scroll.offset
        for (const child of [...scroll.content.children]) { child.active = false; child.destroy() }
        scroll.setContentHeight(entries.length * ROW_HEIGHT)
        if (!entries.length) {
            const text = ui.text('PACKAGE_NO_MODS')
            ui.label(scroll.content, {
                text, font: 'profile', color: DIM_COLOR, y: textY,
                x: Math.max(0, Math.floor((width - FontMetricsUtil.measureTextWidth(font, text)) / 2)),
            })
        }
        const columns = layoutColumns(scroll.contentWidth)
        entries.forEach((entry, index) => renderRow(entry, index, scroll.contentWidth, columns))
        scroll.offset = offset
    }

    const measure = (text: string) => FontMetricsUtil.measureTextWidth(font, text)

    /** Versions share one column, so they line up down the list; names get the space before it. */
    function layoutColumns(rowWidth: number): { nameWidth: number, versionX: number, right: number } {
        const right = rowWidth - measure(ui.text('PACKAGE_UNINSTALL')) - 8 - 2 * ARROW_WIDTH - 14
        // A fixed share of the row, unless the widest version would run past the arrows.
        const versionX = Math.min(46 + Math.round((right - 46) * 0.8), right - Math.max(0, ...entries.map(entry => measure(entry.version ?? ''))))
        return { nameWidth: Math.max(0, versionX - measure('    ') - 46), versionX, right }
    }

    function renderRow(entry: Entry, index: number, rowWidth: number, columns: ReturnType<typeof layoutColumns>): void {
        const row = uiNode({
            name: `Package-${index}`, parent: scroll.content, active: false, position: { y: -index * ROW_HEIGHT },
            size: { width: rowWidth, height: ROW_HEIGHT }, anchor: { x: 0, y: 1 },
        }).node
        const toggle = (value: boolean) => { if (value) checked.add(entry.id); else checked.delete(entry.id) }
        // The base game stays on: its box and name answer clicks with a note, as the options' 3D acceleration box does.
        const locked = entry.builtin ? () => {
            ui.dialog(dialog.node, { title: ui.text('PACKAGE_BASE_REQUIRED_HEADER'), message: ui.text('PACKAGE_BASE_REQUIRED_BODY') })
        } : undefined
        const checkbox = ui.checkbox(row, {
            x: 6, y: Math.ceil(ROW_HEIGHT / 2 - CHECKBOX_CENTER_Y * CHECKBOX_SCALE), value: entry.builtin || checked.has(entry.id), onChange: toggle, locked,
        })
        checkbox.node.setScale(CHECKBOX_SCALE, CHECKBOX_SCALE)
        const text = ui.text('PACKAGE_UNINSTALL')
        const textWidth = FontMetricsUtil.measureTextWidth(font, text)
        const uninstallX = rowWidth - textWidth - 8
        const nameRight = entry.builtin ? rowWidth - 8 : columns.right
        const nameWidth = Math.max(0, nameRight - 46)
        const suffix = entry.error ? ' [Error]' : ''
        let id = entry.id
        if (measure(id + suffix) > columns.nameWidth) {
            while (id.length && measure(id + '...' + suffix) > columns.nameWidth) id = id.slice(0, -1)
            id += '...'
        }
        const nameColor = entry.error ? LINK_COLOR : TEXT_COLOR
        const labels = [ui.label(row, { text: id + suffix, font: 'profile', color: nameColor, x: 46, y: textY })]
        if (entry.version) labels.push(ui.label(row, { text: entry.version, font: 'profile', color: nameColor, x: columns.versionX, y: textY }))
        if (entry.error) ui.tooltip(row, { text: entry.error })
        if (locked) {
            rowButton(row, 46, nameWidth, nameColor, true, locked, color => { for (const label of labels) label.renderer.fontColor = color })
            row.active = true
            return
        }

        const label = ui.label(row, { text, font: 'profile', color: LINK_COLOR, x: uninstallX, y: textY })
        rowButton(row, uninstallX, textWidth, LINK_COLOR, true, () => { void run(() => uninstallEntry(entry.id)) },
            color => { label.renderer.fontColor = color })
        // Clicking the name toggles the checkbox, as clicking the box does.
        rowButton(row, 46, nameWidth, nameColor, true, () => {
            checkbox.value = !checkbox.value
            toggle(checkbox.value)
        }, color => { for (const label of labels) label.renderer.fontColor = color })
        {
            arrowButton(row, uninstallX - 2 * ARROW_WIDTH - 10, true, index > 0, () => move(index, -1))
            arrowButton(row, uninstallX - ARROW_WIDTH - 6, false, index < order.length - 1, () => move(index, 1))
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
        button.onPress = () => { void SoundSystem.play(SoundEffect.ButtonClick) }
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
        return ids.reverse()
    }

    async function importArchive(): Promise<void> {
        const imports = await options.import()
        if (!dialog.node.isValid) { await manager.discardImports(imports); return }
        if (!imports.length) return
        for (const mod of imports) {
            const { id } = mod
            const previous = pendingImports.get(id)
            if (previous) await manager.discardImports([previous])
            pendingImports.set(id, mod)
            pendingUninstalls.delete(id)
            if (!order.includes(id)) order.unshift(id)
            checked.add(id)
        }
        await refresh()
    }

    async function uninstallEntry(id: string): Promise<void> {
        const confirmed = await ui.dialog(dialog.node, {
            title: ui.text('ARE_YOU_SURE'), message: ui.text('PACKAGE_UNINSTALL_WARNING').replace('%s', id),
            confirmText: ui.text('BUTTON_YES'), cancelText: ui.text('BUTTON_NO'),
        }).result
        if (!confirmed || !dialog.node.isValid) return
        const imported = pendingImports.get(id)
        if (imported) await manager.discardImports([imported])
        pendingImports.delete(id)
        if (installedEntries.some(entry => entry.id === id)) pendingUninstalls.add(id)
        checked.delete(id)
        await refresh()
    }

    async function apply(): Promise<void> {
        const enabled = enabledDraft()
        const same = enabled.length === initial.length
            && enabled.every((id, index) => initial[index] === id)
        const restart = !same || pendingImports.size > 0 || pendingUninstalls.size > 0
        if (restart) {
            const confirmed = await ui.dialog(dialog.node, {
                title: ui.text('PACKAGE_RESTART_HEADER'),
                message: ui.text('PACKAGE_RESTART_BODY'),
                confirmText: ui.text('BUTTON_OK'), cancelText: ui.text('BUTTON_CANCEL'),
            }).result
            if (!confirmed || !dialog.node.isValid) return
        }
        if (restart) {
            await restartWithProgress(dialog.node, ui, async () => {
                await options.save()
                await manager.queueChanges({ enabled, order, imports: [...pendingImports.values()], uninstalls: [...pendingUninstalls] })
                pendingImports.clear()
                restarting = true
                await options.restart()
            })
        } else {
            await manager.setEnabled(enabled, order)
            dialog.close(true)
        }
    }

    dialog.onConfirm = () => { void run(apply) }
    dialog.onKeyDown = event => event.keyCode === KeyCode.SPACE
    await refresh(installedEntries)
    const draft = () => JSON.stringify([order, [...checked].sort()])
    const initialDraft = draft()
    dialog.onCancel = () => { void run(async () => {
        if (pendingImports.size || pendingUninstalls.size || draft() !== initialDraft) {
            const discard = await ui.dialog(dialog.node, {
                title: ui.text('ARE_YOU_SURE'),
                message: ui.text('PACKAGE_DISCARD_WARNING'),
                confirmText: ui.text('BUTTON_YES'), cancelText: ui.text('BUTTON_NO'),
            }).result
            if (!discard || !dialog.node.isValid) return
        }
        dialog.close(false)
    }) }
    importButton.onClick = () => { void run(importArchive) }
    return dialog
}
