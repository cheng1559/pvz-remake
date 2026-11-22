/** JSON as the protocol and saves carry it: its types, and checking and copying values as JSON. */

export type JsonValue = null | boolean | number | string | JsonValue[] | JsonObject

export type JsonObject = { [key: string]: JsonValue }

const UNSAFE_JSON_COPY = Symbol('unsafe JSON copy')

/**
 * A copy of a JSON object or array without a serialization and parse pass, or nothing when the value is not plain JSON
 * (a cycle, a class instance, a non-finite number): the caller then takes the slower way, with its diagnostics.
 */
export function copyJson(value: object): JsonValue | undefined {
    const copy = copyJsonContainer(value, new WeakSet<object>())
    return copy === UNSAFE_JSON_COPY ? undefined : copy
}

function copyJsonContainer(value: object, ancestors: WeakSet<object>): JsonValue | typeof UNSAFE_JSON_COPY {
    const isArray = Array.isArray(value)
    const prototype = Object.getPrototypeOf(value)
    if (ancestors.has(value) || (!isArray && prototype !== Object.prototype && prototype !== null)) return UNSAFE_JSON_COPY
    // Unusual array prototypes may have inherited JSON serialization behavior; use the existing path.
    if (isArray && prototype !== Array.prototype) return UNSAFE_JSON_COPY
    const keys = Reflect.ownKeys(value)
    if (isArray && keys.length !== value.length + 1) return UNSAFE_JSON_COPY
    const copy: JsonObject | JsonValue[] = isArray ? new Array(value.length) : {}
    ancestors.add(value)
    for (const key of keys) {
        if (typeof key !== 'string') return UNSAFE_JSON_COPY
        if (isArray) {
            if (key === 'length') continue
            if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) return UNSAFE_JSON_COPY
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!
        if (!descriptor.enumerable || !('value' in descriptor)) return UNSAFE_JSON_COPY
        let item = descriptor.value
        // Most snapshot fields are scalar; avoid another function call for each one on jitless V8.
        if (typeof item === 'number') {
            if (!Number.isFinite(item)) return UNSAFE_JSON_COPY
            if (item === 0) item = 0 // JSON round trips normalize negative zero.
        } else if (item !== null && typeof item !== 'string' && typeof item !== 'boolean') {
            if (typeof item !== 'object') return UNSAFE_JSON_COPY
            item = copyJsonContainer(item, ancestors)
            if (item === UNSAFE_JSON_COPY) return UNSAFE_JSON_COPY
        }
        // JSON.parse creates an own data property here, without changing the result's prototype.
        if (key === '__proto__') setJsonField(copy as JsonObject, key, item)
        else (copy as JsonObject)[key] = item
    }
    ancestors.delete(value)
    return copy
}

/** Sets a JSON object's field as its own data property: assigned, `__proto__` would set the object's prototype instead. */
export function setJsonField(object: Record<string, unknown>, key: string, value: unknown): void {
    if (key === '__proto__') Object.defineProperty(object, key, { value, enumerable: true, writable: true, configurable: true })
    else object[key] = value
}

export function assertJsonValue(value: unknown): asserts value is JsonValue {
    // Snapshots are checked every tick; only build property paths when there is an error to report.
    if (!isJsonNode(value, new WeakSet<object>())) assertJsonNode(value, new WeakSet<object>(), '$')
}

/** The same rules as assertJsonNode, without allocating a path for every property. */
const isJsonNode = (value: unknown, ancestors: WeakSet<object>): boolean => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
    if (typeof value === 'number') return Number.isFinite(value)
    if (typeof value !== 'object' || ancestors.has(value)) return false
    const isArray = Array.isArray(value)
    const prototype = Object.getPrototypeOf(value)
    if (!isArray && prototype !== Object.prototype && prototype !== null) return false
    const keys = Reflect.ownKeys(value)
    // Without holes, an array's own keys are exactly its indices and 'length'.
    if (isArray && keys.length !== value.length + 1) return false
    ancestors.add(value)
    for (const key of keys) {
        if (typeof key !== 'string') return false
        if (isArray && key === 'length') continue
        const descriptor = Object.getOwnPropertyDescriptor(value, key)!
        if (!descriptor.enumerable || !('value' in descriptor) || !isJsonNode(descriptor.value, ancestors)) return false
    }
    if (isArray) for (let index = 0; index < value.length; index++) if (!Object.prototype.hasOwnProperty.call(value, index)) return false
    ancestors.delete(value)
    return true
}

export function isJsonValue(value: unknown): value is JsonValue {
    try {
        assertJsonValue(value)
        return true
    } catch {
        return false
    }
}

export function jsonRoundTrip<T>(value: T): T {
    assertJsonValue(value)
    return JSON.parse(JSON.stringify(value)) as T
}

const assertJsonNode = (value: unknown, ancestors: WeakSet<object>, path: string): void => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return
    if (typeof value === 'number') {
        if (Number.isFinite(value)) return
        throw new TypeError(`${path} must contain only finite numbers`)
    }
    if (typeof value !== 'object') throw new TypeError(`${path} is not JSON-safe`)
    if (ancestors.has(value)) throw new TypeError(`${path} contains a cycle`)

    const prototype = Object.getPrototypeOf(value)
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`${path} must contain only arrays and plain objects`)
    }

    ancestors.add(value)
    if (Array.isArray(value)) {
        for (const key of Reflect.ownKeys(value)) {
            if (key === 'length') continue
            if (typeof key !== 'string' || !/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length) {
                throw new TypeError(`${path} contains a non-JSON array property`)
            }
            assertJsonProperty(value, key, ancestors, `${path}[${key}]`)
        }
        for (let index = 0; index < value.length; index++) {
            if (!Object.prototype.hasOwnProperty.call(value, index)) throw new TypeError(`${path}[${index}] is not JSON-safe`)
        }
    } else {
        for (const key of Reflect.ownKeys(value)) {
            if (typeof key !== 'string') throw new TypeError(`${path} contains a symbol property`)
            assertJsonProperty(value, key, ancestors, `${path}.${key}`)
        }
    }
    ancestors.delete(value)
}

const assertJsonProperty = (object: object, key: string, ancestors: WeakSet<object>, path: string): void => {
    const descriptor = Object.getOwnPropertyDescriptor(object, key)!
    if (!descriptor.enumerable || !('value' in descriptor)) {
        throw new TypeError(`${path} must be an enumerable data property`)
    }
    assertJsonNode(descriptor.value, ancestors, path)
}
