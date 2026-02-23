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

import type { FontConfig, RenderCmd } from './FontRenderer.d'

const { ccclass, property, executeInEditMode } = _decorator

@ccclass('FontRenderer')
@executeInEditMode(true)
export class FontRenderer extends Component {
    @property
    fontConfigJson: JsonAsset | null = null

    @property
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

    // === 序列化字段 ===
    @property private _string: string = ''
    @property private _fontSize: number = 0
    @property private _fontColor: Color = new Color(255, 255, 255, 255)
    @property private _letterSpacing: number = 0
    @property private _lineSpacing: number = 0
    @property private _maxWidth: number = 0

    // === 内部状态 ===
    private _config: FontConfig | null = null
    private _spriteFrameCache: Map<string, SpriteFrame> = new Map()
    private _charNodes: Node[] = []
    private _dirty: boolean = true
    private _rebuildScheduled: boolean = false
    private _totalWidth: number = 0
    private _totalHeight: number = 0

    // ─── 生命周期 ──────────────────────────────────────────

    onLoad() {
        this._loadConfig()
        this._rebuild()
    }

    onEnable() {
        if (this._dirty) {
            this._rebuild()
        }
    }

    // ─── 公共方法 ──────────────────────────────────────────

    /** 获取当前文本渲染的像素宽度 */
    get contentWidth(): number {
        return this._totalWidth
    }

    /** 获取当前文本渲染的像素高度 */
    get contentHeight(): number {
        return this._totalHeight
    }

    /** 强制重建 */
    forceRebuild() {
        this._dirty = true
        this._loadConfig()
        this._rebuild()
    }

    // ─── 内部实现 ──────────────────────────────────────────

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

