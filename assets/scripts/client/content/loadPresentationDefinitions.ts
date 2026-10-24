import { buildPresentationDefinitions, type DefinitionSource } from '@/shared/content/DefinitionRegistry'
import { JsonAsset } from 'cc'
import type { ContentManifest } from '@/shared/content'
import type { PresentationDefinitions } from '@/shared/content/presentation'
import { resourcePacks } from './ResourcePacks'

export async function loadPresentationDefinitions(
    manifest: ContentManifest,
    sources?: readonly DefinitionSource[],
): Promise<PresentationDefinitions> {
    let definitions = sources
    if (!definitions) {
        // ModLoader supplies base sources during initialization; avoid a static import back to it.
        const { loadInstalledMods } = await import('@/app/ModLoader')
        definitions = (await loadInstalledMods()).presentationDefinitions
    }
    const parse = (value: unknown) => buildPresentationDefinitions(value, definitions)
    const path = manifest.presentation.definitions.replace(/\.json$/i, '')
    const id = manifest.id.slice(0, manifest.id.indexOf(':') + 1) + path
    const replacement = await resourcePacks.asset(id, JsonAsset)
    if (!replacement) throw new Error(`Missing presentation definitions: ${id}`)
    return parse(replacement.json)
}
