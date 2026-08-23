import { assetManager, JsonAsset } from 'cc'

interface GameplayDefinition {
    id: string
    kind: string
}

interface GameplayModule {
    register(api: {
        registerDefinition(definition: GameplayDefinition): void
        enhanceSystem(targetId: string, enhancer: unknown): void
    }): void | Promise<void>
}

interface Phase0PlatformProbe {
    loadGameplayModule(url: string): Promise<GameplayDefinition[]>
    loadClientBundle(url: string): Promise<unknown>
}

type AssetBundle = NonNullable<ReturnType<typeof assetManager.getBundle>>
type ProbeGlobal = typeof globalThis & { pvzPhase0?: Phase0PlatformProbe }

export function installPhase0PlatformProbe() {
    const probeGlobal = globalThis as ProbeGlobal
    if (probeGlobal.pvzPhase0) return

    probeGlobal.pvzPhase0 = {
        async loadGameplayModule(url) {
            if (/^[A-Za-z]:[\\/]/.test(url)) url = `no-schema:/${url.replace(/\\/g, '/')}`
            const gameplay = await import(url) as GameplayModule
            if (typeof gameplay.register !== 'function') throw new Error('Gameplay module must export register(api)')

            const definitions: GameplayDefinition[] = []
            await gameplay.register({
                registerDefinition: definition => definitions.push(definition),
                enhanceSystem: () => {},
            })
            return definitions
        },
        async loadClientBundle(url) {
            const bundle = await new Promise<AssetBundle>((resolve, reject) => {
                assetManager.loadBundle(url, (error, loadedBundle) => error ? reject(error) : resolve(loadedBundle))
            })
            const marker = await new Promise<JsonAsset>((resolve, reject) => {
                bundle.load('marker', JsonAsset, (error, asset) => error ? reject(error) : resolve(asset))
            })
            return marker.json
        },
    }
}
