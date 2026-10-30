import type { ChallengePageId } from '@/shared/menu'

interface Challenge {
    key: string
    icon: number
    record: number
    required?: number
    endless?: boolean
}

// Order, thumbnail cells and profile record slots follow the original challenge definitions.
const MINI_GAMES: readonly [string, number][] = [
    ['WAR_AND_PEAS', 0], ['WALL_NUT_BOWLING', 6], ['SLOT_MACHINE', 2],
    ['ITS_RAINING_SEEDS', 3], ['BEGHOULED', 1], ['INVISIGHOUL', 8],
    ['SEEING_STARS', 5], ['ZOMBIQUARIUM', 7], ['BEGHOULED_TWIST', 20],
    ['LITTLE_TROUBLE', 12], ['PORTAL_COMBAT', 15], ['COLUMN_AS_YOU_SEE_EM', 4],
    ['BOBSLED_BONANZA', 17], ['ZOMBIES_ON_SPEED', 18], ['WHACK_A_ZOMBIE', 16],
    ['LAST_STAND', 21], ['WAR_AND_PEAS_2', 0], ['WALL_NUT_BOWLING_EXTREME', 6],
    ['POGO_PARTY', 14], ['FINAL_BOSS', 19],
]
const AREAS = ['DAY', 'NIGHT', 'POOL', 'FOG', 'ROOF']
export const CHALLENGES: Record<ChallengePageId, Challenge[]> = {
    minigames: MINI_GAMES.map(([key, icon], index) => ({ key, icon, record: 15 + index })),
    puzzle: ['SCARY_POTTER', 'I_ZOMBIE'].flatMap((prefix, group) => Array.from({ length: 10 }, (_, index) => ({
        key: `${prefix}_${index === 9 ? 'ENDLESS' : index + 1}`, icon: 10 + group,
        record: 50 + group * 10 + index, endless: index === 9,
    }))),
    survival: [
        ...['NORMAL', 'HARD'].flatMap((difficulty, group) => AREAS.map((area, index) => ({
            key: `SURVIVAL_${area}_${difficulty}`, icon: group * 5 + index,
            record: group * 5 + index, required: group === 0 ? 5 : 10,
        }))),
        { key: 'SURVIVAL_POOL_ENDLESS', icon: 10, record: 12, endless: true },
    ],
}

