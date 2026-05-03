import {
    _decorator,
    Component,
    Node,
    Sprite,
    SpriteFrame,
    Texture2D,
    UITransform,
    Color,
    Vec2,
    Vec3,
    Size,
    Rect,
    JsonAsset,
} from 'cc'

import { FontLoader } from '@/core/FontLoader'
import type { BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil } from './FontMetrics'
import type { FontConfig, RenderCmd } from './FontRenderer.d'

const { ccclass, property, executeInEditMode } = _decorator

@ccclass('FontRenderer')
@executeInEditMode(true)
export class FontRenderer extends Component {
    fontConfigJson: JsonAsset | null = null

    layerTextures: Texture2D[] = []

    @property
    get string(): string {
        return this._string
    }
    set string(val: string) {
        if (this._string !== val) {
            this._string = val
            this._dirty = true
            this._scheduleRebuild()
        }
    }

    @property
    get fontSize(): number {
        return this._fontSize
    }
    set fontSize(val: number) {
        if (this._fontSize !== val) {
            this._fontSize = val
            this._dirty = true
            this._scheduleRebuild()
        }
    }

    @property
    get fontColor(): Color {
        return this._fontColor
    }
    set fontColor(val: Color) {
        if (!this._fontColor.equals(val)) {
            this._fontColor.set(val)
            this._dirty = true
            this._scheduleRebuild()
        }
    }

    @property
    get letterSpacing(): number {
        return this._letterSpacing
    }
    set letterSpacing(val: number) {
        if (this._letterSpacing !== val) {
            this._letterSpacing = val
            this._dirty = true
            this._scheduleRebuild()
        }
    }

    @property
    get lineSpacing(): number {
        return this._lineSpacing
    }
    set lineSpacing(val: number) {
        if (this._lineSpacing !== val) {
            this._lineSpacing = val
            this._dirty = true
            this._scheduleRebuild()
        }
    }

    @property
    get maxWidth(): number {
        return this._maxWidth
    }
    set maxWidth(val: number) {
        if (this._maxWidth !== val) {
            this._maxWidth = val
            this._dirty = true
            this._scheduleRebuild()
        }
    }

    @property
    get textAlign(): number {
        return this._textAlign
    }
    set textAlign(val: number) {
        if (this._textAlign !== val) {
            this._textAlign = val
            this._dirty = true
            this._scheduleRebuild()
        }
    }

    // Serialized text layout fields.
    @property private _string: string = ''
    @property private _fontSize: number = 0
    @property private _fontColor: Color = new Color(255, 255, 255, 255)
    @property private _letterSpacing: number = 0
    @property private _lineSpacing: number = 0
    @property private _maxWidth: number = 0
    @property private _textAlign: number = 0

    // Runtime state.
    private _config: FontConfig | null = null
    private _spriteFrameCache: Map<string, SpriteFrame> = new Map()
    private _charNodes: Node[] = []
    private _dirty: boolean = true
    private _rebuildScheduled: boolean = false
    private _totalWidth: number = 0
    private _totalHeight: number = 0
    private _fontLoadVersion: number = 0

    // Lifecycle.

    onLoad() {
        this._loadConfig()
        this._rebuild()
    }

    onEnable() {
        if (this._dirty) {
            this._rebuild()
        }
    }

    // Public API.

    /** Current rendered text width in pixels. */
    get contentWidth(): number {
        return this._totalWidth
    }

    /** Current rendered text height in pixels. */
    get contentHeight(): number {
        return this._totalHeight
    }

    async setFont(fontName: string): Promise<boolean> {
        const loadVersion = ++this._fontLoadVersion
        const assets = await FontLoader.load(fontName)
        if (loadVersion !== this._fontLoadVersion) return false
        if (!assets) return false

        this.setFontAssets(assets)
        return true
    }

    setFontAssets(assets: BitmapFontAssets) {
        this.fontConfigJson = assets.config
        this.layerTextures = assets.textures
        this._loadConfig()
        this._dirty = true
        this._scheduleRebuild()
    }

    /** Force a text mesh rebuild. */
    forceRebuild() {
        this._dirty = true
        this._loadConfig()
        this._rebuild()
    }

    // Internal implementation.

    private _scheduleRebuild() {
        if (this._rebuildScheduled) return
        this._rebuildScheduled = true
        this.scheduleOnce(() => {
            this._rebuildScheduled = false
            if (this._dirty) {
                this._rebuild()
            }
        }, 0)
    }

