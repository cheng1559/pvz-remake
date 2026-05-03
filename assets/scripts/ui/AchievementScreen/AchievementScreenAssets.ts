import { FontLoader, type BitmapFontAssets } from '@/core/FontLoader'
import { SpriteLoader } from '@/core/SpriteLoader'
import type { SpriteFrame } from 'cc'

const ACHIEVEMENT_SCREEN_SPRITES = [
    'selectorscreen_achievements_bg',
    'acheesements_hole_tile',
    'acheesements_china',
    'acheesements_bookworm',
    'acheesements_bejeweled',
    'acheesements_chuzzle',
    'acheesements_peggle',
    'acheesements_pipe',
    'acheesements_zuma',
    'acheesements_back_highlight',
    'acheesements_more_button',
    'acheesements_more_button_highlight',
    'acheesements_top_button',
    'acheesements_top_button_highlight',
    'acheesements_more_rock',
    'acheesements_icons',
]

const ACHIEVEMENT_SCREEN_FONTS = ['dwarventodcraft12', 'dwarventodcraft15']

export interface AchievementScreenSprites {
    background: SpriteFrame
    tile: SpriteFrame
    chinaTile: SpriteFrame
    bookworm: SpriteFrame
    bejeweled: SpriteFrame
    chuzzle: SpriteFrame
    peggle: SpriteFrame
    pipe: SpriteFrame
    zuma: SpriteFrame
    backButton: SpriteFrame
    moreButton: SpriteFrame
    moreButtonHighlight: SpriteFrame
    topButton: SpriteFrame
    topButtonHighlight: SpriteFrame
    rock: SpriteFrame
    icons: SpriteFrame
}

export interface AchievementScreenFonts {
    description: BitmapFontAssets | null
    title: BitmapFontAssets | null
}

export class AchievementScreenAssets {
    static readonly preload = {
        sprites: ACHIEVEMENT_SCREEN_SPRITES,
        fonts: ACHIEVEMENT_SCREEN_FONTS,
    }

    static async loadSprites(): Promise<AchievementScreenSprites | null> {
        const [
            background,
            tile,
            chinaTile,
            bookworm,
            bejeweled,
            chuzzle,
            peggle,
            pipe,
            zuma,
            backButton,
            moreButton,
            moreButtonHighlight,
            topButton,
            topButtonHighlight,
            rock,
            icons,
        ] = await Promise.all(ACHIEVEMENT_SCREEN_SPRITES.map((name) => SpriteLoader.load(name)))

        if (
            !background ||
            !tile ||
            !chinaTile ||
            !bookworm ||
            !bejeweled ||
            !chuzzle ||
            !peggle ||
            !pipe ||
            !zuma ||
            !backButton ||
            !moreButton ||
            !moreButtonHighlight ||
            !topButton ||
            !topButtonHighlight ||
            !rock ||
            !icons
        ) {
            console.error('[AchievementScreenAssets] Failed to load one or more resources')
            return null
        }

        return {
            background,
            tile,
            chinaTile,
            bookworm,
            bejeweled,
            chuzzle,
            peggle,
            pipe,
            zuma,
            backButton,
            moreButton,
            moreButtonHighlight,
            topButton,
            topButtonHighlight,
            rock,
            icons,
        }
    }

    static async loadFonts(): Promise<AchievementScreenFonts> {
        const [description, title] = await Promise.all(
            ACHIEVEMENT_SCREEN_FONTS.map((name) => FontLoader.load(name)),
        )
        return { description, title }
    }
}
