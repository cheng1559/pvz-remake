import { Asset, EffectAsset, resources } from 'cc'
import { modResources } from './ModResources'

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

        const promise = (async () => {
            const replacement = await modResources.asset<T>(path, type)
            if (replacement !== undefined) return replacement
            if (type !== EffectAsset) {
                if (label) console.warn(`[AssetLoader] Missing archive asset: ${label}`)
                return null
            }
            return new Promise<T | null>((resolve) => {
                resources.load<T>(path, type, (err, asset) => {
                    if (err || !asset) {
                        if (label) console.warn(`[AssetLoader] Failed to load ${label}`, err)
                        resolve(null)
                        return
                    }
                    resolve(asset)
                })
            })
        })().finally(() => this._pending.delete(key))
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

        const promise = modResources.ids(type, `pvz:${path}/`).then(ids => Promise.all(ids.map(id => this.load<T>(id, type, label))))
            .then(assets => assets.filter(asset => asset !== null) as T[])
            .finally(() => this._pendingDirs.delete(key))
        this._pendingDirs.set(key, promise as Promise<Asset[]>)
        return promise
    }
}
