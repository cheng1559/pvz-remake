import { Color, Graphics, Layers, Node } from 'cc'
import type { BitmapFontAssets } from '@/core/FontLoader'
import { FontMetricsUtil, FontRenderer } from '@/core/FontRenderer'
import { createUINode } from '@/ui/UIFactory'

export function createTooltipNode(args: {
    name?: string
    title?: string
    text: string
    warningText?: string
    font: BitmapFontAssets | null
    titleFont?: BitmapFontAssets | null
    parent?: Node
    layer?: number
    x?: number
    y?: number
    z?: number
    minWidth?: number
    maxLinesWidth?: number
    warningColor?: Color
    centerX?: boolean
    active?: boolean
}): Node {
    const layer = args.layer ?? Layers.Enum.UI_2D
    const size = measureTooltip(args)
    const { width, height } = size
    const labelFont = args.font
    const titleFont = args.titleFont ?? args.font
    const metrics = FontMetricsUtil.getMetrics(labelFont?.config ?? null)
    const titleMetrics = FontMetricsUtil.getMetrics(titleFont?.config ?? null)
    const title = args.title ?? ''
    const titleWidth = title ? FontMetricsUtil.measureTextWidth(titleFont?.config ?? null, title) : 0
    const warningText = args.warningText ?? ''
    const warningWidth = warningText ? FontMetricsUtil.measureTextWidth(labelFont?.config ?? null, warningText) : 0
    const lines = size.lines
    const node = createUINode(args.name ?? 'Tooltip', {
        parent: args.parent,
        layer,
        anchorX: 0,
        anchorY: 1,
        width,
        height,
        active: args.active,
    })
    node.setPosition((args.x ?? 0) - (args.centerX ? Math.trunc(width / 2) : 0), args.y ?? 0, args.z ?? 0)

    const graphics = node.addComponent(Graphics)
    graphics.fillColor = new Color(255, 255, 200, 255)
    graphics.fillRect(0, -height, width, height)
    graphics.fillColor = Color.BLACK
    graphics.fillRect(0, -1, width, 1)
    graphics.fillRect(0, -height, width, 1)
    graphics.fillRect(0, -height, 1, height)
    graphics.fillRect(width - 1, -height, 1, height)

    let labelY = -1
    if (title) {
        const titleNode = createUINode('Title', {
            parent: node,
            layer,
            anchorX: 0,
            anchorY: 1,
        })
        const titleRenderer = titleNode.addComponent(FontRenderer)
        if (titleFont) titleRenderer.setFontAssets(titleFont)
        titleRenderer.fontColor = Color.BLACK
        titleRenderer.string = title
        titleRenderer.forceRebuild()
        titleNode.setPosition(Math.trunc((width - titleWidth) / 2), labelY, 0)
        labelY -= titleMetrics.ascent + 2
    }

    if (warningText) {
        const warning = createUINode('Warning', {
            parent: node,
            layer,
            anchorX: 0,
            anchorY: 1,
        })
        const warningRenderer = warning.addComponent(FontRenderer)
        if (labelFont) warningRenderer.setFontAssets(labelFont)
        warningRenderer.fontColor = args.warningColor ?? new Color(255, 0, 0, 255)
        warningRenderer.string = warningText
        warningRenderer.forceRebuild()
        warning.setPosition(Math.trunc((width - warningWidth) / 2), labelY, 0)
        labelY -= metrics.ascent + 2
    }

    for (let index = 0; index < lines.length; index++) {
        const line = lines[index]
        const lineNode = createUINode(index === 0 ? 'Label' : `Label_${index}`, {
            parent: node,
            layer,
            anchorX: 0,
            anchorY: 1,
        })
        const renderer = lineNode.addComponent(FontRenderer)
        if (labelFont) renderer.setFontAssets(labelFont)
        renderer.fontColor = Color.BLACK
        renderer.string = line
        renderer.forceRebuild()
        const lineWidth = FontMetricsUtil.measureTextWidth(labelFont?.config ?? null, line)
        lineNode.setPosition(Math.trunc((width - lineWidth) / 2), labelY, 0)
        labelY -= metrics.ascent + 2
    }

    return node
}

