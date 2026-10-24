import { Asset, assetManager, AudioClip, ImageAsset, JsonAsset, native, Rect, resources, Size, SpriteFrame, sys, TextAsset, Texture2D, Vec2 } from 'cc'
import fflate from 'fflate'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import type { FontConfig } from '@/client/font/FontRenderer.d'
import { applySpriteDensity, setSpriteDensity } from './SpriteDensity'
import { installedArchiveRoot, listInstalledArchives, readInstalledArchive, removeInstalledArchive, saveInstalledArchive, unpackArchive, type ArchiveFiles } from './InstalledArchives'

interface PackSprite {
    file: string
    width: number
    height: number
    scale?: number
    rect?: [number, number, number, number]
    offset?: [number, number]
    borders?: [number, number, number, number]
    animations?: string[]
}
interface PackManifest {
    id: string
    sprites: Record<string, PackSprite>
    fonts: Record<string, string>
    audio: Record<string, string>
    json: Record<string, string>
    text: Record<string, string>
}
export interface PackEntry { id: string, enabled: boolean }
interface LoadedPack {
    files: ArchiveFiles
    manifest: PackManifest
    textures: Map<string, Promise<Texture2D>>
    sprites: Map<string, Promise<SpriteFrame>>
    fonts: Map<string, Promise<BitmapFontAssets>>
    assets: Map<string, Promise<Asset>>
    urls: Map<string, string>
    runtimeRoot?: string
}

/** Every installed pack the player has placed, highest priority first. */
const storageKey = 'pvz-remake:resource-packs'
const fileKinds = ['fonts', 'audio', 'json', 'text'] as const
type AssetType<T extends Asset> = new (...args: any[]) => T
let nativeRuntimeReady = false
let nativeRuntimeId = 0
const MAX_NATIVE_TEXTURE_LOADS = 4
let nativeTextureLoads = 0
const nativeTextureWaiters: (() => void)[] = []

function relativeFile(value: unknown): asserts value is string {
    if (typeof value !== 'string' || !value || /^(?:[\\/]|[a-z][a-z0-9+.-]*:)/i.test(value)
        || value.split(/[\\/]/).includes('..')) throw new Error(`Invalid pack file: ${value}`)
}

function parseManifest(value: unknown): PackManifest {
    const data = value as PackManifest
    if (!data || typeof data.id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/i.test(data.id)) {
        throw new Error('Invalid resource pack manifest')
    }
    const fields = new Set(['id', 'sprites', ...fileKinds])
    for (const key of Object.keys(data)) if (!fields.has(key)) throw new Error(`Unsupported pack field: ${key}`)
    for (const kind of ['sprites', ...fileKinds] as const) {
        if (data[kind] === undefined) data[kind] = {}
        if (!data[kind] || typeof data[kind] !== 'object' || Array.isArray(data[kind])) throw new Error(`Invalid pack ${kind}`)
    }
    for (const [id, sprite] of Object.entries(data.sprites)) {
        if (!id.includes(':') || !sprite) throw new Error(`Invalid pack sprite ID: ${id}`)
        relativeFile(sprite.file)
        if (![sprite.width, sprite.height, sprite.scale ?? 1].every(value => Number.isFinite(value) && value > 0)) {
            throw new Error(`Invalid pack sprite dimensions: ${id}`)
        }
        for (const [values, length] of [[sprite.rect, 4], [sprite.offset, 2], [sprite.borders, 4]] as const) {
            if (values !== undefined && (!Array.isArray(values) || values.length !== length || !values.every(Number.isFinite))) {
                throw new Error(`Invalid pack sprite geometry: ${id}`)
            }
        }
        if (sprite.animations !== undefined && (!Array.isArray(sprite.animations) || sprite.animations.some(id => typeof id !== 'string'))) {
            throw new Error(`Invalid pack sprite animations: ${id}`)
        }
    }
    for (const kind of fileKinds) for (const [id, file] of Object.entries(data[kind])) {
        if (!id.includes(':')) throw new Error(`Invalid pack ${kind} ID: ${id}`)
        relativeFile(file)
        if (kind === 'audio' && !/\.(mp3|wav)$/i.test(file)) throw new Error(`Pack audio must be MP3 or WAV: ${id}`)
    }
    return data
}

function archiveFile(files: ArchiveFiles, file: string): Uint8Array {
    relativeFile(file)
    if (!files[file]) throw new Error(`Missing ZIP file: ${file}`)
    return files[file]
}

