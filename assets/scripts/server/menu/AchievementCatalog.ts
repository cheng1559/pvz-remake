// Preserve the previous screen's order: these indices address the saved achievement flags and icon atlas.
const ACHIEVEMENTS = [
    'HOME_SECURITY', 'NOBEL_PEAS_PRIZE', 'BETTER_OFF_DEAD', 'CHINA_SHOP', 'SPUDOW',
    'EXPLODONATOR', 'MORTICULTURALIST', 'DONT_PEA_IN_POOL', 'ROLL_SOME_HEADS', 'GROUNDED',
    'ZOMBOLOGIST', 'PENNY_PINCHER', 'SUNNY_DAYS', 'POPCORN_PARTY', 'GOOD_MORNING',
    'NO_FUNGUS_AMONG_US', 'BEYOND_THE_GRAVE', 'IMMORTAL', 'TOWERING_WISDOM', 'MUSTACHE_MODE',
    'DISCO_IS_UNDEAD',
] as const

export const ACHIEVEMENT_DEFINITIONS = ACHIEVEMENTS.map((key, id) => ({
    id, icon: id, titleKey: `ACHIEVEMENT_${key}_TITLE`, descriptionKey: `ACHIEVEMENT_${key}_DESCRIPTION`,
}))
