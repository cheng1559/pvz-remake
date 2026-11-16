import * as engine from 'cc'
import { ModHost } from '@/shared/mod/ModHost'
import { ModAssets } from '@/shared/mod/ModAssets'
import type { DefinitionSources } from '@/shared/content/DefinitionRegistry'
import type { ClientViews } from './ClientViews'
import { modResources } from './ModResources'
import { CLIENT_HOST_MODULES } from './hostModules'

export class ClientModAssets extends ModAssets {
    /** An image file in this Mod's archive, read as is. */
    sprite(path: string) { return modResources.file(this.id, path, engine.SpriteFrame) }
    /** An image by resource ID: the Mod's own registration, unless a pack with higher priority replaces it (e.g. HD). */
    spriteResource(id: string) { return modResources.sprite(id) }
}

export function createClientModHost(ownerId: string, definitions: DefinitionSources, views: ClientViews): ModHost {
    // Every client module by its path (hostModules, generated), the engine, and the host's definitions and views.
    return new ModHost(ownerId, {
        ...CLIENT_HOST_MODULES,
        'cc': engine,
        'content/definitions': definitions,
        'client/views': views,
    })
}
