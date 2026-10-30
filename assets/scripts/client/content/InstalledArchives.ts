import { native, sys } from 'cc'
import fflate from 'fflate'

export type ArchiveFiles = Record<string, Uint8Array>
export type ArchiveKind = 'mods' | 'mod-resources' | 'mod-pending'

function archivePaths(paths: readonly string[], manifest: 'manifest.json'): Array<[string, string]> {
    const files = new Map<string, string>()
    for (const path of paths) {
        const name = path.replace(/\\/g, '/')
        if (/^(?:\/|[a-z]:)/i.test(name) || name.split('/').includes('..')) throw new Error(`Invalid ZIP path: ${path}`)
        const normalized = name.split('/').filter(part => part && part !== '.').join('/')
        if (normalized.startsWith('__MACOSX/') || normalized.endsWith('.meta') || normalized.endsWith('.DS_Store')) continue
        if (files.has(normalized)) throw new Error(`Duplicate ZIP path: ${normalized}`)
        files.set(normalized, path)
    }
    const manifests = [...files.keys()].filter(name => name === manifest || name.endsWith(`/${manifest}`))
    if (manifests.length !== 1) throw new Error(`ZIP must contain exactly one ${manifest}`)
    const prefix = manifests[0].slice(0, -manifest.length)
    return [...files].filter(([name]) => name.startsWith(prefix)).map(([name, path]) => [path, name.slice(prefix.length)])
}

export function unpackArchive(data: Uint8Array, manifest: 'manifest.json'): ArchiveFiles {
    const entries = fflate.unzipSync(data, { filter: entry => !entry.name.endsWith('/') })
    return Object.fromEntries(archivePaths(Object.keys(entries), manifest).map(([path, name]) => [name, entries[path]]))
}

export function installedArchiveRoot(kind: ArchiveKind, id: string): string {
    return `${native.fileUtils.getWritablePath().replace(/\\/g, '/').replace(/\/$/, '')}/${kind}/${encodeURIComponent(id)}`
}

const databases = new Map<ArchiveKind, Promise<IDBDatabase>>()
function openDatabase(kind: ArchiveKind): Promise<IDBDatabase> {
    const cached = databases.get(kind)
    if (cached) return cached
    const pending = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(`pvz-remake-${kind}`, 1)
        request.onupgradeneeded = () => { request.result.createObjectStore('archives') }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
    databases.set(kind, pending)
    return pending
}

