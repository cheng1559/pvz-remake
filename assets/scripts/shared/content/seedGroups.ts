import { BASE_MOD_ID } from '@/shared/mod'
import { CHOOSER_PLACES, type GameplayDefinitions, type SeedDefinition } from './gameplayTypes'

/**
 * The groups seeds are laid out in by their `position`, each numbered on its own: the original seeds (the chooser's
 * grid, BASE_MOD_ID), each Mod's own seeds (by its ID, the seeds' namespace), and the base game's hidden cards. A Mod's
 * seeds are never in the grid nor among the hidden cards, so Mods cannot take each other's places.
 */
export const HIDDEN_SEEDS = '#hidden'

/** The group a seed is laid out in: the hidden cards, or the group of the Mod that adds it (the base game's grid). */
export function seedGroup(id: string, seed: Pick<SeedDefinition, 'hidden'>): string {
    return seed.hidden ? HIDDEN_SEEDS : id.slice(0, id.indexOf(':'))
}

/**
 * The groups in their order: the original seeds, each Mod's in the order the Mods were installed, then the hidden
 * cards; each group's seeds in place order. The original group is there even with no seed.
 */
export function seedGroups(definitions: Pick<GameplayDefinitions, 'seeds'>): Array<{ group: string, seeds: string[] }> {
    const groups = new Map<string, string[]>([[BASE_MOD_ID, []]])
    for (const [id, seed] of Object.entries(definitions.seeds)) {
        const group = seedGroup(id, seed)
        if (group !== HIDDEN_SEEDS) groups.set(group, [...groups.get(group) ?? [], id])
    }
    groups.set(HIDDEN_SEEDS, Object.keys(definitions.seeds).filter(id => definitions.seeds[id].hidden))
    const place = (id: string) => definitions.seeds[id].position
    return [...groups].filter(([group, seeds]) => group === BASE_MOD_ID || seeds.length)
        .map(([group, seeds]) => ({ group, seeds: seeds.sort((left, right) => place(left) - place(right)) }))
}

/** The original seeds, the chooser's grid (SeedChooserScreen::GetSeedPositionInChooser), in place order. */
export function chooserSeeds(definitions: Pick<GameplayDefinitions, 'seeds'>): string[] {
    return seedGroups(definitions)[0].seeds
}

/** A card of a group's page: its seed, at a grid place (8 columns in reading order from 0). */
export interface GroupCard { seedId: string, place: number }

/**
 * The pages of the groups after the original seeds' (each Mod's, then the hidden cards): each group from a page of its
 * own, each seed on the page and at the place its position gives (CHOOSER_PLACES a page), pages with no seed left out.
 * The chooser (with `/cheatseed`) and the almanac (with `/cheatseed`) turn to them after their first page.
 */
export function seedGroupPages(definitions: Pick<GameplayDefinitions, 'seeds'>): GroupCard[][] {
    return seedGroups(definitions).slice(1).flatMap(({ seeds }) => {
        const pages: GroupCard[][] = []
        for (const seedId of seeds) {
            const position = definitions.seeds[seedId].position
            ;(pages[Math.floor(position / CHOOSER_PLACES)] ??= []).push({ seedId, place: position % CHOOSER_PLACES })
        }
        return pages.filter(page => page.length)
    })
}
