import { FontLoader, type BitmapFontAssets } from '@/core/FontLoader'
import { SpriteLoader } from '@/core/SpriteLoader'
import type { SpriteFrame } from 'cc'

const CHALLENGE_SCREEN_SPRITES = [
    'challenge_background',
    'challenge_thumbnails',
    'challenge_window',
    'challenge_window_highlight',
    'minigame_trophy',
    'seedchooser_button2',
    'seedchooser_button2_glow',
    'survival_thumbnails',
    'trophy',
]

const CHALLENGE_SCREEN_FONTS = ['houseofterror28', 'dwarventodcraft15', 'briannetod12']

export interface ChallengeScreenSprites {
    background: SpriteFrame
    challengeThumbnails: SpriteFrame
    challengeWindow: SpriteFrame
    challengeWindowHighlight: SpriteFrame
    miniGameTrophy: SpriteFrame
    backButton: SpriteFrame
    backButtonHighlight: SpriteFrame
    survivalThumbnails: SpriteFrame
    trophy: SpriteFrame
}

export interface ChallengeScreenFonts {
    title: BitmapFontAssets | null
    small: BitmapFontAssets | null
    button: BitmapFontAssets | null
}

export class ChallengeScreenAssets {
    static readonly preload = {
        sprites: CHALLENGE_SCREEN_SPRITES,
        fonts: CHALLENGE_SCREEN_FONTS,
    }

    static async loadSprites(): Promise<ChallengeScreenSprites | null> {
        const [
            background,
            challengeThumbnails,
            challengeWindow,
            challengeWindowHighlight,
            miniGameTrophy,
            backButton,
            backButtonHighlight,
            survivalThumbnails,
            trophy,
        ] = await Promise.all(
            CHALLENGE_SCREEN_SPRITES.map((name) => SpriteLoader.load(name)),
        )

        if (
            !background ||
            !challengeThumbnails ||
            !challengeWindow ||
            !challengeWindowHighlight ||
            !miniGameTrophy ||
            !backButton ||
            !backButtonHighlight ||
            !survivalThumbnails ||
            !trophy
        ) {
            console.error('[ChallengeScreenAssets] Failed to load one or more resources')
            return null
        }

        return {
            background,
            challengeThumbnails,
            challengeWindow,
            challengeWindowHighlight,
            miniGameTrophy,
            backButton,
            backButtonHighlight,
            survivalThumbnails,
            trophy,
        }
    }

    static async loadFonts(): Promise<ChallengeScreenFonts> {
        const [title, small, button] = await Promise.all(
            CHALLENGE_SCREEN_FONTS.map((name) => FontLoader.load(name)),
        )
        return { title, small, button }
    }
}
