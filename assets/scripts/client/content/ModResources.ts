import { Asset, assetManager, AudioClip, dynamicAtlasManager, ImageAsset, macro, JsonAsset, native, Rect, resources, Size, SpriteFrame, sys, TextAsset, Texture2D, Vec2 } from 'cc'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import type { ContentCategory } from '@/shared/content'
import type { FontConfig } from '@/client/font/FontRenderer.d'
import { applySpriteDensity, setSpriteDensity } from './SpriteDensity'
import { decodePremultipliedPng } from './PremultipliedPng'
import { loadKernel } from '@/shared/kernel/index'
import { installedArchiveRoot, installedFilePath, readArchiveBlob, readArchiveFile, unpackArchive, type ArchiveFiles } from './InstalledArchives'
import { modManager, type ModManager } from './ModManager'
import { contentJson, relativeFile, parseContentArchive, type ContentArchive, type ModContent, type ResourceManifest, type ResourceSprite as PackSprite } from '@/shared/mod/content'

type PackManifest = { id: string } & ResourceManifest
interface LoadedPack {
    locale?: string
    files: ArchiveFiles
    manifest: PackManifest
    textures: Map<string, Promise<Texture2D>>
    sprites: Map<string, Promise<SpriteFrame>>
    fonts: Map<string, Promise<BitmapFontAssets>>
    assets: Map<string, Promise<Asset>>
    urls: Map<string, string>
    runtimeRoot?: string
    premultiplied: Set<string>
}

const fileKinds = ['fonts', 'audio', 'json', 'text'] as const
type AssetType<T extends Asset> = new (...args: any[]) => T
let nativeRuntimeReady = false
let nativeRuntimeId = 0
const MAX_NATIVE_TEXTURE_LOADS = 4
let nativeTextureLoads = 0
const nativeTextureWaiters: (() => void)[] = []

function archiveFile(files: ArchiveFiles, file: string): Promise<Uint8Array> {
    relativeFile(file)
    // Installed native files are read from disk on each access; web media from the stored ZIP.
    return readArchiveFile(files, file)
}

const archiveJson = contentJson

function createPack(files: ArchiveFiles, id: string, content: ModContent, locale?: string): LoadedPack {
    const { resources } = content
    const manifest: PackManifest = { id, ...resources,
        json: { ...resources.json, ...resources.reanim, ...resources.particles, ...resources.music } }
    const premultiplied = new Set(Object.values(resources.sprites).filter(sprite => sprite.alphaMode === 'premultiplied').map(sprite => sprite.file))
    return { locale, manifest, files, premultiplied, textures: new Map(), sprites: new Map(), fonts: new Map(), assets: new Map(), urls: new Map() }
}

async function fileUrl(pack: LoadedPack, file: string, mime: string): Promise<string> {
    const cached = pack.urls.get(file)
    if (cached) return cached
    let url = installedFilePath(pack.files, file)
    if (url) {
        pack.urls.set(file, url)
        return url
    }
    if (sys.isNative) {
        const bytes = await archiveFile(pack.files, file)
        pack.runtimeRoot ??= installedArchiveRoot('mod-resources', `${pack.manifest.id}-${++nativeRuntimeId}`)
        url = `${pack.runtimeRoot}/${file}`
        native.fileUtils.createDirectory(url.slice(0, url.lastIndexOf('/')))
        if (!native.fileUtils.writeDataToFile(bytes.slice().buffer, url)) throw new Error(`Failed to prepare Mod resource: ${file}`)
    } else {
        relativeFile(file)
        // Audio URLs stay alive for playback, seeking and the SFX pitch decoder until restart.
        url = URL.createObjectURL(await readArchiveBlob(pack.files, file, mime))
        const raced = pack.urls.get(file)
        if (raced) { URL.revokeObjectURL(url); return raced }
    }
    pack.urls.set(file, url)
    return url
}

async function remote<T extends Asset>(pack: LoadedPack, file: string, ext: string, mime: string): Promise<T> {
    const url = await fileUrl(pack, file, mime)
    return new Promise((resolve, reject) => assetManager.loadRemote<T>(url, { ext, reloadAsset: true },
        (error, asset) => error ? reject(error) : resolve(asset)))
}

