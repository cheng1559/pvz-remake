import type { BitmapFontAssets } from './BitmapFontAssets'
import { resourcePacks } from '@/client/content/ResourcePacks'

export async function loadBitmapFont(name: string): Promise<BitmapFontAssets> {
    const font = await resourcePacks.font(`pvz:${name}`)
    if (!font) throw new Error(`Missing font: ${name}`)
    return font
}
