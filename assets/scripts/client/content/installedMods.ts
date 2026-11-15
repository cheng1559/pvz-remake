import type { DefinitionSource } from '@/shared/content/DefinitionRegistry'
import type { ModManifest } from '@/shared/mod'
import type { ArchiveContentRegistry } from './ArchiveContentRegistry'
import type { ClientViews } from './ClientViews'

/** What the client takes from the installed Mods: who they are, their resources and views, and their definition layers. */
export interface ClientMods {
    readonly manifests: readonly ModManifest[]
    readonly views: ClientViews
    readonly clientContent: ArchiveContentRegistry
    readonly gameplayDefinitions: readonly DefinitionSource[]
    readonly presentationDefinitions: readonly DefinitionSource[]
}

let source: (() => Promise<ClientMods>) | undefined

/**
 * The application hands the client its Mods at startup: they load once for both sides (app/ModLoader), so the client
 * asks for them here rather than reaching up into the application.
 */
export function provideInstalledMods(load: () => Promise<ClientMods>): void {
    source = load
}

export function installedMods(): Promise<ClientMods> {
    if (!source) return Promise.reject(new Error('The installed Mods are not provided'))
    return source()
}