async function texture(pack: LoadedPack, file: string, scale = 1): Promise<Texture2D> {
    const cached = pack.textures.get(file)
    if (cached) return cached
    const pending = (async () => {
        const isNative = sys.isNative
        if (isNative) {
            if (nativeTextureLoads >= MAX_NATIVE_TEXTURE_LOADS) await new Promise<void>(resolve => nativeTextureWaiters.push(resolve))
            else nativeTextureLoads++
        }
        let image: ImageAsset | undefined
        try {
            // The web may still be compiling the kernel that decodes premultiplied images.
            const decoded = pack.premultiplied.has(file) ? decodePremultipliedPng(await archiveFile(pack.files, file), await loadKernel()) : undefined
            if (!decoded) image = await remote<ImageAsset>(pack, file, '.png', 'image/png')
            const result = new Texture2D()
            if (decoded) {
                result.reset({ width: decoded.width, height: decoded.height, format: Texture2D.PixelFormat.RGBA8888 })
                result.uploadData(decoded.rgba)
            } else {
                result.image = image!
            }
            // Preserve the decoded RGBA upload used by the existing HD images and fonts.
            const pixels = result.image?.data
            if (sys.isBrowser && pixels && !ArrayBuffer.isView(pixels)) {
                const canvas = document.createElement('canvas')
                canvas.width = result.width
                canvas.height = result.height
                const context = canvas.getContext('2d')!
                context.drawImage(pixels, 0, 0)
                const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data
                result.uploadData(new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength))
            }
            result.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE)
            result.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR)
            setSpriteDensity(result, scale)
            return result
        } finally {
            if (isNative) {
                // Remote images have no Cocos dependency edge, so automatic image cleanup misses them.
                if (image) {
                    assetManager.releaseAsset(image)
                    // Each texture loads once; drop bytes held in memory (installed files are read on demand).
                    delete pack.files[file]
                }
                const next = nativeTextureWaiters.shift()
                if (next) next()
                else nativeTextureLoads--
            }
        }
    })().catch(error => { pack.textures.delete(file); throw error })
    pack.textures.set(file, pending)
    return pending
}

/** All archive resources share decoding and caches; installation belongs to ModManager. */
export class ModResources {
    private base?: LoadedPack
    private baseArchive?: ContentArchive
    private active: LoadedPack[] = []
    private baseInitialization?: Promise<void>
    private initialization?: Promise<void>

    constructor(private readonly loadBase?: () => Promise<Uint8Array>, private readonly manager: ModManager = modManager) {}

    private readyBase(): Promise<void> {
        return this.baseInitialization ??= (async () => {
            macro.CLEANUP_IMAGE_CACHE = false
            // Native uploads release CPU images; atlas packing would copy freed data.
            dynamicAtlasManager.enabled = !sys.isNative
            if (sys.isNative && !nativeRuntimeReady) {
                native.fileUtils.removeDirectory(installedArchiveRoot('mod-resources', ''))
                nativeRuntimeReady = true
            }
            if (this.loadBase) {
                this.baseArchive = parseContentArchive(unpackArchive(await this.loadBase(), 'manifest.json'))
                this.base = createPack(this.baseArchive.files, this.baseArchive.manifest.id, this.baseArchive.content, this.baseArchive.manifest.locale)
            }
        })()
    }

    ready(): Promise<void> {
        return this.initialization ??= (async () => {
            await this.readyBase()
            this.active = (await this.manager.ready()).map(mod => createPack(mod.files, mod.manifest.id, mod.content, mod.manifest.locale))
        })()
    }

    /** Bootstrap artwork can load from the base archive before pending Mod changes are applied. */
    async baseAsset<T extends Asset>(id: string, type: AssetType<T>): Promise<T | undefined> {
        await this.readyBase()
        return this.resolveAsset(id, type, undefined, true)
    }

    async baseContent(): Promise<ContentArchive> {
        await this.ready()
        if (!this.baseArchive) throw new Error('Base content is not loaded')
        return this.baseArchive
    }

    async preload(onProgress: (progress: number) => void): Promise<void> {
        await this.ready()
        const tasks = [...(this.base ? [this.base] : []), ...this.active].flatMap(pack => [
            ...Object.entries(pack.manifest.sprites).flatMap(([id, entry]) =>
                (entry.animations ?? [undefined]).map(animation => () => this.sprite(id, animation))),
            ...Object.keys(pack.manifest.fonts).map(id => () => this.font(id)),
            ...Object.keys(pack.manifest.audio).map(id => () => this.asset(id, AudioClip)),
            ...Object.keys(pack.manifest.json).map(id => () => this.asset(id, JsonAsset)),
            ...Object.keys(pack.manifest.text).map(id => () => this.asset(id, TextAsset)),
        ])
        let completed = 0
        await Promise.all(tasks.map(async load => { await load(); onProgress(++completed / tasks.length) }))
        onProgress(1)
    }

    /** Resolve presentation assets before either the resources bundle or the content registry. */
    async asset<T extends Asset>(id: string, type: AssetType<T>, animation?: string, category?: ContentCategory): Promise<T | undefined> {
        await this.ready()
        return this.resolveAsset(id, type, animation, false, category)
    }

