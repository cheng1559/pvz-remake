import type { ClientApi } from './index.js'
import { coverBackground } from './background.js'

export async function installLoadingBackground(api: ClientApi): Promise<void> {
    const frame = await api.assets.sprite('assets/images/titlescreen.png')
    const { js } = api.host.get('cc')
    const StartupScreen = js.getClassByName('StartupScreen')
    const installed = new WeakSet<object>()
    // The first loadTitle may already be awaiting UI/Mods. Patch before drawing,
    // so that in-flight initialization gets the same background as later visits.
    api.host.around(StartupScreen.prototype, 'render', function (next, ...args) {
        const title = this.title
        if (title && !installed.has(title)) {
            coverBackground(api, title.children[0], frame, 400, -300)
            installed.add(title)
        }
        return next(...args)
    })
}
