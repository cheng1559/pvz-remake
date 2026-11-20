import type { JsonAsset, Material, Texture2D } from 'cc'

export interface BitmapFontAssets {
    config: JsonAsset
    textures: Texture2D[]
    /** Per layer glyph materials; layers without one use the default sprite material. */
    materials?: Material[]
}
