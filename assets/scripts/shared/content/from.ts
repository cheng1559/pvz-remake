const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * `from`: a block of a definition (a plant's or a zombie's gameplay `animation`, its presentation `clips`) starts as
 * the same block of another of its table, which has one of its own (a cone zombie plays the plain zombie's animation,
 * the explode-o-nut draws the wall-nut's clips). What it writes beside `from` adds to that, one level down: an entry
 * that is an object on both sides is the other's with this one's entries over it (a flag zombie's clips and layers
 * over the plain zombie's). Given before the table is read, as if each had written it out.
 */
export function withFrom(entries: Record<string, unknown>, field: string, name: string): Record<string, unknown> {
    return Object.fromEntries(Object.entries(entries).map(([id, entry]) => {
        const block = isObject(entry) ? entry[field] : undefined
        if (!isObject(block) || block.from === undefined) return [id, entry]
        const { from, ...own } = block
        const source = typeof from === 'string' ? entries[from] : undefined
        const shared = isObject(source) ? source[field] : undefined
        if (!isObject(shared) || shared.from !== undefined) throw new TypeError(`${name}.${id}.${field}.from must name another of the ${name} whose ${field} is its own`)
        const merged: Record<string, unknown> = { ...shared }
        for (const [key, value] of Object.entries(own)) merged[key] = isObject(value) && isObject(shared[key]) ? { ...shared[key], ...value } : value
        return [id, { ...(entry as Record<string, unknown>), [field]: merged }]
    }))
}
