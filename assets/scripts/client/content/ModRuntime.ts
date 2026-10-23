import { assetManager, ImageAsset, native, SpriteFrame, sys, Texture2D } from 'cc'
import fflate from 'fflate'
import { installedArchiveRoot, saveInstalledArchive } from './InstalledArchives'
import type { InstalledMod } from './ModManager'

type Registration = [string[], (...args: any[]) => any]
interface ModuleSystem {
    instantiate(url: string, parent?: string): unknown
    import(url: string): Promise<any>
    register(...args: any[]): void
}
interface MountedMod extends InstalledMod { urls: Map<string, string> }

const mounted = new Map<string, MountedMod>()
let initialized = false

function system(): ModuleSystem {
    const value = (globalThis as { System?: ModuleSystem }).System
    if (!value) throw new Error('The Mod runtime requires SystemJS')
    return value
}

function resolve(url: string): { mod: MountedMod, file: string } | undefined {
    const match = /^pvzmod:\/\/\/([^/]+)\/([^?#]*)(?:[?#].*)?$/.exec(url)
    if (!match) return undefined
    const mod = mounted.get(decodeURIComponent(match[1]))
    if (!mod) throw new Error(`Mod is not mounted: ${match[1]}`)
    return { mod, file: decodeURIComponent(match[2]) }
}

function bytes(mod: MountedMod, file: string): Uint8Array {
    const value = mod.files[file]
    if (!value) throw new Error(`Missing Mod file: ${mod.manifest.id}/${file}`)
    return value
}

function execute(mod: MountedMod, file: string, runtime: Pick<ModuleSystem, 'register'>): void {
    const source = fflate.strFromU8(bytes(mod, file))
    new Function('System', `${source}\n//# sourceURL=${modFileUrl(mod.manifest.id, file)}`)(runtime)
}

function initialize(): void {
    if (initialized) return
    const runtime = system(), instantiate = runtime.instantiate.bind(runtime)
    runtime.instantiate = (url, parent) => {
        const entry = resolve(url)
        if (!entry) return instantiate(url, parent)
        let registration: Registration | undefined
        execute(entry.mod, entry.file, {
            register(dependencies: string[], declare: Registration[1]) {
                if (registration || !Array.isArray(dependencies) || typeof declare !== 'function') {
                    throw new Error(`Invalid SystemJS Mod module: ${url}`)
                }
                registration = [dependencies, declare]
            },
        })
        if (!registration) throw new Error(`Mod module must call System.register: ${url}`)
        return registration
    }
    const downloader = assetManager.downloader, download = downloader.download.bind(downloader)
    downloader.download = (id, url, type, options, onComplete) => {
        if (!url.startsWith('pvzmod:///')) { download(id, url, type, options, onComplete); return }
        void (async () => {
            const { mod, file } = resolve(url)!
            if (type === 'bundle') {
                const directory = file.replace(/\/$/, '')
                const config = JSON.parse(fflate.strFromU8(bytes(mod, `${directory}/config.json`)))
                execute(mod, `${directory}/index.js`, runtime)
                config.base = `${url.replace(/\/$/, '')}/`
                return config
            }
            if (type === '.json') return JSON.parse(fflate.strFromU8(bytes(mod, file)))
            if (type === '.js') { execute(mod, file, runtime); return null }
            let location: string
            if (sys.isNative) location = `${installedArchiveRoot('mod-runtime', mod.manifest.id)}/${file}`
            else {
                const cached = mod.urls.get(file)
                location = cached ?? URL.createObjectURL(new Blob([bytes(mod, file).slice().buffer]))
                if (!cached) mod.urls.set(file, location)
            }
            return new Promise<unknown>((resolve, reject) => {
                download(id, location, type, options, (error, value) => error ? reject(error) : resolve(value))
            })
        })().then(value => onComplete(null, value), error => onComplete(error))
    }
    initialized = true
}

export function clearModRuntimeCache(): void {
    if (sys.isNative) native.fileUtils.removeDirectory(installedArchiveRoot('mod-runtime', ''))
}

export async function mountMod(mod: InstalledMod): Promise<void> {
    initialize()
    if (mounted.has(mod.manifest.id)) return
    if (sys.isNative && mod.manifest.client) {
        // Keep client assets alive after an installed ZIP is updated or removed.
        await saveInstalledArchive('mod-runtime', mod.manifest.id, mod.archive, mod.files)
    }
    mounted.set(mod.manifest.id, { ...mod, urls: new Map() })
}

export function modFileUrl(id: string, file: string): string {
    return `pvzmod:///${encodeURIComponent(id)}/${file.split('/').map(encodeURIComponent).join('/')}`
}

export async function loadModSprite(id: string, file: string): Promise<SpriteFrame> {
    const image = await new Promise<ImageAsset>((resolve, reject) => {
        assetManager.loadRemote<ImageAsset>(modFileUrl(id, file), { ext: '.png' },
            (error, value) => error ? reject(error) : resolve(value))
    })
    const texture = new Texture2D()
    texture.image = image
    // Match resource-pack uploads so transparent edges keep their original colors.
    const pixels = image.data
    if (sys.isBrowser && pixels && !ArrayBuffer.isView(pixels)) {
        const canvas = document.createElement('canvas')
        canvas.width = texture.width
        canvas.height = texture.height
        const context = canvas.getContext('2d')!
        context.drawImage(pixels, 0, 0)
        const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data
        texture.uploadData(new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.byteLength))
    }
    texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE)
    texture.setFilters(Texture2D.Filter.LINEAR, Texture2D.Filter.LINEAR)
    const frame = new SpriteFrame()
    frame.texture = texture
    return frame
}

export async function importModModule(id: string, file: string): Promise<any> {
    const loaded = await system().import(modFileUrl(id, file))
    if (typeof loaded.register !== 'function') throw new Error(`${id}/${file} must export register(api)`)
    return loaded
}
