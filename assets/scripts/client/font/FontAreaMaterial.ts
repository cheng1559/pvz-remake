import { EffectAsset, Material, resources, type Texture2D, Vec4 } from 'cc'

let effect: Promise<EffectAsset> | undefined
const materials = new WeakMap<Texture2D, Material>()

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
    materials.set(texture, material)
    return material
}
