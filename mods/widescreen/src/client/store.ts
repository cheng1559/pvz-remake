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
        this.sprites.store_car = open
        this.sprites.store_carclosed = closed
        this.sprites.store_hatchbackopen = hatch
        this.car.spriteFrame = wasClosed ? closed : open
        this.hatch.getComponent(Sprite).spriteFrame = hatch
        const transform = this.car.node.getComponent(UITransform)
        transform.setContentSize(781, 494)
        // Ultimate draws at (198,136); keep the existing (196,138) shake origin.
        transform.setAnchorPoint(-2 / 781, 1 - 2 / 494)
        return result
    })
}
