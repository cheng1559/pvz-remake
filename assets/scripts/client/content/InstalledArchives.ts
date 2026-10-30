import { native, sys } from 'cc'
import fflate from 'fflate'

export type ArchiveFiles = Record<string, Uint8Array>
/** A ZIP held in memory, or (web) a Blob that stays in storage and is read in slices. */
export type ArchiveData = Uint8Array | Blob
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

/** Web archives leave these files in the ZIP Blob until they are used (HD packs run to hundreds of MB). */
const ON_DEMAND = /\.(?:png|jpe?g|webp|gif|mp3|wav|ogg|m4a|aac|mp4|webm|ttf|otf|woff2?|bin|cconb|astc|pkm|pvr|ktx)$/i
const READ_BATCH = 16

interface ZipEntry { name: string, method: number, compressedSize: number, size: number, offset: number, header: number, data?: number }
const blobArchives = new WeakMap<ArchiveFiles, { blob: Blob, entries: Map<string, ZipEntry> }>()

async function readBlob(blob: Blob, start: number, end: number): Promise<Uint8Array> {
    return new Uint8Array(await blob.slice(start, end).arrayBuffer())
}

async function inBatches<T>(items: readonly T[], read: (item: T) => Promise<void>): Promise<void> {
    for (let index = 0; index < items.length; index += READ_BATCH) await Promise.all(items.slice(index, index + READ_BATCH).map(read))
}

