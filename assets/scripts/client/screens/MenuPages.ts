import type { MusicTuneId } from '@/client/music/MusicPlaybackSnapshot'

export type MenuPageId =
    | 'splash' | 'title' | 'main' | 'minigames' | 'puzzle' | 'survival'
    | 'almanac' | 'plants' | 'zombies' | 'store'
    | 'garden' | 'mushroom' | 'aquarium' | 'tree' | 'achievements'
    | 'help'
    | 'award'

/**
 * Menu dialogs over whatever is on screen, as the original's Dialogs (see MenuDialog): the options (NewOptionsDialog, from the
 * title screen or a level), the pause and failure dialogs, the player list and the quit confirmation. They are not pages, so
 * opening one leaves the page or level under it.
 */
export type MenuDialogId = 'options' | 'gameOptions' | 'pause' | 'gameOver' | 'players' | 'quit'
export const MENU_DIALOGS: readonly MenuDialogId[] = ['options', 'gameOptions', 'pause', 'gameOver', 'players', 'quit']
/** The menu dialogs over a level, which pause it. */
export const LEVEL_DIALOGS: readonly MenuDialogId[] = ['gameOptions', 'pause', 'gameOver']
export const isMenuDialog = (id: string): id is MenuDialogId => (MENU_DIALOGS as readonly string[]).includes(id)

/** Where navigate() goes: a page, the board (play, resume, restart, the next level) or back. Dialogs open with openDialog(). */
export type MenuAction = MenuPageId | 'play' | 'resume' | 'restart' | 'nextLevel' | 'back'

export interface MenuBackground {
    image: string
    x?: number
    y?: number
    width?: number
    height?: number
}

export interface MenuPage {
    music?: MusicTuneId
    heading?: {
        key: string
        font: 'pageTitle' | 'pageTitleSmall' | 'title'
        y: number
        color: readonly [number, number, number]
    }
    backgrounds: readonly MenuBackground[]
    /** Where the page's own buttons lead; each page's screen draws them with original text. */
    buttons: readonly { target: MenuAction }[]
    back?: MenuAction
    retainPrevious?: boolean
}

const MAIN_BACKGROUND: MenuBackground[] = [
    { image: 'selectorscreen_bg', width: 800, height: 600 },
    { image: 'selectorscreen_bg_center', x: 80, y: 250 },
    { image: 'selectorscreen_bg_left', y: -79.8 },
    { image: 'selectorscreen_bg_right', x: 71, y: 41 },
]
const CHALLENGE_BUTTONS = [
    { target: 'minigames' },
    { target: 'puzzle' },
    { target: 'survival' },
] as const
const GARDEN_BUTTONS = [
    { target: 'garden' },
    { target: 'mushroom' },
    { target: 'aquarium' },
    { target: 'tree' },
    { target: 'store' },
] as const

export const MENU_PAGES: Record<MenuPageId, MenuPage> = {
    splash: {
        backgrounds: [{ image: 'popcap_logo', x: 250, y: 150 }],
        buttons: [{ target: 'title' }],
    },
    title: {
        backgrounds: [{ image: 'titlescreen' }, { image: 'pvz_logo', x: 50, y: 20 }],
        buttons: [{ target: 'main' }],
    },
    main: {
        backgrounds: MAIN_BACKGROUND,
        buttons: [
            { target: 'play' },
            ...CHALLENGE_BUTTONS,
            { target: 'almanac' },
            { target: 'store' },
            { target: 'garden' },
            { target: 'achievements' },
            { target: 'help' },
        ],
    },
    minigames: {
        music: 'choose_seeds', backgrounds: [{ image: 'challenge_background' }],
        heading: { key: 'PICK_CHALLENGE', font: 'pageTitle', y: 58, color: [220, 220, 220] },
        buttons: [], back: 'main',
    },
    puzzle: {
        music: 'choose_seeds', backgrounds: [{ image: 'challenge_background' }],
        heading: { key: 'SCARY_POTTER', font: 'pageTitle', y: 58, color: [220, 220, 220] },
        buttons: [], back: 'main',
    },
    survival: {
        music: 'choose_seeds', backgrounds: [{ image: 'challenge_background' }],
        heading: { key: 'PICK_AREA', font: 'pageTitle', y: 58, color: [220, 220, 220] },
        buttons: [], back: 'main',
    },
    almanac: {
        retainPrevious: true,
        backgrounds: [{ image: 'almanac_indexback' }],
        heading: { key: 'SUBURBAN_ALMANAC_INDEX', font: 'pageTitle', y: 60, color: [220, 220, 220] },
        buttons: [{ target: 'plants' }, { target: 'zombies' }], back: 'back',
    },
    plants: {
        retainPrevious: true,
        backgrounds: [{ image: 'almanac_plantback' }], buttons: [], back: 'almanac',
        heading: { key: 'SUBURBAN_ALMANAC_PLANTS', font: 'pageTitleSmall', y: 48, color: [213, 159, 43] },
    },
    zombies: {
        retainPrevious: true,
        backgrounds: [{ image: 'almanac_zombieback' }], buttons: [], back: 'almanac',
        heading: { key: 'SUBURBAN_ALMANAC_ZOMBIES', font: 'title', y: 54, color: [0, 196, 0] },
    },
    store: {
        retainPrevious: true,
        backgrounds: [{ image: 'store_background' }], buttons: [], back: 'back',
    },
    garden: {
        music: 'zen_garden', backgrounds: [{ image: 'background_greenhouse' }],
        buttons: GARDEN_BUTTONS, back: 'main',
    },
    mushroom: {
        music: 'zen_garden', backgrounds: [{ image: 'background_mushroomgarden' }],
        buttons: GARDEN_BUTTONS, back: 'main',
    },
    aquarium: {
        music: 'zen_garden', backgrounds: [{ image: 'aquarium1' }], buttons: GARDEN_BUTTONS, back: 'main',
    },
    tree: {
        music: 'zen_garden', backgrounds: [{ image: 'tree_bg' }], buttons: GARDEN_BUTTONS, back: 'main',
    },
    achievements: {
        retainPrevious: true,
        backgrounds: [], buttons: [], back: 'main',
    },
    help: {
        backgrounds: [
            { image: 'background1', x: -700, y: -300, width: 2800, height: 1200 },
            { image: 'zombienote', x: 80, y: 80 },
            { image: 'zombie_note_help', x: 131, y: 132 },
        ], buttons: [], back: 'main',
    },
    award: {
        backgrounds: [{ image: 'awardscreen_back' }],
        heading: { key: 'NEW_PLANT', font: 'title', y: 58, color: [213, 159, 43] },
        buttons: [{ target: 'nextLevel' }], back: 'main',
    },
}
