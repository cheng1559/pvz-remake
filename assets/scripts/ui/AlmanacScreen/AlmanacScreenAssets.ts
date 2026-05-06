import { JsonAsset, type SpriteFrame } from 'cc'
import { AssetLoader } from '@/core/AssetLoader'
import { FontLoader, type BitmapFontAssets } from '@/core/FontLoader'
import { SpriteLoader } from '@/core/SpriteLoader'

export const ALMANAC_PLANT_ANIMATIONS = [
    'peashootersingle',
    'sunflower',
    'cherrybomb',
    'wallnut',
    'potatomine',
    'snowpea',
    'chomper',
    'peashooter',
] as const

export type AlmanacPlantAnimationName = typeof ALMANAC_PLANT_ANIMATIONS[number]
export type AlmanacPlantAnimationMap = Partial<Record<AlmanacPlantAnimationName, JsonAsset>>

const ALMANAC_SCREEN_SPRITES = [
    'almanac_indexback',
    'almanac_closebutton',
    'almanac_closebuttonhighlight',
    'almanac_indexbutton',
    'almanac_indexbuttonhighlight',
    'almanac_plantback',
    'almanac_zombieback',
    'almanac_imitater',
    'almanac_plantcard',
    'almanac_zombieblank',
    'almanac_zombiecard',
    'almanac_zombiewindow',
    'almanac_zombiewindow2',
    'almanac_groundday',
    'almanac_groundice',
    'particles/seedpacketflash',
    'seeds',
    'packet_plants',
    'packet_plants_cached',
    'seedchooser_button',
    'seedchooser_button_glow',
    'button_left',
    'button_middle',
    'button_right',
    'button_down_left',
    'button_down_middle',
    'button_down_right',
    'plantshadow',
]

const ALMANAC_SCREEN_FONTS = [
    'houseofterror28',
    'houseofterror20',
    'dwarventodcraft24',
    'dwarventodcraft18yellow',
    'dwarventodcraft18greeninset',
    'dwarventodcraft18brightgreeninset',
    'briannetod12',
    'pico129',
]

export interface AlmanacScreenSprites {
    almanacIndexBack: SpriteFrame
    almanacCloseButton: SpriteFrame
    almanacCloseButtonHighlight: SpriteFrame
    almanacIndexButton: SpriteFrame
    almanacIndexButtonHighlight: SpriteFrame
    almanacPlantBack: SpriteFrame
    almanacZombieBack: SpriteFrame
    almanacImitater: SpriteFrame
    almanacPlantCard: SpriteFrame
    almanacZombieBlank: SpriteFrame
    almanacZombieCard: SpriteFrame
    almanacZombieWindow: SpriteFrame
    almanacZombieWindowOverlay: SpriteFrame
    almanacGroundDay: SpriteFrame
    almanacGroundIce: SpriteFrame
    seedPacketFlash: SpriteFrame
    seeds: SpriteFrame
    packetPlants: SpriteFrame
    packetPlantsCached: SpriteFrame
    seedChooserButton: SpriteFrame
    seedChooserButtonHighlight: SpriteFrame
    buttonLeft: SpriteFrame
    buttonMiddle: SpriteFrame
    buttonRight: SpriteFrame
    buttonDownLeft: SpriteFrame
    buttonDownMiddle: SpriteFrame
    buttonDownRight: SpriteFrame
    plantShadow: SpriteFrame
}

export interface AlmanacScreenFonts {
    indexTitle: BitmapFontAssets | null
    plantTitle: BitmapFontAssets | null
    zombieTitle: BitmapFontAssets | null
    plantButton: BitmapFontAssets | null
    zombieButton: BitmapFontAssets | null
    zombieButtonHover: BitmapFontAssets | null
    footer: BitmapFontAssets | null
    packetCost: BitmapFontAssets | null
}

export class AlmanacScreenAssets {
    static readonly preload = {
        sprites: ALMANAC_SCREEN_SPRITES,
        fonts: ALMANAC_SCREEN_FONTS,
        animations: ALMANAC_PLANT_ANIMATIONS,
    }

    static async loadSprites(): Promise<AlmanacScreenSprites | null> {
        const sprites = await Promise.all(ALMANAC_SCREEN_SPRITES.map((name) => SpriteLoader.load(name)))
        if (sprites.some((sprite) => !sprite)) {
            const missing = ALMANAC_SCREEN_SPRITES.filter((_, index) => !sprites[index])
            console.error(`[AlmanacScreenAssets] Failed to load resources: ${missing.join(', ')}`)
            return null
        }
        const [
            almanacIndexBack,
            almanacCloseButton,
            almanacCloseButtonHighlight,
            almanacIndexButton,
            almanacIndexButtonHighlight,
            almanacPlantBack,
            almanacZombieBack,
            almanacImitater,
            almanacPlantCard,
            almanacZombieBlank,
            almanacZombieCard,
            almanacZombieWindow,
            almanacZombieWindowOverlay,
            almanacGroundDay,
            almanacGroundIce,
            seedPacketFlash,
            seeds,
            packetPlants,
            packetPlantsCached,
            seedChooserButton,
            seedChooserButtonHighlight,
            buttonLeft,
            buttonMiddle,
            buttonRight,
            buttonDownLeft,
            buttonDownMiddle,
            buttonDownRight,
            plantShadow,
        ] = sprites as SpriteFrame[]
        return {
            almanacIndexBack,
            almanacCloseButton,
            almanacCloseButtonHighlight,
            almanacIndexButton,
            almanacIndexButtonHighlight,
            almanacPlantBack,
            almanacZombieBack,
            almanacImitater,
            almanacPlantCard,
            almanacZombieBlank,
            almanacZombieCard,
            almanacZombieWindow,
            almanacZombieWindowOverlay,
            almanacGroundDay,
            almanacGroundIce,
            seedPacketFlash,
            seeds,
            packetPlants,
            packetPlantsCached,
            seedChooserButton,
            seedChooserButtonHighlight,
            buttonLeft,
            buttonMiddle,
            buttonRight,
            buttonDownLeft,
            buttonDownMiddle,
            buttonDownRight,
            plantShadow,
        }
    }

    static async loadAnimations(): Promise<AlmanacPlantAnimationMap> {
        const animations = await Promise.all(
            ALMANAC_PLANT_ANIMATIONS.map((name) =>
                AssetLoader.load(`animations/${name}`, JsonAsset, `almanac plant animation: ${name}`),
            ),
        )
        const map: AlmanacPlantAnimationMap = {}
        for (let i = 0; i < ALMANAC_PLANT_ANIMATIONS.length; i++) {
            const animation = animations[i]
            if (animation) map[ALMANAC_PLANT_ANIMATIONS[i]] = animation
        }
        return map
    }

    static async loadFonts(): Promise<AlmanacScreenFonts> {
        const [
            indexTitle,
            plantTitle,
            zombieTitle,
            plantButton,
            zombieButton,
            zombieButtonHover,
            footer,
            packetCost,
        ] = await Promise.all(ALMANAC_SCREEN_FONTS.map((name) => FontLoader.load(name)))
        return { indexTitle, plantTitle, zombieTitle, plantButton, zombieButton, zombieButtonHover, footer, packetCost }
    }
}
