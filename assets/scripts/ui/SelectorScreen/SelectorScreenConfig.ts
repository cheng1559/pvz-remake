import { ButtonConfig } from './SelectorScreen.d'
import { Vec2, Vec3 } from 'cc'

const BUTTON_CONFIGS: ButtonConfig[] = [
    {
        name: 'adventure',
        attached: {
            trackName: 'SelectorScreen_Adventure_button',
            offsetX: 0,
            offsetY: 0,
            isReplaceTrack: true,
        },
        normalImage: 'selectorscreen_adventure_button',
        pressedImage: 'selectorscreen_adventure_highlight',
        polygon: [new Vec2(7, -1), new Vec2(328, -30), new Vec2(314, -125), new Vec2(1, -78)],
    },
    {
        name: 'miniGames',
        attached: {
            trackName: 'SelectorScreen_Survival_button',
            offsetX: 0,
            offsetY: 0,
            isReplaceTrack: true,
        },
        normalImage: 'selectorscreen_survival_button',
        pressedImage: 'selectorscreen_survival_highlight',
        polygon: [new Vec2(4, -2), new Vec2(312, -51), new Vec2(296, -130), new Vec2(7, -77)],
    },
    {
        name: 'puzzles',
        attached: {
            trackName: 'SelectorScreen_Challenges_button',
            offsetX: 0,
            offsetY: 0,
            isReplaceTrack: true,
        },
        normalImage: 'selectorscreen_challenges_button',
        pressedImage: 'selectorscreen_challenges_highlight',
        polygon: [new Vec2(2, 0), new Vec2(281, -55), new Vec2(268, -121), new Vec2(3, -60)],
    },
    {
        name: 'survival',
        attached: {
            trackName: 'SelectorScreen_ZenGarden_button',
            offsetX: 0,
            offsetY: 0,
            isReplaceTrack: true,
        },
        normalImage: 'selectorscreen_vasebreaker_button',
        pressedImage: 'selectorscreen_vasebreaker_highlight',
        polygon: [new Vec2(7, -1), new Vec2(267, -62), new Vec2(257, -124), new Vec2(7, -57)],
    },
]

const FLOWER_CENTERS: { x: number; y: number; radius: number }[] = [
    { x: 765, y: 483, radius: 20 },
    { x: 663, y: 455, radius: 20 },
    { x: 701, y: 439, radius: 20 },
]

const WOODSIGN_BUTTON_CONFIGS: ButtonConfig[] = [
    {
        name: 'changeUser',
        attached: {
            trackName: 'woodsign2',
            offsetX: 24,
            offsetY: 10,
            isReplaceTrack: true,
        },
        normalImage: 'selectorscreen_woodsign2',
        pressedImage: 'selectorscreen_woodsign2_press',
        pressOffset: new Vec3(0, 0, 0),
        width: 250,
        height: 30,
        offsetX: -24,
        offsetY: -10,
    },
    {
        name: 'zombatar',
        attached: {
            trackName: 'woodsign3',
            offsetX: 0,
            offsetY: 0,
            isReplaceTrack: true,
        },
        normalImage: 'selectorscreen_woodsign3',
        pressedImage: 'selectorscreen_woodsign3_press',
        pressOffset: new Vec3(0, 0, 0),
    },
]

const AUX_BUTTON_CONFIGS: ButtonConfig[] = [
    {
        name: 'zenGarden',
        attached: {
            trackName: 'SelectorScreen_BG_Right',
            offsetX: 100,
            offsetY: 360,
            isReplaceTrack: false,
        },
        normalImage: 'selectorscreen_zengarden',
        pressedImage: 'selectorscreen_zengardenhighlight',
        width: 130,
        height: 130,
        spriteDir: 'images',
    },
    {
        name: 'store',
        attached: {
            trackName: 'SelectorScreen_BG_Right',
            offsetX: 334,
            offsetY: 441,
            isReplaceTrack: false,
        },
        normalImage: 'selectorscreen_store',
        pressedImage: 'selectorscreen_storehighlight',
        spriteDir: 'images',
    },
    {
        name: 'almanac',
        attached: {
            trackName: 'SelectorScreen_BG_Right',
            offsetX: 256,
            offsetY: 387,
            isReplaceTrack: false,
        },
        normalImage: 'selectorscreen_almanac',
        pressedImage: 'selectorscreen_almanachighlight',
        spriteDir: 'images',
    },
    {
        name: 'achievement',
        attached: {
            trackName: 'SelectorScreen_BG_Left',
            offsetX: 20,
            offsetY: 480,
            isReplaceTrack: false,
        },
        normalImage: 'achievements_pedestal',
        pressedImage: 'achievements_pedestal_press',
        spriteDir: 'images',
    },
    {
        name: 'options',
        attached: {
            trackName: 'SelectorScreen_BG_Right',
            offsetX: 494,
            offsetY: 434,
            isReplaceTrack: false,
        },
        normalImage: 'selectorscreen_options1',
        pressedImage: 'selectorscreen_options2',
        width: 81,
        height: 31 + 23,
        offsetY: 13,
        spriteDir: 'images',
    },
    {
        name: 'help',
        attached: {
            trackName: 'SelectorScreen_BG_Right',
            offsetX: 576,
            offsetY: 458,
            isReplaceTrack: false,
        },
        normalImage: 'selectorscreen_help1',
        pressedImage: 'selectorscreen_help2',
        width: 48,
        height: 22 + 33,
        offsetY: 28,
        spriteDir: 'images',
    },
    {
        name: 'quit',
        attached: {
            trackName: 'SelectorScreen_BG_Right',
            offsetX: 644,
            offsetY: 469,
            isReplaceTrack: false,
        },
        normalImage: 'selectorscreen_quit1',
        pressedImage: 'selectorscreen_quit2',
        width: 47 + 10,
        height: 27 + 10,
        offsetX: 5,
        offsetY: 3,
        spriteDir: 'images',
    },
]

export { BUTTON_CONFIGS, FLOWER_CENTERS, WOODSIGN_BUTTON_CONFIGS, AUX_BUTTON_CONFIGS }
