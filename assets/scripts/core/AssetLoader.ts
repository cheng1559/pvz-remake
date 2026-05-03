import { Asset, resources } from 'cc'

export class AssetLoader {
    private static _pending: Map<string, Promise<Asset | null>> = new Map()

    static load<T extends Asset>(
        path: string,
        type: any,
        label: string | null = path,
    ): Promise<T | null> {
        const key = `${type.name}:${path}`
        const pending = this._pending.get(key) as Promise<T | null> | undefined
        if (pending) return pending

        const promise = new Promise<T | null>((resolve) => {
            resources.load(path, type, (err, asset) => {
                this._pending.delete(key)
                if (err || !asset) {
                    if (label) {
                        console.warn(`[AssetLoader] Failed to load ${label}`, err)
                    }
                    resolve(null)
                    return
                }
                resolve(asset)
            })
        })
        this._pending.set(key, promise as Promise<Asset | null>)
        return promise
    }

    static clearPending() {
        this._pending.clear()
    }
}
