import { Color, type Node } from 'cc'
import { FontMetricsUtil } from '@/client/font'
import type { UI } from '@/client/ui/UI'
import { uiNode } from '@/client/view/uiNode'

interface Run { text: string, color: Color }
interface Line { runs: Run[], spacing: number }
const BODY = new Color(40, 50, 90)
const ACCENT = new Color(143, 67, 27)
const STAT = new Color(204, 36, 29)
const COLORS: Record<string, Color> = {
    NORMAL: BODY, KEYWORD: ACCENT, FLAVOR: ACCENT, STAT, METAL: STAT, KEYMETAL: ACCENT,
    NOCTURNAL: new Color(136, 50, 170), AQUATIC: new Color(11, 161, 219),
}

/** Keep the original bitmap glyphs and color/spacing tags; descriptions are not Cocos system text. */
export function almanacLines(text: string, measure: (text: string) => number, width: number): Line[] {
    const source: Line[] = []
    let line: Line = { runs: [], spacing: 0 }, color = BODY, flavor = false, skipBreak = false
    const append = (value: string) => {
        const last = line.runs.at(-1)
        if (last?.color === color) last.text += value
        else line.runs.push({ text: value, color })
    }
    const finish = (spacing = 0) => { line.spacing = spacing; source.push(line); line = { runs: [], spacing: 0 } }
    for (const part of text.replace(/\r/g, '').split(/(\{[^}]*\}|\n)/)) {
        if (!part) continue
        if (part.startsWith('{')) {
            const tag = part.slice(1, -1)
            if (tag === 'SHORTLINE' || tag === 'EXTRASHORTLINE') {
                finish(tag === 'SHORTLINE' ? -9 : -14); skipBreak = true; flavor = false
            } else if (COLORS[tag]) { color = COLORS[tag]; flavor = tag === 'FLAVOR' }
        } else if (part === '\n') {
            if (skipBreak) skipBreak = false
            else if (flavor) append(' ')
            else finish()
        } else { append(part); skipBreak = false }
    }
    if (line.runs.length) source.push(line)
    const wrapped: Line[] = []
    for (const original of source) {
        let current: Line = { runs: [], spacing: 0 }, used = 0
        const add = (value: string, tint: Color) => {
            if (!used && !value.trim()) return
            const last = current.runs.at(-1)
            if (last?.color === tint) last.text += value
            else current.runs.push({ text: value, color: tint })
            used += measure(value)
        }
        for (const run of original.runs) for (const word of run.text.split(/(\s+)/).filter(Boolean)) {
            const size = measure(word)
            if (used && used + size > width && word.trim()) { wrapped.push(current); current = { runs: [], spacing: 0 }; used = 0 }
            if (size <= width) add(word, run.color)
            else for (const char of word) {
                if (used && used + measure(char) > width) { wrapped.push(current); current = { runs: [], spacing: 0 }; used = 0 }
                add(char, run.color)
            }
        }
        current.spacing = original.spacing
        wrapped.push(current)
    }
    return wrapped
}

export function drawAlmanacText(parent: Node, ui: UI, text: string, box: {
    x: number, y: number, width: number, height?: number, align?: 'left' | 'right',
}): number {
    const font = ui.assets.fonts.small.config
    const metrics = FontMetricsUtil.getMetrics(font)
    const measure = (value: string) => FontMetricsUtil.measureTextWidth(font, value)
    let lines = almanacLines(text, measure, box.width)
    const heightOf = (values: Line[]) => values.reduce((sum, line) => sum + metrics.lineSpacing + line.spacing, 0)
    const textHeight = heightOf(lines)
    const scrolling = box.height !== undefined && textHeight > box.height
    const height = scrolling ? box.height! : textHeight
    const scroll = scrolling ? ui.scroll(parent, {
        x: box.x, y: box.y, width: box.width, height, contentHeight: textHeight,
        wheelStep: metrics.lineSpacing * 0.6, bottomPadding: metrics.lineSpacing * 0.6,
    }) : null
    const width = scroll?.contentWidth ?? box.width
    if (scroll) {
        lines = almanacLines(text, measure, width)
        scroll.setContentHeight(heightOf(lines))
    }
    const content = scroll?.content ?? uiNode({
        name: 'Description', parent, position: { x: box.x, y: -box.y },
        anchor: { x: 0, y: 1 }, size: { width, height },
    }).node
    let y = 0
    for (const line of lines) {
        let x = box.align === 'right' ? width - line.runs.reduce((sum, run) => sum + measure(run.text), 0) : 0
        for (const run of line.runs) {
            ui.label(content, { text: run.text, font: 'small', color: run.color, x, y })
            x += measure(run.text)
        }
        y += metrics.lineSpacing + line.spacing
    }
    return height
}