    private _loadConfig() {
        if (!this.fontConfigJson) {
            this._config = null
            return
        }
        this._config = this.fontConfigJson.json as unknown as FontConfig
    }

    /** Rebuilds all glyph nodes. */
    private _rebuild() {
        this._dirty = false

        // Clear old glyph nodes.
        this._clearCharNodes()

        if (!this._config || !this._string) return
        if (this.layerTextures.length === 0) return

        const config = this._config
        const pointSize = this._fontSize > 0 ? this._fontSize : config.defaultPointSize
        const scale = config.defaultPointSize > 0 ? pointSize / config.defaultPointSize : 1
        const inputColor = this._fontColor

        // Resolve char codes.
        const resolvedChars: number[] = []
        for (let i = 0; i < this._string.length; i++) {
            let code = this._string.charCodeAt(i)
            const mapped = config.charMap[String(code)]
            if (mapped !== undefined) code = mapped
            resolvedChars.push(code)
        }

        // Compute line breaks using layer 0. Each range is end-exclusive.
        const layer0 = config.layers[0]
        const wrapWidth = this._maxWidth > 0 ? this._maxWidth / scale : 0

        // PvZ ImageFont falls back to each layer's default glyph height when mHeight is 0.
        const layerDefaultHeight = FontMetricsUtil.getLayerDefaultHeight(layer0)
        const layerLineHeight = layer0.height > 0 ? layer0.height : layerDefaultHeight
        const fontLineSpacing =
            this._lineSpacing !== 0 ? this._lineSpacing : layerLineHeight + layer0.lineSpacingOffset

        interface LineRange {
            start: number
            end: number
            width: number
        }
        const lines: LineRange[] = []

        if (wrapWidth > 0 && layer0) {
            // PvZ WriteWordWrapped algorithm
            let curPos = 0
            let lineStartPos = 0
            let curWidth = 0
            let prevChar = 0
            let spacePos = -1

            while (curPos < resolvedChars.length) {
                const curChar = resolvedChars[curPos]

                if (curChar === 32) {
                    // Space.
                    spacePos = curPos
                } else if (curChar === 10) {
                    // Newline forces wrapping.
                    const lineEnd = this._trimTrailingSpaces(resolvedChars, lineStartPos, curPos)
                    lines.push({
                        start: lineStartPos,
                        end: lineEnd,
                        width: this._measureLineWidth(
                            layer0,
                            resolvedChars,
                            lineStartPos,
                            lineEnd,
                            pointSize,
                        ),
                    })
                    curPos++
                    lineStartPos = curPos
                    spacePos = -1
                    curWidth = 0
                    prevChar = 0
                    continue
                }

                // CharWidthKern: advance width plus kerning with the previous char.
                const charAdvance = this._getCharWidthKern(
                    layer0,
                    curChar,
                    prevChar,
                    pointSize,
                )
                curWidth += charAdvance
                prevChar = curChar

                if (curWidth > wrapWidth) {
                    // Need to wrap.
                    if (spacePos !== -1) {
                        lines.push({
                            start: lineStartPos,
                            end: spacePos,
                            width: this._measureLineWidth(
                                layer0,
                                resolvedChars,
                                lineStartPos,
                                spacePos,
                                pointSize,
                            ),
                        })
                        curPos = spacePos + 1
                        // Skip consecutive spaces.
                        while (curPos < resolvedChars.length && resolvedChars[curPos] === 32) {
                            curPos++
                        }
                        lineStartPos = curPos
                    } else {
                        // No space found, break at the current position.
                        if (curPos <= lineStartPos) curPos++ // Ensure progress.
                        const lineEnd = this._trimTrailingSpaces(resolvedChars, lineStartPos, curPos)
                        lines.push({
                            start: lineStartPos,
                            end: lineEnd,
                            width: this._measureLineWidth(
                                layer0,
                                resolvedChars,
                                lineStartPos,
                                lineEnd,
                                pointSize,
                            ),
                        })
                        lineStartPos = curPos
                    }
                    spacePos = -1
                    curWidth = 0
                    prevChar = 0
                } else {
                    curPos++
                }
            }
            // Last line.
            if (lineStartPos < resolvedChars.length) {
                const lineEnd = this._trimTrailingSpaces(
                    resolvedChars,
                    lineStartPos,
                    resolvedChars.length,
                )
                lines.push({
                    start: lineStartPos,
                    end: lineEnd,
                    width: this._measureLineWidth(
                        layer0,
                        resolvedChars,
                        lineStartPos,
                        lineEnd,
                        pointSize,
                    ),
                })
            }
        } else {
            // No word wrap, split only on newlines.
            let lineStart = 0
            let lineWidth = 0
            let prevChar = 0
            for (let i = 0; i < resolvedChars.length; i++) {
                if (resolvedChars[i] === 10) {
                    const lineEnd = this._trimTrailingSpaces(resolvedChars, lineStart, i)
                    lines.push({
                        start: lineStart,
                        end: lineEnd,
                        width: this._measureLineWidth(layer0, resolvedChars, lineStart, lineEnd, pointSize),
                    })
                    lineStart = i + 1
                    lineWidth = 0
                    prevChar = 0
                } else {
                    lineWidth += this._getCharWidthKern(layer0, resolvedChars[i], prevChar, pointSize)
                    prevChar = resolvedChars[i]
                }
            }
            const lineEnd = this._trimTrailingSpaces(resolvedChars, lineStart, resolvedChars.length)
            lines.push({
                start: lineStart,
                end: lineEnd,
                width: this._measureLineWidth(layer0, resolvedChars, lineStart, lineEnd, pointSize),
            })
        }

        // Phase 1: collect render commands.
        const commands: RenderCmd[] = []

        for (let layerIdx = 0; layerIdx < config.layers.length; layerIdx++) {
            const layer = config.layers[layerIdx]
            if (layerIdx >= this.layerTextures.length) continue

            const layerScale = scale
            let lineY = 0

            for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                const line = lines[lineIdx]
                let cursorX = this._getLineOffsetX(line.width, wrapWidth, layerScale)

                for (let i = line.start; i < line.end; i++) {
                    const charCode = resolvedChars[i]
                    if (charCode === 10) continue // Skip newlines.

                    const charCodeStr = String(charCode)
                    const charInfo = layer.chars[charCodeStr]
                    if (!charInfo) {
                        // Space or unknown character, advance the cursor.
                        cursorX +=
                            this._getCharAdvanceToNext(
                                layer,
                                charCode,
                                i + 1 < line.end ? resolvedChars[i + 1] : 0,
                                pointSize,
                            ) *
                            layerScale
                        continue
                    }

                    // Coordinates.
                    const x = cursorX + (layer.offset[0] + charInfo.offset[0]) * layerScale
                    const y =
                        lineY * layerScale + (layer.offset[1] + charInfo.offset[1]) * layerScale

                    // Draw order.
                    const order = Math.max(0, Math.min(255, layer.baseOrder + charInfo.order + 128))

                    commands.push({
                        order,
                        layerIdx,
                        charCode,
                        x,
                        y,
                        charInfo,
                    })

                    // Advance cursor
                    cursorX +=
                        this._getCharAdvanceToNext(
                            layer,
                            charCode,
                            i + 1 < line.end ? resolvedChars[i + 1] : 0,
                            pointSize,
                        ) * layerScale
                }

                lineY += fontLineSpacing
            }
        }

