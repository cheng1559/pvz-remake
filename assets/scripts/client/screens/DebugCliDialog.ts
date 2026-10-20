import { _decorator, Color, Component, UITransform, type Node } from 'cc'
import { SoundEffect, SoundLoader } from '@/client/sound/LegacySoundSystem'
import type { UI } from '@/client/ui/UI'
import type { UIDialog } from '@/client/ui/UIDialog'
import type { UIInput } from '@/client/ui/UIInput'
import { getDebugCliCompletions, getDebugCliSuffix, type DebugCliCatalog, type DebugCliResult } from '@/shared/debug/DebugCli'

const { ccclass } = _decorator
const COMMAND_COLOR = new Color(240, 240, 255)

@ccclass('DebugCliDialog')
class DebugCliDialog extends Component {
    private static readonly history: string[] = []
    private field!: UIInput
    private dialog!: UIDialog
    private historyIndex = -1
    private draft = ''
    private candidates: string[] = []
    private candidateIndex = -1
    private flash = 0
    private busy = false
    private catalog?: DebugCliCatalog
    private execute!: (command: string) => Promise<DebugCliResult>
    result: DebugCliResult | null = null

    initialize(dialog: UIDialog, ui: UI, execute: (command: string) => Promise<DebugCliResult>, catalog?: DebugCliCatalog): void {
        this.dialog = dialog
        this.execute = execute
        this.catalog = catalog
        const { width, height } = dialog.content.getComponent(UITransform)!
        this.field = ui.input(dialog.content, {
            value: '/', x: 40, y: height - 159, width: width - 90, height: 36, maxLength: 120,
            filter: value => value.replace(/[^\x20-\x7e]/g, ''),
            completion: value => getDebugCliSuffix(value, this.catalog),
            onKey: key => this.key(key),
            onChange: value => {
                this.historyIndex = -1
                this.candidates = []
                if (!value) dialog.close(false)
            },
            onSubmit: () => { void this.submit() }, onCancel: () => dialog.onCancel(),
        })
        dialog.onConfirm = () => { void this.submit() }
        dialog.onCancel = () => { if (!this.busy) dialog.close(false) }
        this.field.focus()
    }

    private key(key: string): boolean {
        if (this.busy) return true
        if (key !== 'Tab') this.candidates = []
        const value = this.field.value
        if (key === 'Tab') {
            if (this.field.hasSelection || this.field.cursorPosition !== value.length) return true
            if (this.candidates[this.candidateIndex] !== value || !this.candidates.length) {
                this.candidates = getDebugCliCompletions(value, this.catalog, true)
                this.candidateIndex = -1
            }
            if (this.candidates.length) {
                this.candidateIndex = (this.candidateIndex + 1) % this.candidates.length
                this.field.value = this.candidates[this.candidateIndex]
                this.historyIndex = -1
            }
            return true
        }
        if (key !== 'ArrowUp' && key !== 'ArrowDown') return false
        const history = DebugCliDialog.history
        if (!history.length || key === 'ArrowDown' && this.historyIndex < 0) return true
        if (key === 'ArrowUp' && history.length) {
            if (this.historyIndex < 0) { this.draft = value; this.historyIndex = history.length }
            this.historyIndex = Math.max(0, this.historyIndex - 1)
        } else if (this.historyIndex >= 0 && ++this.historyIndex >= history.length) this.historyIndex = -1
        this.field.value = this.historyIndex < 0 ? this.draft : history[this.historyIndex]
        return true
    }

    private async submit(): Promise<void> {
        if (this.busy) return
        const command = this.field.value.trim()
        const history = DebugCliDialog.history
        if (command) {
            const duplicate = history.indexOf(command)
            if (duplicate >= 0) history.splice(duplicate, 1)
            history.push(command)
            if (history.length > 64) history.shift()
        }
        this.busy = true
        try {
            const result = await this.execute(command)
            if (!this.node.isValid) return
            console[result.ok ? 'info' : 'warn'](`[Debug CLI] ${result.message}`)
            if (!result.ok && result.failure !== 'condition') {
                this.flash = 0.7
                this.field.focus()
            } else {
                this.result = result
                this.field.blur()
                this.dialog.close(result.ok)
            }
            void SoundLoader.play(result.ok ? SoundEffect.ButtonClick : SoundEffect.Buzzer)
        } catch (error) {
            console.error('[Debug CLI]', error)
            if (this.node.isValid) { this.flash = 0.7; this.field.focus() }
        } finally { this.busy = false }
    }

    protected update(dt: number): void {
        if (this.flash <= 0) return
        this.flash = Math.max(0, this.flash - dt)
        this.field.color = this.flash > 0 && Math.floor(this.flash * 10) % 2 === 0 ? Color.RED : COMMAND_COLOR
    }
}

export function showDebugCliDialog(parent: Node, ui: UI, execute: (command: string) => Promise<DebugCliResult>, catalog?: DebugCliCatalog): Promise<DebugCliResult | null> {
    const dialog = ui.dialog(parent, {
        title: 'DEBUG CLI', message: 'Enter debug command:', extraWidth: 110, extraHeight: 40,
        centerMessage: false, messageOffsetY: -8, confirmText: 'OK', cancelText: 'Cancel', clickSound: null,
    })
    const cli = dialog.node.addComponent(DebugCliDialog)
    cli.initialize(dialog, ui, execute, catalog)
    void SoundLoader.play(SoundEffect.GraveButton)
    return dialog.result.then(() => cli.result)
}
