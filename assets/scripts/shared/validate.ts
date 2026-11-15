/**
 * The checks every reader of outside data shares: saves, packets, snapshots, content and Mod archives. Each returns the
 * value it accepts, or throws a TypeError naming it (`name`, a path such as `server save.wave.index`).
 */

/** An object: neither null nor an array. */
export function record(value: unknown, name: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError(`${name} must be an object`)
    return value as Record<string, unknown>
}

/** An object with every key of `required`, any of `optional`, and nothing else. */
export function exact(value: unknown, required: readonly string[], name: string, optional: readonly string[] = []): Record<string, unknown> {
    const source = record(value, name)
    const allowed = new Set([...required, ...optional])
    for (const key of Object.keys(source)) if (!allowed.has(key)) throw new TypeError(`${name}.${key} is not supported`)
    for (const key of required) if (!Object.hasOwn(source, key)) throw new TypeError(`${name}.${key} is required`)
    return source
}

export function array(value: unknown, name: string): unknown[] {
    if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`)
    return value
}

export function nonEmptyString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${name} must be a non-empty string`)
    return value
}

export function boolean(value: unknown, name: string): boolean {
    if (typeof value !== 'boolean') throw new TypeError(`${name} must be a boolean`)
    return value
}

/** A flag that is there only when set: `true`, never `false`. */
export function trueFlag(value: unknown, name: string): true {
    if (value !== true) throw new TypeError(`${name} must be true`)
    return true
}

/** One of a few words (`plants` or `zombies`). */
export function oneOf<T extends string>(value: unknown, options: readonly T[], name: string): T {
    if (!options.includes(value as T)) {
        const words = options.length > 1 ? `${options.slice(0, -1).join(', ')} or ${options.at(-1)}` : options[0]
        throw new TypeError(`${name} must be ${words}`)
    }
    return value as T
}

export function finite(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${name} must be finite`)
    return value
}

export function nonNegativeFinite(value: unknown, name: string): number {
    const result = finite(value, name)
    if (result < 0) throw new TypeError(`${name} must be non-negative`)
    return result
}

export function positiveFinite(value: unknown, name: string): number {
    const result = finite(value, name)
    if (result <= 0) throw new TypeError(`${name} must be positive`)
    return result
}

export function finiteInRange(value: unknown, min: number, max: number, name: string): number {
    const result = finite(value, name)
    if (result < min || result > max) throw new TypeError(`${name} must be between ${min} and ${max}`)
    return result
}

/** A safe integer of either sign. */
export function integer(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new TypeError(`${name} must be a safe integer`)
    return value
}

export function nonNegativeInteger(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative safe integer`)
    return value
}

export function positiveInteger(value: unknown, name: string): number {
    const result = nonNegativeInteger(value, name)
    if (result === 0) throw new TypeError(`${name} must be positive`)
    return result
}

export function integerInRange(value: unknown, min: number, max: number, name: string): number {
    const result = integer(value, name)
    if (result < min || result > max) throw new TypeError(`${name} must be between ${min} and ${max}`)
    return result
}

export function uint32(value: unknown, name: string): number {
    const result = nonNegativeInteger(value, name)
    if (result > 0xffffffff) throw new TypeError(`${name} must be a uint32`)
    return result
}