export function measureTooltip(args: {
    title?: string
    text: string
    warningText?: string
    font: BitmapFontAssets | null
    titleFont?: BitmapFontAssets | null
    minWidth?: number
    maxLinesWidth?: number
}) {
    const labelFont = args.font
    const titleFont = args.titleFont ?? args.font
    const metrics = FontMetricsUtil.getMetrics(labelFont?.config ?? null)
    const titleMetrics = FontMetricsUtil.getMetrics(titleFont?.config ?? null)
    const title = args.title ?? ''
    const titleWidth = title ? FontMetricsUtil.measureTextWidth(titleFont?.config ?? null, title) : 0
    const warningText = args.warningText ?? ''
    const warningWidth = warningText ? FontMetricsUtil.measureTextWidth(labelFont?.config ?? null, warningText) : 0
    let lineLimit = Math.max(Math.max(titleWidth, warningWidth) - 30, 100)
    if (args.maxLinesWidth && args.maxLinesWidth > 0) lineLimit = Math.min(lineLimit, args.maxLinesWidth)
    const lines = args.text ? (title || warningText ? wrapTooltipText(args.text, labelFont, lineLimit) : [args.text]) : []
    let textWidth = 0
    for (const line of lines) {
        textWidth = Math.max(textWidth, FontMetricsUtil.measureTextWidth(labelFont?.config ?? null, line))
    }
    const width = Math.max(args.minWidth ?? 0, titleWidth, textWidth, warningWidth) + 10
    const height = (title ? titleMetrics.ascent + 8 : 6) +
        (warningText ? titleMetrics.ascent + 2 : 0) +
        lines.length * metrics.ascent +
        lines.length * 2 - 2
    return { width, height, lines }
}

function wrapTooltipText(text: string, font: BitmapFontAssets | null, maxWidth: number) {
    const lines: string[] = []
    let lineStart = 0
    let currentWidth = 0
    let breakDrawEnd = -1
    let breakResume = 0
    let previousChar = ''
    for (let i = 0; i < text.length;) {
        const charStart = i
        const codePoint = text.codePointAt(i) ?? 0
        const char = String.fromCodePoint(codePoint)
        i += char.length
        const charEnd = i

        if (char === '\r') continue
        if (char === '\n') {
            lines.push(text.slice(lineStart, charStart))
            lineStart = charEnd
            currentWidth = 0
            breakDrawEnd = -1
            previousChar = ''
            continue
        }

        currentWidth += FontMetricsUtil.measureTextWidth(font?.config ?? null, char)
        if (char === ' ') {
            breakDrawEnd = charStart
            breakResume = charEnd
            if (currentWidth >= maxWidth) {
                lines.push(text.slice(lineStart, breakDrawEnd))
                while (breakResume < text.length && text[breakResume] === ' ') breakResume++
                i = breakResume
                lineStart = i
                currentWidth = 0
                breakDrawEnd = -1
                previousChar = ''
                continue
            }
        } else if (
            isAutoBreakChar(codePoint) &&
            !isClosingPunctuation(char) &&
            charStart > lineStart &&
            !isOpeningPunctuation(previousChar)
        ) {
            breakDrawEnd = charStart
            breakResume = charStart
            if (currentWidth >= maxWidth) {
                lines.push(text.slice(lineStart, breakDrawEnd))
                i = breakResume
                lineStart = i
                currentWidth = 0
                breakDrawEnd = -1
                previousChar = ''
                continue
            }
        }
        previousChar = char
    }
    if (lineStart < text.length) {
        lines.push(text.slice(lineStart))
    } else if (text.length === 0 || text.endsWith('\n')) {
        lines.push('')
    }
    return lines
}

function isOpeningPunctuation(char: string) {
    return '〈《「『【〔〖〘〚（［｛‘‚‛“'.includes(char)
}

function isClosingPunctuation(char: string) {
    return '〉》」』】〕〗〙〛）］｝’”、。，．！？：；'.includes(char)
}

function isAutoBreakChar(codePoint: number) {
    if (codePoint < 0x80) return false
    return (codePoint >= 0x2018 && codePoint <= 0x201D) ||
        (codePoint >= 0x2600 && codePoint <= 0x27BF) ||
        (codePoint >= 0x3000 && codePoint <= 0x303F) ||
        (codePoint >= 0x3040 && codePoint <= 0x309F) ||
        (codePoint >= 0x30A0 && codePoint <= 0x30FF) ||
        (codePoint >= 0x3400 && codePoint <= 0x4DBF) ||
        (codePoint >= 0x4E00 && codePoint <= 0x9FFF) ||
        (codePoint >= 0xAC00 && codePoint <= 0xD7AF) ||
        (codePoint >= 0xF900 && codePoint <= 0xFAFF) ||
        (codePoint >= 0xFE30 && codePoint <= 0xFE4F) ||
        (codePoint >= 0xFF01 && codePoint <= 0xFF60) ||
        (codePoint >= 0x1F300 && codePoint <= 0x1FAFF) ||
        (codePoint >= 0x20000 && codePoint <= 0x2FA1F)
}
