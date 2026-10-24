import type { ModManifest } from './index'

/** A Mod reads its own archive directly, without Cocos importing or compiling its JSON. */
export class ModAssets {
    readonly baseUrl: string
    constructor(readonly manifest: ModManifest, private readonly files: Readonly<Record<string, Uint8Array>>) {
        this.baseUrl = `pvzmod:///${encodeURIComponent(manifest.id)}/`
    }
    get id(): string { return this.manifest.id }
    bytes(path: string): Uint8Array {
        if (!path || /^(?:[\\/]|[A-Za-z][\w+.-]*:)/.test(path) || decodeURIComponent(path).split(/[\\/]/).includes('..')) throw new Error('Mod path must stay inside its archive')
        const value = this.files[path]
        if (!value) throw new Error(`Missing Mod file: ${this.id}/${path}`)
        return value.slice()
    }
    json<T = any>(path: string): T { return JSON.parse(new TextDecoder('utf-8').decode(this.bytes(path))) as T }
    url(path: string): string { this.bytes(path); return this.baseUrl + path.split('/').map(encodeURIComponent).join('/') }
}
