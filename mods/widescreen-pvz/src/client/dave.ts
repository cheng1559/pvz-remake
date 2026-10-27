import type { ClientApi } from './index.js'
import { extendDave } from './animations.js'

export function installDaveAnimation(api: ClientApi): void {
    const { ReanimPlayer } = api.host.get('client/reanim/ReanimPlayer')
    const { view } = api.host.get('cc')
    const sources = new WeakMap<object, ReturnType<typeof extendDave>>()
    api.host.around(ReanimPlayer.prototype, 'play', function (next, ...args) {
        const entering = this.loadedId === 'pvz:dave_enter'
        if (entering || this.loadedId === 'pvz:dave_leave') {
            const source = sources.get(this) ?? this.getAnimation()
            sources.set(this, source)
            this.replaceAnimation(extendDave(source, view.getVisibleSize().width, entering))
        }
        return next(...args)
    })
}
