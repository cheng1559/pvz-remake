import type { ModManifest } from './index'

/** A Mod reads its own archive directly, without Cocos importing or compiling its JSON. */
export class ModAssets {
    readonly baseUrl: string
    constructor(readonly manifest: ModManifest, private readonly files: Readonly<Record<string, Uint8Array>>) {
        this.baseUrl = `pvzmod:///${encodeURIComponent(manifest.id)}/`
    }
    get id(): string { return this.manifest.id }
    bytes(path: string): Uint8Array {
        this.check(path)
        const value = this.files[path]
        if (!value) throw new Error(`Missing Mod file: ${this.id}/${path}`)
        return value.slice()
    }
    json<T = any>(path: string): T { return JSON.parse(new TextDecoder('utf-8').decode(this.bytes(path))) as T }
    /** Checks only that the file exists: installed files are read when loaded (from disk, or the web's stored ZIP). */
    url(path: string): string {
        this.check(path)
        if (!Object.hasOwn(this.files, path)) throw new Error(`Missing Mod file: ${this.id}/${path}`)
        return this.baseUrl + path.split('/').map(encodeURIComponent).join('/')
    }
    private check(path: string): void {
        if (!path || /^(?:[\\/]|[A-Za-z][\w+.-]*:)/.test(path) || decodeURIComponent(path).split(/[\\/]/).includes('..')) throw new Error('Mod path must stay inside its archive')
    }
}
