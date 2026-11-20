import assert from 'node:assert/strict'
import test from 'node:test'
import { menuApi } from '@/client/api/MenuApi'
import { connectLocalMenuApi } from '@/app/LocalMenuApi'
import type { MenuStorage } from '@/shared/menu'

test('saved settings answer before the menu catalogs load, so startup music uses the saved volume', async () => {
    const items = new Map<string, string>()
    const storage: MenuStorage = {
        getItem: key => items.get(key) ?? null,
        setItem: (key, value) => { items.set(key, value) },
        removeItem: key => { items.delete(key) },
        key: index => [...items.keys()][index] ?? null,
        get length() { return items.size },
    }
    // The catalogs wait on the game content, which is still loading while the title screen plays its music.
    connectLocalMenuApi(storage, () => null, () => false, new Promise(() => {}))

    assert.equal((await menuApi.updateSettings({ musicVolume: 0 })).musicVolume, 0)
    assert.equal((await menuApi.getSettings()).musicVolume, 0)

    // Everything else still waits for the catalogs.
    const store = Promise.race([menuApi.getStore().then(() => 'answered'), new Promise(resolve => setTimeout(resolve, 20, 'waiting'))])
    assert.equal(await store, 'waiting')
})
