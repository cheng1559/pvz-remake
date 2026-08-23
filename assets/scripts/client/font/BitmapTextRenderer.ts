import { _decorator, Color, Component } from 'cc'
import { ClientContentLoader, FontRepository } from '@/client/content/ClientContentLoader'
import { ContentRegistry } from '@/client/content/ContentRegistry'
import { FontRenderer } from './FontRenderer'

export type BitmapTextAlign = 'left' | 'right' | 'center'

export interface BitmapTextOptions {
    fontSize?: number
    color?: [number, number, number, number]
    letterSpacing?: number
    lineSpacing?: number
    maxWidth?: number
    align?: BitmapTextAlign
}

export interface BitmapTextSnapshot {
    id: string
    text: string
    fontSize: number
    color: [number, number, number, number]
    letterSpacing: number
    lineSpacing: number
    maxWidth: number
    align: BitmapTextAlign
    visible: boolean
}

const { ccclass } = _decorator

@ccclass('BitmapTextRenderer')
export class BitmapTextRenderer extends Component {
    private id: string | null = null

    async load(id: string, registry: ContentRegistry, loader = new ClientContentLoader()): Promise<void> {
        const assets = await new FontRepository(registry, loader).load(id)
        if (!this.node.isValid) throw new Error('bitmap text renderer was destroyed while loading')
        this.renderer.setFontAssets(assets)
        this.id = id
    }

    setText(text: string, options: BitmapTextOptions = {}): void {
        const renderer = this.renderer
        renderer.string = text
        if (options.fontSize != null) renderer.fontSize = options.fontSize
        if (options.color != null) renderer.fontColor = new Color(...options.color)
        if (options.letterSpacing != null) renderer.letterSpacing = options.letterSpacing
        if (options.lineSpacing != null) renderer.lineSpacing = options.lineSpacing
        if (options.maxWidth != null) renderer.maxWidth = options.maxWidth
        if (options.align != null) renderer.textAlign = alignCode(options.align)
        renderer.forceRebuild()
    }

    snapshot(): BitmapTextSnapshot {
        const renderer = this.renderer
        const color = renderer.fontColor
        return {
            id: this.requireId(),
            text: renderer.string,
            fontSize: renderer.fontSize,
            color: [color.r, color.g, color.b, color.a],
            letterSpacing: renderer.letterSpacing,
            lineSpacing: renderer.lineSpacing,
            maxWidth: renderer.maxWidth,
            align: alignName(renderer.textAlign),
            visible: this.node.active,
        }
    }

    restore(snapshot: BitmapTextSnapshot): void {
        if (snapshot.id !== this.requireId()) throw new Error(`cannot restore font ${snapshot.id} into ${this.id}`)
        if (typeof snapshot.text !== 'string' || typeof snapshot.visible !== 'boolean') {
            throw new Error('invalid bitmap text snapshot')
        }
        const numbers = [
            snapshot.fontSize, ...snapshot.color, snapshot.letterSpacing,
            snapshot.lineSpacing, snapshot.maxWidth,
        ]
        if (numbers.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
            throw new Error('invalid bitmap text snapshot numbers')
        }
        this.setText(snapshot.text, snapshot)
        this.node.active = snapshot.visible
    }

    private get renderer(): FontRenderer {
        return this.node.getComponent(FontRenderer) ?? this.node.addComponent(FontRenderer)
    }

    private requireId(): string {
        if (!this.id) throw new Error('bitmap text font is not loaded')
        return this.id
    }
}

function alignCode(align: BitmapTextAlign): number {
    if (align === 'left') return 0
    if (align === 'right') return 1
    if (align === 'center') return 2
    throw new Error(`unknown bitmap text alignment: ${align}`)
}

function alignName(align: number): BitmapTextAlign {
    if (align === 1) return 'right'
    if (align === 2) return 'center'
    return 'left'
}
