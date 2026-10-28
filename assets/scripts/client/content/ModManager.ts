import { sys } from 'cc'
import { isQualifiedId, sortModManifests, type ModManifest } from '@/shared/mod'
import { contentJson, parseContentArchive, type ContentArchive } from '@/shared/mod/content'
import { listInstalledArchives, readInstalledArchive, readInstalledFiles, removeInstalledArchive, saveInstalledArchive, unpackArchive, type ArchiveFiles } from './InstalledArchives'

export interface InstalledMod extends ContentArchive {
    files: ArchiveFiles
}

/** A Mod read from a new ZIP, kept whole until it is installed. */
interface ArchivedMod extends InstalledMod {
    archive: Uint8Array
}

export interface ModImport {
    id: string
    version: string
    manifest: ModManifest
    stagingId: string
}

export interface ModChanges {
    enabled: string[]
    order: string[]
    imports: ModImport[]
    uninstalls: string[]
}

const storageKey = 'pvz-remake:active-mods'
const orderStorageKey = 'pvz-remake:mod-order'
const pendingStorageKey = 'pvz-remake:pending-mod-changes'
let nextImport = 0

/** Installed Mods were checked when installed, so a startup reads only their manifest and content index. */
function parseInstalled(files: ArchiveFiles): InstalledMod {
    const { manifest, content } = parseContentArchive(files, false)
    return { manifest, content, files }
}

function parseImport(archive: Uint8Array): ArchivedMod {
    const files = unpackArchive(archive, 'manifest.json')
    const { manifest, content } = parseContentArchive(files)
    if (manifest.id === 'pvz:base') throw new Error('pvz:base is built in and cannot be imported')
    for (const file of [manifest.gameplay?.cocosModule, manifest.client?.module]) {
        if (file && !files[file]) throw new Error(`Missing Mod module: ${file}`)
    }
    if (manifest.client?.bundle) {
        const root = manifest.client.bundle.replace(/\/$/, '')
        for (const file of ['config.json', 'index.js']) {
            if (!files[`${root}/${file}`]) throw new Error(`Missing Mod bundle file: ${root}/${file}`)
        }
        contentJson(files, `${root}/config.json`)
    }
    return { manifest, content, files, archive }
}

export class ModManager {
    /** Failures in this session; installed archives and saved enable states stay intact. */
    readonly failures = new Map<string, string>()
    private readonly loaded = new Map<string, InstalledMod>()
    private readonly reinstalled = new Set<string>()
    private initialization?: Promise<InstalledMod[]>
    private applying?: Promise<void>
    private startupGate?: Promise<void>
    private releaseStartup?: () => void

    /** Let startup display its existing screen before any resource request starts applying changes. */
    deferPendingChanges(): void {
        if (this.hasPendingChanges() && !this.startupGate) {
            this.startupGate = new Promise(resolve => { this.releaseStartup = resolve })
        }
    }

    ready(): Promise<InstalledMod[]> {
        // The running Mod set stays fixed until a full restart; pending updates and removals apply before the next one.
        return this.initialization ??= (async () => {
            await this.startupGate
            await this.applyPendingChanges()
            const ids = this.enabledIds(), installed: InstalledMod[] = []
            for (const id of ids) {
                try {
                    const mod = await this.read(id, true)
                    if (mod) installed.push(mod)
                    else console.warn(`[Mods] Removed missing Mod from enabled list: ${id}. Reinstall from /mod`)
                } catch (error) {
                    this.failures.set(id, error instanceof Error ? error.message : String(error))
                    console.error(`[Mods] Disabled invalid archive ${id}`, error)
                }
            }
            const byId = new Map(installed.map(mod => [mod.manifest.id, mod]))
            const valid = installed.filter(mod => {
                const closure = new Map<string, ModManifest>()
                const visit = (manifest: ModManifest) => {
                    if (closure.has(manifest.id)) return
                    closure.set(manifest.id, manifest)
                    for (const dependency of manifest.dependencies) {
                        const target = byId.get(dependency.id)
                        if (target) visit(target.manifest)
                    }
                }
                try { visit(mod.manifest); sortModManifests([...closure.values()]); return true }
                catch (error) { this.failures.set(mod.manifest.id, String(error)); return false }
            })
            const ordered = sortModManifests(valid.map(mod => mod.manifest))
            const mods = ordered.map(manifest => byId.get(manifest.id)!)
            if (valid.length !== ids.length) this.saveEnabled(valid.map(mod => mod.manifest.id))
            return mods
        })()
    }

