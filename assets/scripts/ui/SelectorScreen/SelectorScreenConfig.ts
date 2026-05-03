import { Vec2, Vec3 } from 'cc'
import { ButtonConfig } from './SelectorScreen.d'

type Point = [number, number]
type ButtonExtra = Partial<Pick<ButtonConfig, 'width' | 'height' | 'offsetX' | 'offsetY' | 'pressOffset'>>

const polygon = (points: Point[]) => points.map(([x, y]) => new Vec2(x, y))
const zeroOffset = new Vec3(0, 0, 0)

function replaceButton(
    name: string,
    trackName: string,
    normalImage: string,
    pressedImage: string,
    points: Point[],
): ButtonConfig {
    return {
        name,
        attached: { trackName, offsetX: 0, offsetY: 0, isReplaceTrack: true },
        normalImage,
        pressedImage,
        polygon: polygon(points),
    }
}

function attachedButton(
    name: string,
    trackName: string,
    offsetX: number,
    offsetY: number,
    normalImage: string,
    pressedImage: string,
    extra: ButtonExtra = {},
    isReplaceTrack = false,
): ButtonConfig {
    return {
        name,
        attached: { trackName, offsetX, offsetY, isReplaceTrack },
        normalImage,
        pressedImage,
        ...extra,
    }
}

const BUTTON_CONFIGS: ButtonConfig[] = [
    replaceButton('adventure', 'SelectorScreen_Adventure_button', 'selectorscreen_adventure_button', 'selectorscreen_adventure_highlight', [
        [7, -1], [328, -30], [314, -125], [1, -78],
    ]),
    replaceButton('miniGames', 'SelectorScreen_Survival_button', 'selectorscreen_survival_button', 'selectorscreen_survival_highlight', [
        [4, -2], [312, -51], [296, -130], [7, -77],
    ]),
    replaceButton('Puzzle', 'SelectorScreen_Challenges_button', 'selectorscreen_challenges_button', 'selectorscreen_challenges_highlight', [
        [2, 0], [281, -55], [268, -121], [3, -60],
    ]),
    replaceButton('Survival', 'SelectorScreen_ZenGarden_button', 'selectorscreen_vasebreaker_button', 'selectorscreen_vasebreaker_highlight', [
        [7, -1], [267, -62], [257, -124], [7, -57],
    ]),
]

const FLOWER_CENTERS: { x: number; y: number; radius: number }[] = [
    { x: 765, y: 483, radius: 20 },
    { x: 663, y: 455, radius: 20 },
    { x: 701, y: 439, radius: 20 },
]

const WOODSIGN_BUTTON_CONFIGS: ButtonConfig[] = [
    attachedButton('changeUser', 'woodsign2', 24, 10, 'selectorscreen_woodsign2', 'selectorscreen_woodsign2_press', {
        pressOffset: zeroOffset,
        width: 250,
        height: 30,
        offsetX: -24,
        offsetY: -10,
    }, true),
    attachedButton('zombatar', 'woodsign3', 0, 0, 'selectorscreen_woodsign3', 'selectorscreen_woodsign3_press', {
        pressOffset: zeroOffset,
    }, true),
]

const AUX_BUTTON_CONFIGS: ButtonConfig[] = [
    attachedButton('zenGarden', 'SelectorScreen_BG_Right', 100, 360, 'selectorscreen_zengarden', 'selectorscreen_zengardenhighlight', {
        width: 130,
        height: 130,
    }),
    attachedButton('store', 'SelectorScreen_BG_Right', 334, 441, 'selectorscreen_store', 'selectorscreen_storehighlight'),
    attachedButton('almanac', 'SelectorScreen_BG_Right', 256, 387, 'selectorscreen_almanac', 'selectorscreen_almanachighlight'),
    attachedButton('achievement', 'SelectorScreen_BG_Left', 20, 480, 'achievements_pedestal', 'achievements_pedestal_press'),
    attachedButton('options', 'SelectorScreen_BG_Right', 494, 434, 'selectorscreen_options1', 'selectorscreen_options2', {
        width: 81,
        height: 54,
        offsetY: 13,
    }),
    attachedButton('help', 'SelectorScreen_BG_Right', 576, 458, 'selectorscreen_help1', 'selectorscreen_help2', {
        width: 48,
        height: 55,
        offsetY: 28,
    }),
    attachedButton('quit', 'SelectorScreen_BG_Right', 644, 469, 'selectorscreen_quit1', 'selectorscreen_quit2', {
        width: 57,
        height: 37,
        offsetX: 5,
        offsetY: 3,
    }),
]

const SELECTOR_SCREEN_ANIMATIONS = ['animations/selectorscreen', 'animations/zombie_hand']
const SELECTOR_SCREEN_SPRITES = [
    ...BUTTON_CONFIGS,
    ...WOODSIGN_BUTTON_CONFIGS,
    ...AUX_BUTTON_CONFIGS,
].flatMap((config) => [config.normalImage, config.pressedImage])

export {
    BUTTON_CONFIGS,
    FLOWER_CENTERS,
    WOODSIGN_BUTTON_CONFIGS,
    AUX_BUTTON_CONFIGS,
    SELECTOR_SCREEN_ANIMATIONS,
    SELECTOR_SCREEN_SPRITES,
}
