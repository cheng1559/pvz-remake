import type { AlmanacPlantDefinition, AlmanacView, AlmanacZombieDefinition } from '@/shared/menu'
import type { PlayerProfile } from './profileStore'

/** `purchase` is the store item that unlocks the plant (STORE_ITEM_PLANT_GATLINGPEA ... STORE_ITEM_PLANT_IMITATER). */
type AlmanacPlant = AlmanacPlantDefinition & { purchase?: number }
/**
 * gZombieDefs' mStartingLevel; `spawnedOnly` is Board::IsZombieTypeSpawnedOnly; `afterAdventure` zombies only come
 * once the adventure is finished (LawnApp::CanSpawnYetis).
 */
type AlmanacZombie = AlmanacZombieDefinition & { startingLevel: number, spawnedOnly?: boolean, afterAdventure?: boolean }
interface AlmanacDefinition { plants: AlmanacPlant[], zombies: AlmanacZombie[] }

const GROUNDS = new Set(['day', 'night', 'pool', 'nightpool', 'roof'])
const SEEDS_IN_CHOOSER = 49

/** LawnApp::GetAwardSeedForLevel: each area awards eight plants, less the levels that award something else. */
function awardSeedForLevel(level: number): number {
    const sub = (level - 1) % 10 + 1
    return Math.min(40, Math.floor((level - 1) / 10) * 8 + sub - (sub >= 10 ? 2 : sub >= 5 ? 1 : 0))
}

/** The almanac entries come from `pvz:gameplay/almanac`; only the unlock rules live here. */
export function createAlmanacCatalog(value: unknown) {
    validateAlmanac(value)
    const { plants, zombies } = value

    /**
     * The current player's almanac: LawnApp::HasSeedType for plants, AlmanacDialog::ZombieIsShown and
     * ZombieHasDescription for zombies. A zombie that debuts on the player's current level is not described yet;
     * the original also describes it once it has been defeated since the player was selected, which is not tracked.
     * The Yeti's silhouette before it can spawn is not drawn, so it stays hidden until then.
     */
    function view(profile: PlayerProfile | null): AlmanacView {
        const level = profile?.adventureLevel ?? 1, finishedTimes = profile?.finishedAdventure ?? 0, finished = finishedTimes > 0
        const seedsAvailable = finished || level > 50 ? SEEDS_IN_CHOOSER : Math.min(SEEDS_IN_CHOOSER, awardSeedForLevel(level))
        return {
            plants: plants.filter(plant => plant.purchase !== undefined
                ? (profile?.purchases[plant.purchase] ?? 0) > 0 : plant.id < seedsAvailable)
                .map(({ purchase: _purchase, ...plant }) => plant),
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
    const plants = new Set<number>(), purchases = new Set<number>()
    for (const plant of data.plants) {
        if (!Number.isInteger(plant.id) || plant.id < 0 || plants.has(plant.id) || typeof plant.key !== 'string' || typeof plant.name !== 'string' ||
            !Number.isInteger(plant.cost) || plant.cost < 0 || !Number.isInteger(plant.refreshTime) || plant.refreshTime <= 0 ||
            !GROUNDS.has(plant.ground)) throw new Error(`Invalid or duplicate almanac plant: ${plant.id}`)
        if (plant.purchase !== undefined && (!Number.isInteger(plant.purchase) || plant.purchase < 0 || purchases.has(plant.purchase))) {
            throw new Error(`Invalid almanac plant purchase: ${plant.id}`)
        }
        plants.add(plant.id)
        if (plant.purchase !== undefined) purchases.add(plant.purchase)
    }
    const zombies = new Set<number>()
    for (const zombie of data.zombies) {
        if (!Number.isInteger(zombie.id) || zombie.id < 0 || zombies.has(zombie.id) || typeof zombie.key !== 'string' ||
            !Number.isInteger(zombie.startingLevel) || zombie.startingLevel < 1) throw new Error(`Invalid or duplicate almanac zombie: ${zombie.id}`)
        zombies.add(zombie.id)
    }
}
