import { isQualifiedId } from '@/shared/mod/index'

export interface FontCharV2 {
    rect: [number, number, number, number]
    offset: [number, number]
    width: number
    order: number
    kerning: Record<string, number>
}

export interface FontLayerV2 {
    name: string
    image: string
    ascent: number
    ascentPadding: number
    lineSpacingOffset: number
    pointSize: number
    height: number
    spacing: number
    offset: [number, number]
    drawMode: number
    baseOrder: number
    colorMult: [number, number, number, number]
    colorAdd: [number, number, number, number]
    chars: Record<string, FontCharV2>
}

export interface FontV2 {
    schemaVersion: 2
    id: string
    defaultPointSize: number
    charMap: Record<string, number>
    layers: FontLayerV2[]
}

export function parseFontV2(value: unknown): FontV2 {
    const source = exactObject(
        value,
        ['schemaVersion', 'id', 'defaultPointSize', 'charMap', 'layers'],
        'font',
    )
    if (source.schemaVersion !== 2) throw new Error('font.schemaVersion must be 2')
    if (!isQualifiedId(source.id)) throw new Error('font.id must be a qualified ID')
    if (!Array.isArray(source.layers) || source.layers.length === 0) {
        throw new Error('font.layers must be a non-empty array')
    }

    return {
        schemaVersion: 2,
        id: source.id,
        defaultPointSize: positiveNumber(source.defaultPointSize, 'font.defaultPointSize'),
        charMap: codeNumberRecord(source.charMap, 'font.charMap'),
        layers: source.layers.map((value, index) => parseLayer(value, `font.layers[${index}]`)),
    }
}

function parseLayer(value: unknown, name: string): FontLayerV2 {
    const layer = exactObject(value, [
        'name', 'image', 'ascent', 'ascentPadding', 'lineSpacingOffset', 'pointSize',
        'height', 'spacing', 'offset', 'drawMode', 'baseOrder', 'colorMult', 'colorAdd', 'chars',
    ], name)
    const image = nonEmptyString(layer.image, `${name}.image`)
    if (!/^[A-Za-z0-9_-]+$/.test(image)) throw new Error(`${name}.image must be an asset name`)
    const chars = object(layer.chars, `${name}.chars`)
    if (Object.keys(chars).length === 0) throw new Error(`${name}.chars must not be empty`)
    const parsedChars: Record<string, FontCharV2> = {}
    for (const key of Object.keys(chars).sort((a, b) => Number(a) - Number(b))) {
        codeKey(key, `${name}.chars`)
        parsedChars[key] = parseChar(chars[key], `${name}.chars.${key}`)
    }

    return {
        name: nonEmptyString(layer.name, `${name}.name`),
        image,
        ascent: finiteNumber(layer.ascent, `${name}.ascent`),
        ascentPadding: finiteNumber(layer.ascentPadding, `${name}.ascentPadding`),
        lineSpacingOffset: finiteNumber(layer.lineSpacingOffset, `${name}.lineSpacingOffset`),
        pointSize: positiveNumber(layer.pointSize, `${name}.pointSize`),
        height: nonNegativeNumber(layer.height, `${name}.height`),
        spacing: finiteNumber(layer.spacing, `${name}.spacing`),
        offset: tuple(layer.offset, 2, finiteNumber, `${name}.offset`),
        drawMode: safeInteger(layer.drawMode, `${name}.drawMode`),
        baseOrder: safeInteger(layer.baseOrder, `${name}.baseOrder`),
        colorMult: tuple(layer.colorMult, 4, colorByte, `${name}.colorMult`),
        colorAdd: tuple(layer.colorAdd, 4, colorByte, `${name}.colorAdd`),
        chars: parsedChars,
    }
}

function parseChar(value: unknown, name: string): FontCharV2 {
    const char = exactObject(value, ['rect', 'offset', 'width', 'order', 'kerning'], name)
    return {
        rect: tuple(char.rect, 4, nonNegativeNumber, `${name}.rect`),
        offset: tuple(char.offset, 2, finiteNumber, `${name}.offset`),
        width: nonNegativeNumber(char.width, `${name}.width`),
        order: safeInteger(char.order, `${name}.order`),
        kerning: finiteNumberRecord(char.kerning, `${name}.kerning`),
    }
}

function codeNumberRecord(value: unknown, name: string): Record<string, number> {
    const source = object(value, name)
    const result: Record<string, number> = {}
    for (const key of Object.keys(source).sort((a, b) => Number(a) - Number(b))) {
        codeKey(key, name)
        result[key] = codeNumber(source[key], `${name}.${key}`)
    }
    return result
}

function finiteNumberRecord(value: unknown, name: string): Record<string, number> {
    const source = object(value, name)
    const result: Record<string, number> = {}
    for (const key of Object.keys(source).sort((a, b) => Number(a) - Number(b))) {
        codeKey(key, name)
        result[key] = finiteNumber(source[key], `${name}.${key}`)
    }
    return result
}

function codeKey(key: string, name: string): void {
    if (!/^(?:0|[1-9]\d*)$/.test(key) || Number(key) > 65535) {
        throw new Error(`${name} key must be a UTF-16 character code: ${key}`)
    }
}

function codeNumber(value: unknown, name: string): number {
    const number = safeInteger(value, name)
    if (number < 0 || number > 65535) throw new Error(`${name} must be a UTF-16 character code`)
    return number
}

function colorByte(value: unknown, name: string): number {
    const number = safeInteger(value, name)
    if (number < 0 || number > 255) throw new Error(`${name} must be between 0 and 255`)
    return number
}

function tuple<N extends number>(
    value: unknown,
    length: N,
    parse: (value: unknown, name: string) => number,
    name: string,
): N extends 2 ? [number, number] : [number, number, number, number] {
    if (!Array.isArray(value) || value.length !== length) throw new Error(`${name} must contain ${length} numbers`)
    return value.map((item, index) => parse(item, `${name}[${index}]`)) as any
}

function exactObject(value: unknown, keys: readonly string[], name: string): Record<string, unknown> {
    const record = object(value, name)
    const expected = new Set(keys)
    for (const key of Object.keys(record)) if (!expected.has(key)) throw new Error(`${name}.${key} is not supported`)
    for (const key of keys) if (!Object.prototype.hasOwnProperty.call(record, key)) throw new Error(`${name}.${key} is required`)
    return record
}

function object(value: unknown, name: string): Record<string, unknown> {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`)
    return value as Record<string, unknown>
}

function nonEmptyString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.length === 0) throw new Error(`${name} must be a non-empty string`)
    return value
}

function finiteNumber(value: unknown, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${name} must be finite`)
    return value
}

function safeInteger(value: unknown, name: string): number {
    const number = finiteNumber(value, name)
    if (!Number.isSafeInteger(number)) throw new Error(`${name} must be a safe integer`)
    return number
}

function positiveNumber(value: unknown, name: string): number {
    const number = finiteNumber(value, name)
    if (number <= 0) throw new Error(`${name} must be positive`)
    return number
}

function nonNegativeNumber(value: unknown, name: string): number {
    const number = finiteNumber(value, name)
    if (number < 0) throw new Error(`${name} must be non-negative`)
    return number
}
