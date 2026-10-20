import type { MusicTuneId } from '@/client/music/MusicPlaybackSnapshot'

export type MenuPageId =
    | 'splash' | 'title' | 'main' | 'minigames' | 'puzzle' | 'survival'
    | 'almanac' | 'plants' | 'zombies' | 'store'
    | 'garden' | 'mushroom' | 'aquarium' | 'tree' | 'achievements'
    | 'help' | 'options' | 'players' | 'quit'
    | 'pause' | 'gameOptions' | 'award' | 'gameOver'

export type MenuAction = MenuPageId | 'play' | 'resume' | 'restart' | 'back'

export interface MenuBackground {
    image: string
    x?: number
    y?: number
    width?: number
    height?: number
}

export interface MenuPage {
    title: string
    music?: MusicTuneId
    heading?: {
        key: string
        font: 'pageTitle' | 'pageTitleSmall' | 'title'
        y: number
        color: readonly [number, number, number]
    }
    backgrounds: readonly MenuBackground[]
    buttons: readonly { label: string, target: MenuAction }[]
    back?: MenuAction
    overlay?: boolean
    retainPrevious?: boolean
}

const MAIN_BACKGROUND: MenuBackground[] = [
    { image: 'selectorscreen_bg', width: 800, height: 600 },
    { image: 'selectorscreen_bg_center', x: 80, y: 250 },
    { image: 'selectorscreen_bg_left', y: -79.8 },
    { image: 'selectorscreen_bg_right', x: 71, y: 41 },
]
const OPTIONS_BACKGROUND: MenuBackground = { image: 'options_menuback', x: 188.5, y: 51 }
const CHALLENGE_BUTTONS = [
    { label: 'Mini-games', target: 'minigames' },
    { label: 'Puzzle', target: 'puzzle' },
    { label: 'Survival', target: 'survival' },
] as const
const GARDEN_BUTTONS = [
    { label: 'Zen garden', target: 'garden' },
    { label: 'Mushroom garden', target: 'mushroom' },
    { label: 'Aquarium', target: 'aquarium' },
    { label: 'Tree of Wisdom', target: 'tree' },
    { label: 'Store', target: 'store' },
] as const

