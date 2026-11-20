import { buildPresentationDefinitions } from '@/shared/content/DefinitionRegistry'
import { contentJson, type ContentArchive } from '@/shared/mod/content'
import type { PresentationDefinitions } from '@/shared/content/presentation'
import { modResources } from './ModResources'
import { SoundSystem } from '@/client/sound/SoundSystem'
import { installedMods } from './installedMods'

let pending: Promise<PresentationDefinitions> | undefined

/** The base archive's presentation tables, before any Mod's layer. */
export function basePresentationJson(base: ContentArchive): unknown {
    if (!base.content.presentation) throw new Error('Base content does not define presentation')
    return contentJson(base.files, base.content.presentation)
}

/**
 * The presentation: the base's with the running Mods' layers on it, built once for the UI and the game alike. Its
 * foley tables are the sound system's from here on.
 */
export function loadPresentationDefinitions(): Promise<PresentationDefinitions> {
    return pending ??= (async () => {
        const [base, mods] = await Promise.all([modResources.baseContent(), installedMods()])
        const presentation = buildPresentationDefinitions(basePresentationJson(base), mods.presentationDefinitions)
        SoundSystem.useFoley(presentation.foley)
        return presentation
    })().catch(error => { pending = undefined; throw error })
}
