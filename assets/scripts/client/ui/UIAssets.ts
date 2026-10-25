import { buildModStrings } from '@/shared/content/DefinitionRegistry'
import { loadInstalledMods } from '@/app/ModLoader'
import { loadPresentationDefinitions } from '@/client/content/loadPresentationDefinitions'
import { ClientContentLoader } from '@/client/content/ClientContentLoader'
import type { PresentationDefinitions } from '@/shared/content/presentation'
import { JsonAsset, type SpriteFrame } from 'cc'
import { AssetLoader } from '@/client/content/LegacyAssetLoader'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import { loadBitmapFont } from '@/client/font/BitmapFontLoader'
import { SpriteLoader } from '@/core/SpriteLoader'
import { modResources } from '@/client/content/ModResources'

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
    tooltipTitle: 'pix118bold',
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
    presentation: PresentationDefinitions
    fonts: Record<UIFont, BitmapFontAssets>
    sprites: Record<typeof SPRITE_NAMES[number], SpriteFrame>
    strings: Readonly<Record<string, string>>
}

let pending: Promise<UIAssets> | undefined

export async function loadUIAssets(): Promise<UIAssets> {
    await modResources.ready()
    if (pending) return pending
    const loader = new ClientContentLoader()
    return pending = Promise.all([
        loader.loadManifest().then(manifest => loadPresentationDefinitions(manifest)),
        Promise.all(Object.entries(FONT_NAMES).map(async ([key, name]) => [key, await loadBitmapFont(name)] as const)),
        Promise.all(SPRITE_NAMES.map(async name => {
            const frame = await SpriteLoader.load(name)
            if (!frame) throw new Error(`Missing UI sprite: ${name}`)
            return [name, frame] as const
        })),
        Promise.all(['ui/strings', 'properties/lawnstrings'].map(async path => {
            const asset = await AssetLoader.load<JsonAsset>(path, JsonAsset)
            if (!asset) throw new Error(`Missing UI strings: ${path}`)
            return asset.json as Record<string, string>
        })).then(tables => Object.assign({}, ...tables)),
        loadInstalledMods().then(mods => buildModStrings(mods.presentationDefinitions)),
    ]).then(([presentation, fonts, sprites, strings, modStrings]) => ({
        presentation,
        fonts: Object.fromEntries(fonts) as UIAssets['fonts'],
        sprites: Object.fromEntries(sprites) as UIAssets['sprites'],
        strings: { ...strings, ...modStrings },
    })).catch(error => { pending = undefined; throw error })
}