    async list(): Promise<string[]> {
        await this.ready()
        return this.enabledIds()
    }

    /** Validate and stage the compressed ZIP separately; installed files and settings stay intact. */
    async prepareImport(archive: Uint8Array): Promise<ModImport> {
        const { manifest } = parseImport(archive)
        const stagingId = `${Date.now().toString(36)}-${++nextImport}`
        await saveInstalledArchive('mod-pending', stagingId, archive, {})
        return { id: manifest.id, version: manifest.version, manifest, stagingId }
    }

    async discardImports(imports: readonly ModImport[]): Promise<void> {
        for (const mod of imports) await removeInstalledArchive('mod-pending', mod.stagingId)
    }

    hasPendingChanges(): boolean { return !!sys.localStorage.getItem(pendingStorageKey) }

    /** Apply only records metadata. ZIP decoding, installation and removal happen on the next startup. */
    async queueChanges(changes: ModChanges): Promise<void> {
        await this.ready()
        const imported = new Map(changes.imports.map(mod => [mod.id, mod.manifest]))
        const manifests = changes.enabled.map(id => {
            const manifest = imported.get(id) ?? this.loaded.get(id)?.manifest
            if (!manifest) throw new Error(this.failures.get(id) ?? `Mod is not ready: ${id}`)
            return manifest
        })
        sortModManifests(manifests)
        const installed = [...new Set([...(await this.installedIds()), ...imported.keys()])]
        this.validateSelection(changes.enabled, changes.order, installed)
        if (changes.imports.some(mod => mod.id === 'pvz:base' || mod.manifest.id !== mod.id)
            || changes.uninstalls.some(id => !installed.includes(id) || changes.enabled.includes(id) || changes.order.includes(id))) {
            throw new Error('Invalid pending Mod changes')
        }
        sys.localStorage.setItem(pendingStorageKey, JSON.stringify({ schemaVersion: 1, ...changes }))
    }

    /** Runs before loading any Mod code or resources. A failed/interrupted job remains available for retry. */
    applyPendingChanges(onProgress: (progress: number, message: string) => Promise<void> = async () => {}): Promise<void> {
        return this.applying ??= this.applyPending(onProgress).then(() => {
            this.releaseStartup?.()
            this.releaseStartup = undefined
        }).catch(error => { this.applying = undefined; throw error })
    }

    private async applyPending(onProgress: (progress: number, message: string) => Promise<void>): Promise<void> {
        const saved = sys.localStorage.getItem(pendingStorageKey)
        if (!saved) return
        const changes: ModChanges & { schemaVersion: number } = JSON.parse(saved)
        if (changes.schemaVersion !== 1 || !Array.isArray(changes.imports) || !Array.isArray(changes.uninstalls)
            || !Array.isArray(changes.enabled) || !Array.isArray(changes.order)) throw new Error('Invalid pending Mod changes')
        const total = changes.imports.length * 2 + changes.uninstalls.length + 1
        let completed = 0
        const progress = async (message: string) => { await onProgress(completed++ / total, message) }
        const replacements: ArchivedMod[] = []
        for (const mod of changes.imports) {
            await progress(`Checking ${mod.id}`)
            replacements.push(await this.readImport(mod))
        }
        await progress('Checking Mod dependencies')
        await this.saveSelection(changes.enabled, changes.order, replacements, id => progress(`Installing ${id}`))
        for (const id of changes.uninstalls) {
            await progress(`Removing ${id}`)
            // Replaying a job after interruption must also accept removals already completed.
            if ((await listInstalledArchives('mods')).includes(id)) await removeInstalledArchive('mods', id)
            this.loaded.delete(id)
        }
        sys.localStorage.removeItem(pendingStorageKey)
        await this.discardImports(changes.imports).catch(error => console.warn('[Mods] Failed to remove staging files', error))
        await onProgress(1, 'Mods ready')
    }

