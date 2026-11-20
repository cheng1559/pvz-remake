import type { ChallengePageId } from '@/shared/menu'

interface Challenge {
    key: string
    record: number
    required?: number
    endless?: boolean
}

// Order and profile record slots follow the original challenge definitions; thumbnails are presentation `challenges`.
const MINI_GAMES = [
    'WAR_AND_PEAS', 'WALL_NUT_BOWLING', 'SLOT_MACHINE', 'ITS_RAINING_SEEDS', 'BEGHOULED', 'INVISIGHOUL', 'SEEING_STARS',
    'ZOMBIQUARIUM', 'BEGHOULED_TWIST', 'LITTLE_TROUBLE', 'PORTAL_COMBAT', 'COLUMN_AS_YOU_SEE_EM', 'BOBSLED_BONANZA',
    'ZOMBIES_ON_SPEED', 'WHACK_A_ZOMBIE', 'LAST_STAND', 'WAR_AND_PEAS_2', 'WALL_NUT_BOWLING_EXTREME', 'POGO_PARTY',
    'FINAL_BOSS',
]
const AREAS = ['DAY', 'NIGHT', 'POOL', 'FOG', 'ROOF']
export const CHALLENGES: Record<ChallengePageId, Challenge[]> = {
    minigames: MINI_GAMES.map((key, index) => ({ key, record: 15 + index })),
    puzzle: ['SCARY_POTTER', 'I_ZOMBIE'].flatMap((prefix, group) => Array.from({ length: 10 }, (_, index) => ({
        key: `${prefix}_${index === 9 ? 'ENDLESS' : index + 1}`,
        record: 50 + group * 10 + index, endless: index === 9,
    }))),
    survival: [
        ...['NORMAL', 'HARD'].flatMap((difficulty, group) => AREAS.map((area, index) => ({
            key: `SURVIVAL_${area}_${difficulty}`,
            record: group * 5 + index, required: group === 0 ? 5 : 10,
        }))),
        { key: 'SURVIVAL_POOL_ENDLESS', record: 12, endless: true },
    ],
}


export function challengeCompleted(challenge: Challenge, records: readonly number[]): boolean {
    return !challenge.endless && (records[challenge.record] ?? 0) >= (challenge.required ?? 1)
}

/** TrophiesNeedForGoldSunflower: all 48 trophies of the three challenge pages. */
export function hasAllTrophies(records: readonly number[]): boolean {
    return Object.values(CHALLENGES).every(page => page.every(item => item.endless || challengeCompleted(item, records)))
}
