import { buildPresentationDefinitions, type DefinitionSource } from '@/shared/content/DefinitionRegistry'
import { JsonAsset } from 'cc'
import { contentJson, type ContentArchive } from '@/shared/mod/content'
import type { PresentationDefinitions } from '@/shared/content/presentation'
import { modResources } from './ModResources'
import { installedMods } from './installedMods'

/** The base presentation with `sources` layered on: the installed Mods' unless given (the Mod loader gives none). */
export async function loadPresentationDefinitions(
    base: ContentArchive,
    sources?: readonly DefinitionSource[],
): Promise<PresentationDefinitions> {
    const definitions = sources ?? (await installedMods()).presentationDefinitions
    const parse = (value: unknown) => buildPresentationDefinitions(value, definitions)
    if (!base.content.presentation) throw new Error('Base content does not define presentation')
    const replacement = await modResources.asset('pvz:presentation/definitions', JsonAsset)
    return parse(replacement?.json ?? contentJson(base.files, base.content.presentation))
}
