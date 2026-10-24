import type { ClientApi } from './index.js'
import { coverBackground } from './background.js'

export async function installGardenBackgrounds(api: ClientApi): Promise<void> {
    const names: Record<string, string> = {
        garden: 'background_greenhouse', mushroom: 'background_mushroomgarden', aquarium: 'aquarium1', tree: 'tree_bg',
    }
    const frames = new Map(await Promise.all(Object.values(names)
        .map(async name => [name, await api.assets.sprite(`assets/images/${name}.png`)] as const)))
    const { js } = api.host.get('cc')
    const MenuScreen = js.getClassByName('MenuScreen'), installed = new WeakSet<object>()
    api.host.around(MenuScreen.prototype, 'prepare', async function (next, id, ...args) {
        const page = await next(id, ...args), name = names[id]
        if (name && page.root.isValid && !installed.has(page.root)) {
            const node = page.root.getChildByName(name)
            coverBackground(api, node, frames.get(name))
            installed.add(page.root)
        }
        return page
    })
}
