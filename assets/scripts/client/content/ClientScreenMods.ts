import { Node, ResolutionPolicy, screen, Sprite, UITransform, view } from 'cc'
import { loadInstalledMods } from './ModLoader'

const engine = { Node, ResolutionPolicy, screen, Sprite, UITransform, view }

export interface ClientScreenContext {
    node: Node
    backdropParent: Node
    background: Sprite
    engine: typeof engine
}

export type ClientScreenEnhancer = (context: ClientScreenContext) => void | (() => void)

export async function applyClientScreenMods(targetId: string, context: Omit<ClientScreenContext, 'engine'>): Promise<void> {
    const mods = await loadInstalledMods()
    if (!context.node.isValid) return
    for (const extension of mods.clientScreens) {
        if (extension.targetId !== targetId) continue
        const dispose = extension.apply({ ...context, engine })
        if (typeof dispose === 'function') context.node.once(Node.EventType.NODE_DESTROYED, dispose)
    }
}
