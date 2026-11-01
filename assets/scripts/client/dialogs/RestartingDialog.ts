import type { Node } from 'cc'
import { waitForPreloadFrame } from '@/client/content/preloadTasks'
import type { UI } from '@/client/ui/UI'

/** Shows "Restarting...", which cannot be closed, draws it, then runs the restart; a failed restart closes it again. */
export async function restartWithProgress(parent: Node, ui: UI, restart: () => void | Promise<void>): Promise<void> {
    const progress = ui.dialog(parent, { title: ui.text('PACKAGE_RESTARTING'), footer: false, clickSound: null })
    progress.onConfirm = progress.onCancel = () => {}
    await waitForPreloadFrame()
    try { await restart() } catch (error) { progress.close(); throw error }
}
