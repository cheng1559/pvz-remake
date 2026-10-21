import { assetManager, ImageAsset, JsonAsset, Rect, Size, SpriteFrame, sys, Texture2D, Vec2 } from 'cc'
import fflate from 'fflate'
import type { BitmapFontAssets } from '@/client/font/BitmapFontAssets'
import type { FontConfig } from '@/client/font/FontRenderer.d'
import { applySpriteDensity, setSpriteDensity } from './SpriteDensity'
import { installedPackRoot, readInstalledArchive, removeInstalledArchive, saveInstalledArchive, unpackResourcePack, type ArchiveFiles } from './ResourcePackArchive'

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
}
interface LoadedPack {
    files: ArchiveFiles
    manifest: PackManifest
    textures: Map<string, Promise<Texture2D>>
    sprites: Map<string, Promise<SpriteFrame>>
    fonts: Map<string, Promise<BitmapFontAssets>>
}

const storageKey = 'pvz-remake:active-resource-packs'

function relativeFile(value: unknown): asserts value is string {
    if (typeof value !== 'string' || !value || /^(?:[\\/]|[a-z][a-z0-9+.-]*:)/i.test(value)
        || value.split(/[\\/]/).includes('..')) throw new Error(`Invalid pack file: ${value}`)
}

function parseManifest(value: unknown): PackManifest {
    const data = value as PackManifest
    if (!data || typeof data.id !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/i.test(data.id) || !data.sprites || typeof data.sprites !== 'object'
        || Array.isArray(data.sprites) || !data.fonts || typeof data.fonts !== 'object' || Array.isArray(data.fonts)) {
        throw new Error('Invalid resource pack manifest')
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
    for (const [id, file] of Object.entries(data.fonts)) {
        if (!id.includes(':')) throw new Error(`Invalid pack font ID: ${id}`)
        relativeFile(file)
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
    return manifest
}

function createPack(files: ArchiveFiles): LoadedPack {
    return { manifest: archiveManifest(files), files, textures: new Map(), sprites: new Map(), fonts: new Map() }
}

async function texture(pack: LoadedPack, file: string, scale = 1): Promise<Texture2D> {
    const cached = pack.textures.get(file)
    if (cached) return cached
    const pending = (async () => {
        const objectUrl = !sys.isNative
            ? URL.createObjectURL(new Blob([archiveFile(pack.files, file).slice().buffer], { type: 'image/png' })) : undefined
        const image = await new Promise<ImageAsset>((resolve, reject) => assetManager.loadRemote<ImageAsset>(objectUrl ?? `${installedPackRoot(pack.manifest.id)}/${file}`, { ext: '.png', reloadAsset: true },
            (error, asset) => error ? reject(error) : resolve(asset)))
            .finally(() => { if (objectUrl) URL.revokeObjectURL(objectUrl) })
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
    })().catch(error => { pack.textures.delete(file); throw error })
    pack.textures.set(file, pending)
    return pending
}

export class ResourcePackManager {
    private readonly loaded = new Map<string, LoadedPack>()
    private active: LoadedPack[] = []
    private initialization?: Promise<void>
    revision = 0

    ready(): Promise<void> {
        return this.initialization ??= (async () => {
            const saved = sys.localStorage.getItem(storageKey)
            if (!saved) return
            const ids: unknown = JSON.parse(saved)
            if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string')) throw new Error('Invalid saved resource packs')
            for (const id of ids) this.active.push(await this.read(id))
        })()
    }

    async load(id: string): Promise<boolean> {
        await this.ready()
        await this.read(id)
        const ids = await this.list()
        if (ids.includes(id)) return false
        this.saveEnabled([...ids, id])
        return true
    }

    async install(data: Uint8Array): Promise<string> {
        // Keep current textures alive before replacing their installed files; activation waits for restart.
        await this.preload(() => {})
        const files = unpackResourcePack(data)
        const pack = createPack(files)
        await saveInstalledArchive(pack.manifest.id, data, files)
        const ids = await this.list()
        this.saveEnabled([...ids.filter(id => id !== pack.manifest.id), pack.manifest.id])
        this.loaded.delete(pack.manifest.id)
        return pack.manifest.id
    }

    async preload(onProgress: (progress: number) => void): Promise<void> {
        await this.ready()
        const tasks = this.active.flatMap(pack => [
            ...Object.entries(pack.manifest.sprites).flatMap(([id, entry]) =>
                (entry.animations ?? [undefined]).map(animation => () => this.sprite(id, animation))),
            ...Object.keys(pack.manifest.fonts).map(id => () => this.font(id)),
        ])
        let completed = 0
        await Promise.all(tasks.map(async load => { await load(); onProgress(++completed / tasks.length) }))
        onProgress(1)
    }

    async unload(id: string): Promise<boolean> {
        await this.ready()
        if (id !== 'all') await this.read(id)
        const ids = await this.list()
        const next = id === 'all' ? [] : ids.filter(candidate => candidate !== id)
        if (next.length === ids.length) return false
        this.saveEnabled(next)
        return true
    }

    async uninstall(id: string): Promise<boolean> {
        await this.ready()
        await this.read(id)
        // Native textures must finish loading before their source files are removed.
        await this.preload(() => {})
        const ids = await this.list()
        await removeInstalledArchive(id)
        this.saveEnabled(ids.filter(candidate => candidate !== id))
        this.loaded.delete(id)
        return ids.includes(id)
    }

    async list(): Promise<string[]> {
        await this.ready()
        return JSON.parse(sys.localStorage.getItem(storageKey) ?? '[]') as string[]
    }

    async sprite(id: string, animation?: string): Promise<SpriteFrame | undefined> {
        await this.ready()
        const pack = [...this.active].reverse().find(pack => {
            const entry = pack.manifest.sprites[id]
            return entry && (!entry.animations || entry.animations.includes(animation))
        })
        if (!pack) return undefined
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
        const pack = [...this.active].reverse().find(pack => pack.manifest.fonts[id])
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
            return { config, textures }
        })().catch(error => { pack.fonts.delete(id); throw error })
        pack.fonts.set(id, pending)
        return pending
    }

    private async read(id: string): Promise<LoadedPack> {
        if (!/^[a-z0-9][a-z0-9._-]*$/i.test(id)) throw new Error(`Use an installed pack ID; install ZIPs with /pack install`)
        const cached = this.loaded.get(id)
        if (cached) return cached
        const archive = await readInstalledArchive(id)
        if (!archive) throw new Error(`Resource pack is not installed: ${id}. Use /pack install`)
        const pack = createPack(unpackResourcePack(archive))
        if (pack.manifest.id !== id) throw new Error(`Installed resource pack ID does not match: ${id}`)
        this.loaded.set(id, pack)
        return pack
    }

    private saveEnabled(ids: string[]): void {
        sys.localStorage.setItem(storageKey, JSON.stringify(ids))
    }
}

export const resourcePacks = new ResourcePackManager()
