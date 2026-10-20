import type { UIButtonPolygon } from '@/client/ui/UIButton'
import type { MenuAction } from './MenuPages'

export interface MainMenuButton {
    name: string
    target?: MenuAction
    track: string
    image: string
    highlight: string
    replace?: boolean
    x?: number
    y?: number
    width?: number
    height?: number
    imageX?: number
    imageY?: number
    polygon?: UIButtonPolygon
    mode?: boolean
}

export const MAIN_MENU_BUTTONS: readonly MainMenuButton[] = [
    {
        name: 'adventure', target: 'play', track: 'SelectorScreen_Adventure_button', replace: true, mode: true,
        image: 'selectorscreen_adventure_button', highlight: 'selectorscreen_adventure_highlight', height: 125,
        polygon: [[7, 1], [328, 30], [314, 125], [1, 78]],
    },
    {
        name: 'minigames', target: 'minigames', track: 'SelectorScreen_Survival_button', replace: true, mode: true,
        image: 'selectorscreen_survival_button', highlight: 'selectorscreen_survival_highlight', height: 130,
        polygon: [[4, 2], [312, 51], [296, 130], [7, 77]],
    },
    {
        name: 'puzzle', target: 'puzzle', track: 'SelectorScreen_Challenges_button', replace: true, mode: true,
        image: 'selectorscreen_challenges_button', highlight: 'selectorscreen_challenges_highlight', height: 121,
        polygon: [[2, 0], [281, 55], [268, 121], [3, 60]],
    },
    {
        name: 'survival', target: 'survival', track: 'SelectorScreen_ZenGarden_button', replace: true, mode: true,
        image: 'selectorscreen_vasebreaker_button', highlight: 'selectorscreen_vasebreaker_highlight', height: 124,
        polygon: [[7, 1], [267, 62], [257, 124], [7, 57]],
    },
    {
        name: 'players', target: 'players', track: 'woodsign2', replace: true,
        image: 'selectorscreen_woodsign2', highlight: 'selectorscreen_woodsign2_press',
        x: 24, y: 10, width: 250, height: 30, imageX: -24, imageY: -10,
    },
    { name: 'zombatar', track: 'woodsign3', replace: true, image: 'selectorscreen_woodsign3', highlight: 'selectorscreen_woodsign3_press' },
    { name: 'garden', target: 'garden', track: 'SelectorScreen_BG_Right', x: 100, y: 360, width: 130, height: 130, image: 'selectorscreen_zengarden', highlight: 'selectorscreen_zengardenhighlight' },
    { name: 'store', target: 'store', track: 'SelectorScreen_BG_Right', x: 334, y: 441, image: 'selectorscreen_store', highlight: 'selectorscreen_storehighlight' },
    { name: 'almanac', target: 'almanac', track: 'SelectorScreen_BG_Right', x: 256, y: 387, image: 'selectorscreen_almanac', highlight: 'selectorscreen_almanachighlight' },
    { name: 'achievements', target: 'achievements', track: 'SelectorScreen_BG_Left', x: 20, y: 480, image: 'achievements_pedestal', highlight: 'achievements_pedestal_press' },
    { name: 'options', target: 'options', track: 'SelectorScreen_BG_Right', x: 494, y: 434, width: 81, height: 54, imageY: 13, image: 'selectorscreen_options1', highlight: 'selectorscreen_options2' },
    { name: 'help', target: 'help', track: 'SelectorScreen_BG_Right', x: 576, y: 458, width: 48, height: 55, imageY: 28, image: 'selectorscreen_help1', highlight: 'selectorscreen_help2' },
    { name: 'quit', target: 'quit', track: 'SelectorScreen_BG_Right', x: 644, y: 469, width: 57, height: 37, imageX: 5, imageY: 3, image: 'selectorscreen_quit1', highlight: 'selectorscreen_quit2' },
]

export const MAIN_MENU_EXTRA_IMAGES = [
    'selectorscreen_bg', 'selectorscreen_startadventure_button1', 'selectorscreen_startadventure_highlight', 'selectorscreen_levelnumbers',
] as const

export const MAIN_MENU_CLOUDS = ['cloud1', 'cloud2', 'cloud4', 'cloud5', 'cloud6', 'cloud7'] as const
export const MAIN_MENU_FLOWERS = [{ x: 765, y: 483 }, { x: 663, y: 455 }, { x: 701, y: 439 }] as const
