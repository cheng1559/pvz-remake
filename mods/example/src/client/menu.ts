import type { Context } from './types.js'

export async function installMenu({ host, assets }: Context, help: string, playChime: () => void): Promise<void> {
    const frame = await assets.sprite('assets/sprites/button.png')
    const { MainMenuScreen } = host.get('client/screens/MainMenuScreen')
    const { uiNode } = host.get('client/view/uiNode')
    const { Node } = host.get('cc')
    const owned = new Set<any>()
    const screens = new WeakSet<object>()
    host.around(MainMenuScreen.prototype, 'initialize', async function (next, ui, ...args) {
        await next(ui, ...args)
        if (!this.node.isValid || screens.has(this)) return
        screens.add(this)
        const root = uiNode({ name: 'ExampleModLab', parent: this.node,
            position: { x: -384, y: 200 }, anchor: { x: 0, y: 1 } }).node
        owned.add(root)
        root.once(Node.EventType.NODE_DESTROYED, () => owned.delete(root))
        const button = ui.button(root, {
            x: 0, y: 0, width: 160, height: 32, text: ui.text('example:menu'),
            images: { normal: frame }, pressSound: null, clickSound: null,
            onClick: () => {
                const dialog = ui.dialog(this.node, { title: ui.text('example:title'),
                    message: help, width: 650, height: 380, confirmText: 'OK', clickSound: null })
                owned.add(dialog.node)
                dialog.node.once(Node.EventType.NODE_DESTROYED, () => owned.delete(dialog.node))
            },
        })
        // Replace a real callback on this one button, leaving all other buttons alone.
        const restorePress = host.replace(button, 'onPress', playChime)
        root.once(Node.EventType.NODE_DESTROYED, restorePress)
    })
    // ModHost owns method patches. Also dispose nodes that this Mod created in live screens.
    host.around(host, 'dispose', function (next) {
        for (const node of owned) if (node.isValid) node.destroy()
        owned.clear()
        return next()
    })
}
