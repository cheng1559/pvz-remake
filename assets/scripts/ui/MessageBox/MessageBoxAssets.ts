import { SpriteFrame } from 'cc'

import { FontLoader } from '@/core/FontLoader'
import type { BitmapFontAssets } from '@/core/FontLoader'
import { SpriteLoader } from '@/core/SpriteLoader'

const BUTTON_SPRITES = [
    'button_left',
    'button_middle',
    'button_right',
    'button_down_left',
    'button_down_middle',
    'button_down_right',
]

const DIALOG_SPRITES = [
    'dialog_topleft',
    'dialog_topmiddle',
    'dialog_topright',
    'dialog_centerleft',
    'dialog_centermiddle',
    'dialog_centerright',
    'dialog_bottomleft',
    'dialog_bottommiddle',
    'dialog_bottomright',
    'dialog_bigbottomleft',
    'dialog_bigbottommiddle',
    'dialog_bigbottomright',
    'dialog_header',
]

const TEXT_FONTS = ['dwarventodcraft24', 'dwarventodcraft15']
const BUTTON_FONTS = ['dwarventodcraft18greeninset', 'dwarventodcraft18brightgreeninset']

export interface MessageBoxDialogSprites {
    topLeft: SpriteFrame
    topMiddle: SpriteFrame
    topRight: SpriteFrame
    centerLeft: SpriteFrame
    centerMiddle: SpriteFrame
    centerRight: SpriteFrame
    bottomLeft: SpriteFrame
    bottomMiddle: SpriteFrame
    bottomRight: SpriteFrame
    header: SpriteFrame
}

export interface MessageBoxButtonSprites {
    left: SpriteFrame
    middle: SpriteFrame
    right: SpriteFrame
    downLeft: SpriteFrame
    downMiddle: SpriteFrame
    downRight: SpriteFrame
}

export interface MessageBoxTextFonts {
    title: BitmapFontAssets | null
    message: BitmapFontAssets | null
}

export interface MessageBoxButtonFonts {
    normal: BitmapFontAssets | null
    highlight: BitmapFontAssets | null
}

export class MessageBoxAssets {
    static readonly preload = {
        sprites: [...DIALOG_SPRITES, ...BUTTON_SPRITES],
        fonts: [...TEXT_FONTS, ...BUTTON_FONTS],
    }

    private static _buttonSprites: MessageBoxButtonSprites | null = null

    static async loadDialogSprites(isTall: boolean): Promise<MessageBoxDialogSprites | null> {
        const bottomPrefix = isTall ? 'dialog_bigbottom' : 'dialog_bottom'
        const [
            topLeft,
            topMiddle,
            topRight,
            centerLeft,
            centerMiddle,
            centerRight,
            bottomLeft,
            bottomMiddle,
            bottomRight,
            header,
        ] = await Promise.all([
            SpriteLoader.load('dialog_topleft'),
            SpriteLoader.load('dialog_topmiddle'),
            SpriteLoader.load('dialog_topright'),
            SpriteLoader.load('dialog_centerleft'),
            SpriteLoader.load('dialog_centermiddle'),
            SpriteLoader.load('dialog_centerright'),
            SpriteLoader.load(`${bottomPrefix}left`),
            SpriteLoader.load(`${bottomPrefix}middle`),
            SpriteLoader.load(`${bottomPrefix}right`),
            SpriteLoader.load('dialog_header'),
        ])

        if (
            !topLeft ||
            !topMiddle ||
            !topRight ||
            !centerLeft ||
            !centerMiddle ||
            !centerRight ||
            !bottomLeft ||
            !bottomMiddle ||
            !bottomRight ||
            !header
        ) {
            console.error('[MessageBoxAssets] Failed to load dialog sprites')
            return null
        }

        return {
            topLeft,
            topMiddle,
            topRight,
            centerLeft,
            centerMiddle,
            centerRight,
            bottomLeft,
            bottomMiddle,
            bottomRight,
            header,
        }
    }

    static async loadButtonSprites(): Promise<MessageBoxButtonSprites | null> {
        if (this._buttonSprites) return this._buttonSprites

        const [left, middle, right, downLeft, downMiddle, downRight] = await Promise.all(
            BUTTON_SPRITES.map((name) => SpriteLoader.load(name)),
        )
        if (!left || !middle || !right || !downLeft || !downMiddle || !downRight) {
            console.error('[MessageBoxAssets] Failed to load button sprites')
            return null
        }

        this._buttonSprites = { left, middle, right, downLeft, downMiddle, downRight }
        return this._buttonSprites
    }

    static async loadTextFonts(): Promise<MessageBoxTextFonts> {
        const [title, message] = await Promise.all(TEXT_FONTS.map((name) => FontLoader.load(name)))
        return { title, message }
    }

    static async loadButtonFonts(): Promise<MessageBoxButtonFonts> {
        const [normal, highlight] = await Promise.all(BUTTON_FONTS.map((name) => FontLoader.load(name)))
        return { normal, highlight }
    }
}
