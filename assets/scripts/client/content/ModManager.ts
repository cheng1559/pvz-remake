import { sys } from 'cc'
import { isQualifiedId, parseModManifest, sortModManifests, type ModManifest } from '@/shared/mod'
import { contentJson, parseModContent, type ModContent } from '@/shared/mod/content'
import { listInstalledArchives, readInstalledArchive, removeInstalledArchive, saveInstalledArchive, unpackArchive, type ArchiveFiles } from './InstalledArchives'

export interface InstalledMod {
    manifest: ModManifest
    files: ArchiveFiles
    archive: Uint8Array
    content: ModContent
}

const storageKey = 'pvz-remake:active-mods'
const orderStorageKey = 'pvz-remake:mod-order'

function parseArchive(archive: Uint8Array): InstalledMod {
    const files = unpackArchive(archive, 'manifest.json')
    const manifest = parseModManifest(contentJson(files, 'manifest.json'))
    const content = parseModContent(contentJson(files, 'content.json'), files)
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

    ready(): Promise<InstalledMod[]> {
        // Keep the running Mod set and its bytes until a full restart, including after an update/uninstall.
        return this.initialization ??= (async () => {
            const ids = this.enabledIds(), installed: InstalledMod[] = []
            for (const id of ids) {
                try {
                    const mod = await this.read(id, true)
                    if (mod) installed.push(mod)
                    else console.warn(`[Mods] Removed missing Mod from enabled list: ${id}. Reinstall with /mod install`)
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

    /** Saves the ZIP; without `enable`, dependencies are checked only when it replaces an enabled Mod. */
    async install(archive: Uint8Array, enable = true): Promise<string> {
        await this.ready()
        const mod = parseArchive(archive)
        const enabled = this.enabledIds()
        const order = await this.installedIds()
        if (!order.includes(mod.manifest.id)) order.unshift(mod.manifest.id)
        const ids = enable ? order.filter(id => enabled.includes(id) || id === mod.manifest.id).reverse() : enabled
        if (ids.includes(mod.manifest.id)) await this.resolve(ids, mod)
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

    /** Saves enabled states and optional full display order; returns whether the enabled load order changed. */
    async setEnabled(ids: readonly string[], order?: readonly string[]): Promise<boolean> {
        await this.ready()
        if (new Set(ids).size !== ids.length) throw new Error('Duplicate Mod ID')
        await this.resolve([...ids])
        const installed = await this.installedIds()
        if (order && (new Set(order).size !== order.length || order.some(id => !installed.includes(id)) || ids.some(id => !order.includes(id)))) {
            throw new Error('Invalid Mod order')
        }
        const priority = [...ids].reverse()
        let index = 0
        const nextOrder = order ? [...order] : installed.map(id => ids.includes(id) ? priority[index++] : id)
        const orderedEnabled = nextOrder.filter(id => ids.includes(id)).reverse()
        if (orderedEnabled.some((id, index) => id !== ids[index])) throw new Error('Mod order does not match enabled priority')
        const current = this.enabledIds()
        this.saveOrder(nextOrder)
        if (current.length === ids.length && current.every((id, index) => ids[index] === id)) return false
        this.saveEnabled([...ids])
        return true
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

    private async resolve(ids: string[], replacement?: InstalledMod): Promise<InstalledMod[]> {
        const mods = await Promise.all(ids.map(id => replacement?.manifest.id === id ? replacement : this.read(id)))
        const byId = new Map(mods.map(mod => [mod.manifest.id, mod]))
        return sortModManifests(mods.map(mod => mod.manifest)).map(manifest => byId.get(manifest.id)!)
    }

    private read(id: string): Promise<InstalledMod>
    private read(id: string, allowMissing: true): Promise<InstalledMod | undefined>
    private async read(id: string, allowMissing = false): Promise<InstalledMod | undefined> {
        if (!isQualifiedId(id)) throw new Error('Use an installed Mod ID; install ZIPs with /mod install')
        const cached = this.loaded.get(id)
        if (cached) return cached
        const archive = await readInstalledArchive('mods', id)
        if (!archive) {
            if (allowMissing) return undefined
            throw new Error(`Mod is not installed: ${id}. Use /mod install`)
        }
        const mod = parseArchive(archive)
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