    /** 核心：重建所有字符节点 */
    private _rebuild() {
        this._dirty = false

        // 清除旧节点
        this._clearCharNodes()

        if (!this._config || !this._string) return
        if (this.layerTextures.length === 0) return

        const config = this._config
        const pointSize = this._fontSize > 0 ? this._fontSize : config.defaultPointSize
        const scale = config.defaultPointSize > 0 ? pointSize / config.defaultPointSize : 1
        const inputColor = this._fontColor

        // ── Pre-process: resolve char codes ──
        const resolvedChars: number[] = []
        for (let i = 0; i < this._string.length; i++) {
            let code = this._string.charCodeAt(i)
            const mapped = config.charMap[String(code)]
            if (mapped !== undefined) code = mapped
            resolvedChars.push(code)
        }

        // ── Word wrap: compute line breaks using layer 0 ──
        // Each line = { startIdx, endIdx (exclusive) }
        const layer0 = config.layers[0]
        const wrapWidth = this._maxWidth > 0 ? this._maxWidth / scale : 0

        // Compute lineSpacing from font config
        // PvZ: when mHeight == 0 (not specified), falls back to mAscent
        const layerLineHeight = layer0.height > 0 ? layer0.height : layer0.ascent
        const fontLineSpacing =
            this._lineSpacing !== 0 ? this._lineSpacing : layerLineHeight + layer0.lineSpacingOffset

        interface LineRange {
            start: number
            end: number
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
                    // space
                    spacePos = curPos
                } else if (curChar === 10) {
                    // newline: force wrap
                    lines.push({ start: lineStartPos, end: curPos })
                    curPos++
                    lineStartPos = curPos
                    spacePos = -1
                    curWidth = 0
                    prevChar = 0
                    continue
                }

                // CharWidthKern: advance width + kerning with previous char
                const charInfo = layer0.chars[String(curChar)]
                let charAdvance = charInfo
                    ? charInfo.width + layer0.spacing + this._letterSpacing
                    : pointSize * 0.3
                // Kerning with previous character
                if (prevChar !== 0 && charInfo) {
                    const kern = charInfo.kerning[String(prevChar)]
                    if (kern !== undefined) charAdvance += kern
                }
                curWidth += charAdvance
                prevChar = curChar

                if (curWidth > wrapWidth) {
                    // Need to wrap
                    if (spacePos !== -1) {
                        lines.push({ start: lineStartPos, end: spacePos })
                        curPos = spacePos + 1
                        // Skip consecutive spaces
                        while (curPos < resolvedChars.length && resolvedChars[curPos] === 32) {
                            curPos++
                        }
                        lineStartPos = curPos
                    } else {
                        // No space found: break at current position
                        if (curPos <= lineStartPos) curPos++ // ensure progress
                        lines.push({ start: lineStartPos, end: curPos })
                        lineStartPos = curPos
                    }
                    spacePos = -1
                    curWidth = 0
                    prevChar = 0
                } else {
                    curPos++
                }
            }
            // Last line
            if (lineStartPos <= resolvedChars.length) {
                lines.push({ start: lineStartPos, end: resolvedChars.length })
            }
        } else {
            // No word wrap: split only on \n
            let lineStart = 0
            for (let i = 0; i < resolvedChars.length; i++) {
                if (resolvedChars[i] === 10) {
                    lines.push({ start: lineStart, end: i })
                    lineStart = i + 1
                }
            }
            lines.push({ start: lineStart, end: resolvedChars.length })
        }

        // ── Phase 1: 收集渲染指令 ──
        const commands: RenderCmd[] = []

        for (let layerIdx = 0; layerIdx < config.layers.length; layerIdx++) {
            const layer = config.layers[layerIdx]
            if (layerIdx >= this.layerTextures.length) continue

            const layerScale = scale
            let lineY = 0

            for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                const line = lines[lineIdx]
                let cursorX = 0

                for (let i = line.start; i < line.end; i++) {
                    const charCode = resolvedChars[i]
                    if (charCode === 10) continue // skip newlines

                    const charCodeStr = String(charCode)
                    const charInfo = layer.chars[charCodeStr]
                    if (!charInfo) {
                        // Space or unknown: advance cursor
                        if (charCode === 32) {
                            cursorX += (charInfo?.width ?? pointSize * 0.3) * layerScale
                        }
                        continue
                    }

                    // Kerning adjustment
                    let kernOffset = 0
                    if (i + 1 < line.end) {
                        const nextCode = resolvedChars[i + 1]
                        const kernVal = charInfo.kerning[String(nextCode)]
                        if (kernVal !== undefined) {
                            kernOffset = kernVal * layerScale
                        }
                    }

                    // Coordinates
                    const x = cursorX + (layer.offset[0] + charInfo.offset[0]) * layerScale
                    const y =
                        lineY * layerScale + (layer.offset[1] + charInfo.offset[1]) * layerScale

                    // Draw order
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
                        (charInfo.width + layer.spacing + this._letterSpacing) * layerScale +
                        kernOffset
                }

                lineY += fontLineSpacing
            }
        }

        // ── Phase 2: 按 order 排序 (稳定排序) ──
        commands.sort((a, b) => a.order - b.order)

        // ── Phase 3: 创建节点 ──
        let maxX = 0
        let maxY = 0

        for (const cmd of commands) {
            const layer = config.layers[cmd.layerIdx]
            const texture = this.layerTextures[cmd.layerIdx]
            if (!texture) continue

            // 取得或创建 SpriteFrame
            const rect = cmd.charInfo.rect
            const sfKey = `${cmd.layerIdx}_${cmd.charCode}`
            let sf = this._spriteFrameCache.get(sfKey)
            if (!sf) {
                sf = new SpriteFrame()
                sf.texture = texture
                sf.rect = new Rect(rect[0], rect[1], rect[2], rect[3])
                // 翻转Y坐标：PvZ 使用左上角原点，Cocos 也是 SpriteFrame 从左上角
                sf.rotated = false
                this._spriteFrameCache.set(sfKey, sf)
            }

            // 创建节点
            const charNode = new Node(`char_${cmd.charCode}_L${cmd.layerIdx}`)
            const uiTrans = charNode.addComponent(UITransform)
            uiTrans.setContentSize(new Size(rect[2] * scale, rect[3] * scale))
            uiTrans.setAnchorPoint(new Vec2(0, 1)) // 左上角锚点

            const sprite = charNode.addComponent(Sprite)
            sprite.spriteFrame = sf
            sprite.sizeMode = Sprite.SizeMode.CUSTOM
            sprite.type = Sprite.Type.SIMPLE

            // ── 设置 Alpha 混合模式 ──
            // 必须显式设置 SRC_ALPHA / ONE_MINUS_SRC_ALPHA，
            // 否则 Sprite 默认可能不走 Alpha 混合，导致黑底。
            // const renderComp = sprite
            // if (renderComp.customMaterial == null) {
            //     // 使用自定义混合因子
            //     sprite.color = Color.WHITE // 先设白色触发渲染器初始化
            // }

            // ── 颜色混合 ──
            // PvZ 公式: finalColor = min(inputColor * layerColorMult / 255 + layerColorAdd, 255)
            // 注意 colorMult[3] = alpha 通道：
            //   PvZ Color(int) 构造器: 当 alpha bits == 0 时强制 alpha = 255
            //   所以 ColorMult 0 → {R=0, G=0, B=0, A=255} = 不透明黑色
            const cm = layer.colorMult
            const ca = layer.colorAdd
            const r = Math.min(255, Math.floor((inputColor.r * cm[0]) / 255) + ca[0])
            const g = Math.min(255, Math.floor((inputColor.g * cm[1]) / 255) + ca[1])
            const b = Math.min(255, Math.floor((inputColor.b * cm[2]) / 255) + ca[2])
            const a = Math.min(255, Math.floor((inputColor.a * cm[3]) / 255) + ca[3])
            // Cocos Node.color 做 tint 乘法混合。
            // 对于 colorAdd 非零的情况需自定义 Shader（PvZ 原版字体几乎全为 0）。
            sprite.color = new Color(r, g, b, a)

            // 定位：Cocos Y 轴向上，PvZ Y 轴向下，所以 y 取负
            charNode.setPosition(new Vec3(cmd.x, -cmd.y, 0))

            this.node.addChild(charNode)
            this._charNodes.push(charNode)

            // 记录边界
            if (cmd.x + rect[2] * scale > maxX) maxX = cmd.x + rect[2] * scale
            const bottom = cmd.y + rect[3] * scale
            if (bottom > maxY) maxY = bottom
        }

        this._totalWidth = maxX
        this._totalHeight = maxY

        // 更新自身 UITransform
        const selfTrans = this.node.getComponent(UITransform)
        if (selfTrans) {
            selfTrans.setContentSize(new Size(this._totalWidth, this._totalHeight))
        }
    }

    /** 清理所有字符子节点 */
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
        // 清理 SpriteFrame 缓存
        for (const [, sf] of this._spriteFrameCache) {
            sf.destroy()
        }
        this._spriteFrameCache.clear()
    }
}
