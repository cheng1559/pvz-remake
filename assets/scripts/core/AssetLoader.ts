import { Asset, resources } from 'cc'

export class AssetLoader {
    private static _pending: Map<string, Promise<Asset | null>> = new Map()
    private static _pendingDirs: Map<string, Promise<Asset[]>> = new Map()

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

    static loadDir<T extends Asset>(
        path: string,
        type: any,
        label: string | null = path,
    ): Promise<T[]> {
        const key = `${type.name}:${path}`
        const pending = this._pendingDirs.get(key) as Promise<T[]> | undefined
        if (pending) return pending

        const promise = new Promise<T[]>((resolve) => {
            resources.loadDir(path, type, (err, assets) => {
                this._pendingDirs.delete(key)
                if (err || !assets) {
                    if (label) {
                        console.warn(`[AssetLoader] Failed to load ${label}`, err)
                    }
                    resolve([])
                    return
                }
                resolve(assets as T[])
            })
        })
        this._pendingDirs.set(key, promise as Promise<Asset[]>)
        return promise
    }

    static clearPending() {
        this._pending.clear()
        this._pendingDirs.clear()
    }
}
