import type { BitmapFontAssets } from './BitmapFontAssets'
import { modResources } from '@/client/content/ModResources'

export async function loadBitmapFont(name: string): Promise<BitmapFontAssets> {
    const font = await modResources.font(`pvz:${name}`)
    if (!font) throw new Error(`Missing font: ${name}`)
    return font
}
