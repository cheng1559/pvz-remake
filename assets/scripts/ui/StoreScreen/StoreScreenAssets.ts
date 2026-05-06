import { FontLoader, type BitmapFontAssets } from '@/core/FontLoader'
import { SpriteLoader } from '@/core/SpriteLoader'
import type { SpriteFrame } from 'cc'

const STORE_SCREEN_SPRITES = [
    'store_background',
    'store_car',
    'store_carclosed',
    'store_hatchbackopen',
    'store_sign',
    'store_mainmenubutton',
    'store_mainmenubuttondown',
    'store_mainmenubuttonhighlight',
    'store_pricetag',
    'store_packetupgrade',
    'particles/seedpacketflash',
    'seeds',
    'packet_plants',
    'packet_plants_cached',
    'store_nextbutton',
    'store_nextbuttonhighlight',
    'store_nextbuttondisabled',
    'store_prevbutton',
    'store_prevbuttonhighlight',
    'store_prevbuttondisabled',
    'store_mushroomgardenicon',
    'store_aquariumgardenicon',
    'store_treeofwisdomicon',
    'store_firstaidwallnuticon',
    'store_pvzicon',
    'coinbank',
    'icon_poolcleaner',
    'icon_rake',
    'icon_roofcleaner',
    'imitaterseed',
    'wateringcangold',
    'fertilizer',
    'bug_spray',
    'phonograph',
    'treefood',
    'stinky_turn3',
    'zen_gardenglove',
    'zen_wheelbarrow',
]

const STORE_SCREEN_FONTS = ['houseofterror20', 'houseofterror16', 'briannetod12', 'continuumbold14']

export interface StoreScreenSprites {
    storeBackground: SpriteFrame
    storeCar: SpriteFrame
    storeCarClosed: SpriteFrame
    storeHatchbackOpen: SpriteFrame
    storeSign: SpriteFrame
    storeMainMenuButton: SpriteFrame
    storeMainMenuButtonDown: SpriteFrame
    storeMainMenuButtonHighlight: SpriteFrame
    storePriceTag: SpriteFrame
    storePacketUpgrade: SpriteFrame
    seedPacketFlash: SpriteFrame
    seeds: SpriteFrame
    packetPlants: SpriteFrame
    packetPlantsCached: SpriteFrame
    storeNextButton: SpriteFrame
    storeNextButtonHighlight: SpriteFrame
    storeNextButtonDisabled: SpriteFrame
    storePrevButton: SpriteFrame
    storePrevButtonHighlight: SpriteFrame
    storePrevButtonDisabled: SpriteFrame
    storeMushroomGardenIcon: SpriteFrame
    storeAquariumGardenIcon: SpriteFrame
    storeTreeOfWisdomIcon: SpriteFrame
    storeFirstAidWallnutIcon: SpriteFrame
    storePvzIcon: SpriteFrame
    coinBank: SpriteFrame
    iconPoolCleaner: SpriteFrame
    iconRake: SpriteFrame
    iconRoofCleaner: SpriteFrame
    imitaterSeed: SpriteFrame
    wateringCanGold: SpriteFrame
    fertilizer: SpriteFrame
    bugSpray: SpriteFrame
    phonograph: SpriteFrame
    treeFood: SpriteFrame
    stinkyTurn3: SpriteFrame
    zenGardenGlove: SpriteFrame
    zenWheelbarrow: SpriteFrame
}

export interface StoreScreenFonts {
    title: BitmapFontAssets | null
    item: BitmapFontAssets | null
    small: BitmapFontAssets | null
    money: BitmapFontAssets | null
}

export class StoreScreenAssets {
    static readonly preload = {
        sprites: STORE_SCREEN_SPRITES,
        fonts: STORE_SCREEN_FONTS,
    }

    static async loadSprites(): Promise<StoreScreenSprites | null> {
        const sprites = await Promise.all(STORE_SCREEN_SPRITES.map((name) => SpriteLoader.load(name)))
        if (sprites.some((sprite) => !sprite)) {
            console.error('[StoreScreenAssets] Failed to load one or more resources')
            return null
        }
        const [
            storeBackground,
            storeCar,
            storeCarClosed,
            storeHatchbackOpen,
            storeSign,
            storeMainMenuButton,
            storeMainMenuButtonDown,
            storeMainMenuButtonHighlight,
            storePriceTag,
            storePacketUpgrade,
            seedPacketFlash,
            seeds,
            packetPlants,
            packetPlantsCached,
            storeNextButton,
            storeNextButtonHighlight,
            storeNextButtonDisabled,
            storePrevButton,
            storePrevButtonHighlight,
            storePrevButtonDisabled,
            storeMushroomGardenIcon,
            storeAquariumGardenIcon,
            storeTreeOfWisdomIcon,
            storeFirstAidWallnutIcon,
            storePvzIcon,
            coinBank,
            iconPoolCleaner,
            iconRake,
            iconRoofCleaner,
            imitaterSeed,
            wateringCanGold,
            fertilizer,
            bugSpray,
            phonograph,
            treeFood,
            stinkyTurn3,
            zenGardenGlove,
            zenWheelbarrow,
        ] = sprites as SpriteFrame[]
        return {
            storeBackground,
            storeCar,
            storeCarClosed,
            storeHatchbackOpen,
            storeSign,
            storeMainMenuButton,
            storeMainMenuButtonDown,
            storeMainMenuButtonHighlight,
            storePriceTag,
            storePacketUpgrade,
            seedPacketFlash,
            seeds,
            packetPlants,
            packetPlantsCached,
            storeNextButton,
            storeNextButtonHighlight,
            storeNextButtonDisabled,
            storePrevButton,
            storePrevButtonHighlight,
            storePrevButtonDisabled,
            storeMushroomGardenIcon,
            storeAquariumGardenIcon,
            storeTreeOfWisdomIcon,
            storeFirstAidWallnutIcon,
            storePvzIcon,
            coinBank,
            iconPoolCleaner,
            iconRake,
            iconRoofCleaner,
            imitaterSeed,
            wateringCanGold,
            fertilizer,
            bugSpray,
            phonograph,
            treeFood,
            stinkyTurn3,
            zenGardenGlove,
            zenWheelbarrow,
        }
    }

    static async loadFonts(): Promise<StoreScreenFonts> {
        const [title, item, small, money] = await Promise.all(STORE_SCREEN_FONTS.map((name) => FontLoader.load(name)))
        return { title, item, small, money }
    }
}
