import { installMenuAnimation } from './menu.js'

export interface ClientApi {
    expandViewport(options?: { minAspect?: number, maxAspect?: number }): void
    loadSprite(path: string): Promise<any>
    enhanceScreen(targetId: string, apply: (context: {
        node: any, backdropParent: any, background: any, engine: any,
    }) => () => void): void
}

export async function register(api: ClientApi): Promise<void> {
    // Global viewport/input adaptation is independent of the menu's artwork.
    api.expandViewport({ minAspect: 4 / 3, maxAspect: 32 / 9 })
    await installMenuAnimation(api)
}
