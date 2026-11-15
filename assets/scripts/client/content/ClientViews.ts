import { GridItemViewRegistry } from '@/client/gridItems/GridItemViewRegistry'
import { ItemViewRegistry } from '@/client/items/ItemViewRegistry'
import { StageEventRegistry } from '@/client/level/StageEventRegistry'
import { PlantViewRegistry } from '@/client/plants/PlantViewRegistry'
import { ProjectileViewRegistry } from '@/client/projectiles/ProjectileViewRegistry'
import { ZombieViewRegistry } from '@/client/zombies/ZombieViewRegistry'

/**
 * The views of what is on the board, by what it is, and who hears of the server's events about it: the base's, with
 * what the enabled Mods add (`host.get('client/views')`). One set for the session, frozen once the Mods are in.
 */
export class ClientViews {
    readonly plants = new PlantViewRegistry()
    readonly zombies = new ZombieViewRegistry()
    readonly projectiles = new ProjectileViewRegistry()
    readonly gridItems = new GridItemViewRegistry()
    readonly items = new ItemViewRegistry()
    readonly events = new StageEventRegistry()

    private get registries() {
        return [this.plants, this.zombies, this.projectiles, this.gridItems, this.items, this.events]
    }

    /** Undoes what was registered after it, for a Mod that failed to load. */
    checkpoint(): () => void {
        const undo = this.registries.map(registry => registry.checkpoint())
        return () => { for (const step of undo.reverse()) step() }
    }

    freeze(): void {
        for (const registry of this.registries) registry.freeze()
    }
}
