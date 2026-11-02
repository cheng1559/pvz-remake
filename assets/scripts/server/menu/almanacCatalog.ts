import type { AlmanacPlantDefinition, AlmanacView, AlmanacZombieDefinition } from '@/shared/menu'
import type { SeedDefinition } from '@/shared/content/gameplay'
import type { PlayerProfile } from './profileStore'

/**
 * `id` is the packet image (the original SeedType) and `seed` the seed ID the player owns the plant by; the cost and
 * recharge come from that seed's definition.
 */
type AlmanacPlant = Omit<AlmanacPlantDefinition, 'cost' | 'refreshTime'> & { seed: string }
/**
 * gZombieDefs' mStartingLevel; `spawnedOnly` is Board::IsZombieTypeSpawnedOnly; `afterAdventure` zombies only come
 * once the adventure is finished (LawnApp::CanSpawnYetis).
 */
type AlmanacZombie = AlmanacZombieDefinition & { startingLevel: number, spawnedOnly?: boolean, afterAdventure?: boolean }
interface AlmanacDefinition { plants: AlmanacPlant[], zombies: AlmanacZombie[] }

const GROUNDS = new Set(['day', 'night', 'pool', 'nightpool', 'roof'])

/** The almanac entries come from `pvz:gameplay/almanac`; only the unlock rules live here. */
export function createAlmanacCatalog(value: unknown) {
    validateAlmanac(value)
    const { plants, zombies } = value

    /**
     * The current player's almanac: the plants of the `owned` seeds (LawnApp::HasSeedType) that are installed in
     * `seeds`, with their cost and recharge, AlmanacDialog::ZombieIsShown and
     * ZombieHasDescription for zombies. A zombie that debuts on the player's current level is not described yet;
     * the original also describes it once it has been defeated since the player was selected, which is not tracked.
     * The Yeti's silhouette before it can spawn is not drawn, so it stays hidden until then.
     */
    function view(profile: PlayerProfile | null, owned: readonly string[], seeds: Readonly<Record<string, SeedDefinition>>): AlmanacView {
        const level = profile?.adventureLevel ?? 1, finishedTimes = profile?.finishedAdventure ?? 0, finished = finishedTimes > 0
        return {
            plants: plants.flatMap(({ seed, ...plant }) => owned.includes(seed) && seeds[seed]
                ? [{ ...plant, cost: seeds[seed].sunCost, refreshTime: seeds[seed].cooldownTicks }] : []),
            zombies: zombies.map(({ startingLevel, spawnedOnly, afterAdventure, ...zombie }) => {
                if (afterAdventure) {
                    const spawns = finished && (finishedTimes >= 2 || level >= startingLevel)
                    return { ...zombie, shown: spawns, described: spawns && (finishedTimes >= 2 || startingLevel < level) }
                }
                return { ...zombie,
                    shown: finished || startingLevel < level || startingLevel === level && !spawnedOnly,
                    described: finished || startingLevel < level }
            }),
        }
    }

    return { view, plants: plants as readonly AlmanacPlant[] }
}

export type AlmanacCatalog = ReturnType<typeof createAlmanacCatalog>

function validateAlmanac(value: unknown): asserts value is AlmanacDefinition {
    const data = value as AlmanacDefinition
    if (!data || !Array.isArray(data.plants) || !Array.isArray(data.zombies)) throw new Error('Invalid almanac definition')
    const plants = new Set<number>(), seeds = new Set<string>()
    for (const plant of data.plants) {
        if (!Number.isInteger(plant.id) || plant.id < 0 || plants.has(plant.id) || typeof plant.key !== 'string' ||
            typeof plant.seed !== 'string' || !plant.seed || seeds.has(plant.seed) ||
            !GROUNDS.has(plant.ground)) throw new Error(`Invalid or duplicate almanac plant: ${plant.id}`)
        plants.add(plant.id)
        seeds.add(plant.seed)
    }
    const zombies = new Set<number>()
    for (const zombie of data.zombies) {
        if (!Number.isInteger(zombie.id) || zombie.id < 0 || zombies.has(zombie.id) || typeof zombie.key !== 'string' ||
            !Number.isInteger(zombie.startingLevel) || zombie.startingLevel < 1) throw new Error(`Invalid or duplicate almanac zombie: ${zombie.id}`)
        zombies.add(zombie.id)
    }
}
