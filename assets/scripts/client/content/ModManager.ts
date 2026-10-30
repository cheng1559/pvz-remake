import { sys } from 'cc'
import { BASE_MOD_ID, isModId, parseModManifest, sortModManifests, type ModManifest } from '@/shared/mod'
import { contentJson, parseContentArchive, type ContentArchive } from '@/shared/mod/content'
import { listInstalledArchives, readExtractedFiles, readInstalledArchive, readInstalledFiles, readInstalledManifest, removeInstalledArchive, saveInstalledArchive, unpackArchive, type ArchiveFiles } from './InstalledArchives'

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
    author?: string
    manifest: ModManifest
    stagingId: string
}

export interface ModChanges {
    enabled: string[]
    order: string[]
    imports: ModImport[]
    uninstalls: string[]
}

/**
 * Each player keeps their own installed Mods, versions, enabled list and order. ZIPs live once in a shared store under
 * `id@content hash`, so players who install the same file share it; nothing a player references is ever replaced.
 */
interface ModSelection {
    /** Mod ID -> stored archive key. */
    installed: Record<string, string>
    enabled: string[]
    order: string[]
}

/** The profile store removes this prefix with the rest of a deleted player's data. */
export const PLAYER_MODS_PREFIX = 'pvz-remake:player-mods:'
const selectionKey = (profile: number | null) => `${PLAYER_MODS_PREFIX}${profile ?? 'none'}:state`
const pendingStorageKey = 'pvz-remake:pending-mod-changes'
// Mods used to be installed for the whole device; those settings and ZIPs are dropped.
const legacyStorageKeys = ['pvz-remake:active-mods', 'pvz-remake:mod-order']
let nextImport = 0

/** Identifies identical ZIPs (two 32-bit FNV-style lanes plus the length); not a security check. */
function archiveKey(id: string, data: Uint8Array): string {
    let a = 0x811c9dc5, b = 0x9e3779b9 ^ data.length
    for (let i = 0; i < data.length; i++) {
        a = Math.imul(a ^ data[i], 0x01000193)
        b = Math.imul(b ^ data[i], 0x5bd1e995)
        b ^= b >>> 15
    }
    const hex = (value: number) => (value >>> 0).toString(16).padStart(8, '0')
    return `${id}@${data.length.toString(36)}-${hex(a)}${hex(b)}`
}

/** Installed Mods were checked when installed, so a startup reads only their manifest and content index. */
function parseInstalled(files: ArchiveFiles): InstalledMod {
    const { manifest, content } = parseContentArchive(files, false)
    return { manifest, content, files }
}

