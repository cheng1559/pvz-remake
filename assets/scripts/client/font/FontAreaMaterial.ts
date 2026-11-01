import { EffectAsset, Material, resources, type Texture2D, Vec4 } from 'cc'
import { GameDebugSettings } from '@/platform/debug/GameDebugSettings'

let effect: Promise<EffectAsset> | undefined
const materials = new Map<Texture2D, Material>()

const fontParams = (sharpness: number) => new Vec4(sharpness, 0, 0, 0)

/** A glyph material that averages the atlas pixels under each screen pixel, so pixel fonts keep even strokes at any window size. */
export async function fontAreaMaterial(texture: Texture2D): Promise<Material> {
    const cached = materials.get(texture)
    if (cached) return cached
    const asset = await (effect ??= new Promise<EffectAsset>((resolve, reject) => {
        resources.load('effects/font-area', EffectAsset, (error, loaded) => error ? reject(error) : resolve(loaded))
    }).catch(error => { effect = undefined; throw error }))
    const material = new Material()
    material.initialize({ effectAsset: asset })
    material.setProperty('atlasSize', new Vec4(texture.width, texture.height, 1 / texture.width, 1 / texture.height))
    material.setProperty('fontParams', fontParams(GameDebugSettings.fontSharpness))
    materials.set(texture, material)
    return material
}

/** Applies a new magnified sharpness (0 area, 1 nearest) to every glyph material. */
export function setFontSharpness(sharpness: number): void {
    for (const material of materials.values()) material.setProperty('fontParams', fontParams(sharpness))
}
