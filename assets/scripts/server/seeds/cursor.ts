import type { World } from '@/ecs/index'
import { SeedBankResource } from '../state/components'
import { levelRule } from '../rules/registry'

/** Board::ClearCursor: nothing is held any more, and the level's rules may take the cursor back (Challenge::ClearCursor). */
export function clearCursor(world: World): void {
    world.resources.get(SeedBankResource).selection = { mode: 'none' }
    levelRule(world)?.cursorCleared?.(world)
}
