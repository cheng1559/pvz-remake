/** One running package's `pvz:strings` table; the base comes first, then Mods from lowest to highest priority. */
export interface StringLayer { owner: string; table: unknown }

/**
 * All text lives in one key-merged table. The base defines the original and project keys; a Mod adds new keys only in
 * its own namespace (`example:menu`), and may change any existing key, so translations reach the base and other Mods.
 * Later layers win. Keys a Mod may not add are left out and reported.
 */
export function mergeStringLayers(layers: readonly StringLayer[]): { strings: Record<string, string>, rejected: string[] } {
    const tables = layers.map(({ owner, table }) => {
        if (!table || typeof table !== 'object' || Array.isArray(table)) throw new Error(`${owner}: pvz:strings must be an object`)
        for (const [key, value] of Object.entries(table)) {
            // The original table has deliberately empty entries (spacer credit lines), so only the type is checked.
            if (typeof value !== 'string') throw new Error(`${owner}: pvz:strings.${key} must be a string`)
        }
        return { owner, table: table as Record<string, string> }
    })
    const known = new Set(tables.flatMap(({ owner, table }, index) =>
        Object.keys(table).filter(key => index === 0 || key.startsWith(`${owner}:`))))
    const strings: Record<string, string> = {}, rejected: string[] = []
    for (const { owner, table } of tables) {
        for (const [key, value] of Object.entries(table)) {
            if (known.has(key)) strings[key] = value
            else rejected.push(`${owner}: ${key}`)
        }
    }
    return { strings, rejected }
}
