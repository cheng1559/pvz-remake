import { native, sys } from 'cc'
import fflate from 'fflate'

export type ArchiveFiles = Record<string, Uint8Array>

export function unpackResourcePack(data: Uint8Array): ArchiveFiles {
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
    const manifests = Object.keys(files).filter(name => name === 'pack.json' || name.endsWith('/pack.json'))
    if (manifests.length !== 1) throw new Error('ZIP must contain exactly one pack.json')
    const prefix = manifests[0].slice(0, -'pack.json'.length)
    return Object.fromEntries(Object.entries(files).filter(([name]) => name.startsWith(prefix)).map(([name, bytes]) => [name.slice(prefix.length), bytes]))
}

export function installedPackRoot(id: string): string {
    return `${native.fileUtils.getWritablePath().replace(/\\/g, '/').replace(/\/$/, '')}/resource-packs/${encodeURIComponent(id)}`
}

let database: Promise<IDBDatabase> | undefined
function openDatabase(): Promise<IDBDatabase> {
    return database ??= new Promise((resolve, reject) => {
        const request = indexedDB.open('pvz-remake-resource-packs', 1)
        request.onupgradeneeded = () => { request.result.createObjectStore('archives') }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

export async function readInstalledArchive(id: string): Promise<Uint8Array | undefined> {
    if (sys.isNative) {
        const path = `${installedPackRoot(id)}/.archive.zip`
        return native.fileUtils.isFileExist(path) ? new Uint8Array(native.fileUtils.getDataFromFile(path)) : undefined
    }
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
        const request = db.transaction('archives').objectStore('archives').get(id)
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
    })
}

export async function saveInstalledArchive(id: string, data: Uint8Array, files: ArchiveFiles): Promise<void> {
    if (sys.isNative) {
        const fs = native.fileUtils, root = installedPackRoot(id), staging = `${root}.installing`, backup = `${root}.previous`
        fs.removeDirectory(staging)
        fs.createDirectory(staging)
        try {
            for (const [name, bytes] of Object.entries({ ...files, '.archive.zip': data })) {
                const path = `${staging}/${name}`
                fs.createDirectory(path.slice(0, path.lastIndexOf('/')))
                if (!fs.writeDataToFile(bytes.slice().buffer, path)) throw new Error(`Failed to install pack file: ${name}`)
            }
            fs.removeDirectory(backup)
            if (fs.isDirectoryExist(root) && !fs.renameFile(root, backup)) throw new Error('Failed to replace installed pack')
            if (!fs.renameFile(staging, root)) {
                if (fs.isDirectoryExist(backup)) fs.renameFile(backup, root)
                throw new Error('Failed to finish installing pack')
            }
            fs.removeDirectory(backup)
        } finally { fs.removeDirectory(staging) }
        return
    }
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('archives', 'readwrite')
        transaction.oncomplete = () => resolve()
        transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('Failed to save resource pack'))
        transaction.objectStore('archives').put(data, id)
    })
}

export async function removeInstalledArchive(id: string): Promise<void> {
    if (sys.isNative) {
        if (!native.fileUtils.removeDirectory(installedPackRoot(id))) throw new Error(`Failed to uninstall resource pack: ${id}`)
        return
    }
    const db = await openDatabase()
    await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction('archives', 'readwrite')
        transaction.oncomplete = () => resolve()
        transaction.onerror = transaction.onabort = () => reject(transaction.error ?? new Error('Failed to uninstall resource pack'))
        transaction.objectStore('archives').delete(id)
    })
}

export async function selectResourcePackZip(): Promise<Uint8Array | null> {
    if (sys.isNative) {
        const selectFile = (globalThis as { jsb?: { selectFile?: (extension: string, callback: (path: string | null, error?: string | null) => void) => void } }).jsb?.selectFile
        if (!selectFile) throw new Error('File selection is unavailable on this platform')
        const path = await new Promise<string | null>((resolve, reject) => {
            selectFile('zip', (path, error) => error ? reject(new Error(error)) : resolve(path))
        })
        if (!path) return null
        try {
            const data = native.fileUtils.getDataFromFile(path)
            if (!data) throw new Error('Could not read the selected ZIP')
            return new Uint8Array(data)
        } finally {
            if (sys.os === sys.OS.IOS) native.fileUtils.removeFile(path)
        }
    }
    if (!sys.isBrowser) throw new Error('File selection is unavailable on this platform')
    const file = await new Promise<File | null>((resolve, reject) => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.zip,application/zip'
        input.hidden = true
        const finish = (file: File | null) => { input.remove(); resolve(file) }
        input.onchange = () => finish(input.files?.[0] ?? null)
        input.addEventListener('cancel', () => finish(null), { once: true })
        document.body.appendChild(input)
        try { input.click() } catch (error) { input.remove(); reject(error) }
    })
    return file ? new Uint8Array(await file.arrayBuffer()) : null
}