        // Phase 2: sort by draw order.
        commands.sort((a, b) => a.order - b.order)

        // Phase 3: create glyph nodes.
        let maxY = 0

        for (const cmd of commands) {
            const layer = config.layers[cmd.layerIdx]
            const texture = this.layerTextures[cmd.layerIdx]
            if (!texture) continue

            // Get or create the SpriteFrame.
            const rect = cmd.charInfo.rect
            const sfKey = `${cmd.layerIdx}_${cmd.charCode}`
            let sf = this._spriteFrameCache.get(sfKey)
            if (!sf) {
                sf = new SpriteFrame()
                sf.texture = texture
                sf.rect = new Rect(rect[0], rect[1], rect[2], rect[3])
                // PvZ and SpriteFrame rects both use a top-left origin here.
                sf.rotated = false
                this._spriteFrameCache.set(sfKey, sf)
            }

            // Create the glyph node.
            const charNode = new Node(`char_${cmd.charCode}_L${cmd.layerIdx}`)
            const uiTrans = charNode.addComponent(UITransform)
            uiTrans.setContentSize(new Size(rect[2] * scale, rect[3] * scale))
            uiTrans.setAnchorPoint(new Vec2(0, 1))

            const sprite = charNode.addComponent(Sprite)
            sprite.spriteFrame = sf
            sprite.sizeMode = Sprite.SizeMode.CUSTOM
            sprite.type = Sprite.Type.SIMPLE

            // PvZ formula: finalColor = min(inputColor * layerColorMult / 255 + layerColorAdd, 255).
            // colorMult[3] is alpha. PvZ Color(int) treats zero alpha bits as 255.
            const cm = layer.colorMult
            const ca = layer.colorAdd
            const r = Math.min(255, Math.floor((inputColor.r * cm[0]) / 255) + ca[0])
            const g = Math.min(255, Math.floor((inputColor.g * cm[1]) / 255) + ca[1])
            const b = Math.min(255, Math.floor((inputColor.b * cm[2]) / 255) + ca[2])
            const a = Math.min(255, Math.floor((inputColor.a * cm[3]) / 255) + ca[3])
            // Cocos Sprite.color is multiplicative tinting. Non-zero colorAdd needs a custom shader.
            sprite.color = new Color(r, g, b, a)

            // Cocos Y points up while PvZ text coordinates point down.
            charNode.setPosition(new Vec3(cmd.x, -cmd.y, 0))

            this.node.addChild(charNode)
            this._charNodes.push(charNode)

            // Record bounds.
            const bottom = cmd.y + rect[3] * scale
            if (bottom > maxY) maxY = bottom
        }

