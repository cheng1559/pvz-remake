import { assetManager } from 'cc'
import { contentJson } from '@/shared/mod/content'
import { installedFilePath, readArchiveBlob } from './InstalledArchives'
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
    const source = new TextDecoder().decode(bytes(mod, file))
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
                const config = contentJson(mod.files, `${directory}/config.json`)
                execute(mod, `${directory}/index.js`, runtime)
                config.base = `${url.replace(/\/$/, '')}/`
                return config
            }
            if (type === '.json') return contentJson(mod.files, file)
            if (type === '.js') { execute(mod, file, runtime); return null }
            let location = installedFilePath(mod.files, file)
            if (!location) {
                const cached = mod.urls.get(file)
                if (!cached && !Object.hasOwn(mod.files, file)) throw new Error(`Missing Mod file: ${mod.manifest.id}/${file}`)
                location = cached ?? URL.createObjectURL(await readArchiveBlob(mod.files, file))
                if (!cached) mod.urls.set(file, location)
            }
            return new Promise<unknown>((resolve, reject) => {
                download(id, location, type, options, (error, value) => error ? reject(error) : resolve(value))
            })
        })().then(value => onComplete(null, value), error => onComplete(error))
    }
    initialized = true
}

export async function mountMod(mod: InstalledMod): Promise<void> {
    initialize()
    if (mounted.has(mod.manifest.id)) return
    // Native Cocos bundles load their installed files; the Web serves them from memory.
    mounted.set(mod.manifest.id, { ...mod, urls: new Map() })
}

export function modFileUrl(id: string, file: string): string {
    return `pvzmod:///${encodeURIComponent(id)}/${file.split('/').map(encodeURIComponent).join('/')}`
}

export async function importModModule(id: string, file: string): Promise<any> {
    const loaded = await system().import(modFileUrl(id, file))
    if (typeof loaded.register !== 'function') throw new Error(`${id}/${file} must export register({ host, assets })`)
    return loaded
}
