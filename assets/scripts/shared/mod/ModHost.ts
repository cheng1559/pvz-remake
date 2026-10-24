type Method = (...args: any[]) => any
type Wrapper = (this: any, next: Method, ...args: any[]) => any
interface Patch { handler: Wrapper }
interface Point { original: Method, descriptor?: PropertyDescriptor, patches: Patch[], dispatch: Method }
const points = new WeakMap<object, Map<PropertyKey, Point>>()

/** Modules expose real host objects; patches keep receiver identity and compose across Mods. */
export class ModHost {
    private readonly cleanup: Array<() => void> = []
    constructor(readonly ownerId: string, private readonly modules: Readonly<Record<string, unknown>>) {}

    get<T = any>(id: string): T {
        if (!Object.hasOwn(this.modules, id)) throw new Error(`Host module is unavailable: ${id}`)
        return this.modules[id] as T
    }

    around(target: object, key: PropertyKey, handler: Wrapper): () => void {
        if (typeof handler !== 'function') throw new Error('Host wrapper must be a function')
        let methods = points.get(target)
        if (!methods) points.set(target, methods = new Map())
        let point = methods.get(key)
        if (!point) {
            const original = Reflect.get(target, key)
            if (typeof original !== 'function') throw new Error(`Host method is unavailable: ${String(key)}`)
            const descriptor = Object.getOwnPropertyDescriptor(target, key)
            point = { original, descriptor, patches: [], dispatch: function (...args) {
                const receiver = this
                const chain = point!.patches.slice()
                const invoke = (index: number, values: any[]): any => index < 0
                    ? original.apply(receiver, values)
                    : chain[index].handler.call(receiver,
                        (...next) => invoke(index - 1, next.length ? next : values), ...values)
                return invoke(chain.length - 1, args)
            } }
            Object.defineProperty(target, key, { configurable: true, enumerable: descriptor?.enumerable ?? false, writable: true, value: point.dispatch })
            methods.set(key, point)
        }
        const patch = { handler }
        point.patches.push(patch)
        const dispose = () => {
            const index = point!.patches.indexOf(patch)
            if (index < 0) return
            point!.patches.splice(index, 1)
            if (point!.patches.length) return
            if (Reflect.get(target, key) === point!.dispatch) {
                if (point!.descriptor) Object.defineProperty(target, key, point!.descriptor)
                else Reflect.deleteProperty(target, key)
            }
            methods!.delete(key)
        }
        this.cleanup.push(dispose)
        return dispose
    }

    replace(target: object, key: PropertyKey, replacement: Method): () => void {
        if (typeof replacement !== 'function') throw new Error('Host replacement must be a function')
        return this.around(target, key, function (_next, ...args) { return replacement.apply(this, args) })
    }

    dispose(): void {
        for (const cleanup of this.cleanup.splice(0).reverse()) {
            try { cleanup() } catch (error) { console.error(`[Mods] Failed to clean up ${this.ownerId}`, error) }
        }
    }
}
