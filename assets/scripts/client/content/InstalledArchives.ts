import { native, sys } from 'cc'
import fflate from 'fflate'

export type ArchiveFiles = Record<string, Uint8Array>
export type ArchiveKind = 'mods' | 'mod-runtime' | 'mod-resources'

export function unpackArchive(data: Uint8Array, manifest: 'manifest.json'): ArchiveFiles {
    const files: ArchiveFiles = Object.create(null)
    const entries = fflate.unzipSync(data, { filter: entry => !entry.name.endsWith('/') })
    for (const [path, bytes] of Object.entries(entries)) {
        const name = path.replace(/\\/g, '/')
        if (/^(?:\/|[a-z]:)/i.test(name) || name.split('/').includes('..')) throw new Error(`Invalid ZIP path: ${path}`)
        const normalized = name.split('/').filter(part => part && part !== '.').join('/')
        if (normalized.startsWith('__MACOSX/') || normalized.endsWith('.meta') || normalized.endsWith('.DS_Store')) continue
        if (files[normalized]) throw new Error(`Duplicate ZIP path: ${normalized}`)
        files[normalized] = bytes
    }
    const manifests = Object.keys(files).filter(name => name === manifest || name.endsWith(`/${manifest}`))
    if (manifests.length !== 1) throw new Error(`ZIP must contain exactly one ${manifest}`)
    const prefix = manifests[0].slice(0, -manifest.length)
    return Object.fromEntries(Object.entries(files).filter(([name]) => name.startsWith(prefix)).map(([name, bytes]) => [name.slice(prefix.length), bytes]))
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
                if (!fs.writeDataToFile(bytes.slice().buffer, path)) throw new Error(`Failed to install archive file: ${name}`)
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
            dispose: () => { if (sys.os === sys.OS.IOS) native.fileUtils.removeFile(path) },
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
