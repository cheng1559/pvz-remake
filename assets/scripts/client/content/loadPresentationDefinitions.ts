import { buildPresentationDefinitions, type DefinitionSource } from '@/shared/content/DefinitionRegistry'
import { loadInstalledMods } from '@/app/ModLoader'
import { JsonAsset } from 'cc'
import type { ContentManifest } from '@/shared/content'
import type { PresentationDefinitions } from '@/shared/content/presentation'
import { ClientContentLoader } from './ClientContentLoader'
import { resourcePacks } from './ResourcePacks'

export async function loadPresentationDefinitions(
    manifest: ContentManifest,
    loader: ClientContentLoader,
    sources?: readonly DefinitionSource[],
): Promise<PresentationDefinitions> {
    const definitions = sources ?? (await loadInstalledMods()).presentationDefinitions
    const parse = (value: unknown) => buildPresentationDefinitions(value, definitions)
    const path = manifest.presentation.definitions.replace(/\.json$/i, '')
    const id = manifest.id.slice(0, manifest.id.indexOf(':') + 1) + path
    const replacement = await resourcePacks.asset(id, JsonAsset)
    if (replacement) return parse(replacement.json)
    const bundle = await loader.loadBundle(manifest.client.bundle)
    const asset = bundle.get(path, JsonAsset) ?? await new Promise<JsonAsset>((resolve, reject) => {
        bundle.load(path, JsonAsset, (error, asset) => error ? reject(error) : resolve(asset))
    })
    return parse(asset.json)
}