function archiveJson(files: ArchiveFiles, file: string): any {
    return JSON.parse(fflate.strFromU8(archiveFile(files, file)))
}

function pngSize(files: ArchiveFiles, file: string): [number, number] {
    const bytes = archiveFile(files, file)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (bytes.length < 24 || view.getUint32(0) !== 0x89504e47 || view.getUint32(12) !== 0x49484452) throw new Error(`Invalid PNG: ${file}`)
    return [view.getUint32(16), view.getUint32(20)]
}

function archiveManifest(files: ArchiveFiles): PackManifest {
    const manifest = parseManifest(archiveJson(files, 'pack.json'))
    for (const [id, entry] of Object.entries(manifest.sprites)) {
        const [width, height] = pngSize(files, entry.file)
        if (width !== entry.width * (entry.scale ?? 1) || height !== entry.height * (entry.scale ?? 1)) throw new Error(`Resource pack dimensions do not match: ${id}`)
    }
    for (const [id, file] of Object.entries(manifest.fonts)) {
        const config = archiveJson(files, file) as FontConfig
        if (!Array.isArray(config.layers) || !config.layers.length) throw new Error(`Invalid pack font: ${id}`)
        const directory = file.slice(0, file.lastIndexOf('/') + 1)
        for (const layer of config.layers) {
            relativeFile(layer.image)
            pngSize(files, `${directory}${layer.image}.png`)
        }
    }
    for (const kind of ['audio', 'json', 'text'] as const) for (const file of Object.values(manifest[kind])) {
        if (kind === 'json') archiveJson(files, file)
        else archiveFile(files, file)
    }
    return manifest
}

function createPack(files: ArchiveFiles): LoadedPack {
    return { manifest: archiveManifest(files), files, textures: new Map(), sprites: new Map(), fonts: new Map(), assets: new Map(), urls: new Map() }
}

function fileUrl(pack: LoadedPack, file: string, mime: string): string {
    const cached = pack.urls.get(file)
    if (cached) return cached
    const bytes = archiveFile(pack.files, file)
    let url: string
    if (sys.isNative) {
        pack.runtimeRoot ??= installedArchiveRoot('resource-pack-runtime', `${pack.manifest.id}-${++nativeRuntimeId}`)
        url = `${pack.runtimeRoot}/${file}`
        native.fileUtils.createDirectory(url.slice(0, url.lastIndexOf('/')))
        if (!native.fileUtils.writeDataToFile(bytes.slice().buffer, url)) throw new Error(`Failed to prepare pack file: ${file}`)
    } else {
        // Audio URLs stay alive for playback, seeking and the SFX pitch decoder until restart.
        url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: mime }))
    }
    pack.urls.set(file, url)
    return url
}

