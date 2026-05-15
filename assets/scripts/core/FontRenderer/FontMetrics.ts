import { JsonAsset } from 'cc'

import type { FontConfig, FontLayerConfig } from './FontRenderer.d'

export interface FontMetrics {
    ascent: number
    ascentPadding: number
    height: number
    lineSpacing: number
}

export interface WordWrapMeasure {
    height: number
    lineWidths: number[]
}

export class FontMetricsUtil {
    static measureTextWidth(fontConfig: JsonAsset | null, text: string): number {
        const cfg = this._getConfig(fontConfig)
        const layer = cfg?.layers?.[0]
        if (!cfg || !layer) return 0

        let width = 0
        let prevCode = 0
        for (const code of this._resolveChars(cfg, text)) {
            const charInfo = layer.chars?.[String(code)]
            if (!charInfo) {
                width += code === 32 ? cfg.defaultPointSize * 0.3 : 0
                prevCode = code
                continue
            }

            let spacing = 0
            if (prevCode !== 0) {
                const prevInfo = layer.chars?.[String(prevCode)]
                spacing = layer.spacing + (prevInfo?.kerning?.[String(code)] ?? 0)
            }

            width += charInfo.width + spacing
            prevCode = code
        }
        return width
    }

    static getMetrics(fontConfig: JsonAsset | null): FontMetrics {
        const layer = this._getConfig(fontConfig)?.layers?.[0]
        if (!layer) return { ascent: 0, ascentPadding: 0, height: 0, lineSpacing: 0 }

        const height = layer.height > 0 ? layer.height : this.getLayerDefaultHeight(layer)
        return {
            ascent: layer.ascent ?? 0,
            ascentPadding: layer.ascentPadding ?? 0,
            height,
            lineSpacing: height + (layer.lineSpacingOffset ?? 0),
        }
    }

    static measureWordWrapped(
        fontConfig: JsonAsset | null,
        text: string,
        wrapWidth: number,
    ): WordWrapMeasure {
        if (!text) return { height: 0, lineWidths: [] }

        const cfg = this._getConfig(fontConfig)
        const layer = cfg?.layers?.[0]
        if (!cfg || !layer || wrapWidth <= 0) return { height: 0, lineWidths: [] }

        const metrics = this.getMetrics(fontConfig)
        const chars = this._resolveChars(cfg, text)
        const lineWidths: number[] = []

        const measureRange = (start: number, end: number) =>
            this._measureRange(layer, cfg.defaultPointSize, chars, start, end)

        let curPos = 0
        let lineStartPos = 0
        let curWidth = 0
        let prevChar = 0
        let spacePos = -1

        while (curPos < chars.length) {
            const curChar = chars[curPos]
            if (curChar === 32) {
                spacePos = curPos
            } else if (curChar === 10) {
                lineWidths.push(measureRange(lineStartPos, curPos))
                curPos++
                lineStartPos = curPos
                spacePos = -1
                curWidth = 0
                prevChar = 0
                continue
            }

            curWidth += this._getCharWidthKern(layer, cfg.defaultPointSize, curChar, prevChar)
            prevChar = curChar

            if (curWidth > wrapWidth) {
                if (spacePos !== -1) {
                    lineWidths.push(measureRange(lineStartPos, spacePos))
                    curPos = spacePos + 1
                    while (curPos < chars.length && chars[curPos] === 32) curPos++
                    lineStartPos = curPos
                } else {
                    if (curPos <= lineStartPos) curPos++
                    lineWidths.push(measureRange(lineStartPos, curPos))
                    lineStartPos = curPos
                }
                spacePos = -1
                curWidth = 0
                prevChar = 0
            } else {
                curPos++
            }
        }

        if (lineStartPos < chars.length) {
            lineWidths.push(measureRange(lineStartPos, chars.length))
        }
        return {
            height: lineWidths.length > 0 ? lineWidths.length * metrics.lineSpacing : 0,
            lineWidths,
        }
    }

    static measureWordWrappedHeight(
        fontConfig: JsonAsset | null,
        text: string,
        wrapWidth: number,
    ): number {
        return this.measureWordWrapped(fontConfig, text, wrapWidth).height
    }

    static getLayerDefaultHeight(layer: FontLayerConfig): number {
        let height = layer.ascent
        for (const charCode in layer.chars) {
            const charInfo = layer.chars[charCode]
            const bottom = charInfo.rect[3] + charInfo.offset[1]
            if (bottom > height) height = bottom
        }
        return height
    }

    private static _getConfig(fontConfig: JsonAsset | null): FontConfig | null {
        return (fontConfig?.json as FontConfig | undefined) ?? null
    }

    private static _resolveChars(config: FontConfig, text: string): number[] {
        const chars: number[] = []
        for (let i = 0; i < text.length; i++) {
            let code = text.charCodeAt(i)
            code = config.charMap?.[String(code)] ?? code
            chars.push(code)
        }
        return chars
    }

    private static _getCharWidthKern(
        layer: FontLayerConfig,
        defaultPointSize: number,
        charCode: number,
        prevCode: number,
    ): number {
        const charInfo = layer.chars?.[String(charCode)]
        let width = charInfo ? charInfo.width : defaultPointSize * 0.3
        if (prevCode !== 0) {
            const prevInfo = layer.chars?.[String(prevCode)]
            width += layer.spacing + (prevInfo?.kerning?.[String(charCode)] ?? 0)
        }
        return width
    }

    private static _measureRange(
        layer: FontLayerConfig,
        defaultPointSize: number,
        chars: number[],
        start: number,
        end: number,
    ): number {
        let width = 0
        let prevCode = 0
        for (let i = start; i < end; i++) {
            width += this._getCharWidthKern(layer, defaultPointSize, chars[i], prevCode)
            prevCode = chars[i]
        }
        return width
    }

}
