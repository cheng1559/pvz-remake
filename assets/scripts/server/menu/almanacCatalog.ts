import type { AlmanacCard, AlmanacView } from '@/shared/menu'
import { chooserSeeds, seedGroupPages, type GameplayDefinitions, type SeedDefinition } from '@/shared/content/gameplay'
import type { PlayerProfile } from './profileStore'

/**
 * The almanac from the gameplay definitions: its plant page is the chooser's grid (AlmanacDialog::GetSeedPosition), its
 * zombie windows the `almanac` table's; only the unlock rules live here.
 */
export function createAlmanacCatalog(definitions: Pick<GameplayDefinitions, 'almanac'>) {
    const zombies = Object.entries(definitions.almanac)

    /**
     * The current player's almanac: the grid's seeds the player owns (LawnApp::HasSeedType) with their cost and
     * recharge, AlmanacDialog::ZombieIsShown and ZombieHasDescription for zombies. A zombie that debuts on the player's
     * current level is not described yet; the original also describes it once it has been defeated since the player was
     * selected, which is not tracked. The Yeti's silhouette before it can spawn is not drawn, so it stays hidden until
     * then. `cheatSeeds` (`/cheatseed`) shows and describes everything, and adds the pages of the other seed groups
     * (seedGroupPages).
     */
    function view(profile: PlayerProfile | null, owned: readonly string[], seeds: Readonly<Record<string, SeedDefinition>>, cheatSeeds = false): AlmanacView {
        const level = profile?.adventureLevel ?? 1, finishedTimes = profile?.finishedAdventure ?? 0, finished = finishedTimes > 0
        const card = (seed: string, place: number): AlmanacCard => ({
            seed, place, cost: seeds[seed].sunCost, refreshTime: seeds[seed].cooldownTicks, ...(seeds[seed].hidden ? { hidden: true as const } : {}),
        })
        return {
            plants: chooserSeeds({ seeds }).flatMap(seed => cheatSeeds || owned.includes(seed) ? [card(seed, seeds[seed].position)] : []),
            zombies: zombies.map(([zombie, { place, startingLevel, spawnedOnly, afterAdventure }]) => {
                if (cheatSeeds) return { place, zombie, shown: true, described: true }
                if (afterAdventure) {
                    const spawns = finished && (finishedTimes >= 2 || level >= startingLevel)
                    return { place, zombie, shown: spawns, described: spawns && (finishedTimes >= 2 || startingLevel < level) }
                }
                return { place, zombie,
                    shown: finished || startingLevel < level || startingLevel === level && !spawnedOnly,
                    described: finished || startingLevel < level }
            }),
            ...(cheatSeeds ? { groupPages: seedGroupPages({ seeds }).map(page => page.map(({ seedId, place }) => card(seedId, place))) } : {}),
        }
    }

    return { view }
}

export type AlmanacCatalog = ReturnType<typeof createAlmanacCatalog>
