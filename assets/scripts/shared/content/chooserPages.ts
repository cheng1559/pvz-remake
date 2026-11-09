import { CHOOSER_PLACES, type GameplayDefinitions } from './gameplay'
import type { Team } from '@/shared/protocol'
import { BASE_MOD_ID, isOwnId } from '@/shared/mod'

/** A card on a chooser page: a seed, on `team` when not its seed's own, at a grid place (8 columns in reading order from 0). */
export interface ChooserPageCard { seedId: string, team?: Team, place: number }

/**
 * A page of the chooser: its cards, and whether they stand at their catalog places (`catalog`), where an empty place is
 * a seed not unlocked yet and keeps its silhouette, rather than one after another.
 */
export interface ChooserPage { cards: ChooserPageCard[], catalog: boolean }

/** A seed's own side (seedTeam): a plant seed's the plants', any other seed's the zombies'. */
const ownTeam = (seed: { kind: string }): Team => seed.kind === 'plant' ? 'plants' : 'zombies'

/** A page whose cards come one after another: its places, from the first to its last card's. */
export const pagePlaces = (cards: readonly ChooserPageCard[]): number => Math.max(-1, ...cards.map(card => card.place)) + 1

/**
 * `/cheatseed`'s chooser pages, the plants' side then the zombies' side, each laid out the same way:
 * 1. the `available` catalog seeds at their catalog places (with `/cheatseed` the server offers every seed there,
 *    owned or not, so a Mod's seed placed in the grid shows too);
 * 2. the Mods' plant seeds outside the grid, on pages of their own, when there are any;
 * 3. the cheat cards, on pages of their own: the base game's hidden plant seeds, then every grave and zombie seed;
 * 4. then all of them again on the zombies' side.
 * Seeds outside the grid come in catalog order, then those the catalog does not list. A list longer than the grid goes
 * on to more pages, and an empty one is left out. `team` is kept only when not the seed's own. The server offers the
 * cards of the pages after the first, so both sides lay them out alike.
 */
export function chooserPages(definitions: Pick<GameplayDefinitions, 'seeds' | 'seedCatalog'>, available: readonly string[]): ChooserPage[] {
    const side = (seedId: string, team: Team) => team === ownTeam(definitions.seeds[seedId]) ? { seedId } : { seedId, team }
    const place = (id: string) => definitions.seedCatalog[id]?.position ?? Infinity
    const ofKind = (kind: string) => Object.keys(definitions.seeds).filter(id => definitions.seeds[id].kind === kind)
    const hidden = ofKind('plant').filter(id => place(id) >= CHOOSER_PLACES).sort((left, right) => place(left) - place(right))
    const base = (id: string) => isOwnId(BASE_MOD_ID, id)
    // Each group starts a page of its own: the Mods' plants, then the cheat cards.
    const groups = [hidden.filter(id => !base(id)), [...hidden.filter(base), ...ofKind('grave'), ...ofKind('zombie')]]
    const fill = (team: Team): ChooserPage[] => groups.flatMap(seeds => {
        const pages: ChooserPage[] = []
        seeds.forEach((seedId, index) => {
            if (index % CHOOSER_PLACES === 0) pages.push({ cards: [], catalog: false })
            pages[pages.length - 1].cards.push({ ...side(seedId, team), place: index % CHOOSER_PLACES })
        })
        return pages
    })
    const catalog = (team: Team): ChooserPage => ({ cards: available.map(seedId => ({ ...side(seedId, team), place: place(seedId) })), catalog: true })
    return [catalog('plants'), ...fill('plants'), catalog('zombies'), ...fill('zombies')]
        .filter((page, index) => index === 0 || page.cards.length)
}

/** The cards of the pages after the first, which `/cheatseed` offers beyond the owned catalog seeds, in page order. */
export function cheatSeedEntries(definitions: Pick<GameplayDefinitions, 'seeds' | 'seedCatalog'>, available: readonly string[]) {
    return chooserPages(definitions, available).slice(1)
        .flatMap(page => page.cards.map(({ seedId, team }) => ({ seedId, ...(team ? { team } : {}) })))
}