    /** Raw Mod paths use the same decoder, caches and native upload limits as registered IDs. */
    async file<T extends Asset>(owner: string, file: string, type: AssetType<T>): Promise<T> {
        await this.ready()
        const pack = this.base?.manifest.id === owner ? this.base : this.active.find(entry => entry.manifest.id === owner)
        if (!pack) throw new Error(`Mod resources are unavailable: ${owner}`)
        relativeFile(file)
        const assetType: AssetType<Asset> = type
        const scale = Object.values(pack.manifest.sprites).find(entry => entry.file === file)?.scale ?? 1
        if (assetType === SpriteFrame) {
            const image = await texture(pack, file, scale)
            const asset: Asset = await this.spriteFrom(pack, `file:${file}`, { file, width: image.width / scale, height: image.height / scale, scale })
            return asset as T
        }
        if (assetType === Texture2D) { const asset: Asset = await texture(pack, file, scale); return asset as T }
        return this.fileAsset(pack, file, type)
    }

    /** Authoritative configuration bypasses presentation overrides. */
    async baseJson<T = unknown>(id: string): Promise<T> {
        await this.ready()
        const asset = await this.resolveAsset(id, JsonAsset, undefined, true)
        if (!asset) throw new Error(`Missing base JSON: ${id}`)
        return asset.json as T
    }

    /** The text language: the last running Mod's manifest locale, else the base's. */
    async locale(): Promise<string> {
        await this.ready()
        const packs = [...(this.base ? [this.base] : []), ...this.active]
            .filter(pack => pack === this.base || !this.manager.failures.has(pack.manifest.id))
        return packs.reverse().find(pack => pack.locale)?.locale ?? 'en-US'
    }

    /** Every running layer of a JSON resource, base first and the highest-priority Mod last, for tables merged by key. */
    async jsonLayers(id: string): Promise<{ owner: string, json: unknown }[]> {
        await this.ready()
        const packs = [...(this.base ? [this.base] : []), ...this.active]
            .filter(pack => (pack === this.base || !this.manager.failures.has(pack.manifest.id)) && pack.manifest.json[id])
        return packs.map(pack => ({ owner: pack.manifest.id, json: archiveJson(pack.files, pack.manifest.json[id]) }))
    }

    async ids(type: AssetType<Asset>, prefix = ''): Promise<string[]> {
        await this.ready()
        const kind = type === JsonAsset ? 'json' : type === AudioClip ? 'audio' : type === TextAsset ? 'text' : 'sprites'
        return [...new Set([...(this.base ? [this.base] : []), ...this.active]
            .flatMap(pack => Object.keys(pack.manifest[kind])))].filter(id => id.startsWith(prefix))
    }

    private async resolveAsset<T extends Asset>(id: string, type: AssetType<T>, animation?: string, baseOnly = false, category?: ContentCategory): Promise<T | undefined> {
        const assetType: AssetType<Asset> = type
        if (!id.includes(':')) {
            if (assetType === AudioClip || assetType === SpriteFrame || assetType === Texture2D) {
                id = id.replace(/\/(spriteFrame|texture)$/, '')
                id = id.slice(id.lastIndexOf('/') + 1)
            }
            id = `pvz:${id}`
        }
        if (assetType === SpriteFrame) {
            const pack = this.find('sprites', id, animation, baseOnly)
            const asset: Asset | undefined = pack && await this.spriteFrom(pack, id)
            return asset as T | undefined
        }
        if (assetType === Texture2D) {
            const pack = this.find('sprites', id, animation, baseOnly)
            if (!pack) return undefined
            const entry = pack.manifest.sprites[id]
            const asset: Asset = await texture(pack, entry.file, entry.scale ?? 1)
            return asset as T
        }
        const kind = category === 'sprites' ? undefined : category === 'sounds' ? 'audio' : category ??
            (assetType === AudioClip ? 'audio' : assetType === JsonAsset ? 'json' : assetType === TextAsset ? 'text' : undefined)
        if (!kind) return undefined
        const pack = this.find(kind, id, animation, baseOnly)
        if (!pack) return undefined
        return this.fileAsset(pack, pack.manifest[kind][id], type)
    }

    private fileAsset<T extends Asset>(pack: LoadedPack, file: string, type: AssetType<T>): Promise<T> {
        const key = `${file}:${type.name}`
        const cached = pack.assets.get(key)
        if (cached) return cached as Promise<T>
        const assetType: AssetType<Asset> = type
        const pending: Promise<Asset> = (async () => {
            if (assetType === AudioClip) {
                const ext = file.slice(file.lastIndexOf('.')).toLowerCase()
                return remote<AudioClip>(pack, file, ext, ext === '.mp3' ? 'audio/mpeg' : 'audio/wav')
            }
            if (assetType !== JsonAsset && assetType !== TextAsset) return remote<T>(pack, file, file.slice(file.lastIndexOf('.')), 'application/octet-stream')
            const asset = assetType === JsonAsset ? new JsonAsset() : new TextAsset()
            asset.name = file.slice(file.lastIndexOf('/') + 1)
            if (asset instanceof JsonAsset) asset.json = archiveJson(pack.files, file)
            else asset.text = new TextDecoder('utf-8').decode(await archiveFile(pack.files, file))
            return asset
        })().catch(error => { pack.assets.delete(key); throw error })
        pack.assets.set(key, pending)
        return pending as Promise<T>
    }