        this._totalWidth = Math.max(0, ...lines.map((line) => line.width * scale))
        this._totalHeight = maxY

        // Update this node's UITransform.
        const selfTrans = this.node.getComponent(UITransform)
        if (selfTrans) {
            selfTrans.setContentSize(new Size(this._totalWidth, this._totalHeight))
        }
    }

    private _getLineOffsetX(lineWidth: number, wrapWidth: number, scale: number): number {
        if (wrapWidth <= 0 || this._textAlign === 0) return 0

        const spare = Math.max(0, wrapWidth - lineWidth)
        if (this._textAlign === 1) return spare * scale
        if (this._textAlign === 2) return (spare / 2) * scale
        return 0
    }

    private _getCharWidthKern(
        layer: FontConfig['layers'][number],
        charCode: number,
        prevCharCode: number,
        pointSize: number,
    ): number {
        const charInfo = layer.chars[String(charCode)]
        let width = charInfo ? charInfo.width : pointSize * 0.3
        if (prevCharCode !== 0) {
            const prevInfo = layer.chars[String(prevCharCode)]
            width += layer.spacing + (prevInfo?.kerning[String(charCode)] ?? 0)
        }
        return width + this._letterSpacing
    }

    private _measureLineWidth(
        layer: FontConfig['layers'][number],
        chars: number[],
        start: number,
        end: number,
        pointSize: number,
    ): number {
        let width = 0
        let prevChar = 0
        for (let i = start; i < end; i++) {
            width += this._getCharWidthKern(layer, chars[i], prevChar, pointSize)
            prevChar = chars[i]
        }
        return width
    }

    private _trimTrailingSpaces(chars: number[], start: number, end: number): number {
        let trimmedEnd = end
        while (trimmedEnd > start && chars[trimmedEnd - 1] === 32) {
            trimmedEnd--
        }
        return trimmedEnd
    }

    private _getCharAdvanceToNext(
        layer: FontConfig['layers'][number],
        charCode: number,
        nextCharCode: number,
        pointSize: number,
    ): number {
        const charInfo = layer.chars[String(charCode)]
        let width = charInfo ? charInfo.width : pointSize * 0.3
        if (nextCharCode !== 0) {
            width += layer.spacing + (charInfo?.kerning[String(nextCharCode)] ?? 0)
        }
        return width + this._letterSpacing
    }

    /** Clears all glyph child nodes. */
    private _clearCharNodes() {
        for (const n of this._charNodes) {
            if (n.isValid) {
                n.removeFromParent()
                n.destroy()
            }
        }
        this._charNodes.length = 0
    }

    onDestroy() {
        this._clearCharNodes()
        // Clear SpriteFrame cache.
        for (const [, sf] of this._spriteFrameCache) {
            sf.destroy()
        }
        this._spriteFrameCache.clear()
    }
}
