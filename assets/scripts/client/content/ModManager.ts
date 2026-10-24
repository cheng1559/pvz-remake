import { sys } from 'cc'
import fflate from 'fflate'
import { isQualifiedId, parseModManifest, sortModManifests, type ModManifest } from '@/shared/mod'
import { listInstalledArchives, readInstalledArchive, removeInstalledArchive, saveInstalledArchive, unpackArchive, type ArchiveFiles } from './InstalledArchives'

export interface InstalledMod {
    manifest: ModManifest
    files: ArchiveFiles
    archive: Uint8Array
}

const storageKey = 'pvz-remake:active-mods'

function parseArchive(archive: Uint8Array): InstalledMod {
    const files = unpackArchive(archive, 'mod.json')
    const manifest = parseModManifest(JSON.parse(fflate.strFromU8(files['mod.json'])))
    for (const file of [manifest.gameplay?.cocosModule, manifest.client?.module]) {
        if (file && !files[file]) throw new Error(`Missing Mod module: ${file}`)
    }
    if (manifest.client?.bundle) {
        const root = manifest.client.bundle.replace(/\/$/, '')
        for (const file of ['config.json', 'index.js']) {
            if (!files[`${root}/${file}`]) throw new Error(`Missing Mod bundle file: ${root}/${file}`)
        }
        JSON.parse(fflate.strFromU8(files[`${root}/config.json`]))
    }
    return { manifest, files, archive }
}

export class ModManager {
    /** Failures in this session; installed archives and saved enable states stay intact. */
    readonly failures = new Map<string, string>()
    private readonly loaded = new Map<string, InstalledMod>()
    private initialization?: Promise<InstalledMod[]>

    ready(): Promise<InstalledMod[]> {
        // Keep the running Mod set and its bytes until a full restart, including after an update/uninstall.
        return this.initialization ??= (async () => {
            const ids = this.enabledIds(), installed: string[] = []
            for (const id of ids) {
                if (await this.read(id, true)) installed.push(id)
                else console.warn(`[Mods] Removed missing Mod from enabled list: ${id}. Reinstall with /mod install`)
            }
            const mods = await this.resolve(installed)
            if (installed.length !== ids.length) this.saveEnabled(installed)
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
        const ids = enable ? [...enabled.filter(id => id !== mod.manifest.id), mod.manifest.id] : enabled
        if (ids.includes(mod.manifest.id)) await this.resolve(ids, mod)
        await saveInstalledArchive('mods', mod.manifest.id, archive, mod.files)
        if (enable) this.saveEnabled(ids)
        this.loaded.delete(mod.manifest.id)
        return mod.manifest.id
    }

    /** Installed Mods; a damaged archive is still listed so it can be uninstalled. */
    async installed(): Promise<{ id: string, version?: string, error?: string }[]> {
        const ids = await listInstalledArchives('mods')
        return Promise.all(ids.map(async id => ({ id, ...(this.failures.has(id) ? { error: this.failures.get(id) } : {}),
            version: await this.read(id).then(mod => mod.manifest.version, () => undefined) })))
    }

    /** Mods used by this session, in load order. */
    async running(): Promise<string[]> {
        return (await this.ready()).map(mod => mod.manifest.id).filter(id => !this.failures.has(id))
    }

    /** Replaces the saved enabled list after checking dependencies; returns whether it changed. */
    async setEnabled(ids: readonly string[]): Promise<boolean> {
        await this.ready()
        if (new Set(ids).size !== ids.length) throw new Error('Duplicate Mod ID')
        await this.resolve([...ids])
        const current = this.enabledIds()
        if (current.length === ids.length && current.every(id => ids.includes(id))) return false
        this.saveEnabled([...ids])
        return true
    }

    async load(id: string): Promise<boolean> {
        await this.ready()
        await this.read(id)
        const ids = this.enabledIds()
        if (ids.includes(id)) return false
        await this.resolve([...ids, id])
        this.saveEnabled([...ids, id])
        return true
    }

    async unload(id: string): Promise<boolean> {
        await this.ready()
        if (id !== 'all') await this.read(id)
        const ids = this.enabledIds(), next = id === 'all' ? [] : ids.filter(candidate => candidate !== id)
        if (next.length === ids.length) return false
        await this.resolve(next)
        this.saveEnabled(next)
        return true
    }

    async uninstall(id: string): Promise<boolean> {
        await this.ready()
        await this.read(id)
        const ids = this.enabledIds(), next = ids.filter(candidate => candidate !== id)
        await this.resolve(next)
        await removeInstalledArchive('mods', id)
        this.saveEnabled(next)
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

    private saveEnabled(ids: string[]): void {
        sys.localStorage.setItem(storageKey, JSON.stringify(ids))
    }
}

export const modManager = new ModManager()
