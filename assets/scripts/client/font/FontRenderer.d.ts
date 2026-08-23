interface CharInfo {
    rect: [number, number, number, number] // [x, y, w, h] in atlas
    offset: [number, number] // [ox, oy]
    width: number // advance width
    order: number // per-char draw order
    kerning: Record<string, number> // nextCharCode -> offset
}

interface FontLayerConfig {
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
    colorMult: [number, number, number, number] // RGBA
    colorAdd: [number, number, number, number] // RGBA
    chars: Record<string, CharInfo> // charCode(string) -> info
}

interface FontConfig {
    defaultPointSize: number
    charMap: Record<string, number>
    layers: FontLayerConfig[]
}

interface RenderCmd {
    order: number
    layerIdx: number
    charCode: number
    x: number
    y: number
    charInfo: CharInfo
}

export type { FontConfig, FontLayerConfig, CharInfo, RenderCmd }
