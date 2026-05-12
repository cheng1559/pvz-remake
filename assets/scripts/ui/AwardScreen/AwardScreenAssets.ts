import { type SpriteFrame } from 'cc'
import { FontLoader, type BitmapFontAssets } from '@/core/FontLoader'
import { SpriteLoader } from '@/core/SpriteLoader'

const AWARD_SCREEN_SPRITES = [
    'awardscreen_back',
    'seedpacket_larger',
    'plant_previews_cached',
    'seedchooser_button',
    'seedchooser_button_glow',
] as const

const AWARD_SCREEN_FONTS = [
    'dwarventodcraft24',
    'dwarventodcraft18yellow',
    'briannetod16',
    'dwarventodcraft15',
    'pico129',
] as const

export interface AwardScreenSprites {
    background: SpriteFrame
    seedPacketLarger: SpriteFrame
    plantPreviewsCached: SpriteFrame
    seedChooserButton: SpriteFrame
    seedChooserButtonGlow: SpriteFrame
}

export interface AwardScreenFonts {
    title: BitmapFontAssets | null
    awardName: BitmapFontAssets | null
    description: BitmapFontAssets | null
    button: BitmapFontAssets | null
    packetCost: BitmapFontAssets | null
}

export class AwardScreenAssets {
    static readonly preload = {
        sprites: AWARD_SCREEN_SPRITES,
        fonts: AWARD_SCREEN_FONTS,
    }

    static async loadSprites(): Promise<AwardScreenSprites | null> {
        const sprites = await Promise.all(AWARD_SCREEN_SPRITES.map((name) => SpriteLoader.load(name)))
        if (sprites.some((sprite) => !sprite)) {
            const missing = AWARD_SCREEN_SPRITES.filter((_, index) => !sprites[index])
            console.error(`[AwardScreenAssets] Failed to load resources: ${missing.join(', ')}`)
            return null
        }

        const [
            background,
            seedPacketLarger,
            plantPreviewsCached,
            seedChooserButton,
            seedChooserButtonGlow,
        ] = sprites as SpriteFrame[]
        return {
            background,
            seedPacketLarger,
            plantPreviewsCached,
            seedChooserButton,
            seedChooserButtonGlow,
        }
    }

    static async loadFonts(): Promise<AwardScreenFonts> {
        const [title, awardName, description, button, packetCost] = await Promise.all(
            AWARD_SCREEN_FONTS.map((name) => FontLoader.load(name)),
        )
        return { title, awardName, description, button, packetCost }
    }
}