    private async readImport(mod: ModImport): Promise<ArchivedMod> {
        const archive = await readInstalledArchive('mod-pending', mod.stagingId)
        if (!archive) throw new Error(`Missing staged Mod: ${mod.id}`)
        const imported = parseImport(archive)
        if (imported.manifest.id !== mod.id) throw new Error(`Staged Mod ID does not match: ${mod.id}`)
        return imported
    }

    /**
     * Saves the ZIP; without `enable`, dependencies are checked only when it replaces an enabled Mod. Like uninstall,
     * this changes installed files at once; the game queues changes instead, since running Mods read them on demand.
     */
    async install(archive: Uint8Array, enable = true): Promise<string> {
        const mod = parseImport(archive)
        await this.ready()
        const enabled = this.enabledIds()
        const order = await this.installedIds()
        if (!order.includes(mod.manifest.id)) order.unshift(mod.manifest.id)
        const ids = enable ? order.filter(id => enabled.includes(id) || id === mod.manifest.id).reverse() : enabled
        if (ids.includes(mod.manifest.id)) await this.resolve(ids, [mod])
        await saveInstalledArchive('mods', mod.manifest.id, archive, mod.files)
        if (enable) this.saveEnabled(ids)
        this.saveOrder(order)
        this.loaded.delete(mod.manifest.id)
        this.reinstalled.add(mod.manifest.id)
        return mod.manifest.id
    }

    /** Installed Mods in display order (highest priority first), including disabled or damaged archives. */
    async installed(): Promise<{ id: string, version?: string, error?: string }[]> {
        const ids = await this.installedIds()
        // Session failures describe the old running code, not a ZIP imported for the next restart.
        return Promise.all(ids.map(async id => ({ id, ...(this.failures.has(id) && !this.reinstalled.has(id) ? { error: this.failures.get(id) } : {}),
            version: await this.read(id).then(mod => mod.manifest.version, () => undefined) })))
    }

    /** Mods used by this session, in load order. */
    async running(): Promise<string[]> {
        return (await this.ready()).map(mod => mod.manifest.id).filter(id => !this.failures.has(id))
    }

    /** Saves enabled states and display order for already installed Mods. */
    async setEnabled(ids: readonly string[], order?: readonly string[]): Promise<boolean> {
        await this.ready()
        return this.saveSelection(ids, order, [])
    }

    private async saveSelection(ids: readonly string[], order: readonly string[] | undefined, replacements: readonly ArchivedMod[],
        beforeInstall: (id: string) => Promise<void> = async () => {}): Promise<boolean> {
        if (new Set(ids).size !== ids.length) throw new Error('Duplicate Mod ID')
        await this.resolve([...ids], replacements)
        const installed = [...new Set([...(await this.installedIds()), ...replacements.map(mod => mod.manifest.id)])]
        this.validateSelection(ids, order, installed)
        const priority = [...ids].reverse()
        let index = 0
        const nextOrder = order ? [...order] : installed.map(id => ids.includes(id) ? priority[index++] : id)
        const orderedEnabled = nextOrder.filter(id => ids.includes(id)).reverse()
        if (orderedEnabled.some((id, index) => id !== ids[index])) throw new Error('Mod order does not match enabled priority')
        const current = this.enabledIds()
        for (const mod of replacements) {
            await beforeInstall(mod.manifest.id)
            await saveInstalledArchive('mods', mod.manifest.id, mod.archive, mod.files)
            this.loaded.delete(mod.manifest.id)
            this.reinstalled.add(mod.manifest.id)
        }
        this.saveOrder(nextOrder)
        if (current.length === ids.length && current.every((id, index) => ids[index] === id)) return false
        this.saveEnabled([...ids])
        return true
    }