/** The ZIP's central directory, read from its end without touching any file data. */
async function zipDirectory(blob: Blob): Promise<ZipEntry[]> {
    const tailStart = Math.max(0, blob.size - 65557), tail = await readBlob(blob, tailStart, blob.size)
    const view = new DataView(tail.buffer)
    let end = tail.length - 22
    while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) end--
    if (end < 0) throw new Error('Invalid ZIP file')
    let count = view.getUint16(end + 10, true), size = view.getUint32(end + 12, true), offset = view.getUint32(end + 16, true)
    if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) {
        // ZIP64: the locator just before the end record points to the 64-bit end record.
        if (end < 20 || view.getUint32(end - 20, true) !== 0x07064b50) throw new Error('Invalid ZIP file')
        const start = Number(view.getBigUint64(end - 12, true)), record = new DataView((await readBlob(blob, start, start + 56)).buffer)
        if (record.byteLength < 56 || record.getUint32(0, true) !== 0x06064b50) throw new Error('Invalid ZIP file')
        count = Number(record.getBigUint64(32, true)); size = Number(record.getBigUint64(40, true)); offset = Number(record.getBigUint64(48, true))
    }
    const directory = await readBlob(blob, offset, offset + size), entries: ZipEntry[] = []
    const data = new DataView(directory.buffer)
    for (let at = 0, index = 0; index < count; index++) {
        if (at + 46 > directory.length || data.getUint32(at, true) !== 0x02014b50) throw new Error('Invalid ZIP file')
        const flags = data.getUint16(at + 8, true), method = data.getUint16(at + 10, true)
        let compressedSize = data.getUint32(at + 20, true), size = data.getUint32(at + 24, true), local = data.getUint32(at + 42, true)
        const nameLength = data.getUint16(at + 28, true), extraLength = data.getUint16(at + 30, true)
        const nameBytes = directory.subarray(at + 46, at + 46 + nameLength)
        // Like fflate: UTF-8 when flagged, otherwise Latin-1.
        const name = flags & 0x800 ? new TextDecoder().decode(nameBytes) : String.fromCharCode(...nameBytes)
        for (let extra = at + 46 + nameLength, extraEnd = extra + extraLength; extra + 4 <= extraEnd;) {
            const length = data.getUint16(extra + 2, true)
            if (data.getUint16(extra, true) === 1) {
                // ZIP64 values follow in this order, only for the fields saturated above.
                let field = extra + 4
                const next = () => { const value = Number(data.getBigUint64(field, true)); field += 8; return value }
                if (size === 0xffffffff) size = next()
                if (compressedSize === 0xffffffff) compressedSize = next()
                if (local === 0xffffffff) local = next()
            }
            extra += 4 + length
        }
        at += 46 + nameLength + extraLength + data.getUint16(at + 32, true)
        if (name.endsWith('/')) continue
        if (flags & 1) throw new Error(`Encrypted ZIP files are not supported: ${name}`)
        if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP compression: ${name}`)
        entries.push({ name, method, compressedSize, size, offset: local, header: 30 + nameLength + extraLength })
    }
    return entries
}

/** The start of the entry's data; a stored entry's first `length` bytes come with its local header in one read. */
async function entryStart(blob: Blob, entry: ZipEntry, length = 0): Promise<[number, Uint8Array?]> {
    if (entry.data !== undefined && !length) return [entry.data]
    // Local extra fields usually match the directory's; a longer one costs a second read.
    const header = await readBlob(blob, entry.offset, entry.offset + entry.header + length + 64), view = new DataView(header.buffer)
    if (header.length < 30 || view.getUint32(0, true) !== 0x04034b50) throw new Error(`Invalid ZIP file: ${entry.name}`)
    const offset = 30 + view.getUint16(26, true) + view.getUint16(28, true)
    entry.data = entry.offset + offset
    return [entry.data, offset + length <= header.length ? header.subarray(offset, offset + length) : undefined]
}

async function readEntry(blob: Blob, entry: ZipEntry): Promise<Uint8Array> {
    const [start] = await entryStart(blob, entry), data = await readBlob(blob, start, start + entry.compressedSize)
    return entry.method ? fflate.inflateSync(data) : data
}

/**
 * Web: the archive's files without reading it whole. Text files (manifest, content index, JSON, scripts) are read now
 * and stay readable synchronously; images, audio and other media stay in the Blob for readArchiveFile/readArchiveBlob.
 */
export async function openArchive(data: ArchiveData, readNow: (name: string) => boolean = name => !ON_DEMAND.test(name)): Promise<ArchiveFiles> {
    // Archives installed before the web stored Blobs come back as bytes; wrap them without another copy.
    const whole = data instanceof Uint8Array && data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
    const blob = data instanceof Uint8Array ? new Blob([whole ? data.buffer as ArrayBuffer : data.slice().buffer]) : data
    const directory = await zipDirectory(blob), byPath = new Map(directory.map(entry => [entry.name, entry]))
    const files: ArchiveFiles = Object.create(null), onDemand = new Map<string, ZipEntry>(), now: Array<[string, ZipEntry]> = []
    for (const [path, name] of archivePaths(directory.map(entry => entry.name), 'manifest.json')) {
        const entry = byPath.get(path)!
        if (readNow(name)) { files[name] = undefined; now.push([name, entry]); continue }
        onDemand.set(name, entry)
        Object.defineProperty(files, name, { enumerable: true, configurable: true, get() {
            throw new Error(`${name} is read from the stored ZIP when used; read it asynchronously`)
        } })
    }
    await inBatches(now, async ([name, entry]) => { files[name] = await readEntry(blob, entry) })
    blobArchives.set(files, { blob, entries: onDemand })
    return files
}

/**
 * For checks only: files left in a web archive's Blob are replaced by their first bytes, enough for PNG sizes, so an
 * import is validated without reading its images. Archives held in memory are returned as they are.
 */
export async function archiveHeads(files: ArchiveFiles): Promise<ArchiveFiles> {
    const archive = blobArchives.get(files)
    if (!archive) return files
    const heads: ArchiveFiles = Object.create(null)
    for (const name of Object.keys(files)) heads[name] = archive.entries.has(name) ? undefined : files[name]
    await inBatches([...archive.entries], async ([name, entry]) => {
        heads[name] = (entry.method ? undefined : (await entryStart(archive.blob, entry, Math.min(24, entry.size)))[1])
            ?? (await readEntry(archive.blob, entry)).subarray(0, 24)
    })
    return heads
}

/** A file's bytes, whether it is held in memory, extracted on disk (native) or left in a web archive's Blob. */
export async function readArchiveFile(files: ArchiveFiles, name: string): Promise<Uint8Array> {
    const archive = blobArchives.get(files), entry = archive?.entries.get(name)
    const bytes = entry ? await readEntry(archive.blob, entry) : files[name]
    if (!bytes) throw new Error(`Missing ZIP file: ${name}`)
    return bytes
}

/** A Blob of the file for object URLs; uncompressed files in a web archive are a slice of its Blob, with no copy. */
export async function readArchiveBlob(files: ArchiveFiles, name: string, type = ''): Promise<Blob> {
    const archive = blobArchives.get(files), entry = archive?.entries.get(name)
    if (entry && !entry.method) {
        const [start] = await entryStart(archive.blob, entry)
        return archive.blob.slice(start, start + entry.size, type)
    }
    return new Blob([(await readArchiveFile(files, name)).slice().buffer], { type })
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

export async function readInstalledArchive(kind: ArchiveKind, id: string): Promise<ArchiveData | undefined> {
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
    return archive && (await openArchive(archive, name => name === 'manifest.json'))['manifest.json']
}

const installedRoots = new WeakMap<ArchiveFiles, string>()

/**
 * Native installation already extracted these files; each one is read from disk when used. Installed files change
 * only while pending changes are applied at startup, before any Mod is read, so a running game sees one version.
 */
export function readInstalledFiles(kind: ArchiveKind, id: string, archive: ArchiveData): ArchiveFiles | undefined {
    if (!sys.isNative || !(archive instanceof Uint8Array)) return undefined
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

export async function saveInstalledArchive(kind: ArchiveKind, id: string, data: ArchiveData, files: ArchiveFiles): Promise<void> {
    if (sys.isNative) {
        if (!(data instanceof Uint8Array)) throw new Error('Native archives are installed from bytes')
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
    read(): Promise<ArchiveData>
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
    // The File stays a handle: it is checked in slices and stored in IndexedDB as a Blob, never read whole.
    return files.map(file => ({ name: file.name, read: async () => file }))
}
