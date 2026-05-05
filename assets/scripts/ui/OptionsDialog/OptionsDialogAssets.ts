import { FontLoader, type BitmapFontAssets } from '@/core/FontLoader'
import { SpriteLoader } from '@/core/SpriteLoader'
import type { SpriteFrame } from 'cc'

const OPTION_SPRITES = [
    'options_menuback',
    'options_backtogamebutton0',
    'options_backtogamebutton2',
    'options_checkbox0',
    'options_checkbox1',
    'options_sliderslot',
    'options_sliderknob2',
    'button_left',
    'button_middle',
    'button_right',
    'button_down_left',
    'button_down_middle',
    'button_down_right',
]

const OPTION_FONTS = [
    'dwarventodcraft18',
    'dwarventodcraft36greeninset',
    'dwarventodcraft36brightgreeninset',
    'dwarventodcraft18greeninset',
    'dwarventodcraft18brightgreeninset',
]

export interface OptionsDialogSprites {
    menuBack: SpriteFrame
    backToGameButton: SpriteFrame
    backToGameButtonDown: SpriteFrame
    checkboxOff: SpriteFrame
    checkboxOn: SpriteFrame
    sliderSlot: SpriteFrame
    sliderKnob: SpriteFrame
    buttonLeft: SpriteFrame
    buttonMiddle: SpriteFrame
    buttonRight: SpriteFrame
    buttonDownLeft: SpriteFrame
    buttonDownMiddle: SpriteFrame
    buttonDownRight: SpriteFrame
}

export interface OptionsDialogFonts {
    label: BitmapFontAssets | null
    button: BitmapFontAssets | null
    buttonHighlight: BitmapFontAssets | null
    smallButton: BitmapFontAssets | null
    smallButtonHighlight: BitmapFontAssets | null
}

export class OptionsDialogAssets {
    static readonly preload = {
        sprites: OPTION_SPRITES,
        fonts: OPTION_FONTS,
    }

    static async loadSprites(): Promise<OptionsDialogSprites | null> {
        const [
            menuBack,
            backToGameButton,
            backToGameButtonDown,
            checkboxOff,
            checkboxOn,
            sliderSlot,
            sliderKnob,
            buttonLeft,
            buttonMiddle,
            buttonRight,
            buttonDownLeft,
            buttonDownMiddle,
            buttonDownRight,
        ] = await Promise.all(OPTION_SPRITES.map((name) => SpriteLoader.load(name)))

        if (
            !menuBack ||
            !backToGameButton ||
            !backToGameButtonDown ||
            !checkboxOff ||
            !checkboxOn ||
            !sliderSlot ||
            !sliderKnob ||
            !buttonLeft ||
            !buttonMiddle ||
            !buttonRight ||
            !buttonDownLeft ||
            !buttonDownMiddle ||
            !buttonDownRight
        ) {
            console.error('[OptionsDialogAssets] Failed to load one or more resources')
            return null
        }

        return {
            menuBack,
            backToGameButton,
            backToGameButtonDown,
            checkboxOff,
            checkboxOn,
            sliderSlot,
            sliderKnob,
            buttonLeft,
            buttonMiddle,
            buttonRight,
            buttonDownLeft,
            buttonDownMiddle,
            buttonDownRight,
        }
    }

    static async loadFonts(): Promise<OptionsDialogFonts> {
        const [label, button, buttonHighlight, smallButton, smallButtonHighlight] = await Promise.all(
            OPTION_FONTS.map((name) => FontLoader.load(name)),
        )
        return { label, button, buttonHighlight, smallButton, smallButtonHighlight }
    }
}