function parseImport(archive: Uint8Array): ArchivedMod {
    const files = unpackArchive(archive, 'manifest.json')
    const { manifest, content } = parseContentArchive(files)
    if (manifest.id === BASE_MOD_ID) throw new Error(`${BASE_MOD_ID} is built in and cannot be imported`)
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
    /** By archive key: an archive's content never changes, so these stay valid across players and updates. */
    private readonly loaded = new Map<string, InstalledMod>()
    /** Manifest versions and authors the Mod list read without loading the Mod, by archive key. */
    private readonly versions = new Map<string, { version?: string, author?: string }>()
    private readonly reinstalled = new Set<string>()
    private initialization?: Promise<InstalledMod[]>
    private applying?: Promise<void>
    private startupGate?: Promise<void>
    private releaseStartup?: () => void
    private currentProfile: () => number | null = () => null
    /** The enabled Mods and archives this session loaded; switching to a player with another set needs a restart. */
    private session?: string

    /** Supplies the current player. A switch without a restart keeps the same Mods, so later edits follow the new player. */
    useProfiles(current: () => number | null): void { this.currentProfile = current }

    private get profile(): number | null { return this.currentProfile() }

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
            for (const key of legacyStorageKeys) sys.localStorage.removeItem(key)
            await this.collectGarbage()
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
            this.session = this.signature(this.profile)
            return mods
        })()
    }

    async list(): Promise<string[]> {
        await this.ready()
        return this.enabledIds()
    }

    /** Whether that player's enabled Mods or their versions differ from the ones running now. */
    async needsRestartFor(profile: number | null): Promise<boolean> {
        await this.ready()
        return this.signature(profile) !== this.session
    }

    hasMods(profile: number | null): boolean {
        return Object.keys(this.selection(profile).installed).length > 0
    }

    /**
     * Gives a new player another player's Mods; both then share the same archives. The first player takes over
     * (`move`) what was installed before any player existed.
     */
    copyMods(from: number | null, to: number, move = false): void {
        this.writeSelection(to, this.selection(from))
        if (move) sys.localStorage.removeItem(selectionKey(from))
    }

    private signature(profile: number | null): string {
        const { installed, enabled } = this.selection(profile)
        return JSON.stringify(enabled.map(id => [id, installed[id]]))
    }

    /** Validate and stage the compressed ZIP separately; installed files and settings stay intact. */
    async prepareImport(archive: Uint8Array): Promise<ModImport> {
        const { manifest } = parseImport(archive)
        const stagingId = `${Date.now().toString(36)}-${++nextImport}`
        await saveInstalledArchive('mod-pending', stagingId, archive, {})
        return { id: manifest.id, version: manifest.version, ...(manifest.author ? { author: manifest.author } : {}), manifest, stagingId }
    }

    async discardImports(imports: readonly ModImport[]): Promise<void> {
        for (const mod of imports) await removeInstalledArchive('mod-pending', mod.stagingId)
    }

    hasPendingChanges(): boolean { return !!sys.localStorage.getItem(pendingStorageKey) }

    /** Apply only records metadata. ZIP decoding, installation and removal happen on the next startup. */
    async queueChanges(changes: ModChanges): Promise<void> {
        await this.ready()
        const imported = new Map(changes.imports.map(mod => [mod.id, mod.manifest]))
        // The list reads only manifests; a Mod enabled now is fully read and validated here instead.
        const manifests = await Promise.all(changes.enabled.map(async id => {
            const manifest = imported.get(id) ?? (await this.read(id).catch(() => undefined))?.manifest
            if (!manifest) throw new Error(this.failures.get(id) ?? `Mod is not ready: ${id}`)
            return manifest
        }))
        sortModManifests(manifests)
        const installed = [...new Set([...this.installedIds(), ...imported.keys()])]
        this.validateSelection(changes.enabled, changes.order, installed)
        if (changes.imports.some(mod => mod.id === BASE_MOD_ID || mod.manifest.id !== mod.id)
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
        // Every import is checked before anything is installed, but only one is held unpacked at a time: the checks
        // keep just each manifest and index, and installing reads its ZIP again (HD packs run to hundreds of MB).
        const replacements: ArchivedMod[] = []
        const staged = new Map<string, ModImport>()
        for (const mod of changes.imports) {
            await progress(`Checking ${mod.id}`)
            const { manifest, content } = await this.readImport(mod)
            replacements.push({ manifest, content, files: Object.create(null), archive: new Uint8Array() })
            staged.set(manifest.id, mod)
        }
        await progress('Checking Mod dependencies')
        await this.saveSelection(changes.enabled, changes.order, replacements, id => progress(`Installing ${id}`),
            mod => this.readImport(staged.get(mod.manifest.id)!))
        for (const id of changes.uninstalls) {
            await progress(`Removing ${id}`)
            // Replaying a job after interruption must also accept removals already completed.
            await this.removeInstalled(id)
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
        const mod: ArchivedMod = { ...parseImport(archive), archive }
        await this.ready()
        const enabled = this.enabledIds()
        const order = this.installedIds()
        if (!order.includes(mod.manifest.id)) order.unshift(mod.manifest.id)
        const ids = enable ? order.filter(id => enabled.includes(id) || id === mod.manifest.id).reverse() : enabled
        if (ids.includes(mod.manifest.id)) await this.resolve(ids, [mod])
        await this.store(mod)
        if (enable) this.saveEnabled(ids)
        this.saveOrder(order)
        return mod.manifest.id
    }

    /** Installed Mods in display order (highest priority first), including disabled or damaged archives. */
    async installed(): Promise<{ id: string, version?: string, author?: string, error?: string }[]> {
        await this.ready()
        const ids = this.installedIds()
        // Session failures describe the old running code, not a ZIP imported for the next restart.
        return Promise.all(ids.map(async id => ({ id, ...(this.failures.has(id) && !this.reinstalled.has(id) ? { error: this.failures.get(id) } : {}),
            ...await this.details(id).catch(() => ({})) })))
    }

    /** The list shows versions and authors, so a Mod not loaded this session reads just its manifest, once. */
    private async details(id: string): Promise<{ version?: string, author?: string }> {
        const key = this.selection(this.profile).installed[id]
        if (!key) return {}
        const loaded = this.loaded.get(key)?.manifest
        const known = loaded ? { version: loaded.version, author: loaded.author } : this.versions.get(key)
        if (known !== undefined) return known
        const manifest = await readInstalledManifest('mods', key)
        if (!manifest) return {}
        const { version, author } = parseModManifest(contentJson({ 'manifest.json': manifest }, 'manifest.json'))
        this.versions.set(key, { version, author })
        return { version, author }
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
        beforeInstall: (id: string) => Promise<void> = async () => {}, load?: (mod: ArchivedMod) => Promise<ArchivedMod>): Promise<boolean> {
        if (new Set(ids).size !== ids.length) throw new Error('Duplicate Mod ID')
        await this.resolve([...ids], replacements)
        const installed = [...new Set([...this.installedIds(), ...replacements.map(mod => mod.manifest.id)])]
        this.validateSelection(ids, order, installed)
        const priority = [...ids].reverse()
        let index = 0
        const nextOrder = order ? [...order] : installed.map(id => ids.includes(id) ? priority[index++] : id)
        const orderedEnabled = nextOrder.filter(id => ids.includes(id)).reverse()
        if (orderedEnabled.some((id, index) => id !== ids[index])) throw new Error('Mod order does not match enabled priority')
        const current = this.enabledIds()
        for (const mod of replacements) {
            await beforeInstall(mod.manifest.id)
            await this.store(load ? await load(mod) : mod)
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
        const order = this.installedIds()
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
        const order = this.installedIds()
        await this.resolve(next)
        this.saveEnabled(next)
        this.saveOrder(order)
        return true
    }

    async uninstall(id: string): Promise<boolean> {
        await this.ready()
        const order = this.installedIds()
        if (!order.includes(id)) throw new Error(`Mod is not installed: ${id}`)
        const ids = this.enabledIds(), next = ids.filter(candidate => candidate !== id)
        await this.resolve(next)
        this.saveEnabled(next)
        this.saveOrder(order.filter(candidate => candidate !== id))
        await this.removeInstalled(id)
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
        if (!isModId(id)) throw new Error('Use an installed Mod ID; install ZIPs from /mod')
        const key = this.selection(this.profile).installed[id]
        const cached = key && this.loaded.get(key)
        if (cached) return cached
        // Native installs are extracted on disk; reading their file list there avoids loading the whole ZIP.
        const extracted = key ? readExtractedFiles('mods', key) : undefined
        if (extracted) {
            const mod = parseInstalled(extracted)
            if (mod.manifest.id !== id) throw new Error(`Installed Mod ID does not match: ${id}`)
            this.loaded.set(key, mod)
            return mod
        }
        const archive = key && await readInstalledArchive('mods', key)
        if (!archive) {
            if (allowMissing) return undefined
            throw new Error(`Mod is not installed: ${id}. Open /mod to install it`)
        }
        const mod = parseInstalled(readInstalledFiles('mods', key, archive) ?? unpackArchive(archive, 'manifest.json'))
        if (mod.manifest.id !== id) throw new Error(`Installed Mod ID does not match: ${id}`)
        this.loaded.set(key, mod)
        return mod
    }

    private selection(profile: number | null): ModSelection {
        const raw = sys.localStorage.getItem(selectionKey(profile))
        if (!raw) return { installed: {}, enabled: [], order: [] }
        const value = JSON.parse(raw), ids = (list: unknown) => Array.isArray(list) && list.every(id => isModId(id)) && new Set(list).size === list.length
        if (!value || typeof value !== 'object' || !ids(value.enabled) || !ids(value.order) || !value.installed || typeof value.installed !== 'object'
            || Object.entries(value.installed).some(([id, key]) => !isModId(id) || typeof key !== 'string')) {
            // Dev saves follow the current format only (e.g. Mod IDs before they became bare names): start without Mods.
            console.warn(`[Mods] Ignoring saved Mods in an old format for player ${profile ?? 'none'}`)
            return { installed: {}, enabled: [], order: [] }
        }
        return { installed: { ...value.installed }, enabled: [...value.enabled], order: [...value.order] }
    }

    private writeSelection(profile: number | null, selection: ModSelection): void {
        sys.localStorage.setItem(selectionKey(profile), JSON.stringify(selection))
    }

    private update(change: (selection: ModSelection) => void): void {
        const selection = this.selection(this.profile)
        change(selection)
        this.writeSelection(this.profile, selection)
    }

    private enabledIds(): string[] { return this.selection(this.profile).enabled }

    private installedIds(): string[] {
        const { installed, enabled, order } = this.selection(this.profile)
        return [...new Set([...order, ...[...enabled].reverse(), ...Object.keys(installed)])].filter(id => Object.hasOwn(installed, id))
    }

    private saveOrder(ids: readonly string[]): void { this.update(selection => { selection.order = [...ids] }) }

    private saveEnabled(ids: string[]): void { this.update(selection => { selection.enabled = [...ids] }) }

    /** Saves the ZIP once per content and points this player at it; the archive it replaces goes if nobody uses it. */
    private async store(mod: ArchivedMod): Promise<void> {
        const id = mod.manifest.id, key = archiveKey(id, mod.archive)
        if (!(await listInstalledArchives('mods')).includes(key)) await saveInstalledArchive('mods', key, mod.archive, mod.files)
        const previous = this.selection(this.profile).installed[id]
        this.update(selection => { selection.installed[id] = key })
        if (previous && previous !== key) await this.release(previous)
        this.reinstalled.add(id)
    }

    private async removeInstalled(id: string): Promise<void> {
        const key = this.selection(this.profile).installed[id]
        this.update(selection => {
            delete selection.installed[id]
            selection.enabled = selection.enabled.filter(candidate => candidate !== id)
            selection.order = selection.order.filter(candidate => candidate !== id)
        })
        if (key) await this.release(key)
    }

    private referencedArchives(): Set<string> {
        const keys = new Set<string>(), storage = sys.localStorage
        for (let index = 0; index < storage.length; index++) {
            const name = storage.key(index)
            if (!name?.startsWith(PLAYER_MODS_PREFIX)) continue
            const profile = name.slice(PLAYER_MODS_PREFIX.length, -':state'.length)
            try { for (const key of Object.values(this.selection(profile === 'none' ? null : Number(profile)).installed)) keys.add(key) }
            catch (error) { console.warn(`[Mods] Ignoring invalid player Mods: ${name}`, error) }
        }
        return keys
    }

    private async release(key: string): Promise<void> {
        if (!this.referencedArchives().has(key)) await removeInstalledArchive('mods', key)
    }

    /** Drops archives no player uses: deleted players, replaced versions and the old device-wide installs. */
    private async collectGarbage(): Promise<void> {
        const referenced = this.referencedArchives()
        for (const key of await listInstalledArchives('mods')) {
            if (!referenced.has(key)) await removeInstalledArchive('mods', key).catch(error => console.warn(`[Mods] Failed to remove ${key}`, error))
        }
    }
}

export const modManager = new ModManager()
