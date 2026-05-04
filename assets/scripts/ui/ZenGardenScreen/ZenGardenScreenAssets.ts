import { FontLoader, type BitmapFontAssets } from '@/core/FontLoader'
import { SpriteLoader } from '@/core/SpriteLoader'
import { AssetLoader } from '@/core/AssetLoader'
import { JsonAsset, type SpriteFrame } from 'cc'

const ZEN_GARDEN_SCREEN_SPRITES = [
    'background_greenhouse',
    'background_mushroomgarden',
    'aquarium1',
    'zenshopbutton',
    'zenshopbutton_highlight',
    'zen_nextgarden',
    'button_left',
    'button_middle',
    'button_right',
    'button_down_left',
    'button_down_middle',
    'button_down_right',
]

const ZEN_GARDEN_SCREEN_FONTS = [
    'dwarventodcraft18greeninset',
    'dwarventodcraft18brightgreeninset',
    'houseofterror16',
    'briannetod12',
]

const ZEN_GARDEN_SCREEN_ANIMATIONS = ['treeofwisdom', 'treeofwisdomclouds']

export interface ZenGardenScreenSprites {
    zenBackground: SpriteFrame
    mushroomBackground: SpriteFrame
    aquariumBackground: SpriteFrame
    zenShopButton: SpriteFrame
    zenShopButtonHighlight: SpriteFrame
    zenNextGarden: SpriteFrame
    buttonLeft: SpriteFrame
    buttonMiddle: SpriteFrame
    buttonRight: SpriteFrame
    buttonDownLeft: SpriteFrame
    buttonDownMiddle: SpriteFrame
    buttonDownRight: SpriteFrame
}

export interface ZenGardenScreenFonts {
    button: BitmapFontAssets | null
    buttonHighlight: BitmapFontAssets | null
    sceneLabel: BitmapFontAssets | null
    tooltip: BitmapFontAssets | null
}

export interface ZenGardenScreenAnimations {
    treeOfWisdom: JsonAsset
    treeOfWisdomClouds: JsonAsset
}

export class ZenGardenScreenAssets {
    static readonly preload = {
        sprites: ZEN_GARDEN_SCREEN_SPRITES,
        fonts: ZEN_GARDEN_SCREEN_FONTS,
        animations: ZEN_GARDEN_SCREEN_ANIMATIONS,
    }

    static async loadSprites(): Promise<ZenGardenScreenSprites | null> {
        const sprites = await Promise.all(ZEN_GARDEN_SCREEN_SPRITES.map((name) => SpriteLoader.load(name)))
        if (sprites.some((sprite) => !sprite)) {
            console.error('[ZenGardenScreenAssets] Failed to load one or more resources')
            return null
        }
        const [
            zenBackground,
            mushroomBackground,
            aquariumBackground,
            zenShopButton,
            zenShopButtonHighlight,
            zenNextGarden,
            buttonLeft,
            buttonMiddle,
            buttonRight,
            buttonDownLeft,
            buttonDownMiddle,
            buttonDownRight,
        ] = sprites as SpriteFrame[]
        return {
            zenBackground,
            mushroomBackground,
            aquariumBackground,
            zenShopButton,
            zenShopButtonHighlight,
            zenNextGarden,
            buttonLeft,
            buttonMiddle,
            buttonRight,
            buttonDownLeft,
            buttonDownMiddle,
            buttonDownRight,
        }
    }

    static async loadFonts(): Promise<ZenGardenScreenFonts> {
        const [button, buttonHighlight, sceneLabel, tooltip] = await Promise.all(ZEN_GARDEN_SCREEN_FONTS.map((name) => FontLoader.load(name)))
        return { button, buttonHighlight, sceneLabel, tooltip }
    }

    static async loadAnimations(): Promise<ZenGardenScreenAnimations | null> {
        const [treeOfWisdom, treeOfWisdomClouds] = await Promise.all(
            ZEN_GARDEN_SCREEN_ANIMATIONS.map((name) =>
                AssetLoader.load(`animations/${name}`, JsonAsset, `animation: ${name}`),
            ),
        )
        if (!treeOfWisdom || !treeOfWisdomClouds) {
            console.error('[ZenGardenScreenAssets] Failed to load one or more animations')
            return null
        }
        return { treeOfWisdom, treeOfWisdomClouds }
    }
}