function remote<T extends Asset>(pack: LoadedPack, file: string, ext: string, mime: string): Promise<T> {
    return new Promise((resolve, reject) => assetManager.loadRemote<T>(fileUrl(pack, file, mime), { ext, reloadAsset: true },
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
            image = await remote<ImageAsset>(pack, file, '.png', 'image/png')
            const result = new Texture2D()
            result.image = image
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
                    // The running snapshot already owns the file on disk, including after uninstall.
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

export class ResourcePackManager {
    private base?: LoadedPack
    private readonly loaded = new Map<string, LoadedPack>()
    private active: LoadedPack[] = []
    private initialization?: Promise<void>
    revision = 0

    constructor(private readonly loadBase?: () => Promise<Uint8Array>) {}

    ready(): Promise<void> {
        return this.initialization ??= (async () => {
            if (sys.isNative && !nativeRuntimeReady) {
                native.fileUtils.removeDirectory(installedArchiveRoot('resource-pack-runtime', ''))
                nativeRuntimeReady = true
            }
            if (this.loadBase) this.base = createPack(unpackArchive(await this.loadBase(), 'pack.json'))
            const entries = this.saved()
            const packs: LoadedPack[] = []
            const missing = new Set<string>()
            for (const { id } of entries.filter(entry => entry.enabled).reverse()) {
                const pack = await this.read(id, true)
                if (pack) packs.push(pack)
                else {
                    missing.add(id)
                    console.warn(`[ResourcePacks] Removed missing pack from enabled list: ${id}. Reinstall with /pack install`)
                }
            }
            this.active = packs
            if (missing.size) this.saveEntries(entries.filter(entry => !missing.has(entry.id)))
        })()
    }

    /** Enables an installed pack at the highest priority. */
    async load(id: string): Promise<boolean> {
        await this.ready()
        await this.read(id)
        const entries = this.saved()
        if (entries.some(entry => entry.id === id && entry.enabled)) return false
        this.saveEntries([{ id, enabled: true }, ...entries.filter(entry => entry.id !== id)])
        return true
    }

    /** Saves the ZIP; `enable` also enables it at the highest priority. */
    async install(data: Uint8Array, enable = true): Promise<string> {
        await this.ready()
        const files = unpackArchive(data, 'pack.json')
        const pack = createPack(files)
        const id = pack.manifest.id
        await saveInstalledArchive('resource-packs', id, data, files)
        if (enable) this.saveEntries([{ id, enabled: true }, ...this.saved().filter(entry => entry.id !== id)])
        this.loaded.delete(id)
        return id
    }

    async installed(): Promise<string[]> {
        return listInstalledArchives('resource-packs')
    }

    /** All installed packs, highest priority first; packs never placed are listed last as disabled. */
    async entries(): Promise<PackEntry[]> {
        await this.ready()
        const installed = await this.installed()
        const entries = this.saved().filter(entry => installed.includes(entry.id))
        return [...entries, ...installed.filter(id => !entries.some(entry => entry.id === id)).map(id => ({ id, enabled: false }))]
    }

    /** Replaces the saved order and enabled state, highest priority first. */
    async setEntries(entries: readonly PackEntry[]): Promise<void> {
        await this.ready()
        if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Duplicate resource pack ID')
        for (const entry of entries) if (entry.enabled) await this.read(entry.id)
        this.saveEntries(entries.map(({ id, enabled }) => ({ id, enabled })))
    }

    /** Packs used by this session, lowest priority first. */
    async running(): Promise<string[]> {
        await this.ready()
        return this.active.map(pack => pack.manifest.id)
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

    /** Disables a pack, or `all`, keeping its place in the order. */
    async unload(id: string): Promise<boolean> {
        await this.ready()
        if (id !== 'all') await this.read(id)
        const entries = this.saved()
        if (!entries.some(entry => entry.enabled && (id === 'all' || entry.id === id))) return false
        this.saveEntries(entries.map(entry => id === 'all' || entry.id === id ? { ...entry, enabled: false } : entry))
        return true
    }

    async uninstall(id: string): Promise<boolean> {
        await this.ready()
        await this.read(id)
        const entries = this.saved()
        await removeInstalledArchive('resource-packs', id)
        this.saveEntries(entries.filter(entry => entry.id !== id))
        this.loaded.delete(id)
        return entries.some(entry => entry.id === id && entry.enabled)
    }

    /** Enabled packs in load order, lowest priority first. */
    async list(): Promise<string[]> {
        await this.ready()
        return this.saved().filter(entry => entry.enabled).map(entry => entry.id).reverse()
    }

    /** Resolve presentation assets before either the resources bundle or the content registry. */
    async asset<T extends Asset>(id: string, type: AssetType<T>, animation?: string): Promise<T | undefined> {
        await this.ready()
        return this.resolveAsset(id, type, animation)
    }

    /** Authoritative configuration bypasses presentation overrides. */
    async baseJson<T = unknown>(id: string): Promise<T> {
        await this.ready()
        const asset = await this.resolveAsset(id, JsonAsset, undefined, true)
        if (!asset) throw new Error(`Missing base JSON: ${id}`)
        return asset.json as T
    }

    async ids(type: AssetType<Asset>, prefix = ''): Promise<string[]> {
        await this.ready()
        const kind = type === JsonAsset ? 'json' : type === AudioClip ? 'audio' : type === TextAsset ? 'text' : 'sprites'
        return [...new Set([...(this.base ? [this.base] : []), ...this.active]
            .flatMap(pack => Object.keys(pack.manifest[kind])))].filter(id => id.startsWith(prefix))
    }

    private async resolveAsset<T extends Asset>(id: string, type: AssetType<T>, animation?: string, baseOnly = false): Promise<T | undefined> {
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
        const kind = assetType === AudioClip ? 'audio' : assetType === JsonAsset ? 'json' : assetType === TextAsset ? 'text' : undefined
        if (!kind) return undefined
        const pack = this.find(kind, id, animation, baseOnly)
        if (!pack) return undefined
        const key = `${kind}:${id}`
        const cached = pack.assets.get(key)
        if (cached) return cached as Promise<T>
        const file = pack.manifest[kind][id]
        const pending: Promise<Asset> = (async () => {
            if (kind === 'audio') {
                const ext = file.slice(file.lastIndexOf('.')).toLowerCase()
                return remote<AudioClip>(pack, file, ext, ext === '.mp3' ? 'audio/mpeg' : 'audio/wav')
            }
            const asset = kind === 'json' ? new JsonAsset() : new TextAsset()
            asset.name = id.slice(id.lastIndexOf('/') + 1).replace(/^.*:/, '')
            if (asset instanceof JsonAsset) asset.json = archiveJson(pack.files, file)
            else asset.text = fflate.strFromU8(archiveFile(pack.files, file))
            return asset
        })().catch(error => { pack.assets.delete(key); throw error })
        pack.assets.set(key, pending)
        return pending as Promise<T>
    }

    private find(kind: 'sprites' | typeof fileKinds[number], id: string, animation?: string, baseOnly = false): LoadedPack | undefined {
        return [...(baseOnly ? [] : this.active)].reverse().concat(this.base ? [this.base] : []).find(pack => {
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

    private spriteFrom(pack: LoadedPack, id: string): Promise<SpriteFrame> {
        const cached = pack.sprites.get(id)
        if (cached) return cached
        const entry = pack.manifest.sprites[id]
        const pending = texture(pack, entry.file, entry.scale ?? 1).then(texture => {
            if (texture.width !== entry.width * (entry.scale ?? 1) || texture.height !== entry.height * (entry.scale ?? 1)) {
                throw new Error(`Resource pack dimensions do not match: ${id}`)
            }
            const [x, y, width, height] = entry.rect ?? [0, 0, entry.width, entry.height]
            const [left, top, right, bottom] = entry.borders ?? [0, 0, 0, 0]
            const frame = new SpriteFrame()
            frame.reset({ texture, rect: new Rect(x, y, width, height), originalSize: new Size(entry.width, entry.height),
                offset: new Vec2(...(entry.offset ?? [0, 0])), borderLeft: left, borderTop: top, borderRight: right, borderBottom: bottom })
            applySpriteDensity(frame)
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
            if (!Array.isArray(data.layers) || !data.layers.length) throw new Error(`Invalid pack font: ${id}`)
            const directory = file.slice(0, file.lastIndexOf('/') + 1)
            const textures = await Promise.all(data.layers.map(layer => {
                relativeFile(layer.image)
                return texture(pack, `${directory}${layer.image}.png`)
            }))
            if (pack === this.base) for (const atlas of textures) atlas.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST)
            return { config, textures }
        })().catch(error => { pack.fonts.delete(id); throw error })
        pack.fonts.set(id, pending)
        return pending
    }

    private async read(id: string, allowMissing = false): Promise<LoadedPack | undefined> {
        if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) throw new Error(`Use an installed pack ID; install ZIPs with /pack install`)
        const cached = this.loaded.get(id)
        if (cached) return cached
        const archive = await readInstalledArchive('resource-packs', id)
        if (!archive) {
            if (allowMissing) return undefined
            throw new Error(`Resource pack is not installed: ${id}. Use /pack install`)
        }
        const pack = createPack(unpackArchive(archive, 'pack.json'))
        if (pack.manifest.id !== id) throw new Error(`Installed resource pack ID does not match: ${id}`)
        this.loaded.set(id, pack)
        return pack
    }

    private saved(): PackEntry[] {
        const entries: unknown = JSON.parse(sys.localStorage.getItem(storageKey) ?? '[]')
        if (!Array.isArray(entries) || entries.some(entry => typeof entry?.id !== 'string' || typeof entry.enabled !== 'boolean')) {
            throw new Error('Invalid saved resource packs')
        }
        return entries
    }

    private saveEntries(entries: PackEntry[]): void {
        sys.localStorage.setItem(storageKey, JSON.stringify(entries))
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
    const data = asset.nativeAsset as ArrayBuffer | Uint8Array
    const bytes = (data instanceof Uint8Array ? data : new Uint8Array(data)).slice()
    assetManager.releaseAsset(asset)
    return bytes
}

export const resourcePacks = new ResourcePackManager(loadBaseArchive)
