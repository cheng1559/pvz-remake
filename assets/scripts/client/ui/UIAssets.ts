import { mergeStringLayers } from '@/shared/content/strings'
import { loadPresentationDefinitions } from '@/client/content/loadPresentationDefinitions'
import { ClientContentLoader } from '@/client/content/ClientContentLoader'
import type { PresentationDefinitions } from '@/shared/content/presentation'
import { JsonAsset, SpriteFrame } from 'cc'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import { loadBitmapFont } from '@/client/font/BitmapFontLoader'
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
    // Hotkey letters have their own ID: text packs replace houseofterror16 for words, HD packs can still redraw this one.
    hotkey: 'hotkey',
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
    /** The installed text's language (BCP 47, e.g. en-US or zh-CN); text packs declare it as their manifest locale. */
    locale: string
}

let pending: Promise<UIAssets> | undefined

export async function loadUIAssets(): Promise<UIAssets> {
    await modResources.ready()
    if (pending) return pending
    const loader = new ClientContentLoader()
    return pending = Promise.all([
        loader.loadBaseContent().then(base => loadPresentationDefinitions(base)),
        Promise.all(Object.entries(FONT_NAMES).map(async ([key, name]) => [key, await loadBitmapFont(name)] as const)),
        Promise.all(SPRITE_NAMES.map(async name => {
            const frame = await modResources.asset(name, SpriteFrame)
            if (!frame) throw new Error(`Missing UI sprite: ${name}`)
            return [name, frame] as const
        })),
        // All text is one table merged by key: the base, then each running Mod's own keys and translations.
        modResources.jsonLayers('pvz:strings').then(layers => {
            if (!layers.length) throw new Error('Missing strings: pvz:strings')
            const { strings, rejected } = mergeStringLayers(layers.map(({ owner, json }) => ({ owner, table: json })))
            for (const entry of rejected) console.error(`[UI] A Mod may only add strings in its own namespace: ${entry}`)
            return strings
        }),
        modResources.locale(),
    ]).then(([presentation, fonts, sprites, strings, locale]) => ({
        presentation,
        fonts: Object.fromEntries(fonts) as UIAssets['fonts'],
        sprites: Object.fromEntries(sprites) as UIAssets['sprites'],
        strings,
        locale,
    })).catch(error => { pending = undefined; throw error })
}
