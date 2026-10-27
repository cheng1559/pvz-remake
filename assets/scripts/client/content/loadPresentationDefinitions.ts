import { buildPresentationDefinitions, type DefinitionSource } from '@/shared/content/DefinitionRegistry'
import { JsonAsset } from 'cc'
import { contentJson, type ContentArchive } from '@/shared/mod/content'
import type { PresentationDefinitions } from '@/shared/content/presentation'
import { modResources } from './ModResources'

export async function loadPresentationDefinitions(
    base: ContentArchive,
    sources?: readonly DefinitionSource[],
): Promise<PresentationDefinitions> {
    let definitions = sources
    if (!definitions) {
        // ModLoader supplies base sources during initialization; avoid a static import back to it.
        const { loadInstalledMods } = await import('@/app/ModLoader')
        definitions = (await loadInstalledMods()).presentationDefinitions
    }
    const parse = (value: unknown) => buildPresentationDefinitions(value, definitions)
    if (!base.content.presentation) throw new Error('Base content does not define presentation')
    const replacement = await modResources.asset('pvz:presentation/definitions', JsonAsset)
    return parse(replacement?.json ?? contentJson(base.files, base.content.presentation))
}
