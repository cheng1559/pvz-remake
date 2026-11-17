import type { World } from '@/ecs/index'
import { Plant, type PlantConfig } from './Plant'

/**
 * The hypno-shroom (the definition's `mindControl`): awake, what eats it comes over to its side (a zombie as it chews,
 * a hostile plant as it bites; zombies/mindControl.ts). Asleep, it is eaten as any plant.
 */
export class HypnoShroom extends Plant {
    static readonly config: readonly PlantConfig[] = ['mindControl']

    mindControls(world: World): boolean {
        return !this.asleep(world)
    }
}
