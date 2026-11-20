import { readGameplaySource } from '../../tools/mod/content'
import type { GameplayLevels } from '@/shared/content/gameplay'

const startingSeeds = (readGameplaySource('definitions') as { seedBank: { startingSeeds: string[] } }).seedBank.startingSeeds

/**
 * The seeds a player who played the adventure in order owns on `levelId`: the starting seeds and every earlier
 * level's award seed (what the profile's `seeds` would hold).
 */
export function adventureSeeds(levels: GameplayLevels, levelId: string): string[] {
    const index = levels.levels[levelId].adventureIndex
    return [...startingSeeds, ...Object.values(levels.levels)
        .flatMap(level => level.award.kind === 'seed' && level.adventureIndex < index ? [level.award.id] : [])]
}