    private validateSelection(ids: readonly string[], order: readonly string[] | undefined, installed: readonly string[]): void {
        if (new Set(ids).size !== ids.length) throw new Error('Duplicate Mod ID')
        if (order && (new Set(order).size !== order.length || order.some(id => !installed.includes(id)) || ids.some(id => !order.includes(id)))) {
            throw new Error('Invalid Mod order')
        }
        if (order && order.filter(id => ids.includes(id)).reverse().some((id, index) => id !== ids[index])) {
            throw new Error('Mod order does not match enabled priority')
        }
    }

    async load(id: string): Promise<boolean> {
        await this.ready()
        await this.read(id)
        const ids = this.enabledIds()
        if (ids.includes(id)) return false
        const order = await this.installedIds()
        const next = order.filter(candidate => candidate === id || ids.includes(candidate)).reverse()
        await this.resolve(next)
        this.saveEnabled(next)
        this.saveOrder(order)
        return true
    }

    async unload(id: string): Promise<boolean> {
        await this.ready()
        if (id !== 'all') await this.read(id)
        const ids = this.enabledIds(), next = id === 'all' ? [] : ids.filter(candidate => candidate !== id)
        if (next.length === ids.length) return false
        const order = await this.installedIds()
        await this.resolve(next)
        this.saveEnabled(next)
        this.saveOrder(order)
        return true
    }

    async uninstall(id: string): Promise<boolean> {
        await this.ready()
        const order = await this.installedIds()
        if (!order.includes(id)) throw new Error(`Mod is not installed: ${id}`)
        const ids = this.enabledIds(), next = ids.filter(candidate => candidate !== id)
        await this.resolve(next)
        await removeInstalledArchive('mods', id)
        this.saveEnabled(next)
        this.saveOrder(order.filter(candidate => candidate !== id))
        this.loaded.delete(id)
        return ids.includes(id)
    }

    private async resolve(ids: string[], replacements: readonly InstalledMod[] = []): Promise<InstalledMod[]> {
        const pending = new Map(replacements.map(mod => [mod.manifest.id, mod]))
        const mods = await Promise.all(ids.map(id => pending.get(id) ?? this.read(id)))
        const byId = new Map(mods.map(mod => [mod.manifest.id, mod]))
        return sortModManifests(mods.map(mod => mod.manifest)).map(manifest => byId.get(manifest.id)!)
    }

    private read(id: string): Promise<InstalledMod>
    private read(id: string, allowMissing: true): Promise<InstalledMod | undefined>
    private async read(id: string, allowMissing = false): Promise<InstalledMod | undefined> {
        if (!isQualifiedId(id)) throw new Error('Use an installed Mod ID; install ZIPs from /mod')
        const cached = this.loaded.get(id)
        if (cached) return cached
        const archive = await readInstalledArchive('mods', id)
        if (!archive) {
            if (allowMissing) return undefined
            throw new Error(`Mod is not installed: ${id}. Open /mod to install it`)
        }
        const mod = parseInstalled(readInstalledFiles('mods', id, archive) ?? unpackArchive(archive, 'manifest.json'))
        if (mod.manifest.id !== id) throw new Error(`Installed Mod ID does not match: ${id}`)
        this.loaded.set(id, mod)
        return mod
    }

    private enabledIds(): string[] {
        const ids: unknown = JSON.parse(sys.localStorage.getItem(storageKey) ?? '[]')
        if (!Array.isArray(ids) || ids.some(id => !isQualifiedId(id)) || new Set(ids).size !== ids.length) {
            throw new Error('Invalid saved Mods')
        }
        return ids
    }

    private async installedIds(): Promise<string[]> {
        const installed = await listInstalledArchives('mods')
        const order: unknown = JSON.parse(sys.localStorage.getItem(orderStorageKey) ?? '[]')
        if (!Array.isArray(order) || order.some(id => !isQualifiedId(id)) || new Set(order).size !== order.length) throw new Error('Invalid saved Mod order')
        return [...new Set([...order, ...this.enabledIds().reverse(), ...installed])].filter(id => installed.includes(id))
    }

    private saveOrder(ids: readonly string[]): void {
        sys.localStorage.setItem(orderStorageKey, JSON.stringify(ids))
    }

    private saveEnabled(ids: string[]): void {
        sys.localStorage.setItem(storageKey, JSON.stringify(ids))
    }
}

export const modManager = new ModManager()
