import { record, nonEmptyString, finite, nonNegativeFinite, positiveFinite, integer, exact } from '@/shared/validate'
import { isQualifiedId } from '@/shared/mod/index'

export interface FontChar {
    rect: [number, number, number, number]
    offset: [number, number]
    width: number
    order: number
    kerning: Record<string, number>
}

export interface FontLayer {
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
    chars: Record<string, FontChar>
}

export interface Font {
    schemaVersion: 2
    id: string
    defaultPointSize: number
    charMap: Record<string, number>
    layers: FontLayer[]
}

export function parseFont(value: unknown): Font {
    const source = exact(
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
        defaultPointSize: positiveFinite(source.defaultPointSize, 'font.defaultPointSize'),
        charMap: codeNumberRecord(source.charMap, 'font.charMap'),
        layers: source.layers.map((value, index) => parseLayer(value, `font.layers[${index}]`)),
    }
}

function parseLayer(value: unknown, name: string): FontLayer {
    const layer = exact(value, [
        'name', 'image', 'ascent', 'ascentPadding', 'lineSpacingOffset', 'pointSize',
        'height', 'spacing', 'offset', 'drawMode', 'baseOrder', 'colorMult', 'colorAdd', 'chars',
    ], name)
    const image = nonEmptyString(layer.image, `${name}.image`)
    if (!/^[A-Za-z0-9_-]+$/.test(image)) throw new Error(`${name}.image must be an asset name`)
    const chars = record(layer.chars, `${name}.chars`)
    if (Object.keys(chars).length === 0) throw new Error(`${name}.chars must not be empty`)
    const parsedChars: Record<string, FontChar> = {}
    for (const key of Object.keys(chars).sort((a, b) => Number(a) - Number(b))) {
        codeKey(key, `${name}.chars`)
        parsedChars[key] = parseChar(chars[key], `${name}.chars.${key}`)
    }

    return {
        name: nonEmptyString(layer.name, `${name}.name`),
        image,
        ascent: finite(layer.ascent, `${name}.ascent`),
        ascentPadding: finite(layer.ascentPadding, `${name}.ascentPadding`),
        lineSpacingOffset: finite(layer.lineSpacingOffset, `${name}.lineSpacingOffset`),
        pointSize: positiveFinite(layer.pointSize, `${name}.pointSize`),
        height: nonNegativeFinite(layer.height, `${name}.height`),
        spacing: finite(layer.spacing, `${name}.spacing`),
        offset: tuple(layer.offset, 2, finite, `${name}.offset`),
        drawMode: integer(layer.drawMode, `${name}.drawMode`),
        baseOrder: integer(layer.baseOrder, `${name}.baseOrder`),
        colorMult: tuple(layer.colorMult, 4, colorByte, `${name}.colorMult`),
        colorAdd: tuple(layer.colorAdd, 4, colorByte, `${name}.colorAdd`),
        chars: parsedChars,
    }
}

function parseChar(value: unknown, name: string): FontChar {
    const char = exact(value, ['rect', 'offset', 'width', 'order', 'kerning'], name)
    return {
        rect: tuple(char.rect, 4, nonNegativeFinite, `${name}.rect`),
        offset: tuple(char.offset, 2, finite, `${name}.offset`),
        width: nonNegativeFinite(char.width, `${name}.width`),
        order: integer(char.order, `${name}.order`),
        kerning: finiteNumberRecord(char.kerning, `${name}.kerning`),
    }
}

function codeNumberRecord(value: unknown, name: string): Record<string, number> {
    const source = record(value, name)
    const result: Record<string, number> = {}
    for (const key of Object.keys(source).sort((a, b) => Number(a) - Number(b))) {
        codeKey(key, name)
        result[key] = codeNumber(source[key], `${name}.${key}`)
    }
    return result
}

function finiteNumberRecord(value: unknown, name: string): Record<string, number> {
    const source = record(value, name)
    const result: Record<string, number> = {}
    for (const key of Object.keys(source).sort((a, b) => Number(a) - Number(b))) {
        codeKey(key, name)
        result[key] = finite(source[key], `${name}.${key}`)
    }
    return result
}

function codeKey(key: string, name: string): void {
    if (!/^(?:0|[1-9]\d*)$/.test(key) || Number(key) > 65535) {
        throw new Error(`${name} key must be a UTF-16 character code: ${key}`)
    }
}

function codeNumber(value: unknown, name: string): number {
    const number = integer(value, name)
    if (number < 0 || number > 65535) throw new Error(`${name} must be a UTF-16 character code`)
    return number
}

function colorByte(value: unknown, name: string): number {
    const number = integer(value, name)
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