    private find(kind: keyof ResourceManifest, id: string, animation?: string, baseOnly = false): LoadedPack | undefined {
        return [...(baseOnly ? [] : this.active)].reverse().concat(this.base ? [this.base] : []).find(pack => {
            if (pack !== this.base && this.manager.failures.has(pack.manifest.id)) return false
            const entry = pack.manifest[kind][id]
            if (!entry) return false
            if (kind !== 'sprites') return true
            const scopes = (entry as PackSprite).animations
            return !scopes || (animation !== undefined && scopes.includes(animation))
        })
    }

    async sprite(id: string, animation?: string): Promise<SpriteFrame | undefined> {
        await this.ready()
        const pack = this.find('sprites', id, animation)
        if (!pack) return undefined
        return this.spriteFrom(pack, id)
    }

    private spriteFrom(pack: LoadedPack, id: string, entry = pack.manifest.sprites[id]): Promise<SpriteFrame> {
        const cached = pack.sprites.get(id)
        if (cached) return cached
        const pending = texture(pack, entry.file, entry.scale ?? 1).then(texture => {
            if (texture.width !== entry.width * (entry.scale ?? 1) || texture.height !== entry.height * (entry.scale ?? 1)) {
                throw new Error(`Mod sprite dimensions do not match: ${id}`)
            }
            const [x, y, width, height] = entry.rect ?? [0, 0, entry.width, entry.height]
            const [left, top, right, bottom] = entry.borders ?? [0, 0, 0, 0]
            const frame = new SpriteFrame()
            frame.reset({ texture, rect: new Rect(x, y, width, height), originalSize: new Size(entry.width, entry.height),
                offset: new Vec2(...(entry.offset ?? [0, 0])), borderLeft: left, borderTop: top, borderRight: right, borderBottom: bottom })
            applySpriteDensity(frame)
            if (pack.premultiplied.has(entry.file)) frame.packable = false
            return frame
        }).catch(error => { pack.sprites.delete(id); throw error })
        pack.sprites.set(id, pending)
        return pending
    }

    async font(id: string): Promise<BitmapFontAssets | undefined> {
        await this.ready()
        const pack = this.find('fonts', id)
        if (!pack) return undefined
        const cached = pack.fonts.get(id)
        if (cached) return cached
        const file = pack.manifest.fonts[id]
        const pending = (async () => {
            const config = new JsonAsset()
            config.json = archiveJson(pack.files, file)
            const data = config.json as FontConfig
            if (!Array.isArray(data.layers) || !data.layers.length) throw new Error(`Invalid Mod font: ${id}`)
            const directory = file.slice(0, file.lastIndexOf('/') + 1)
            const textures = await Promise.all(data.layers.map(layer => {
                relativeFile(layer.image)
                return texture(pack, `${directory}${layer.image}.png`)
            }))
            // Linear minification preserves one-pixel strokes when the window shrinks.
            if (pack === this.base) for (const atlas of textures) atlas.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.NEAREST)
            return { config, textures }
        })().catch(error => { pack.fonts.delete(id); throw error })
        pack.fonts.set(id, pending)
        return pending
    }

}

async function loadBaseArchive(): Promise<Uint8Array> {
    assetManager.downloader.register('.zip', (url, options, done) => {
        if (sys.isNative) {
            const bytes = native.fileUtils.getDataFromFile(url)
            done(bytes ? null : new Error(`Missing base archive: ${url}`), bytes)
        } else assetManager.downloader.downloadFile(url, { ...options, xhrResponseType: 'arraybuffer' }, options.onFileProgress, done)
    })
    assetManager.parser.register('.zip', (data, _options, done) => done(null, data))
    const asset = await new Promise<Asset>((resolve, reject) => {
        resources.load('base', Asset, (error, asset) => error ? reject(error) : resolve(asset))
    })
    try {
        const data = (sys.isNative ? native.fileUtils.getDataFromFile(asset.nativeUrl) : asset.nativeAsset) as ArrayBuffer | Uint8Array
        if (!data) throw new Error(`Missing base archive: ${asset.nativeUrl}`)
        return (data instanceof Uint8Array ? data : new Uint8Array(data)).slice()
    } finally { assetManager.releaseAsset(asset) }
}

export const modResources = new ModResources(loadBaseArchive)
