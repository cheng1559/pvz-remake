import type { ClientApi } from './index.js'

export async function installStoreCar(api: ClientApi): Promise<void> {
    const [open, closed, hatch] = await Promise.all(['store_car', 'store_carclosed', 'store_hatchbackopen']
        .map(name => api.assets.sprite(`assets/images/${name}.png`)))
    const { js, Sprite, UITransform } = api.host.get('cc')
    const StoreScreen = js.getClassByName('PvZStoreScreen')
    api.host.around(StoreScreen.prototype, 'initialize', async function (next, ...args) {
        const result = await next(...args)
        if (!this.node.isValid) return result
        const wasClosed = this.car.spriteFrame === this.sprites.store_carclosed
        Object.assign(this.sprites, { store_car: open, store_carclosed: closed, store_hatchbackopen: hatch })
        this.car.spriteFrame = wasClosed ? closed : open
        this.hatch.getComponent(Sprite).spriteFrame = hatch
        this.car.sizeMode = Sprite.SizeMode.CUSTOM
        this.car.node.getComponent(UITransform).setContentSize(open.originalSize.width, open.originalSize.height)
        return result
    })
}
