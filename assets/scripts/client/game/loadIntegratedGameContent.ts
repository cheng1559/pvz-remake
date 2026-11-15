import { buildGameplayContent } from '@/shared/content/DefinitionRegistry'
import { loadPresentationDefinitions } from '@/client/content/loadPresentationDefinitions'
import { modResources } from '@/client/content/ModResources'
import { installedMods } from '@/client/content/installedMods'
import { ClientAnimationRegistry } from '@/client/content/ClientAnimationRegistry'
import { assertPresented } from '@/client/content/assertPresented'
import { contentJson } from '@/shared/mod/content'

// Preserve the installed asset ID and prefab UUID for existing content packs and saves.
export const LEVEL_PREFAB_ID = 'pvz:level'

let gameplayContent: ReturnType<typeof buildGameplay> | undefined
let integratedContent: ReturnType<typeof buildIntegrated> | undefined

/** The gameplay definitions and levels with the enabled Mods' changes, built once, without loading any level assets. */
export function loadGameplayContent() {
    return gameplayContent ??= buildGameplay().catch(error => { gameplayContent = undefined; throw error })
}

/** Everything a level and what is shown off the board are drawn with, loaded once. */
export function loadIntegratedGameContent() {
    return integratedContent ??= buildIntegrated().catch(error => { integratedContent = undefined; throw error })
}

async function buildGameplay() {
    const [base, mods] = await Promise.all([modResources.baseContent(), installedMods()])
    if (!base.content.gameplay) throw new Error('Base content does not define gameplay')
    const gameplay = contentJson(base.files, base.content.gameplay)
    return { gameplay, ...buildGameplayContent(gameplay, mods.gameplayDefinitions) }
}

async function buildIntegrated() {
    const [base, loadedMods, { definitions, levels }, levelPrefab, presentation] = await Promise.all([
        modResources.baseContent(), installedMods(), loadGameplayContent(), modResources.prefab(LEVEL_PREFAB_ID), loadPresentationDefinitions(),
    ])
    const animations = new ClientAnimationRegistry(presentation)
    animations.freeze()
    const { views } = loadedMods
    views.freeze()
    assertPresented({ definitions, levels }, presentation, views)
    const enabledMods = loadedMods.manifests
        .filter(mod => mod.gameplay !== undefined || loadedMods.gameplayDefinitions.some(source => source.ownerId === mod.id))
        .map(mod => ({ id: mod.id, version: mod.version, contentHash: mod.contentHash }))
    const { id, version, contentHash } = base.manifest
    return {
        definitions, presentation, levels, levelPrefab,
        /** The base content a save is made with (GameSave.contentSet.base). */
        base: { id, version, contentHash },
        enabledMods, animations, views,
    }
}
