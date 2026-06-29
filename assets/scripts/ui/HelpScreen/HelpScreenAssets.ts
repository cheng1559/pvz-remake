import { FontLoader, type BitmapFontAssets } from '@/core/FontLoader'
import { SpriteLoader } from '@/core/SpriteLoader'
import type { SpriteFrame } from 'cc'

const HELP_SCREEN_SPRITES = [
    'background1',
    'zombienote',
    'zombie_note_help',
    'seedchooser_button',
    'seedchooser_button_glow',
    'seedchooser_button_disabled',
]

const HELP_SCREEN_FONTS = ['dwarventodcraft15']

export interface HelpScreenSprites {
    background: SpriteFrame
    zombieNote: SpriteFrame
    zombieNoteHelp: SpriteFrame
    mainMenuButton: SpriteFrame
    mainMenuButtonGlow: SpriteFrame
    mainMenuButtonDisabled: SpriteFrame
}

export interface HelpScreenFonts {
    button: BitmapFontAssets | null
}

export class HelpScreenAssets {
    static readonly preload = {
        sprites: HELP_SCREEN_SPRITES,
        fonts: HELP_SCREEN_FONTS,
    }

    static async loadSprites(): Promise<HelpScreenSprites | null> {
        const [
            background,
            zombieNote,
            zombieNoteHelp,
            mainMenuButton,
            mainMenuButtonGlow,
            mainMenuButtonDisabled,
        ] = await Promise.all(HELP_SCREEN_SPRITES.map((name) => SpriteLoader.load(name)))

        if (
            !background ||
            !zombieNote ||
            !zombieNoteHelp ||
            !mainMenuButton ||
            !mainMenuButtonGlow ||
            !mainMenuButtonDisabled
        ) {
            console.error('[HelpScreenAssets] Failed to load one or more resources')
            return null
        }

        return {
            background,
            zombieNote,
            zombieNoteHelp,
            mainMenuButton,
            mainMenuButtonGlow,
            mainMenuButtonDisabled,
        }
    }

    static async loadFonts(): Promise<HelpScreenFonts> {
        const [button] = await Promise.all(HELP_SCREEN_FONTS.map((name) => FontLoader.load(name)))
        return { button }
    }
}