export const MENU_PAGES: Record<MenuPageId, MenuPage> = {
    splash: {
        title: '', backgrounds: [{ image: 'popcap_logo', x: 250, y: 150 }],
        buttons: [{ label: 'Continue', target: 'title' }],
    },
    title: {
        title: '', backgrounds: [{ image: 'titlescreen' }, { image: 'pvz_logo', x: 50, y: 20 }],
        buttons: [{ label: 'Click to start', target: 'main' }],
    },
    main: {
        title: 'Main menu', backgrounds: MAIN_BACKGROUND,
        buttons: [
            { label: 'Adventure 1-1', target: 'play' },
            ...CHALLENGE_BUTTONS,
            { label: 'Almanac', target: 'almanac' },
            { label: 'Store', target: 'store' },
            { label: 'Zen garden', target: 'garden' },
            { label: 'Achievements', target: 'achievements' },
            { label: 'Options', target: 'options' },
            { label: 'Help', target: 'help' },
            { label: 'Players', target: 'players' },
            { label: 'Quit', target: 'quit' },
        ],
    },
    minigames: {
        title: 'Mini-games', music: 'choose_seeds', backgrounds: [{ image: 'challenge_background' }],
        heading: { key: 'PICK_CHALLENGE', font: 'pageTitle', y: 58, color: [220, 220, 220] },
        buttons: [], back: 'main',
    },
    puzzle: {
        title: 'Puzzle', music: 'choose_seeds', backgrounds: [{ image: 'challenge_background' }],
        heading: { key: 'SCARY_POTTER', font: 'pageTitle', y: 58, color: [220, 220, 220] },
        buttons: [], back: 'main',
    },
    survival: {
        title: 'Survival', music: 'choose_seeds', backgrounds: [{ image: 'challenge_background' }],
        heading: { key: 'PICK_AREA', font: 'pageTitle', y: 58, color: [220, 220, 220] },
        buttons: [], back: 'main',
    },
    almanac: {
        retainPrevious: true,
        title: 'Suburban Almanac - Index', backgrounds: [{ image: 'almanac_indexback' }],
        heading: { key: 'SUBURBAN_ALMANAC_INDEX', font: 'pageTitle', y: 60, color: [220, 220, 220] },
        buttons: [{ label: 'Plants', target: 'plants' }, { label: 'Zombies', target: 'zombies' }], back: 'main',
    },
    plants: {
        retainPrevious: true,
        title: 'Suburban Almanac - Plants', backgrounds: [{ image: 'almanac_plantback' }], buttons: [], back: 'almanac',
        heading: { key: 'SUBURBAN_ALMANAC_PLANTS', font: 'pageTitleSmall', y: 48, color: [213, 159, 43] },
    },
    zombies: {
        retainPrevious: true,
        title: 'Suburban Almanac - Zombies', backgrounds: [{ image: 'almanac_zombieback' }], buttons: [], back: 'almanac',
        heading: { key: 'SUBURBAN_ALMANAC_ZOMBIES', font: 'title', y: 54, color: [0, 196, 0] },
    },
    store: {
        retainPrevious: true,
        title: 'Store', backgrounds: [{ image: 'store_background' }], buttons: [], back: 'back',
    },
    garden: {
        title: 'Zen garden', music: 'zen_garden', backgrounds: [{ image: 'background_greenhouse' }],
        buttons: GARDEN_BUTTONS, back: 'main',
    },
    mushroom: {
        title: 'Mushroom garden', music: 'zen_garden', backgrounds: [{ image: 'background_mushroomgarden' }],
        buttons: GARDEN_BUTTONS, back: 'main',
    },
    aquarium: {
        title: 'Aquarium', music: 'zen_garden', backgrounds: [{ image: 'aquarium1' }], buttons: GARDEN_BUTTONS, back: 'main',
    },
    tree: {
        title: 'Tree of Wisdom', music: 'zen_garden', backgrounds: [{ image: 'tree_bg' }], buttons: GARDEN_BUTTONS, back: 'main',
    },
    achievements: {
        retainPrevious: true,
        title: 'Achievements', backgrounds: [], buttons: [], back: 'main',
    },
    help: {
        title: 'Help', backgrounds: [
            { image: 'background1', x: -700, y: -300, width: 2800, height: 1200 },
            { image: 'zombienote', x: 80, y: 80 },
            { image: 'zombie_note_help', x: 131, y: 132 },
        ], buttons: [], back: 'main',
    },
    options: {
        retainPrevious: true,
        title: 'Options', backgrounds: [...MAIN_BACKGROUND, OPTIONS_BACKGROUND], buttons: [], back: 'back',
    },
    players: {
        retainPrevious: true,
        title: 'Players', backgrounds: MAIN_BACKGROUND, buttons: [], back: 'main',
    },
    quit: {
        retainPrevious: true,
        title: 'Quit', backgrounds: MAIN_BACKGROUND, buttons: [], back: 'main',
    },
    pause: {
        title: 'GAME PAUSED', backgrounds: [], overlay: true, buttons: [], back: 'resume',
    },
    gameOptions: {
        title: 'Options', backgrounds: [OPTIONS_BACKGROUND], overlay: true, buttons: [], back: 'resume',
    },
    award: {
        title: 'YOU GOT A NEW PLANT!', backgrounds: [{ image: 'awardscreen_back' }],
        heading: { key: 'NEW_PLANT', font: 'title', y: 58, color: [213, 159, 43] },
        buttons: [{ label: 'Play again', target: 'restart' }], back: 'main',
    },
    gameOver: {
        title: 'Game over', backgrounds: [], overlay: true,
        buttons: [{ label: 'Try again', target: 'restart' }], back: 'main',
    },
}
