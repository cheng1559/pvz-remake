import { JsonAsset, Texture2D, type SpriteFrame } from 'cc'
import { AssetLoader } from '@/client/content/LegacyAssetLoader'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import type { FontConfig } from '@/client/font/FontRenderer.d'
import { upscaledFontLoader } from '@/client/font/UpscaledFonts'
import { SpriteLoader } from '@/core/SpriteLoader'

const FONT_NAMES = {
    label: 'dwarventodcraft18',
    button: 'dwarventodcraft18greeninset',
    buttonHover: 'dwarventodcraft18brightgreeninset',
    large: 'dwarventodcraft36greeninset',
    largeHover: 'dwarventodcraft36brightgreeninset',
    title: 'dwarventodcraft24',
    pageTitle: 'houseofterror28',
    pageTitleSmall: 'houseofterror20',
    body: 'dwarventodcraft15',
    small: 'briannetod12',
    yellow: 'dwarventodcraft18yellow',
    profile: 'briannetod16',
    packetCost: 'pico129',
    money: 'continuumbold14',
    storeItem: 'houseofterror16',
    achievement: 'dwarventodcraft12',
} as const

const SPRITE_NAMES = [
    'options_menuback', 'options_backtogamebutton0', 'options_backtogamebutton2',
    'options_checkbox0', 'options_checkbox1', 'options_sliderslot', 'options_sliderknob2',
    'button_left', 'button_middle', 'button_right',
    'button_down_left', 'button_down_middle', 'button_down_right',
    'seedchooser_button', 'seedchooser_button_glow', 'seedchooser_button_disabled',
    'seedchooser_button2', 'seedchooser_button2_glow',
    'almanac_indexbutton', 'almanac_indexbuttonhighlight',
    'almanac_closebutton', 'almanac_closebuttonhighlight',
    'dialog_topleft', 'dialog_topmiddle', 'dialog_topright',
    'dialog_centerleft', 'dialog_centermiddle', 'dialog_centerright',
    'dialog_bottomleft', 'dialog_bottommiddle', 'dialog_bottomright', 'dialog_header',
    'dialog_bigbottomleft', 'dialog_bigbottommiddle', 'dialog_bigbottomright', 'editbox',
] as const

export type UIFont = keyof typeof FONT_NAMES
export interface UIAssets {
    fonts: Record<UIFont, BitmapFontAssets>
    sprites: Record<typeof SPRITE_NAMES[number], SpriteFrame>
    strings: Readonly<Record<string, string>>
}

let pending: Promise<UIAssets> | undefined

export function loadUIAssets(): Promise<UIAssets> {
    return pending ??= Promise.all([
        Promise.all(Object.entries(FONT_NAMES).map(async ([key, name]) => {
            const config = await AssetLoader.load<JsonAsset>(`fonts/${name}`, JsonAsset)
            if (!config) throw new Error(`Missing UI font: ${name}`)
            const data = config.json as unknown as FontConfig
            const textures = await Promise.all(data.layers.map(async layer => {
                const texture = await AssetLoader.load<Texture2D>(`fonts/${layer.image}/texture`, Texture2D)
                if (!texture) throw new Error(`Missing UI font texture: ${layer.image}`)
                texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE)
                texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST)
                return texture
            }))
            return [key, { config, textures, loadUpscaled: upscaledFontLoader(name) }] as const
        })),
        Promise.all(SPRITE_NAMES.map(async name => {
            const frame = await SpriteLoader.load(name)
            if (!frame) throw new Error(`Missing UI sprite: ${name}`)
            return [name, frame] as const
        })),
        AssetLoader.load<JsonAsset>('properties/lawnstrings', JsonAsset).then(asset => {
            if (!asset) throw new Error('Missing UI strings')
            return asset.json as Record<string, string>
        }),
    ]).then(([fonts, sprites, strings]) => ({
        fonts: Object.fromEntries(fonts) as UIAssets['fonts'],
        sprites: Object.fromEntries(sprites) as UIAssets['sprites'],
        strings,
    })).catch(error => { pending = undefined; throw error })
}
