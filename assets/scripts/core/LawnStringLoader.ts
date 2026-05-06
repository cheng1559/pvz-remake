import { JsonAsset } from 'cc'
import { AssetLoader } from './AssetLoader'

type LawnStringMap = Record<string, string>

const LAWN_STRINGS_PATH = 'properties/lawnstrings'
const TOKEN_REPLACEMENTS: Array<[RegExp, string]> = [
    [/\{KEYWORD\}/g, ''],
    [/\{STAT\}/g, ''],
    [/\{FLAVOR\}/g, ''],
    [/\{SHORTLINE\}/g, '\n'],
]

export class LawnStringLoader {
    private static _strings: LawnStringMap | null = null
    private static _loading: Promise<LawnStringMap> | null = null

    static async load(): Promise<LawnStringMap> {
        if (this._strings) return this._strings
        if (this._loading) return this._loading

        this._loading = (async () => {
            const asset = await AssetLoader.load<JsonAsset>(LAWN_STRINGS_PATH, JsonAsset, 'Lawn strings')
            this._strings = (asset?.json as LawnStringMap | undefined) ?? {}
            this._loading = null
            return this._strings
        })()

        return this._loading
    }

    static translate(key: string, strings: LawnStringMap): string {
        if (key.length >= 3 && key[0] === '[' && key[key.length - 1] === ']') {
            const name = key.slice(1, -1).trim().toUpperCase()
            return strings[name] ?? `<Missing ${name}>`
        }
        return key
    }

    static translateOptional(key: string, strings: LawnStringMap): string {
        if (key.length >= 3 && key[0] === '[' && key[key.length - 1] === ']') {
            const name = key.slice(1, -1).trim().toUpperCase()
            return strings[name] ?? ''
        }
        return key
    }

    static almanacText(key: string, strings: LawnStringMap): string {
        let text = this.translate(key, strings)
        for (const [pattern, replacement] of TOKEN_REPLACEMENTS) {
            text = text.replace(pattern, replacement)
        }
        return text
            .replace(/\n{3,}/g, '\n\n')
            .replace(/^\s+/, '')
            .replace(/\s+$/, '')
    }
}
