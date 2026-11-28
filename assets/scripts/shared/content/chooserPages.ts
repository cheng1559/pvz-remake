import type { GameplayDefinitions } from './gameplay'
import { chooserEntryKey, type ChooserEntry, type Team } from '@/shared/protocol'
import { seedGroupPages } from './seedGroups'
import { seedTeam } from './teams'

/**
 * SeedChooserScreen::EnableStartButton: Let's Rock takes a full bank, or one with every card offered in it (the owned
 * catalog seeds `available` and the `entries` beyond them), or with `/cheatseed` any number of cards, none at all
 * included; the slots left over stay empty. A `/repick` keeps the bank's size, which can outnumber the cards offered once `/cheatseed` is turned off. The
 * server checks Let's Rock with it, and the client lights the button.
 */
export function seedChoiceComplete(choice: { chosen: readonly ChooserEntry[], available: readonly string[],
    entries: readonly ChooserEntry[], slots: number, cheatSeeds: boolean }): boolean {
    const { chosen, available, entries, slots, cheatSeeds } = choice
    if (chosen.length > slots) return false
    if (chosen.length === slots || cheatSeeds) return true
    const keys = new Set(chosen.map(chooserEntryKey))
    return [...available.map(seedId => ({ seedId })), ...entries].every(card => keys.has(chooserEntryKey(card)))
}

/** A card on a chooser page: a seed, on `team` when not its seed's own, at a grid place (8 columns in reading order from 0). */
export interface ChooserPageCard { seedId: string, team?: Team, place: number }

/**
 * A page of the chooser: its cards, and whether they stand at their catalog places (`catalog`), where an empty place is
 * a seed not unlocked yet and keeps its silhouette, rather than drawing only up to its last card.
 */
export interface ChooserPage { cards: ChooserPageCard[], catalog: boolean }

/** A page whose cards come one after another: its places, from the first to its last card's. */
export const pagePlaces = (cards: readonly ChooserPageCard[]): number => Math.max(-1, ...cards.map(card => card.place)) + 1

/**
 * `/cheatseed`'s chooser pages, the plants' side then the zombies' side, each laid out the same way:
 * 1. the `available` original seeds at their places in the grid (with `/cheatseed` the server offers every one of them,
 *    owned or not);
 * 2. the pages of the other groups (seedGroupPages): each Mod's seeds, then the base game's hidden cards, each group
 *    from a page of its own and each seed at its position;
 * 3. then all of them again on the zombies' side.
 * `team` is kept only when not the seed's own. The server offers the cards of the pages after the first, so both sides
 * lay them out alike.
 */
export function chooserPages(definitions: Pick<GameplayDefinitions, 'seeds'>, available: readonly string[]): ChooserPage[] {
    const side = (seedId: string, team: Team) => team === seedTeam(definitions.seeds[seedId]) ? { seedId } : { seedId, team }
    const groups = seedGroupPages(definitions)
    const catalog = (team: Team): ChooserPage => ({
        cards: available.map(seedId => ({ ...side(seedId, team), place: definitions.seeds[seedId].position })), catalog: true,
    })
    const fill = (team: Team): ChooserPage[] => groups.map(cards => ({
        cards: cards.map(({ seedId, place }) => ({ ...side(seedId, team), place })), catalog: false,
    }))
    return [catalog('plants'), ...fill('plants'), catalog('zombies'), ...fill('zombies')]
        .filter((page, index) => index === 0 || page.cards.length)
}

/** The cards of the pages after the first, which `/cheatseed` offers beyond the owned catalog seeds, in page order. */
export function cheatSeedEntries(definitions: Pick<GameplayDefinitions, 'seeds'>, available: readonly string[]) {
    return chooserPages(definitions, available).slice(1)
        .flatMap(page => page.cards.map(({ seedId, team }) => ({ seedId, ...(team ? { team } : {}) })))
}