export async function readInstalledArchive(kind: ArchiveKind, id: string): Promise<Uint8Array | undefined> {
    if (sys.isNative) {
        const path = `${installedArchiveRoot(kind, id)}/.archive.zip`
        return native.fileUtils.isFileExist(path) ? new Uint8Array(native.fileUtils.getDataFromFile(path)) : undefined
    }
    const db = await openDatabase(kind)
    return new Promise((resolve, reject) => {
        const request = db.transaction('archives').objectStore('archives').get(id)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

/** Just the archive's manifest.json: native reads the extracted file, the web inflates only that ZIP entry. */
export async function readInstalledManifest(kind: ArchiveKind, id: string): Promise<Uint8Array | undefined> {
    if (sys.isNative) {
        const path = `${installedArchiveRoot(kind, id)}/manifest.json`
        return native.fileUtils.isFileExist(path) ? new Uint8Array(native.fileUtils.getDataFromFile(path)) : undefined
    }
    const archive = await readInstalledArchive(kind, id)
    if (!archive) return undefined
    const entries = fflate.unzipSync(archive, { filter: entry => /(?:^|[\\/])manifest\.json$/.test(entry.name) })
    const [path] = archivePaths(Object.keys(entries), 'manifest.json').find(([, name]) => name === 'manifest.json') ?? []
    return path === undefined ? undefined : entries[path]
}

const installedRoots = new WeakMap<ArchiveFiles, string>()

/**
 * Native installation already extracted these files; each one is read from disk when used. Installed files change
 * only while pending changes are applied at startup, before any Mod is read, so a running game sees one version.
 */
export function readInstalledFiles(kind: ArchiveKind, id: string, archive: Uint8Array): ArchiveFiles | undefined {
    if (!sys.isNative) return undefined
    const root = `${installedArchiveRoot(kind, id)}/`
    const paths = new Set<string>()
    // Read the ZIP directory without inflating entries, including hidden files.
    fflate.unzipSync(archive, { filter: entry => { if (!entry.name.endsWith('/')) paths.add(entry.name); return false } })
    const files: ArchiveFiles = Object.create(null)
    for (const [, name] of archivePaths([...paths], 'manifest.json')) {
        Object.defineProperty(files, name, { enumerable: true, configurable: true, get() {
            const data = native.fileUtils.getDataFromFile(`${root}${name}`)
            if (!data) throw new Error(`Failed to read installed archive file: ${name}`)
            return new Uint8Array(data)
        } })
    }
    installedRoots.set(files, root)
    return files
}

/**
 * Native: the extracted files of an installed archive, listed from disk, so a startup never reads the whole ZIP into
 * memory (HD packs run to hundreds of MB). Undefined when the archive was not extracted (older installs).
 */
export function readExtractedFiles(kind: ArchiveKind, id: string): ArchiveFiles | undefined {
    if (!sys.isNative) return undefined
    const fs = native.fileUtils, root = `${installedArchiveRoot(kind, id)}/`
    if (!fs.isFileExist(`${root}manifest.json`)) return undefined
    const names: string[] = []
    const walk = (directory: string) => {
        for (const entry of fs.listFiles(directory)) {
            const path = entry.replace(/\\/g, '/').replace(/\/$/, '')
            // Some platforms also list '.' and '..'; only entries inside this directory count.
            if (!path.startsWith(directory) || path.length === directory.length) continue
            if (fs.isDirectoryExist(path)) walk(`${path}/`)
            else names.push(path.slice(root.length))
        }
    }
    walk(root)
    const files: ArchiveFiles = Object.create(null)
    for (const name of names) {
        if (name === '.archive.zip') continue
        Object.defineProperty(files, name, { enumerable: true, configurable: true, get() {
            const data = fs.getDataFromFile(`${root}${name}`)
            if (!data) throw new Error(`Failed to read installed archive file: ${name}`)
            return new Uint8Array(data)
        } })
    }
    installedRoots.set(files, root)
    return files
}

/** The file's installed path, for native loaders that read files themselves; undefined for files held in memory. */
export function installedFilePath(files: ArchiveFiles, name: string): string | undefined {
    const root = installedRoots.get(files)
    return root && name in files ? `${root}${name}` : undefined
}

/** Installed archive IDs, sorted, without reading their contents. */
export async function listInstalledArchives(kind: ArchiveKind): Promise<string[]> {
    if (sys.isNative) {
        const fs = native.fileUtils, root = installedArchiveRoot(kind, '').replace(/\/$/, '')
        if (!fs.isDirectoryExist(root)) return []
        return fs.listFiles(root)
            .map(path => path.replace(/\\/g, '/').replace(/\/$/, ''))
            // Skip staging and backup folders left by an interrupted install.
            .filter(path => !/\.(?:installing|previous)$/.test(path) && fs.isFileExist(`${path}/.archive.zip`))
            .map(path => decodeURIComponent(path.slice(path.lastIndexOf('/') + 1)))
            .sort()
    }
    const db = await openDatabase(kind)
    return new Promise((resolve, reject) => {
        const request = db.transaction('archives').objectStore('archives').getAllKeys()
        request.onsuccess = () => resolve((request.result as string[]).slice().sort())
        request.onerror = () => reject(request.error)
    })
}

export async function saveInstalledArchive(kind: ArchiveKind, id: string, data: Uint8Array, files: ArchiveFiles): Promise<void> {
    if (sys.isNative) {
        const fs = native.fileUtils, root = installedArchiveRoot(kind, id), staging = `${root}.installing`, backup = `${root}.previous`
        fs.removeDirectory(staging)
        fs.createDirectory(staging)
        try {
            for (const [name, bytes] of Object.entries({ ...files, '.archive.zip': data })) {
                const path = `${staging}/${name}`
                fs.createDirectory(path.slice(0, path.lastIndexOf('/')))
                // Copy only views into a larger buffer (stored ZIP entries); inflated files are written as they are.
                const buffer = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer as ArrayBuffer : bytes.slice().buffer
                if (!fs.writeDataToFile(buffer, path)) throw new Error(`Failed to install archive file: ${name}`)
            }
            fs.removeDirectory(backup)
            if (fs.isDirectoryExist(root) && !fs.renameFile(root, backup)) throw new Error('Failed to replace installed archive')
            if (!fs.renameFile(staging, root)) {
                if (fs.isDirectoryExist(backup)) fs.renameFile(backup, root)
                throw new Error('Failed to finish installing archive')
            }
            fs.removeDirectory(backup)
        } finally { fs.removeDirectory(staging) }
        return
    }
    const db = await openDatabase(kind)
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('archives', 'readwrite')
        transaction.oncomplete = () => resolve()
        transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('Failed to save archive'))
        transaction.objectStore('archives').put(data, id)
    })
}

export async function removeInstalledArchive(kind: ArchiveKind, id: string): Promise<void> {
    if (sys.isNative) {
        if (!native.fileUtils.removeDirectory(installedArchiveRoot(kind, id))) throw new Error(`Failed to uninstall archive: ${id}`)
        return
    }
    const db = await openDatabase(kind)
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('archives', 'readwrite')
        transaction.oncomplete = () => resolve()
        transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('Failed to uninstall archive'))
        transaction.objectStore('archives').delete(id)
    })
}

export interface SelectedZip {
    name: string
    read(): Promise<Uint8Array>
    dispose?(): void
}

/** Keep selections as file handles so large ZIPs can be read and installed one at a time. */
export async function selectZips(): Promise<SelectedZip[]> {
    if (sys.isNative) {
        const selectFiles = (globalThis as { jsb?: { selectFiles?: (extension: string, callback: (paths: string[], error?: string | null) => void) => void } }).jsb?.selectFiles
        if (!selectFiles) throw new Error('File selection is unavailable on this platform')
        const paths = await new Promise<string[]>((resolve, reject) => {
            selectFiles('zip', (paths, error) => error ? reject(new Error(error)) : resolve(paths))
        })
        return paths.map(path => ({
            name: path.replace(/\\/g, '/').split('/').pop()!,
            read: async () => {
                const data = native.fileUtils.getDataFromFile(path)
                if (!data) throw new Error('Could not read the selected ZIP')
                return new Uint8Array(data)
            },
            // iOS and Android pickers return temporary copies.
            dispose: () => { if (sys.os === sys.OS.IOS || sys.os === sys.OS.ANDROID) native.fileUtils.removeFile(path) },
        }))
    }
    if (!sys.isBrowser) throw new Error('File selection is unavailable on this platform')
    const files = await new Promise<File[]>((resolve, reject) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.zip,application/zip'
        input.multiple = true
        input.hidden = true
        const finish = (files: File[]) => { input.remove(); resolve(files) }
        input.onchange = () => finish(Array.from(input.files ?? []))
        input.addEventListener('cancel', () => finish([]), { once: true })
        document.body.appendChild(input)
        try { input.click() } catch (error) { input.remove(); reject(error) }
    })
    return files.map(file => ({ name: file.name, read: async () => new Uint8Array(await file.arrayBuffer()) }))
}
